/**
 * `login` and `logout`.
 *
 * The device grant itself is `@kleora-io/core`'s, and its own suite covers the
 * protocol. What is tested here is the three behaviours `login` fixes because
 * getting them wrong is the usual way a device-grant client is unpleasant, and
 * the unconditional half of `logout`.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileCredentialStore, type CredentialStore } from '@kleora-io/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { run } from '../src/cli.js'
import { EXIT } from '../src/exit.js'
import { RecordingIo } from '../src/output.js'
import { BASE_URL, fakeFetch, ISSUER, runCli, type FakeFetch, type Route } from './harness.js'

const DEVICE_AUTHORIZATION = JSON.stringify({
  device_code: 'device-code-1',
  user_code: 'BCDF-GHJK',
  verification_uri: `${ISSUER}/flow/device`,
  verification_uri_complete: `${ISSUER}/flow/device?user_code=BCDF-GHJK`,
  expires_in: 600,
  interval: 5,
})

const TOKENS = JSON.stringify({
  access_token: 'access-token',
  refresh_token: 'refresh-token-new',
  expires_in: 3600,
})

describe('login', () => {
  it('prints the code, the URL and the clickable URL, all on stderr', async () => {
    const result = await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stderr).toContain('BCDF-GHJK')
    expect(result.stderr).toContain(`${ISSUER}/flow/device`)
    expect(result.stderr).toContain('user_code=BCDF-GHJK')
    // Nothing on stdout: a sign-in is not data.
    expect(result.stdout).toBe('')
  })

  it('says that approving will ask for a password again, before they click', async () => {
    // Approval needs a re-authentication within five minutes. Saying so before
    // they click is the difference between a control and a bug report.
    const result = await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(result.stderr).toContain('re-enter your password')
    expect(result.stderr).toContain('five minutes')
    expect(result.stderr).toContain('that is the control working, not a bug')
  })

  it('does not open a browser unless asked', async () => {
    const openUrl = vi.fn()
    await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      openUrl,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('opens one with --open', async () => {
    const openUrl = vi.fn()
    await runCli({
      argv: ['login', '--open'],
      stdinIsTty: true,
      refreshToken: null,
      openUrl,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(openUrl).toHaveBeenCalledWith(`${ISSUER}/flow/device?user_code=BCDF-GHJK`)
  })

  // "`login` polls at the issued `interval`, and a `slow_down`
  // raises its own interval rather than being retried through."
  it('treats slow_down as an instruction and widens its own interval', async () => {
    const result = await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        {
          method: 'POST',
          path: '/oauth/token',
          status: 400,
          body: JSON.stringify({ error: 'authorization_pending' }),
        },
        { method: 'POST', path: '/oauth/token', status: 400, body: JSON.stringify({ error: 'slow_down' }) },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    // The issued interval was 5; after one `slow_down` it is 10, permanently.
    expect(result.stderr).toContain('polling every 10s')
    expect(result.stored).toBe('refresh-token-new')
  })

  it('stores the refresh token and says which backend holds it', async () => {
    // the stored token is in the keychain or a 0600 file, and appears
    // in neither the environment nor any command line. The file store's
    // permission bits are `@kleora-io/core`'s own test; what matters here is
    // that `login` says *where*.
    const result = await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(result.stderr).toContain('~/.kleora-cli')
    expect(result.stored).toBe('refresh-token-new')
  })

  it('never puts the refresh token on either stream', async () => {
    const result = await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(result.stdout).not.toContain('refresh-token-new')
    expect(result.stderr).not.toContain('refresh-token-new')
  })

  it('says access_denied plainly and stores nothing', async () => {
    const result = await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', status: 400, body: JSON.stringify({ error: 'access_denied' }) },
      ],
    })
    expect(result.code).toBe(EXIT.UNAUTHENTICATED)
    expect(result.stderr).toContain('approval was denied')
    expect(result.stored).toBeNull()
  })

  it('refuses to wait when stdin is not a terminal, and names the way out', async () => {
    const result = await runCli({ argv: ['login'], refreshToken: null })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--device-code-only')
    expect(result.stderr).toContain('KLEORA_API_KEY')
    // Nothing was started: no device authorization was requested.
    expect(result.calls).toHaveLength(0)
  })

  it('prints the code as JSON and exits with --device-code-only', async () => {
    const result = await runCli({
      argv: ['login', '--device-code-only'],
      refreshToken: null,
      routes: [{ method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION }],
    })
    expect(result.code).toBe(EXIT.OK)
    const document = JSON.parse(result.stdout) as Record<string, unknown>
    expect(document['user_code']).toBe('BCDF-GHJK')
    expect(document['verification_uri_complete']).toContain('user_code=BCDF-GHJK')
    // It does not poll: nothing was stored, and the person completes the
    // sign-in in a browser and runs `login` again.
    expect(result.calls.filter((call) => call.url === '/oauth/token')).toHaveLength(0)
  })

  it('refuses an unknown flag rather than ignoring it', async () => {
    const result = await runCli({ argv: ['login', '--opne'], refreshToken: null })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--opne')
  })
})

describe('logout', () => {
  // "`logout` revokes at the issuer and deletes locally; with the
  // issuer unreachable it still deletes locally and says the revocation failed."
  it('revokes at the issuer, then deletes locally', async () => {
    const result = await runCli({
      argv: ['logout'],
      routes: [{ method: 'POST', path: '/oauth/revoke', status: 200 }],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.calls.some((call) => call.url === '/oauth/revoke')).toBe(true)
    expect(result.stored).toBeNull()
    expect(result.stderr).toContain('revoked at')
  })

  it('deletes locally even when the revocation failed', async () => {
    const result = await runCli({
      argv: ['logout'],
      routes: [{ method: 'POST', path: '/oauth/revoke', status: 500, body: '{}' }],
    })
    expect(result.code).toBe(EXIT.OK)
    // The token is gone whatever the issuer said: "A token we could not revoke
    // because the machine is offline is still a token that must not stay on
    // disk."
    expect(result.stored).toBeNull()
    expect(result.stderr).toContain('could not be')
    expect(result.stderr).toContain('revoke it in the console')
  })

  it('says so when there was nothing stored', async () => {
    const result = await runCli({ argv: ['logout'], refreshToken: null })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stderr).toContain('nothing stored')
    expect(result.calls).toHaveLength(0)
  })

  it('sends the token as a form body, never in a URL', async () => {
    const result = await runCli({
      argv: ['logout'],
      routes: [{ method: 'POST', path: '/oauth/revoke', status: 200 }],
    })
    const revoke = result.calls.find((call) => call.url === '/oauth/revoke')
    expect(revoke?.url).toBe('/oauth/revoke')
    expect(revoke?.url).not.toContain('refresh-token')
  })

  it('never prints the token it revoked', async () => {
    const result = await runCli({
      argv: ['logout'],
      routes: [{ method: 'POST', path: '/oauth/revoke', status: 200 }],
    })
    expect(result.stdout).not.toContain('refresh-token')
    expect(result.stderr).not.toContain('refresh-token')
  })

  it('covers every profile it knows about with --all', async () => {
    // The profile index exists for this: neither backend can be enumerated, so
    // `--all` on a keychain machine would otherwise silently do nothing.
    const first = await runCli({
      argv: ['login'],
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })
    expect(first.code).toBe(EXIT.OK)

    // A second run in a fresh directory, so the assertion is about the index
    // rather than about a shared temp dir: `--all` covers `default` and says so.
    const result = await runCli({
      argv: ['logout', '--all'],
      routes: [{ method: 'POST', path: '/oauth/revoke', status: 200 }],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stderr).toContain("'default'")
  })
})

// Where the issuer comes from. The harness sets
// KLEORA_ISSUER for every other test; these clear it, so the CLI has to ask.
describe('with no explicit issuer', () => {
  const NO_OVERRIDE = { KLEORA_ISSUER: '' }
  const PLATFORM = { method: 'GET', path: '/api/v1/platform', body: JSON.stringify({ issuer: ISSUER }) }

  it('login asks the API for the issuer first, then runs the device grant there', async () => {
    const result = await runCli({
      argv: ['login'],
      env: NO_OVERRIDE,
      stdinIsTty: true,
      refreshToken: null,
      routes: [
        PLATFORM,
        { method: 'POST', path: '/oauth/device_authorization', body: DEVICE_AUTHORIZATION },
        { method: 'POST', path: '/oauth/token', body: TOKENS },
      ],
    })

    expect(result.code).toBe(EXIT.OK)
    expect(result.stored).toBe('refresh-token-new')
    expect(result.calls.map((call) => `${call.method} ${call.url}`).slice(0, 2)).toEqual([
      'GET /api/v1/platform',
      'POST /oauth/device_authorization',
    ])
    // Anonymous: the question is asked before there is anything to send.
    expect(result.calls[0]?.headers['authorization']).toBeUndefined()
  })

  it('login fails plainly when the API cannot name the issuer, and starts nothing', async () => {
    const result = await runCli({
      argv: ['login'],
      env: NO_OVERRIDE,
      stdinIsTty: true,
      refreshToken: null,
      routes: [{ method: 'GET', path: '/api/v1/platform', status: 404, body: '{}' }],
    })

    expect(result.code).not.toBe(EXIT.OK)
    expect(result.stderr).toContain('/api/v1/platform')
    expect(result.calls.some((call) => call.url === '/oauth/device_authorization')).toBe(false)
  })

  it('logout deletes locally even when the issuer cannot be found', async () => {
    const result = await runCli({
      argv: ['logout'],
      env: NO_OVERRIDE,
      routes: [{ method: 'GET', path: '/api/v1/platform', status: 503, body: '{}' }],
    })

    expect(result.code).toBe(EXIT.OK)
    expect(result.stored).toBeNull()
    expect(result.stderr).toContain('could not be')
  })

  it('a command run under an API key never asks', async () => {
    const result = await runCli({
      argv: ['apps', 'list'],
      env: { ...NO_OVERRIDE, KLEORA_API_KEY: 'kl_test_secretvalue' },
      refreshToken: null,
      routes: [{ method: 'GET', path: '/api/v1/apps', body: JSON.stringify({ items: [], next_cursor: null }) }],
    })

    expect(result.code).toBe(EXIT.OK)
    expect(result.calls.some((call) => call.url === '/api/v1/platform')).toBe(false)
  })
})

// kleora-io/kleora#1098: a refresh in flight in another process holds the
// profile's credential lock. A logout that did not take it could delete the
// token and then watch the refresh write its rotated token back, leaving the
// person signed in. Driven through `run` directly rather than `runCli`, because
// the test has to hold the lock on the very store the command uses.
describe('logout holding the credential lock', () => {
  let root: string
  let configDir: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kleora-cli-logout-lock-'))
    configDir = join(root, 'config')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function logoutWith(store: CredentialStore, routes: Route[]): {
    done: Promise<{ code: number; stderr: string }>
    calls: FakeFetch['calls']
    revoked: string[]
  } {
    const io = new RecordingIo({ stdinIsTty: false, stdoutIsTty: false, answers: [] })
    const { fetch: fake, calls } = fakeFetch(routes)
    // The harness records string bodies only; the revocation is a form body.
    const revoked: string[] = []
    const fetch: typeof globalThis.fetch = (input, init) => {
      if (init?.body instanceof URLSearchParams) revoked.push(init.body.get('token') ?? '')
      return fake(input, init)
    }
    const done = run({
      argv: ['logout'],
      env: { KLEORA_BASE_URL: BASE_URL, KLEORA_ISSUER: ISSUER },
      io,
      fetch,
      cwd: root,
      store,
      configDir,
      sleep: () => Promise.resolve(),
    }).then((code) => ({ code, stderr: io.stderrText }))
    return { done, calls, revoked }
  }

  it('waits for a refresh in flight, then revokes and deletes the token it stored', async () => {
    const store = new FileCredentialStore(configDir)
    await store.set('default', 'refresh-token-1')

    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let refreshHolding!: () => void
    const holding = new Promise<void>((resolve) => {
      refreshHolding = resolve
    })
    const refresh = store.lock('default', async () => {
      refreshHolding()
      await released
      await store.set('default', 'refresh-token-2') // the rotated token
    })
    await holding

    let finished = false
    const { done, calls, revoked } = logoutWith(store, [{ method: 'POST', path: '/oauth/revoke', status: 200 }])
    const loggingOut = done.then((result) => {
      finished = true
      return result
    })

    // Give the logout every chance to run ahead of the lock.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(finished).toBe(false)
    expect(calls).toHaveLength(0)
    expect(await store.get('default')).toBe('refresh-token-1')

    release()
    await refresh
    const result = await loggingOut

    expect(result.code).toBe(EXIT.OK)
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(['POST /oauth/revoke'])
    expect(revoked).toEqual(['refresh-token-2'])
    expect(await store.get('default')).toBeNull()
    expect(result.stderr).toContain('revoked at')
  })

  it('still deletes locally when the revocation fails', async () => {
    const store = new FileCredentialStore(configDir)
    await store.set('default', 'refresh-token-1')

    const { done } = logoutWith(store, [{ method: 'POST', path: '/oauth/revoke', status: 500, body: '{}' }])
    const result = await done

    expect(result.code).toBe(EXIT.OK)
    expect(await store.get('default')).toBeNull()
    expect(result.stderr).toContain('could not be')
  })

  it('takes the lock for the profile it was asked about', async () => {
    const store = new FileCredentialStore(configDir)
    await store.set('work', 'refresh-token-1')
    const locked: string[] = []
    const lock = store.lock.bind(store)
    store.lock = <T>(profile: string, fn: () => Promise<T>): Promise<T> => {
      locked.push(profile)
      return lock(profile, fn)
    }

    const io = new RecordingIo({ stdinIsTty: false, stdoutIsTty: false, answers: [] })
    const { fetch } = fakeFetch([{ method: 'POST', path: '/oauth/revoke', status: 200 }])
    const code = await run({
      argv: ['logout', '--profile', 'work'],
      env: { KLEORA_BASE_URL: BASE_URL, KLEORA_ISSUER: ISSUER },
      io,
      fetch,
      cwd: root,
      store,
      configDir,
      sleep: () => Promise.resolve(),
    })

    expect(code).toBe(EXIT.OK)
    expect(locked).toEqual(['work'])
    expect(await store.get('work')).toBeNull()
  })
})
