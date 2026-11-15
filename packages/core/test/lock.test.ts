/** The cross-process credential lock (kleora-io/kleora#1097). */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CredentialLockTimeout, withFileLock } from '../src/credentials/lock.js'
import { FileCredentialStore } from '../src/credentials/store.js'

let root: string
let lockPath: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kleora-lock-'))
  lockPath = join(root, 'dir', 'credentials-default.lock')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('withFileLock', () => {
  it('serialises holders and removes the lock afterwards', async () => {
    let inside = 0
    let most = 0
    const hold = () =>
      withFileLock(lockPath, async () => {
        inside++
        most = Math.max(most, inside)
        await tick(15)
        inside--
      })

    await Promise.all([hold(), hold(), hold()])

    expect(most).toBe(1)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('releases the lock when the holder throws', async () => {
    await expect(withFileLock(lockPath, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(existsSync(lockPath)).toBe(false)
  })

  it('takes over a lock whose holder on this host has exited', async () => {
    const dead = spawnSync(process.execPath, ['-e', '']).pid
    await withFileLock(join(root, 'dir', 'warmup.lock'), () => Promise.resolve()) // creates the dir
    writeFileSync(lockPath, `${String(dead)}\n${hostname()}\n${String(Date.now())}\nx\n`)

    const result = await withFileLock(lockPath, () => Promise.resolve('ran'), { timeoutMs: 1_000 })

    expect(result).toBe('ran')
    expect(readdirSync(join(root, 'dir'))).toEqual([])
  })

  it('takes over a lock older than staleMs, whoever holds it', async () => {
    await withFileLock(join(root, 'dir', 'warmup.lock'), () => Promise.resolve())
    writeFileSync(lockPath, `${String(process.pid)}\nanother-host\n0\nx\n`)
    const old = new Date(Date.now() - 120_000)
    utimesSync(lockPath, old, old)

    const result = await withFileLock(lockPath, () => Promise.resolve('ran'), { timeoutMs: 1_000 })

    expect(result).toBe('ran')
  })

  it('gives up after its bounded wait on a live lock, changing nothing', async () => {
    await withFileLock(join(root, 'dir', 'warmup.lock'), () => Promise.resolve())
    // Held by this (live) process: never stale before staleMs.
    writeFileSync(lockPath, `${String(process.pid)}\n${hostname()}\n${String(Date.now())}\nx\n`)
    let ran = false

    const started = Date.now()
    await expect(
      withFileLock(
        lockPath,
        () => {
          ran = true
          return Promise.resolve()
        },
        { timeoutMs: 200, pollMs: 20 },
      ),
    ).rejects.toBeInstanceOf(CredentialLockTimeout)

    expect(ran).toBe(false)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(existsSync(lockPath)).toBe(true)
  })
})

describe('FileCredentialStore.lock', () => {
  it('holds a lock file beside the credential, per profile, and removes it after', async () => {
    const dir = join(root, 'config')
    const store = new FileCredentialStore(dir)
    await store.set('work', 'a-secret-refresh-token')
    let during: string[] = []

    await store.lock('work', () => {
      during = readdirSync(dir)
      return Promise.resolve()
    })

    expect(during).toContain('credentials-work.lock')
    expect(readdirSync(dir)).toEqual(['credentials-work.json'])
  })
})
