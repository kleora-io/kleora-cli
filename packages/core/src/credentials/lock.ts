/**
 * An exclusive lock file, so that two processes sharing one credential store
 * never present the same refresh token twice.
 *
 * Refresh tokens rotate: the second presentation of one is a replay, and the
 * issuer answers a replay by revoking the whole grant. Two Kleora MCP servers
 * (two editor windows, or a subagent with its own server) or two CLI commands
 * in one pipeline share one keychain entry or one file, so without this lock
 * whichever refreshed second signed both of them out.
 *
 * The lock is a file created with `O_CREAT | O_EXCL` (`'wx'`), which is atomic
 * on every local filesystem Node supports. It records the holder's pid,
 * hostname and start time — nothing secret. It is never held longer than one
 * refresh request, and a waiter never spins: every wait sleeps, and the total
 * wait is bounded.
 *
 * A lock is **stale**, and is taken over, when its holder is a process on this
 * host that no longer exists, or when it is older than `staleMs` whoever holds
 * it (a holder on another host sharing the home directory, a recycled pid, or a
 * refresh request that hung).
 */
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname } from 'node:path'

import { KleoraToolError } from '../errors.js'

export interface FileLockOptions {
  /** Give up waiting after this long. Default 40 s. */
  timeoutMs?: number
  /** A lock older than this is taken over, whoever holds it. Default 30 s. */
  staleMs?: number
  /** How long to sleep between attempts. Default 50 ms, with jitter. */
  pollMs?: number
}

/** The lock could not be taken within its bounded wait. Nothing was changed. */
export class CredentialLockTimeout extends KleoraToolError {
  constructor(waitedMs: number) {
    super(
      'credential_lock_timeout',
      `Another Kleora process held the credential lock for more than ${String(Math.round(waitedMs / 1000))} s. ` +
        'Nothing was changed; try again.',
    )
    this.name = 'CredentialLockTimeout'
  }
}

const DEFAULT_TIMEOUT_MS = 40_000
const DEFAULT_STALE_MS = 30_000
const DEFAULT_POLL_MS = 50

/** Runs `fn` holding the lock file at `path`, created (with its directory) if absent. */
export async function withFileLock<T>(
  path: string,
  fn: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS

  const token = `${String(process.pid)}\n${hostname()}\n${String(Date.now())}\n${randomUUID()}\n`
  const started = Date.now()
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })

  for (;;) {
    if (tryCreate(path, token)) break
    recoverIfStale(path, staleMs)
    if (tryCreate(path, token)) break
    const waited = Date.now() - started
    if (waited >= timeoutMs) throw new CredentialLockTimeout(waited)
    await sleep(Math.min(pollMs + Math.floor(Math.random() * pollMs), timeoutMs - waited))
  }

  try {
    return await fn()
  } finally {
    release(path, token)
  }
}

function tryCreate(path: string, token: string): boolean {
  let fd: number
  try {
    fd = openSync(path, 'wx', 0o600)
  } catch (error) {
    if (codeOf(error) === 'EEXIST') return false
    throw error
  }
  try {
    writeSync(fd, token)
  } finally {
    closeSync(fd)
  }
  return true
}

/** Removes the lock only if it is still ours: a lock taken over as stale is somebody else's now. */
function release(path: string, token: string): void {
  if (readOrNull(path) === token) {
    try {
      rmSync(path)
    } catch {
      // Already gone: nothing to release.
    }
  }
}

function recoverIfStale(path: string, staleMs: number): void {
  const content = readOrNull(path)
  if (content === null) return
  let mtimeMs: number
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch {
    return
  }
  if (!isStale(content, mtimeMs, staleMs)) return

  // Move it aside rather than deleting it in place, then check that what was
  // moved is what was judged stale. Two waiters can judge the same lock stale;
  // the second must not delete the lock the first has just taken.
  const aside = `${path}.${randomUUID()}.stale`
  try {
    renameSync(path, aside)
  } catch {
    return
  }
  if (readOrNull(aside) !== content) {
    // A live lock was moved: put it back unless somebody holds the path now.
    try {
      linkSync(aside, path)
    } catch {
      // The path is taken; the lock we moved belonged to a holder that will
      // find its file gone on release, which `release` tolerates.
    }
  }
  try {
    rmSync(aside)
  } catch {
    // Nothing to clean up.
  }
}

function isStale(content: string, mtimeMs: number, staleMs: number): boolean {
  if (Date.now() - mtimeMs > staleMs) return true
  const [pidText, host] = content.split('\n')
  const pid = Number(pidText)
  if (host !== hostname() || !Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    // EPERM: the process exists but belongs to someone else — alive.
    return codeOf(error) === 'ESRCH'
  }
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function codeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)))
}
