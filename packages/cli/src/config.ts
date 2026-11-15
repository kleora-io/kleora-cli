/**
 * What this CLI reads from the environment and from global flags — and, much
 * more importantly, what it refuses to read from either.
 *
 * `KLEORA_PROFILE`, `KLEORA_BASE_URL`, `KLEORA_ISSUER` and `KLEORA_CLIENT_ID`
 * are read from the environment. **No token, refresh token, API key, client
 * secret or password is, ever, and none is accepted as a flag value.**
 *
 * With one named exception, and it is not a softening of the rule:
 * `KLEORA_API_KEY` *is* read from the environment, because CI has no browser to
 * approve a device grant in and an API key is the credential built for exactly
 * that. It is minted for a machine, scoped to one Environment by construction,
 * revocable by name — and still never accepted in `argv`. "The two are
 * different credentials, and what separates them is whether one of them is a
 * person."
 *
 * Note what that means for this file: `KLEORA_API_KEY` is read, never
 * printed, never logged, and never written anywhere. Nothing here may add a
 * flag that carries it.
 */
import { issuerResolver } from '@kleora-io/core'

import type { Flags } from './argv.js'
import { usageFailure } from './exit.js'
import { USER_AGENT } from './version.js'

/** `apps.accounts.services.provisioning`'s `KLEORA_CLI_CLIENT_ID` default. */
export const DEFAULT_CLIENT_ID = 'kleora-cli'

export const DEFAULT_BASE_URL = 'https://api.kleora.io'

/** The keychain service name and the `0600` fallback directory's name. */
export const KEYCHAIN_SERVICE = 'kleora-cli'
export const CONFIG_DIR_NAME = 'kleora-cli'

export interface Config {
  /** The management API's origin, e.g. `https://api.kleora.io`. */
  readonly baseUrl: string
  /**
   * An explicit issuer — `--issuer` or `KLEORA_ISSUER` — or `undefined`.
   *
   * Read `resolveIssuer()` instead unless the question is specifically "was one
   * given"; this field is only the override.
   */
  readonly issuer: string | undefined
  /**
   * The `id` App's production issuer, where the device grant runs: the explicit
   * one when given, otherwise what the API says at `GET
   * {baseUrl}/api/v1/platform`. Asked at most once per process, and only by a
   * command that reaches the issuer — nothing run under an API key does.
   */
  readonly resolveIssuer: () => Promise<string>
  /** The CLI's own Client row (`KLEORA_CLI_CLIENT_ID`), never the MCP server's. */
  readonly clientId: string
  /**
   * Which stored credential to use: "A person with a personal account and an
   * employer's account keeps two, rather than one that silently means whichever
   * was authorised last."
   */
  readonly profile: string
  /**
   * An API key from `KLEORA_API_KEY`, when one is set.
   *
   * Held as a string because a bearer credential has to be sent, but never
   * rendered: `whoami`, `doctor` and `--debug` all report only *that* a key is
   * in use, never its value. See `redactCredential`.
   */
  readonly apiKey: string | undefined
}

export interface ConfigEnvironment {
  readonly [name: string]: string | undefined
}

/**
 * Builds the configuration from flags and the environment, flags winning.
 *
 * `--base-url`, `--issuer` and `--client-id` exist because a self-hosted or
 * locally-developed deployment is a topology no default can guess; none of
 * them is a credential and none of them is secret.
 */
export function loadConfig(
  flags: Flags,
  env: ConfigEnvironment,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Config {
  const baseUrl = normaliseUrl(
    flags.value('base-url') ?? nonEmpty(env['KLEORA_BASE_URL']) ?? DEFAULT_BASE_URL,
    '--base-url',
  )
  const explicitIssuer = flags.value('issuer') ?? nonEmpty(env['KLEORA_ISSUER'])
  const issuer = explicitIssuer === undefined ? undefined : normaliseUrl(explicitIssuer, '--issuer')
  const clientId = flags.value('client-id') ?? nonEmpty(env['KLEORA_CLIENT_ID']) ?? DEFAULT_CLIENT_ID
  const profile = flags.value('profile') ?? nonEmpty(env['KLEORA_PROFILE']) ?? 'default'
  const resolveIssuer = issuerResolver(issuer, { baseUrl, userAgent: USER_AGENT, fetch: fetchImpl })

  return {
    baseUrl,
    issuer,
    resolveIssuer,
    clientId,
    profile,
    apiKey: nonEmpty(env['KLEORA_API_KEY']),
  }
}

/**
 * Flag names that do not exist and never will, refused by name.
 *
 * Checked before the noun and the verb, so `--password` gets this answer rather
 * than a generic "unknown flag": somebody who typed it has a mental model to
 * correct, and "unknown flag" would leave them looking for the right spelling
 * of it.
 */
const NEVER_A_FLAG = [
  'api-key',
  'token',
  'access-token',
  'refresh-token',
  'password',
  'new-password',
  'current-password',
  'secret',
  'client-secret',
  'credential',
] as const

export function refuseCredentialFlags(passed: readonly string[]): void {
  const found = NEVER_A_FLAG.filter((name) => passed.includes(name))
  if (found.length === 0) return
  throw usageFailure(
    `${found.map((name) => `--${name}`).join(', ')} does not exist, and will not.`,
    '',
    '  A credential in a flag is in your shell history, in `ps` output for',
    '  every other process on this machine, and in the scrollback of any',
    '  screenshot you paste into a support ticket.',
    '',
    '  For a person: `kleora login`. For CI: set KLEORA_API_KEY in the',
    '  environment, which is what a secret store is for. Setting a password is',
    "  the person's own job through a reset: `kleora users send-password-reset`.",
  )
}

function normaliseUrl(value: string, flag: string): string {
  // Fails loudly and early rather than as a confusing `TypeError` from deep
  // inside the first request.
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw usageFailure(`${flag} is not an absolute URL: '${value}'.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw usageFailure(`${flag} must be http or https, not '${url.protocol}'.`)
  }
  return url.toString().replace(/\/$/, '')
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

/**
 * Note what is *not* here: nothing renders `Config.apiKey`, not even redacted.
 *
 * `whoami` and `doctor` report that a key is in use and where it came from
 * (`KLEORA_API_KEY`), which is the fact somebody is actually asking about;
 * printing even a prefix would put part of a live credential into terminal
 * scrollback for no gain over naming the variable it came from.
 */
