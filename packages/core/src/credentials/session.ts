/**
 * One profile's credential lifecycle.
 *
 * The access token lives in memory only, for the life of this object. The
 * refresh token is read from and written to a `CredentialStore` — never held
 * here longer than one call needs it. There is exactly one thing this class
 * remembers across calls that is not a secret: a pending, unapproved device
 * authorization, so that a retried tool call polls the same code instead of
 * starting a new one every time.
 */
import { ManagementApiUnreachable } from '../errors.js'
import {
  OAuthError,
  pollDeviceToken,
  refreshAccessToken,
  startDeviceAuthorization,
  type Tokens,
} from './device-grant.js'
import type { CredentialStore } from './store.js'

export interface SessionOptions {
  /**
   * The platform issuer, or a function that finds it (`issuerResolver`). A
   * function is called only when a request to the issuer is actually about to
   * be made, so a session that never refreshes never asks.
   */
  issuer: string | (() => Promise<string>)
  clientId: string
  profile: string
  store: CredentialStore
  /** `kleora-mcp/{version}` or `kleora-cli/{version}`. */
  userAgent: string
  fetch?: typeof globalThis.fetch
  /** Access tokens are treated as expired this many seconds early. */
  clockSkewSeconds?: number
}

export type SessionState =
  | { status: 'ready'; accessToken: string }
  | {
      status: 'authorization_required'
      verificationUri: string
      verificationUriComplete: string
      userCode: string
      message: string
    }
  | { status: 'denied' }

export type NotReadyState = Exclude<SessionState, { status: 'ready' }>

/**
 * Thrown by the `getAccessToken` callback a `ManagementClient` is built
 * with, when the session is not `ready`. The MCP server catches this and
 * turns it into a tool result that says "not an error — this is the sign-in"
 * rather than letting it surface as a protocol-level failure.
 */
export class SessionNotReady extends Error {
  readonly state: NotReadyState
  constructor(state: NotReadyState) {
    super(`session not ready: ${state.status}`)
    this.name = 'SessionNotReady'
    this.state = state
  }
}

interface Pending {
  deviceCode: string
  interval: number
  expiresAt: number
  verificationUri: string
  verificationUriComplete: string
  userCode: string
  lastPollAt: number
}

export class Session {
  readonly #issuer: () => Promise<string>
  readonly #clientId: string
  readonly #profile: string
  readonly #store: CredentialStore
  readonly #userAgent: string
  readonly #fetch: typeof globalThis.fetch
  readonly #skewMs: number

  #accessToken: string | null = null
  #accessTokenExpiresAt = 0
  #pending: Pending | null = null

  constructor(options: SessionOptions) {
    const issuer = options.issuer
    this.#issuer = typeof issuer === 'string' ? () => Promise.resolve(issuer) : issuer
    this.#clientId = options.clientId
    this.#profile = options.profile
    this.#store = options.store
    this.#userAgent = options.userAgent
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#skewMs = (options.clockSkewSeconds ?? 30) * 1000
  }

  /**
   * The access token to call the management API with, or the instructions to
   * show the person instead of a result: "not an error — this is the
   * sign-in."
   */
  async ensureAccessToken(): Promise<SessionState> {
    if (this.#accessToken !== null && Date.now() < this.#accessTokenExpiresAt - this.#skewMs) {
      return { status: 'ready', accessToken: this.#accessToken }
    }

    const fromRefresh = await this.#tryStoredCredential()
    if (fromRefresh !== null) return fromRefresh

    return this.#advanceDeviceFlow()
  }

  /**
   * An access token from the **stored** credential only — never starting a
   * device flow.
   *
   * This is the CLI's entry point rather than `ensureAccessToken` above, and
   * the difference is a deliberate behavioural split rather than a
   * convenience. With no credential for the profile, a CLI command says so
   * and names `kleora login`, exiting `3`. **It does not start a device flow
   * unbidden**: an interactive sign-in in the middle of a piped command is a
   * hang.
   *
   * An MCP host, by contrast, has a place to show a verification URL and a
   * turn to show it on, which is why `ensureAccessToken` may begin one there.
   * `null` means "nothing stored, or what was stored is dead and has been
   * deleted" — both of which the caller answers with the same sentence.
   */
  async accessTokenFromStoredCredential(): Promise<string | null> {
    if (this.#accessToken !== null && Date.now() < this.#accessTokenExpiresAt - this.#skewMs) {
      return this.#accessToken
    }
    const state = await this.#tryStoredCredential()
    return state !== null && state.status === 'ready' ? state.accessToken : null
  }

  /** Forces the next call to re-authorise, even if a token is cached in memory. */
  invalidate(): void {
    this.#accessToken = null
    this.#accessTokenExpiresAt = 0
  }

  /** `null` means "no usable stored credential — try the device flow instead". */
  async #tryStoredCredential(): Promise<SessionState | null> {
    const stored = await this.#store.get(this.#profile)
    if (stored === null) return null

    let tokens: Tokens
    try {
      tokens = await refreshAccessToken({
        issuer: await this.#issuer(),
        clientId: this.#clientId,
        refreshToken: stored,
        userAgent: this.#userAgent,
        fetch: this.#fetch,
      })
    } catch (error) {
      if (error instanceof OAuthError) {
        // A refresh token that is rejected (revoked, reused or expired): the
        // stored credential is deleted and the next call starts a fresh
        // device flow. A silently retried dead token is a
        // loop this class refuses to run.
        await this.#store.delete(this.#profile)
        return null
      }
      throw error
    }
    await this.#storeTokens(tokens)
    return { status: 'ready', accessToken: tokens.accessToken }
  }

