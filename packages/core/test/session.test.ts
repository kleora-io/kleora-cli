/**
 * The device grant and its failure modes, driven through `Session` with a
 * fake issuer and an in-memory credential store — deterministic because
 * nothing here waits on a real clock or a real browser.
 */
import { describe, expect, it, vi } from 'vitest'
import { Session } from '../src/credentials/session.js'
import type { CredentialStore } from '../src/credentials/store.js'

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

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const ISSUER = 'https://id.example.test'
const CLIENT_ID = 'kleora-mcp'

describe('Session', () => {
  it('with no stored credential, starts a device flow and returns instructions — not an error', async () => {
    const store = new MemoryStore()
    const fetchMock = vi.fn((url: string | URL) => {
      expect(String(url)).toBe(`${ISSUER}/oauth/device_authorization`)
      return jsonResponse(200, {
        device_code: 'device-code-1',
        user_code: 'BCDF-GHJK',
        verification_uri: `${ISSUER}/flow/device`,
        verification_uri_complete: `${ISSUER}/flow/device?user_code=BCDF-GHJK`,
        expires_in: 600,
        interval: 5,
      })
    })
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock as unknown as typeof fetch })

    const state = await session.ensureAccessToken()

    expect(state.status).toBe('authorization_required')
    if (state.status === 'authorization_required') {
      expect(state.userCode).toBe('BCDF-GHJK')
      expect(state.verificationUri).toBe(`${ISSUER}/flow/device`)
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a retried call polls the same device code, and authorization_pending is not an error', async () => {
    const store = new MemoryStore()
    let polls = 0
    const fetchMock = vi.fn((url: string | URL) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return jsonResponse(200, {
          device_code: 'device-code-1',
          user_code: 'BCDF-GHJK',
          verification_uri: `${ISSUER}/flow/device`,
          expires_in: 600,
          interval: 5,
        })
      }
      polls++
      return jsonResponse(400, { error: 'authorization_pending' })
    })
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock as unknown as typeof fetch })

    await session.ensureAccessToken() // starts the flow
    const second = await session.ensureAccessToken() // retried call: one poll

    expect(second.status).toBe('authorization_required')
    expect(polls).toBe(1)
  })

  it('slow_down widens the interval without failing the call', async () => {
    const store = new MemoryStore()
    const fetchMock = vi.fn((url: string | URL) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return jsonResponse(200, {
          device_code: 'device-code-1',
          user_code: 'BCDF-GHJK',
          verification_uri: `${ISSUER}/flow/device`,
          expires_in: 600,
          interval: 5,
        })
      }
      return jsonResponse(400, { error: 'slow_down' })
    })
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock as unknown as typeof fetch })

    await session.ensureAccessToken()
    const second = await session.ensureAccessToken()

    expect(second.status).toBe('authorization_required')
  })

  it('approval makes the retried call succeed as the person, and stores the refresh token', async () => {
    const store = new MemoryStore()
    let approved = false
    const fetchMock = vi.fn((url: string | URL) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return jsonResponse(200, {
          device_code: 'device-code-1',
          user_code: 'BCDF-GHJK',
          verification_uri: `${ISSUER}/flow/device`,
          expires_in: 600,
          interval: 5,
        })
      }
      if (!approved) {
        approved = true
        return jsonResponse(400, { error: 'authorization_pending' })
      }
      return jsonResponse(200, {
        access_token: 'access-token-1',
        refresh_token: 'refresh-token-1',
        expires_in: 3600,
        token_type: 'Bearer',
      })
    })
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock as unknown as typeof fetch })

    await session.ensureAccessToken() // starts the flow
    await session.ensureAccessToken() // pending
    const third = await session.ensureAccessToken() // approved

    expect(third).toEqual({ status: 'ready', accessToken: 'access-token-1' })
    expect(await store.get('default')).toBe('refresh-token-1')
  })

  it('a denied approval clears the pending flow and reports denied, not an error thrown', async () => {
    const store = new MemoryStore()
    const fetchMock = vi.fn((url: string | URL) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return jsonResponse(200, {
          device_code: 'device-code-1',
          user_code: 'BCDF-GHJK',
          verification_uri: `${ISSUER}/flow/device`,
          expires_in: 600,
          interval: 5,
        })
      }
      return jsonResponse(400, { error: 'access_denied' })
    })
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock as unknown as typeof fetch })

    await session.ensureAccessToken()
    const second = await session.ensureAccessToken()

    expect(second).toEqual({ status: 'denied' })
  })

  it('a rejected refresh token is deleted and the next call starts a fresh device flow', async () => {
    const store = new MemoryStore()
    await store.set('default', 'a-stale-refresh-token')
    const fetchMock = vi.fn((url: string | URL) => {
      if (String(url).endsWith('/oauth/token')) {
        return jsonResponse(400, { error: 'invalid_grant' })
      }
      return jsonResponse(200, {
        device_code: 'device-code-2',
        user_code: 'NEW1-CODE',
        verification_uri: `${ISSUER}/flow/device`,
        expires_in: 600,
        interval: 5,
      })
    })
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock as unknown as typeof fetch })

    const state = await session.ensureAccessToken()

    expect(state.status).toBe('authorization_required')
    if (state.status === 'authorization_required') expect(state.userCode).toBe('NEW1-CODE')
    expect(await store.get('default')).toBeNull()
  })

  it('a stored refresh token that still works never touches the device flow at all', async () => {
    const store = new MemoryStore()
    await store.set('default', 'a-good-refresh-token')
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${ISSUER}/oauth/token`)
      const body = init?.body
      if (!(body instanceof URLSearchParams)) throw new Error('expected a URLSearchParams body')
      expect(body.toString()).toContain('grant_type=refresh_token')
      return jsonResponse(200, {
        access_token: 'access-token-2',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
      })
    })
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock as unknown as typeof fetch })

    const state = await session.ensureAccessToken()

    expect(state).toEqual({ status: 'ready', accessToken: 'access-token-2' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await store.get('default')).toBe('rotated-refresh-token')
  })

  it('caches a ready access token in memory rather than refreshing on every call', async () => {
    const store = new MemoryStore()
    await store.set('default', 'a-good-refresh-token')
    const fetchMock = vi.fn(() =>
      jsonResponse(200, { access_token: 'access-token-3', refresh_token: 'r2', expires_in: 3600 }),
    )
    const session = new Session({ issuer: ISSUER, clientId: CLIENT_ID, profile: 'default', store, userAgent: 'kleora-test/0', fetch: fetchMock })

    await session.ensureAccessToken()
    await session.ensureAccessToken()
    await session.ensureAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
