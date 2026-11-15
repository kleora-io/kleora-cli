/**
 * kleora-io/kleora#1097: concurrent calls, a second process sharing the
 * store, and a logout from another process.
 *
 * The fake issuer here behaves like Kleora's on the one point that matters:
 * refresh tokens rotate, and presenting a spent one is a replay that revokes
 * the whole grant — so a test that replays fails loudly rather than passing by
 * luck.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Session } from '../src/credentials/session.js'
import { FileCredentialStore, type CredentialStore } from '../src/credentials/store.js'

const ISSUER = 'https://id.example.test'

class MemoryStore implements CredentialStore {
  readonly backend = 'file' as const
  #values = new Map<string, string>()
  get(profile: string): Promise<string | null> {
    return Promise.resolve(this.#values.get(profile) ?? null)
  }
  set(profile: string, refreshToken: string): Promise<void> {
    this.#values.set(profile, refreshToken)
    return Promise.resolve()
  }
  delete(profile: string): Promise<void> {
    this.#values.delete(profile)
    return Promise.resolve()
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A rotating issuer that revokes the grant on replay, with a delay so callers overlap. */
function rotatingIssuer(initial: string | null, delayMs = 20) {
  const state = {
    live: initial,
    generation: 0,
    presented: [] as string[],
    replays: 0,
    deviceStarts: 0,
  }
  const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const target = String(url)
    if (target.endsWith('/oauth/device_authorization')) {
      state.deviceStarts++
      return json(200, {
        device_code: `device-${String(state.deviceStarts)}`,
        user_code: 'BCDF-GHJK',
        verification_uri: `${ISSUER}/flow/device`,
        expires_in: 600,
        interval: 5,
      })
    }
    const body = init?.body
    if (!(body instanceof URLSearchParams)) throw new Error('expected a form body')
    if (body.get('grant_type') !== 'refresh_token') return json(400, { error: 'authorization_pending' })
    const presented = body.get('refresh_token') ?? ''
    state.presented.push(presented)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (presented !== state.live) {
      // Reuse detected: the whole family goes.
      state.replays++
      state.live = null
      return json(400, { error: 'invalid_grant', error_description: `token ${presented} was reused` })
    }
    state.generation++
    state.live = `refresh-${String(state.generation)}`
    return json(200, {
      access_token: `access-${String(state.generation)}`,
      refresh_token: state.live,
      expires_in: 900,
    })
  }
  return { state, fetch: fetchImpl as typeof globalThis.fetch }
}

function sessionOver(store: CredentialStore, fetchImpl: typeof globalThis.fetch): Session {
  return new Session({
    issuer: ISSUER,
    clientId: 'kleora-mcp',
    profile: 'default',
    store,
    userAgent: 'kleora-test/0',
    fetch: fetchImpl,
  })
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kleora-session-race-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('in-process single-flight', () => {
  it('concurrent ensureAccessToken calls with no access token share one refresh', async () => {
    const store = new MemoryStore()
    await store.set('default', 'refresh-0')
    const issuer = rotatingIssuer('refresh-0')
    const session = sessionOver(store, issuer.fetch)

    const states = await Promise.all(Array.from({ length: 5 }, () => session.ensureAccessToken()))

    expect(issuer.state.presented).toEqual(['refresh-0'])
    expect(issuer.state.replays).toBe(0)
    for (const state of states) expect(state).toEqual({ status: 'ready', accessToken: 'access-1' })
    expect(await store.get('default')).toBe('refresh-1')
  })

  it('concurrent accessTokenFromStoredCredential calls share one refresh', async () => {
    const store = new MemoryStore()
    await store.set('default', 'refresh-0')
    const issuer = rotatingIssuer('refresh-0')
    const session = sessionOver(store, issuer.fetch)

    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => session.accessTokenFromStoredCredential()),
    )

    expect(issuer.state.presented).toEqual(['refresh-0'])
    expect(tokens).toEqual(Array.from({ length: 5 }, () => 'access-1'))
  })

  it('concurrent calls with nothing stored start one device flow, not one each', async () => {
    const store = new MemoryStore()
    const issuer = rotatingIssuer(null)
    const session = sessionOver(store, issuer.fetch)

    const states = await Promise.all(Array.from({ length: 4 }, () => session.ensureAccessToken()))

    expect(issuer.state.deviceStarts).toBe(1)
    for (const state of states) expect(state.status).toBe('authorization_required')
  })
})