  /** Starts a device flow if none is pending, or polls the one already running. */
  async #advanceDeviceFlow(): Promise<SessionState> {
    if (this.#pending === null || Date.now() >= this.#pending.expiresAt) {
      const auth = await startDeviceAuthorization({
        issuer: await this.#issuer(),
        clientId: this.#clientId,
        userAgent: this.#userAgent,
        fetch: this.#fetch,
      })
      this.#pending = {
        deviceCode: auth.deviceCode,
        interval: auth.interval,
        expiresAt: Date.now() + auth.expiresIn * 1000,
        verificationUri: auth.verificationUri,
        verificationUriComplete: auth.verificationUriComplete,
        userCode: auth.userCode,
        lastPollAt: 0,
      }
      return this.#pendingState(
        'No Kleora credential is authorised yet. Open the verification URL, ' +
          'enter the code, and approve. Then call this tool again.',
      )
    }

    const pending = this.#pending
    // The device grant's own interval is enforced by the issuer
    // (RFC 8628 section 3.5): a poll made sooner just gets `slow_down`,
    // which this branch absorbs by widening the interval rather than
    // treating it as a failure. One HTTP request either way.
    pending.lastPollAt = Date.now()
    try {
      const tokens = await pollDeviceToken({
        issuer: await this.#issuer(),
        clientId: this.#clientId,
        deviceCode: pending.deviceCode,
        userAgent: this.#userAgent,
        fetch: this.#fetch,
      })
      this.#pending = null
      await this.#storeTokens(tokens)
      return { status: 'ready', accessToken: tokens.accessToken }
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error
      switch (error.code) {
        case 'authorization_pending':
          return this.#pendingState('Still waiting for approval in the browser.')
        case 'slow_down':
          pending.interval += 5
          return this.#pendingState(
            `Polling too fast; the issuer asked for a wider interval. Wait a little longer before retrying.`,
          )
        case 'access_denied':
          this.#pending = null
          return { status: 'denied' }
        case 'expired_token':
          // The code timed out with nobody approving it. This is treated
          // the same as a rejected refresh token: start over rather than
          // fail — the next call gets a fresh code immediately.
          this.#pending = null
          return this.#advanceDeviceFlow()
        default:
          throw new ManagementApiUnreachable(`the issuer refused the poll: ${error.code}`, {
            cause: error,
          })
      }
    }
  }

  async #storeTokens(tokens: Tokens): Promise<void> {
    this.#accessToken = tokens.accessToken
    this.#accessTokenExpiresAt = Date.now() + tokens.expiresIn * 1000
    if (tokens.refreshToken !== undefined) {
      // The refresh token rotates on every use; the
      // old value is simply overwritten, never appended anywhere.
      await this.#store.set(this.#profile, tokens.refreshToken)
    }
  }

  #pendingState(message: string): SessionState {
    const pending = this.#pending
    if (pending === null) throw new Error('invariant: #pendingState called with no pending flow')
    return {
      status: 'authorization_required',
      verificationUri: pending.verificationUri,
      verificationUriComplete: pending.verificationUriComplete,
      userCode: pending.userCode,
      message,
    }
  }
}
