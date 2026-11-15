/**
 * Which credential a command runs under, and where it came from.
 *
 * Two principals reach this API from a terminal and they behave differently
 * enough that the CLI has to know which it is holding:
 *
 * * **A person**, through the device grant (`kleora login`). Their refresh
 *   token is in the OS keychain or a `0600` file under `~/.kleora-cli`. Their
 *   rate limit is flat and no plan changes it.
 * * **An API key**, from `KLEORA_API_KEY`. Scoped to one Environment by
 *   construction, so every account-level command will answer `403
 *   insufficient-scope` — so the CLI says so up front, because an
 *   unexplained `403` in a pipeline log is an hour of somebody's afternoon.
 *
 * Nothing here ever writes a credential anywhere but the store, ever prints
 * one, or ever reads one from `argv`.
 */
import {
  createCredentialStore,
  defaultConfigDir,
  ManagementClient,
  Session,
  type CredentialStore,
  type RequestTrace,
} from '@kleora-io/core'

import { CONFIG_DIR_NAME, KEYCHAIN_SERVICE, type Config } from './config.js'
import { CliFailure, EXIT } from './exit.js'
import type { Io } from './output.js'
import { USER_AGENT } from './version.js'

export type PrincipalSource = 'api-key' | 'login'

export interface Authenticated {
  readonly client: ManagementClient
  readonly source: PrincipalSource
  /** Where the refresh token is kept — `whoami` prints it, `doctor` checks it. */
  readonly backend: CredentialStore['backend'] | null
}

/** The CLI's credential store: `kleora-cli` / `~/.kleora-cli`. */
export function openStore(configDir?: string): Promise<CredentialStore> {
  return createCredentialStore({
    service: KEYCHAIN_SERVICE,
    configDir: configDir ?? defaultConfigDir(CONFIG_DIR_NAME),
  })
}

export interface AuthenticateOptions {
  readonly config: Config
  readonly io: Io
  readonly fetch: typeof globalThis.fetch
  readonly debug: boolean
  /** Overridden in tests; never by a flag. */
  readonly store?: CredentialStore
}

/**
 * Builds the client every command calls through, or fails with exit `3`.
 *
 * The failure is the interesting half. It names `kleora login` and stops —
 * it does not offer to sign in, because a device flow started in the middle of
 * `kleora users list --json | jq` is a command that appears to hang.
 */
export async function authenticate(options: AuthenticateOptions): Promise<Authenticated> {
  const { config, io, fetch: fetchImpl, debug } = options
  const onTrace = debug ? traceWriter(io) : undefined

  if (config.apiKey !== undefined) {
    // Under an API key the CLI **prints a line saying so**, because such a
    // principal reaches only one Environment and every account-level command
    // will answer `403 insufficient-scope`.
    io.err(
      'Using the API key in KLEORA_API_KEY. It is scoped to one Environment, so ' +
        'account-level commands (apps, billing, the account audit log) will answer 403.\n',
    )
    const key = config.apiKey
    return {
      client: new ManagementClient({
        baseUrl: config.baseUrl,
        getAccessToken: () => Promise.resolve(key),
        userAgent: USER_AGENT,
        fetch: fetchImpl,
        ...(onTrace === undefined ? {} : { onTrace }),
      }),
      source: 'api-key',
      backend: null,
    }
  }

  const store = options.store ?? (await openStore())
  const session = new Session({
    // Resolved only if the session refreshes — never under an API key, which
    // returned above.
    issuer: config.resolveIssuer,
    clientId: config.clientId,
    profile: config.profile,
    store,
    userAgent: USER_AGENT,
    fetch: fetchImpl,
  })

  const token = await session.accessTokenFromStoredCredential()
  if (token === null) throw notSignedIn(config.profile)

  return {
    client: new ManagementClient({
      baseUrl: config.baseUrl,
      // Re-read per call, so a token that expires part-way through a `--all`
      // walk is refreshed rather than failing the walk.
      getAccessToken: async () => {
        const fresh = await session.accessTokenFromStoredCredential()
        if (fresh === null) throw notSignedIn(config.profile)
        return fresh
      },
      userAgent: USER_AGENT,
      fetch: fetchImpl,
      ...(onTrace === undefined ? {} : { onTrace }),
    }),
    source: 'login',
    backend: store.backend,
  }
}

export function notSignedIn(profile: string): CliFailure {
  return new CliFailure(EXIT.UNAUTHENTICATED, [
    `✗ Not signed in${profile === 'default' ? '' : ` on profile '${profile}'`}.`,
    '',
    '  There is no usable credential for this profile — either none was stored,',
    '  or the one there has been revoked or has expired and has been removed.',
    '',
    `  Run \`kleora login${profile === 'default' ? '' : ` --profile ${profile}`}\`.`,
    '  For CI, set KLEORA_API_KEY instead; a key needs no browser.',
  ])
}

/**
 * `--debug`'s one line per request, on stderr.
 *
 * It is the flag a support reply asks for, so it must be safe to paste the
 * output of. Which is why it prints what the `RequestTrace` carries
 * and nothing else — no headers, no bodies, and therefore no bearer token, no
 * API key and no shown-once secret.
 */
export function traceWriter(io: Io): (trace: RequestTrace) => void {
  return (trace) => {
    const status = trace.status === null ? 'ERR' : String(trace.status)
    const id = trace.requestId === undefined ? '' : ` ${trace.requestId}`
    const why = trace.error === undefined ? '' : ` ${trace.error}`
    io.err(`  · ${trace.method} ${trace.path} → ${status} ${String(trace.durationMs)}ms${id}${why}\n`)
  }
}
