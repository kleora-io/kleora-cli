/**
 * Where the refresh token lives: the OS keychain, falling back to a `0600` file
 * under the user's config directory when there is no keychain. Never an
 * environment variable, never a command-line argument — neither appears
 * anywhere in this module, and nothing in either tool reads a credential from
 * either.
 *
 * Never a file inside the user's project, which is the one placement this
 * module makes structurally impossible: the path is always built from
 * `homedir()`.
 *
 * The access token is never written here at all — it lives in memory only
 * (`session.ts`), for the life of the process.
 */
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { withFileLock } from './lock.js'

/** One stored credential, keyed by profile. */
export interface CredentialStore {
  get(profile: string): Promise<string | null>
  set(profile: string, refreshToken: string): Promise<void>
  delete(profile: string): Promise<void>
  /**
   * Runs `fn` holding this profile's cross-process lock, so that two
   * processes sharing the store never present one refresh token twice
   * (`Session` takes it around every refresh). Optional so that a store
   * written for a test still type-checks; a store without it is serialised
   * within one `Session` only. Both stores here implement it with a lock file
   * in the config directory (`credentials-<profile>.lock`) — the keychain
   * store too, since a keychain has no lock of its own.
   */
  lock?<T>(profile: string, fn: () => Promise<T>): Promise<T>
  /** For `kleora_whoami` and diagnostics — never the secret itself. */
  readonly backend: 'keychain' | 'file'
}

/**
 * Which store a tool is asking for. The two tools deliberately do **not**
 * share a stored credential and cannot: a refresh token is bound to the
 * OAuth client it was issued to, and each tool is its own client. What they
 * share is this code.
 *
 * A single `~/.kleora` directory would be tidier and is deliberately not
 * done — moving a live credential store makes every existing MCP user sign in
 * again for no benefit they can see.
 */
export interface CredentialStoreOptions {
  /** The keychain service name: `kleora-mcp` or `kleora-cli`. */
  service: string
  /** Where the `0600` fallback lives: `~/.kleora-mcp` or `~/.kleora-cli`. */
  configDir: string
}

/** `~/.<name>`; overridable for tests, never by a flag a person sets. */
export function defaultConfigDir(name: string): string {
  return join(homedir(), `.${name}`)
}

/**
 * Tries the OS keychain via `@napi-rs/keyring` (an optional dependency); falls
 * back to the file store the moment
 * loading it, or any one call to it, fails. A Linux box with no secret
 * service running is the ordinary case this exists for, not an edge case:
 * the fallback has to work as well as the keychain does, not merely exist.
 */
export async function createCredentialStore({
  service,
  configDir,
}: CredentialStoreOptions): Promise<CredentialStore> {
  const fileStore = new FileCredentialStore(configDir)
  const keyring = await loadKeyring()
  if (keyring === null) return fileStore
  return new KeychainCredentialStore(service, keyring, fileStore)
}

/** The shape of `@napi-rs/keyring`'s `AsyncEntry` this module actually uses. */
interface KeyringModule {
  AsyncEntry: new (service: string, account: string) => {
    // 2.0 resolves a missing entry to `undefined`, 2.1 to `null`; both mean "none".
    getPassword(): Promise<string | null | undefined>
    setPassword(password: string): Promise<void>
    deleteCredential(): Promise<boolean>
  }
}

async function loadKeyring(): Promise<KeyringModule | null> {
  try {
    // A dynamic import, not a static one: the whole point of an optional
    // dependency is that a platform with no prebuilt binary for it — or no
    // keychain at all — still installs and still runs this server, on the
    // file fallback.
    return await import('@napi-rs/keyring')
  } catch {
    return null
  }
}

class KeychainCredentialStore implements CredentialStore {
  readonly backend = 'keychain'
  #service: string
  #keyring: KeyringModule
  #fallback: FileCredentialStore
  /** Set once any call fails, so a dead keychain is not retried per call. */
  #broken = false

