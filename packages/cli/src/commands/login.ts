/**
 * `kleora login` — the device grant, and nothing added to it.
 *
 * Three behaviours are fixed here, because getting them wrong is the usual way
 * a device-grant client is unpleasant:
 *
 * * **It honours `slow_down` as an instruction, not a hint.** The server
 *   enforces the interval it last issued and each refusal raises it by five
 *   seconds permanently, against a ten-minute window — a client that retries
 *   eagerly makes its own sign-in slower the harder it tries.
 * * **It prints the code and waits, rather than opening a browser by
 *   default.** `--open` opens one. A tool that launches a browser unbidden is
 *   wrong over SSH, wrong in a container, and wrong on the machine where the
 *   person's own browser is not the one they are signed into.
 * * **It says what approving will require.** Approval needs a
 *   re-authentication within five minutes, so the person will be asked for
 *   their password on a session they thought was already signed in. Saying so
 *   before they click is the difference between a control and a bug report.
 *
 * And the non-interactive rule: it "refuses when stdin is not a TTY unless
 * `--device-code-only` is passed, which prints the code and URI as JSON and
 * exits — enough for a person to complete a sign-in in a remote shell, and no
 * interactivity where none is possible."
 */
import {
  OAuthError,
  pollDeviceToken,
  startDeviceAuthorization,
  type CredentialStore,
  type DeviceAuthorization,
} from '@kleora-io/core'

import type { Flags } from '../argv.js'
import type { Config } from '../config.js'
import { CliFailure, EXIT, usageFailure } from '../exit.js'
import { printOwnJson, type Io } from '../output.js'
import { rememberProfile } from '../profiles.js'
import { USER_AGENT } from '../version.js'

export interface LoginDependencies {
  readonly config: Config
  readonly flags: Flags
  readonly io: Io
  readonly fetch: typeof globalThis.fetch
  readonly store: CredentialStore
  readonly configDir: string
  readonly json: boolean
  /** Injected so a test never spawns a browser. `--open` is the only caller. */
  readonly openUrl?: (url: string) => void
  /** Injected so a test never actually waits. */
  readonly sleep?: (ms: number) => Promise<void>
  /** A bound on the poll loop, so a hung issuer cannot make this run forever. */
  readonly now?: () => number
}

