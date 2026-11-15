/**
 * The stored refresh token is in the keychain or a `0600` file, and is absent
 * from the process environment and the command line. This exercises the file
 * backend directly — the one every platform falls back to, and the one whose
 * permission bits are actually checkable from a test.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createCredentialStore,
  defaultConfigDir,
  FileCredentialStore,
} from '../src/credentials/store.js'

// `dir` is `root/credentials`, created lazily by the store itself on the
// first `set()` — never pre-created here — so that `root` (a directory
// nothing else in the universe writes into: a fresh `mkdtemp` per test,
// never shared with another test file or a concurrent worker) is a
// race-free place to assert "nothing escaped upward" from.
let root: string
let dir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kleora-mcp-test-'))
  dir = join(root, 'credentials')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('FileCredentialStore', () => {
  it('has never seen the environment or argv — the constructor takes only a directory', () => {
    const store = new FileCredentialStore(dir)
    expect(store.backend).toBe('file')
  })

  it('round-trips a refresh token by profile', async () => {
    const store = new FileCredentialStore(dir)
    await store.set('work', 'refresh-token-1')
    await store.set('personal', 'refresh-token-2')

    expect(await store.get('work')).toBe('refresh-token-1')
    expect(await store.get('personal')).toBe('refresh-token-2')
    expect(await store.get('unknown-profile')).toBeNull()
  })

  it('writes the credential file 0600 and its directory 0700', async () => {
    const store = new FileCredentialStore(dir)
    await store.set('work', 'a-refresh-token')

    const dirMode = statSync(dir).mode & 0o777
    expect(dirMode).toBe(0o700)

    const files = readFileSync(join(dir, 'credentials-work.json'), 'utf8')
    expect(JSON.parse(files)).toEqual({ refreshToken: 'a-refresh-token' })
    const fileMode = statSync(join(dir, 'credentials-work.json')).mode & 0o777
    expect(fileMode).toBe(0o600)
  })

  it('deletes cleanly, including a profile that was never stored', async () => {
    const store = new FileCredentialStore(dir)
    await store.set('work', 'a-refresh-token')

    await store.delete('work')
    expect(await store.get('work')).toBeNull()
    await expect(store.delete('never-stored')).resolves.toBeUndefined()
  })

  describe('encodes a hostile profile name, so one cannot escape the credentials directory', () => {
    // The original version of this test asserted that an *unrelated,
    // absolute* path did not exist (`join(dir, '..', '..', 'etc', 'passwd')`).
    // That measures how deep the OS puts temp directories, not this store's
    // encoding: on Linux, CI's `dir` is shallow enough that two `..`s reach
    // the filesystem root, so the path *was* the real `/etc/passwd` — which
    // exists, so the assertion failed there and only there. It proved
    // nothing on any platform where it passed either. Replaced with
    // assertions about *this store's own* directory and its parent, which
    // are the actual "did not escape" claim and hold regardless of how deep
    // `dir` happens to sit. `root` — `dir`'s parent — is a fresh `mkdtemp`
    // private to this one test (nothing else, in this file or any other,
    // ever writes into it), so diffing its contents before and after is
    // race-free in a way diffing the shared OS temp directory is not.
    for (const [label, hostile] of Object.entries({
      'a relative traversal': '../../etc/passwd',
      'a leading slash': '/etc/passwd',
      'a backslash': 'a\\..\\b',
    })) {
      it(label, async () => {
        const rootBefore = readdirSync(root)
        const store = new FileCredentialStore(dir)

        await store.set(hostile, 'a-secret-token')

        // Exactly one file, inside `dir`, named after the *encoded* profile —
        // no path separator of any kind made it into a directory entry name.
        const entries = readdirSync(dir)
        expect(entries).toHaveLength(1)
        expect(entries[0]).toBe(`credentials-${encodeURIComponent(hostile)}.json`)
        expect(entries[0]).not.toMatch(/[/\\]/)

        // Nothing appeared in `dir`'s parent except `dir` itself — the real
        // "did not escape" claim, checkable without touching an absolute
        // system path.
        const rootAfter = readdirSync(root)
        expect(rootAfter.filter((name) => !rootBefore.includes(name))).toEqual(['credentials'])

        // Encoding round-trips: `get` with the same hostile name reads back
        // what `set` wrote, rather than the two merely agreeing to mangle it
        // the same way by coincidence.
        expect(await store.get(hostile)).toBe('a-secret-token')
      })
    }

    // Not covered: a NUL byte or a newline in the profile name. `profile`
    // comes from `--profile`/`KLEORA_MCP_PROFILE` (`config.ts`), typed by
    // whoever configures this server, never from a tool argument or an API
    // response — so unlike the three cases above (a plausible typo or a
    // copy-pasted path), a NUL byte here would mean the person's own shell
    // or config file already mishandled it before this module saw it. Left
    // untested rather than asserted on faith.
  })
})

describe('the two tools keep separate stores of the same shape', () => {
  // **The two tools do not share a stored credential**, and cannot: a refresh
  // token is bound to the OAuth client it was issued to, and the CLI is its own
  // client. They share the code that stores one.
  it('derives a directory per tool from the home directory, never from a project', () => {
    expect(defaultConfigDir('kleora-mcp')).toMatch(/kleora-mcp$/)
    expect(defaultConfigDir('kleora-cli')).toMatch(/kleora-cli$/)
    expect(defaultConfigDir('kleora-cli')).not.toBe(defaultConfigDir('kleora-mcp'))
    // A project directory is the one placement this must make impossible: a
    // careless `git add` there publishes a refresh token.
    expect(defaultConfigDir('kleora-cli')).toContain(homedir())
  })

  it('opens a store with the service name and directory it is given', async () => {
    const store = await createCredentialStore({ service: 'kleora-cli-test', configDir: dir })
    await store.set('default', 'a-refresh-token')
    expect(await store.get('default')).toBe('a-refresh-token')
    await store.delete('default')
    expect(await store.get('default')).toBeNull()
  })

  it("keeps one profile's credential out of another's file", async () => {
    const store = new FileCredentialStore(dir)
    await store.set('work', 'work-token')
    await store.set('personal', 'personal-token')
    expect(await store.get('work')).toBe('work-token')
    await store.delete('work')
    expect(await store.get('work')).toBeNull()
    expect(await store.get('personal')).toBe('personal-token')
  })
})