  constructor(service: string, keyring: KeyringModule, fallback: FileCredentialStore) {
    this.#service = service
    this.#keyring = keyring
    this.#fallback = fallback
  }

  async get(profile: string): Promise<string | null> {
    if (this.#broken) return this.#fallback.get(profile)
    try {
      const entry = new this.#keyring.AsyncEntry(this.#service, profile)
      const value = await entry.getPassword()
      return value ?? null
    } catch {
      this.#broken = true
      return this.#fallback.get(profile)
    }
  }

  async set(profile: string, refreshToken: string): Promise<void> {
    if (this.#broken) return this.#fallback.set(profile, refreshToken)
    try {
      const entry = new this.#keyring.AsyncEntry(this.#service, profile)
      await entry.setPassword(refreshToken)
    } catch {
      this.#broken = true
      await this.#fallback.set(profile, refreshToken)
    }
  }

  async delete(profile: string): Promise<void> {
    if (this.#broken) return this.#fallback.delete(profile)
    try {
      const entry = new this.#keyring.AsyncEntry(this.#service, profile)
      await entry.deleteCredential()
    } catch {
      this.#broken = true
      await this.#fallback.delete(profile)
    }
  }

  lock<T>(profile: string, fn: () => Promise<T>): Promise<T> {
    return this.#fallback.lock(profile, fn)
  }
}

/**
 * A `0600` file per profile under `configDir`. `mode` on `writeFileSync` is
 * still subject to the process umask, so every write is followed by an
 * explicit `chmodSync` — the guarantee is the final permission bits, not
 * merely the flag passed to the syscall that created the file.
 */
export class FileCredentialStore implements CredentialStore {
  readonly backend = 'file'
  #dir: string

  constructor(dir: string) {
    this.#dir = dir
  }

  // Every one of these is synchronous under the hood (`node:fs`'s sync API,
  // deliberately — this runs at most once per tool call, never in a hot
  // loop) but returns a `Promise` regardless, so `KeychainCredentialStore`
  // can fall back to it without its callers caring which backend answered.
  get(profile: string): Promise<string | null> {
    try {
      const raw = readFileSync(this.#path(profile), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && 'refreshToken' in parsed) {
        const refreshToken = parsed.refreshToken
        if (typeof refreshToken === 'string') return Promise.resolve(refreshToken)
      }
      return Promise.resolve(null)
    } catch (error) {
      if (isNotFound(error)) return Promise.resolve(null)
      return Promise.reject(asError(error))
    }
  }

  set(profile: string, refreshToken: string): Promise<void> {
    try {
      mkdirSync(this.#dir, { recursive: true, mode: 0o700 })
      chmodSync(this.#dir, 0o700)
      const path = this.#path(profile)
      // Write beside the target and rename, so a process killed mid-write
      // never leaves a half-written credential file for the next run to parse.
      const tmp = `${path}.${randomUUID()}.tmp`
      writeFileSync(tmp, JSON.stringify({ refreshToken }), { mode: 0o600 })
      chmodSync(tmp, 0o600)
      renameSync(tmp, path)
      return Promise.resolve()
    } catch (error) {
      return Promise.reject(asError(error))
    }
  }

  delete(profile: string): Promise<void> {
    try {
      rmSync(this.#path(profile))
      return Promise.resolve()
    } catch (error) {
      if (isNotFound(error)) return Promise.resolve()
      return Promise.reject(asError(error))
    }
  }

  lock<T>(profile: string, fn: () => Promise<T>): Promise<T> {
    return withFileLock(join(this.#dir, `credentials-${encodeURIComponent(profile)}.lock`), fn)
  }

  #path(profile: string): string {
    // Profile names come from configuration, never from a tool argument or
    // API response, but a filesystem path is still built from a string the
    // person typed — encoded rather than trusted to contain no `/`.
    return join(this.#dir, `credentials-${encodeURIComponent(profile)}.json`)
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