export async function login(deps: LoginDependencies): Promise<void> {
  const { config, flags, io, fetch: fetchImpl, store, json } = deps
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? (() => Date.now())
  const deviceCodeOnly = flags.boolean('device-code-only') === true
  const open = flags.boolean('open') === true

  if (!io.stdinIsTty && !deviceCodeOnly) {
    throw usageFailure(
      'stdin is not a terminal, so `login` will not wait for an approval it cannot report.',
      '',
      '  For a remote shell: `kleora login --device-code-only` prints the code',
      '  and the verification URL as JSON and exits. Approve it in a browser, then',
      '  run `kleora login --device-code-only` again — or run `login` where there',
      '  is a terminal.',
      '',
      '  For CI: use an API key. Set KLEORA_API_KEY in the environment; a key',
      '  needs no browser and its environment scope is the point.',
    )
  }

  // The issuer: the explicit one, or the API's answer.
  const issuer = await config.resolveIssuer()
  const authorization = await startDeviceAuthorization({
    issuer,
    clientId: config.clientId,
    userAgent: USER_AGENT,
    fetch: fetchImpl,
  })

  if (deviceCodeOnly) {
    // A machine-readable handoff, on stdout, because here the code *is* the
    // data. Nothing is stored and nothing is polled: the person approves in
    // their own browser and runs `login` again.
    printOwnJson(io, {
      user_code: authorization.userCode,
      verification_uri: authorization.verificationUri,
      verification_uri_complete: authorization.verificationUriComplete,
      expires_in: authorization.expiresIn,
      interval: authorization.interval,
      profile: config.profile,
    })
    return
  }

  announce(io, authorization, config.profile)
  if (open) {
    const opener = deps.openUrl
    if (opener === undefined) {
      io.err('--open is not available in this build; open the URL above yourself.\n')
    } else {
      opener(authorization.verificationUriComplete)
      io.err('Opened it in your browser.\n')
    }
  }

  let interval = authorization.interval
  const deadline = now() + authorization.expiresIn * 1000

  // Bounded by the authorization's own `expires_in`, and every iteration
  // sleeps: there is no way for this loop to spin, and no way for it to
  // outlive the code it is polling.
  while (now() < deadline) {
    await sleep(interval * 1000)
    try {
      const tokens = await pollDeviceToken({
        issuer,
        clientId: config.clientId,
        deviceCode: authorization.deviceCode,
        userAgent: USER_AGENT,
        fetch: fetchImpl,
      })
      if (tokens.refreshToken === undefined) {
        throw new CliFailure(EXIT.UNEXPECTED, [
          '✗ Signed in, but the issuer returned no refresh token.',
          '',
          '  Without one there is nothing to store, so the next command would ask',
          '  you to sign in again. This is a deployment problem, not yours.',
        ])
      }
      await store.set(config.profile, tokens.refreshToken)
      rememberProfile(deps.configDir, config.profile)
      if (json) {
        printOwnJson(io, { profile: config.profile, issuer, store: store.backend })
      } else {
        io.err(`\nSigned in on profile '${config.profile}'.\n`)
        io.err(`The credential is in ${where(store.backend)}.\n`)
        io.err(`Run \`kleora whoami\` to see who that is.\n`)
      }
      return
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error
      switch (error.code) {
        case 'authorization_pending':
          continue
        case 'slow_down':
          // An instruction, not a hint: the issuer raises its own floor by five
          // seconds on every refusal and remembers it, so polling harder makes
          // this slower.
          interval += 5
          io.err(`The issuer asked for a wider interval; polling every ${String(interval)}s.\n`)
          continue
        case 'access_denied':
          throw new CliFailure(EXIT.UNAUTHENTICATED, [
            '✗ The approval was denied.',
            '',
            '  Nothing was stored. If that was not you, somebody was shown your',
            '  code — start again and do not share it.',
          ])
        case 'expired_token':
          throw new CliFailure(EXIT.UNAUTHENTICATED, [
            '✗ The code expired before it was approved.',
            '',
            '  Run `kleora login` again for a fresh one.',
          ])
        default:
          throw new CliFailure(EXIT.UNEXPECTED, [
            `✗ The issuer refused the sign-in: ${error.code}.`,
            '',
            `  ${error.message}`,
          ])
      }
    }
  }

  throw new CliFailure(EXIT.UNAUTHENTICATED, [
    '✗ The code expired before it was approved.',
    '',
    '  Run `kleora login` again for a fresh one.',
  ])
}

function announce(io: Io, authorization: DeviceAuthorization, profile: string): void {
  // Every line of this is on stderr: the sign-in is not data, and `login` has
  // no stdout output at all unless `--json` or `--device-code-only` asked for
  // some.
  io.err(`Sign in to Kleora${profile === 'default' ? '' : ` on profile '${profile}'`}.\n\n`)
  io.err(`  Code   ${authorization.userCode}\n`)
  io.err(`  URL    ${authorization.verificationUri}\n\n`)
  io.err(`  Or open this, which fills the code in for you:\n`)
  io.err(`  ${authorization.verificationUriComplete}\n\n`)
  io.err(
    'Approving asks you to re-enter your password, even on a session that is\n' +
      'already signed in — that is the control working, not a bug. It has to happen\n' +
      'within five minutes of approving.\n\n',
  )
  io.err('Waiting for approval. Ctrl-C to stop.\n')
}

function where(backend: CredentialStore['backend']): string {
  return backend === 'keychain' ? 'the OS keychain' : 'a 0600 file under ~/.kleora-cli'
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
