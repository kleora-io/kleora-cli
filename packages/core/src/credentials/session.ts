/**
 * One profile's credential lifecycle.
 *
 * The access token lives in memory only, for the life of this object. The
 * refresh token is read from and written to a `CredentialStore` — never held
 * here longer than one call needs it; what this class keeps between calls is
 * a SHA-256 digest of the one it last read or wrote, so it can tell whether
 * the store still holds it. It also remembers one thing that is not a secret:
 * a pending, unapproved device authorization, so that a retried tool call
 * polls the same code instead of starting a new one every time.
 *
 * Three rules keep one approval alive for the authorization's lifetime
 * (kleora-io/kleora#1097):
 *
 * * **One refresh at a time in this process.** Concurrent calls share one
 *   in-flight refresh, and one device-flow start or poll. Refresh tokens
 *   rotate, so two concurrent refreshes present one token twice — a replay
 *   the issuer answers by revoking the whole grant.
 * * **One refresh at a time across processes.** Every refresh runs inside the
 *   store's lock (`CredentialStore.lock`), and re-reads the store once it
 *   holds it: if another process rotated the token meanwhile, the new one is
 *   used, never the spent one.
 * * **The store is the truth.** Before a cached access token is returned, the
 *   store is read (one keychain or file read). If the refresh token there is
 *   gone (a logout) or different (another login, or another process's
 *   rotation), the cached access token is dropped.
 */
import { createHash } from 'node:crypto'

