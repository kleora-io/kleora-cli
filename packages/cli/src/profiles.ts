/**
 * The names of the profiles this machine has signed in on.
 *
 * **Names only. Never a credential, and never anything derived from one.**
 *
 * It is worth saying why this file exists rather than adding it quietly.
 * `logout --all` does every profile, and neither backend can be enumerated to find
 * out what "every" means: the OS keychain has no listing API through
 * `@napi-rs/keyring`, and on the keychain backend no files are written at all,
 * so a directory scan finds nothing. Without an index, `logout --all` on a
 * machine with a working keychain would silently do nothing — which is the
 * worst possible outcome for a command whose whole job is leaving no credential
 * behind.
 *
 * The file is a JSON array of strings under the same `0700` directory as the
 * `0600` fallback store. It is written after a successful `login` and pruned by
 * `logout`, and everything that reads it treats a missing or unparsable file as
 * an empty list — an index is a convenience, never an authority.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILENAME = 'profiles.json'

export function readProfiles(configDir: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(configDir, FILENAME), 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((name): name is string => typeof name === 'string')
  } catch {
    return []
  }
}

export function rememberProfile(configDir: string, profile: string): void {
  const next = [...new Set([...readProfiles(configDir), profile])].sort()
  write(configDir, next)
}

export function forgetProfile(configDir: string, profile: string): void {
  write(
    configDir,
    readProfiles(configDir).filter((name) => name !== profile),
  )
}

function write(configDir: string, profiles: readonly string[]): void {
  try {
    mkdirSync(configDir, { recursive: true, mode: 0o700 })
    chmodSync(configDir, 0o700)
    const path = join(configDir, FILENAME)
    writeFileSync(path, `${JSON.stringify(profiles)}\n`, { mode: 0o600 })
    chmodSync(path, 0o600)
  } catch {
    // A profile index that could not be written is not a reason to fail a
    // sign-in that otherwise worked. `logout --all` degrades; `logout
    // --profile <name>` does not, and that is the one that matters.
  }
}
