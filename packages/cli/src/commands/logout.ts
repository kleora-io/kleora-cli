/**
 * `kleora logout` — revoke at the issuer, then delete locally
 * **unconditionally**.
 *
 * Revoke at the issuer (RFC 7009), then delete locally **unconditionally**,
 * including when the revocation failed. A token we could not revoke because
 * the machine is offline is still a token that must not stay on disk.
 * `logout --all` does every profile.
 *
 * The order matters and so does the unconditional part. Revoking first is what
 * makes any copy somebody already took of the file worthless, and it writes one
 * `refresh_token.revoked` audit event so the account's owner can see the access
 * end. Keeping the local token because the revocation failed would be the worst
 * of both outcomes.
 *
 * The read, the revocation and the delete all run holding the profile's
 * credential lock (`CredentialStore.lock`), the same lock every refresh takes.
 * Without it, another process part-way through a refresh could finish after the
 * delete and write its rotated refresh token back, leaving the person signed
 * in. With it, the logout waits for that refresh, then revokes and deletes the
 * token the refresh stored (kleora-io/kleora#1098).
 */
import { revokeRefreshToken, type CredentialStore } from '@kleora-io/core'

import type { Flags } from '../argv.js'
import type { Config } from '../config.js'
import { printOwnJson, type Io } from '../output.js'
import { forgetProfile, readProfiles } from '../profiles.js'
import { USER_AGENT } from '../version.js'

export interface LogoutDependencies {
  readonly config: Config
  readonly flags: Flags
  readonly io: Io
  readonly fetch: typeof globalThis.fetch
  readonly store: CredentialStore
  readonly configDir: string
  readonly json: boolean
}

interface Outcome {
  readonly profile: string
  readonly hadCredential: boolean
  readonly revoked: boolean
  readonly revocationError: string | undefined
}

export async function logout(deps: LogoutDependencies): Promise<void> {
  const { config, flags, io, store, json } = deps
  const all = flags.boolean('all') === true

  // The index, plus the named profile, so `--all` covers a profile the index
  // never learned about and `logout --profile x` always covers `x`.
  const profiles = all
    ? [...new Set([...readProfiles(deps.configDir), config.profile])].sort()
    : [config.profile]

  const outcomes: Outcome[] = []
  for (const profile of profiles) {
    outcomes.push(await logoutOne(deps, profile))
  }

  if (json) {
    printOwnJson(io, { profiles: outcomes, store: store.backend })
    return
  }
  // Memoised: a revocation that succeeded already resolved it, so this asks
  // nothing new — it only puts the issuer's name in the sentence.
  const issuer = outcomes.some((outcome) => outcome.revoked) ? await config.resolveIssuer() : ''
  for (const outcome of outcomes) io.err(`${describe(outcome, issuer, store)}\n`)
}

async function logoutOne(deps: LogoutDependencies, profile: string): Promise<Outcome> {
  const { store } = deps
  const run = (): Promise<Outcome> => revokeAndDelete(deps, profile)
  // `lock` is optional on the interface; every store `createCredentialStore`
  // returns carries it.
  const outcome = await (store.lock === undefined ? run() : store.lock(profile, run))
  forgetProfile(deps.configDir, profile)
  return outcome
}

async function revokeAndDelete(deps: LogoutDependencies, profile: string): Promise<Outcome> {
  const { config, store, fetch: fetchImpl } = deps
  const refreshToken = await store.get(profile)
  if (refreshToken === null) {
    return { profile, hadCredential: false, revoked: false, revocationError: undefined }
  }

  let revoked = false
  let revocationError: string | undefined
  try {
    // Inside the `try`: an issuer the API cannot name is one more reason the
    // revocation did not happen, never a reason to keep the token on disk.
    await revokeRefreshToken({
      issuer: await config.resolveIssuer(),
      clientId: config.clientId,
      refreshToken,
      userAgent: USER_AGENT,
      fetch: fetchImpl,
    })
    revoked = true
  } catch (error) {
    revocationError = error instanceof Error ? error.message : String(error)
  }

  // Unconditional, and after the attempt either way.
  await store.delete(profile)
  return { profile, hadCredential: true, revoked, revocationError }
}

function describe(outcome: Outcome, issuer: string, store: CredentialStore): string {
  const where = store.backend === 'keychain' ? 'the OS keychain' : '~/.kleora-cli'
  if (!outcome.hadCredential) {
    return `'${outcome.profile}': nothing stored — nothing to remove.`
  }
  if (outcome.revoked) {
    return (
      `'${outcome.profile}': revoked at ${issuer} and deleted from ${where}. ` +
      'Nothing on this machine can reach the account on this profile any more.'
    )
  }
  return (
    `'${outcome.profile}': deleted from ${where}, but the authorization could not be ` +
    `revoked (${outcome.revocationError ?? 'reason unknown'}). The grant may still be live — ` +
    'revoke it in the console, beside your other sessions.'
  )
}