import { ManagementApiUnreachable } from '../errors.js'
import {
  OAuthError,
  pollDeviceToken,
  refreshAccessToken,
  startDeviceAuthorization,
  type OAuthErrorCode,
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

/**
 * Why a device flow was started:
 *
 * * `no_credential` — nothing was stored for this profile;
 * * `refresh_rejected` — the issuer refused the stored refresh token (revoked,
 *   expired, or presented twice), and it has been deleted;
 * * `signed_out` — the stored credential disappeared while this session was
 *   using it: a logout, possibly from another process.
 */
export type AuthorizationRequiredReason = 'no_credential' | 'refresh_rejected' | 'signed_out'

export type SessionState =
  | { status: 'ready'; accessToken: string }
  | {
      status: 'authorization_required'
      verificationUri: string
      verificationUriComplete: string
      userCode: string
      message: string
      /** Why the device flow this state belongs to was started. */
      reason: AuthorizationRequiredReason
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
  reason: AuthorizationRequiredReason
}

/** What the stored credential gave: a token, or why there is none. */
type Acquired =
  | { ok: true; accessToken: string }
  | { ok: false; reason: AuthorizationRequiredReason; oauthError?: OAuthErrorCode }

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
  /** SHA-256 of the refresh token this session last read or wrote; `null` for none. */
  #knownRefreshDigest: string | null = null
  #pending: Pending | null = null
  #acquiring: Promise<Acquired> | null = null
  #ensuring: Promise<SessionState> | null = null

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
   *
   * Concurrent calls share one in-flight answer, so they share one refresh,
   * and one device-flow start or poll.
   */
  ensureAccessToken(): Promise<SessionState> {
    this.#ensuring ??= this.#ensure().finally(() => {
      this.#ensuring = null
    })
    return this.#ensuring
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
   * deleted, or it was removed by a logout" — all of which the caller answers
   * with the same sentence.
   */
  async accessTokenFromStoredCredential(): Promise<string | null> {
    const acquired = await this.#acquire()
    return acquired.ok ? acquired.accessToken : null
  }

  /** Forces the next call to re-authorise, even if a token is cached in memory. */
  invalidate(): void {
    this.#accessToken = null
    this.#accessTokenExpiresAt = 0
  }

  async #ensure(): Promise<SessionState> {
    const acquired = await this.#acquire()
    if (acquired.ok) {
      // A credential appeared (a login in another process, say): any
      // half-finished device flow here is moot.
      this.#pending = null
      return { status: 'ready', accessToken: acquired.accessToken }
    }
    return this.#advanceDeviceFlow(acquired.reason, acquired.oauthError)
  }

  /** Single-flight over `#acquireOnce`: one store check and at most one refresh at a time. */
  #acquire(): Promise<Acquired> {
    this.#acquiring ??= this.#acquireOnce().finally(() => {
      this.#acquiring = null
    })
    return this.#acquiring
  }

  async #acquireOnce(): Promise<Acquired> {
    const stored = await this.#store.get(this.#profile)
    const storedDigest = stored === null ? null : digest(stored)

    if (storedDigest !== this.#knownRefreshDigest) {
      // Gone (a logout) or different (another login, or another process's
      // rotation): whatever is cached was minted from a credential the store
      // no longer vouches for.
      this.invalidate()
    } else if (this.#accessToken !== null && Date.now() < this.#accessTokenExpiresAt - this.#skewMs) {
      return { ok: true, accessToken: this.#accessToken }
    }

    if (stored === null) {
      const reason = this.#knownRefreshDigest === null ? 'no_credential' : 'signed_out'
      this.#knownRefreshDigest = null
      return { ok: false, reason }
    }
    return this.#refreshUnderLock()
  }

  async #refreshUnderLock(): Promise<Acquired> {
    const run = (): Promise<Acquired> => this.#refreshHoldingLock()
    return this.#store.lock === undefined ? run() : this.#store.lock(this.#profile, run)
  }

  async #refreshHoldingLock(): Promise<Acquired> {
    // Re-read now that the lock is held: another process may have rotated
    // the token, or signed out, while this one waited. Use what is there now.
    const current = await this.#store.get(this.#profile)
    if (current === null) {
      this.#knownRefreshDigest = null
      return { ok: false, reason: 'signed_out' }
    }

    let tokens: Tokens
    try {
      tokens = await refreshAccessToken({
        issuer: await this.#issuer(),
        clientId: this.#clientId,
        refreshToken: current,
        userAgent: this.#userAgent,
        fetch: this.#fetch,
      })
    } catch (error) {
      if (error instanceof OAuthError) {
        // A refresh token that is rejected (revoked, reused or expired): the
        // stored credential is deleted and the next call starts a fresh
        // device flow. A silently retried dead token is a loop this class
        // refuses to run. Deleted only if it is still the one presented, so a
        // login that landed meanwhile is not thrown away.
        if ((await this.#store.get(this.#profile)) === current) {
          await this.#store.delete(this.#profile)
        }
        this.#knownRefreshDigest = null
        return { ok: false, reason: 'refresh_rejected', oauthError: error.code }
      }
      throw error
    }
    await this.#storeTokens(tokens, current)
    return { ok: true, accessToken: tokens.accessToken }
  }

  /** Starts a device flow if none is pending, or polls the one already running. */
  async #advanceDeviceFlow(
    reason: AuthorizationRequiredReason,
    oauthError?: OAuthErrorCode,
  ): Promise<SessionState> {
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
        reason,
      }
      return this.#pendingState(
        `${whyMessage(reason, oauthError)} Open the verification URL, enter the code, and approve. ` +
          'Then call this tool again.',
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
      await this.#storeTokens(tokens, null)
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
          return this.#advanceDeviceFlow(pending.reason, oauthError)
        default:
          throw new ManagementApiUnreachable(`the issuer refused the poll: ${error.code}`, {
            cause: error,
          })
      }
    }
  }

  /** `presented` is the refresh token just used, kept as current if the issuer did not rotate it. */
  async #storeTokens(tokens: Tokens, presented: string | null): Promise<void> {
    this.#accessToken = tokens.accessToken
    this.#accessTokenExpiresAt = Date.now() + tokens.expiresIn * 1000
    if (tokens.refreshToken !== undefined) {
      // The refresh token rotates on every use; the
      // old value is simply overwritten, never appended anywhere.
      await this.#store.set(this.#profile, tokens.refreshToken)
      this.#knownRefreshDigest = digest(tokens.refreshToken)
    } else {
      this.#knownRefreshDigest = presented === null ? null : digest(presented)
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
      reason: pending.reason,
    }
  }
}

/** The first sentence of a new device flow's message. Names an OAuth error code at most — never a token. */
function whyMessage(reason: AuthorizationRequiredReason, oauthError?: OAuthErrorCode): string {
  switch (reason) {
    case 'no_credential':
      return 'No Kleora credential is authorised yet.'
    case 'refresh_rejected':
      return (
        `The issuer rejected the stored Kleora credential (${oauthError ?? 'other'}): it was revoked, ` +
        'expired, or used twice. It has been removed.'
      )
    case 'signed_out':
      return (
        'The Kleora credential this session was using was removed from the credential store ' +
        '(signed out, possibly from another process).'
      )
  }
}

function digest(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex')
}