describe('cross-process serialisation', () => {
  it('two sessions over one file store never present the same refresh token twice', async () => {
    const store = new FileCredentialStore(join(root, 'config'))
    await store.set('default', 'refresh-0')
    const issuer = rotatingIssuer('refresh-0')
    // Two Session objects over one store directory: the shape of two server
    // processes sharing one credential. Only the lock file is shared.
    const a = sessionOver(new FileCredentialStore(join(root, 'config')), issuer.fetch)
    const b = sessionOver(new FileCredentialStore(join(root, 'config')), issuer.fetch)

    const [first, second] = await Promise.all([a.ensureAccessToken(), b.ensureAccessToken()])

    expect(issuer.state.replays).toBe(0)
    expect(new Set(issuer.state.presented).size).toBe(issuer.state.presented.length)
    expect(first.status).toBe('ready')
    expect(second.status).toBe('ready')
    expect(await store.get('default')).toBe(issuer.state.live)
    expect(issuer.state.live).not.toBeNull()
  })
})

describe('logout and external changes take effect on the next call', () => {
  it('a deleted store entry invalidates the cached access token', async () => {
    const store = new MemoryStore()
    await store.set('default', 'refresh-0')
    const issuer = rotatingIssuer('refresh-0')
    const session = sessionOver(store, issuer.fetch)
    expect(await session.ensureAccessToken()).toEqual({ status: 'ready', accessToken: 'access-1' })

    await store.delete('default') // `--logout`, in another process

    const after = await session.ensureAccessToken()
    expect(after.status).toBe('authorization_required')
    if (after.status === 'authorization_required') {
      expect(after.reason).toBe('signed_out')
      expect(after.message).toMatch(/removed/i)
    }
  })

  it('the CLI entry point also stops returning the cached token after a logout', async () => {
    const store = new MemoryStore()
    await store.set('default', 'refresh-0')
    const issuer = rotatingIssuer('refresh-0')
    const session = sessionOver(store, issuer.fetch)
    expect(await session.accessTokenFromStoredCredential()).toBe('access-1')

    await store.delete('default')

    expect(await session.accessTokenFromStoredCredential()).toBeNull()
  })

  it('a different stored credential (another login) replaces the cached token', async () => {
    const store = new MemoryStore()
    await store.set('default', 'refresh-0')
    const issuer = rotatingIssuer('refresh-0')
    const session = sessionOver(store, issuer.fetch)
    expect(await session.ensureAccessToken()).toEqual({ status: 'ready', accessToken: 'access-1' })

    // Logout, then a login as somebody else, both in another process.
    issuer.state.live = 'refresh-other'
    await store.set('default', 'refresh-other')

    expect(await session.ensureAccessToken()).toEqual({ status: 'ready', accessToken: 'access-2' })
    expect(issuer.state.presented).toEqual(['refresh-0', 'refresh-other'])
  })

  it('an unchanged store keeps serving the cached token without a refresh', async () => {
    const store = new MemoryStore()
    await store.set('default', 'refresh-0')
    const issuer = rotatingIssuer('refresh-0')
    const session = sessionOver(store, issuer.fetch)

    await session.ensureAccessToken()
    await session.ensureAccessToken()

    expect(issuer.state.presented).toEqual(['refresh-0'])
  })
})

describe('authorization_required says why', () => {
  it('no_credential when nothing was ever stored', async () => {
    const session = sessionOver(new MemoryStore(), rotatingIssuer(null).fetch)

    const state = await session.ensureAccessToken()

    expect(state.status).toBe('authorization_required')
    if (state.status === 'authorization_required') expect(state.reason).toBe('no_credential')
  })

  it('refresh_rejected names the OAuth error code, and never a token', async () => {
    const store = new MemoryStore()
    await store.set('default', 'a-spent-refresh-token')
    const issuer = rotatingIssuer('refresh-0')
    const session = sessionOver(store, issuer.fetch)

    const state = await session.ensureAccessToken()

    expect(state.status).toBe('authorization_required')
    if (state.status === 'authorization_required') {
      expect(state.reason).toBe('refresh_rejected')
      expect(state.message).toContain('invalid_grant')
      expect(JSON.stringify(state)).not.toContain('a-spent-refresh-token')
    }
    expect(await store.get('default')).toBeNull()

    // A retried call polls the same flow, and still says why it started.
    const retried = await session.ensureAccessToken()
    if (retried.status === 'authorization_required') expect(retried.reason).toBe('refresh_rejected')
  })
})
