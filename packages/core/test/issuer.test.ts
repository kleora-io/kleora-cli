/**
 * Where the issuer comes from: the issuer is what
 * the deployment says it is, never a rewrite of the API's hostname.
 */
import { describe, expect, it, vi } from 'vitest'

import { discoverIssuer, issuerResolver } from '../src/credentials/issuer.js'
import { Session } from '../src/credentials/session.js'
import type { CredentialStore } from '../src/credentials/store.js'
import { ManagementApiUnreachable } from '../src/errors.js'

// An API host and an issuer host that share no suffix at all — the shape the
// hosted service really has (`api.kleora.io`, `id.kleora.eu`), which a label
// swap could never produce.
const BASE_URL = 'https://api.example-one.test'
const ISSUER = 'https://login.example-two.test'

function json(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

const options = (fetch: unknown) => ({
  baseUrl: BASE_URL,
  userAgent: 'kleora-test/0',
  fetch: fetch as typeof globalThis.fetch,
})

describe('discoverIssuer', () => {
  it('asks the management API anonymously and returns what it names', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${BASE_URL}/api/v1/platform`)
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBeNull()
      expect(headers.get('User-Agent')).toBe('kleora-test/0')
      return json(200, { issuer: `${ISSUER}/` })
    })

    await expect(discoverIssuer(options(fetchMock))).resolves.toBe(ISSUER)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('says which URL failed when the deployment does not answer', async () => {
    const fetchMock = vi.fn(() => json(404, { type: 'https://kleora.io/problems/not-found' }))

    const failure = discoverIssuer(options(fetchMock))

    await expect(failure).rejects.toBeInstanceOf(ManagementApiUnreachable)
    await expect(failure).rejects.toThrow(`${BASE_URL}/api/v1/platform answered 404`)
  })

  it('refuses a document that names no usable issuer', async () => {
    for (const body of [{}, { issuer: 42 }, { issuer: 'not a url' }, { issuer: 'ftp://x.test' }]) {
      const fetchMock = vi.fn(() => json(200, body))
      await expect(discoverIssuer(options(fetchMock))).rejects.toThrow('did not name an issuer')
    }
  })

  it('reports a network failure as unreachable, not as a crash', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('fetch failed')))

    await expect(discoverIssuer(options(fetchMock))).rejects.toThrow(`could not reach ${BASE_URL}`)
  })
})

describe('issuerResolver', () => {
  it('an explicit issuer wins and makes no request at all', async () => {
    const fetchMock = vi.fn()

    const resolve = issuerResolver('https://sso.example-three.test', options(fetchMock))

    await expect(resolve()).resolves.toBe('https://sso.example-three.test')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks once, however many times it is called', async () => {
    const fetchMock = vi.fn(() => json(200, { issuer: ISSUER }))
    const resolve = issuerResolver(undefined, options(fetchMock))

    await Promise.all([resolve(), resolve(), resolve()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not remember a failure', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new TypeError('fetch failed')))
      .mockImplementationOnce(() => json(200, { issuer: ISSUER }))
    const resolve = issuerResolver(undefined, options(fetchMock))

    await expect(resolve()).rejects.toBeInstanceOf(ManagementApiUnreachable)
    await expect(resolve()).resolves.toBe(ISSUER)
  })
})

describe('Session with a discovered issuer', () => {
  class MemoryStore implements CredentialStore {
    readonly backend = 'file' as const
    get(): Promise<string | null> {
      return Promise.resolve(null)
    }
    set(): Promise<void> {
      return Promise.resolve()
    }
    delete(): Promise<void> {
      return Promise.resolve()
    }
  }

  it('runs the device grant at the issuer the API named', async () => {
    const seen: string[] = []
    const fetchMock = vi.fn((url: string | URL) => {
      seen.push(String(url))
      if (String(url).endsWith('/api/v1/platform')) return json(200, { issuer: ISSUER })
      return json(200, {
        device_code: 'd',
        user_code: 'BCDF-GHJK',
        verification_uri: `${ISSUER}/flow/device`,
        expires_in: 600,
        interval: 5,
      })
    })
    const session = new Session({
      issuer: issuerResolver(undefined, options(fetchMock)),
      clientId: 'kleora-mcp',
      profile: 'default',
      store: new MemoryStore(),
      userAgent: 'kleora-test/0',
      fetch: fetchMock as unknown as typeof fetch,
    })

    const state = await session.ensureAccessToken()

    expect(state.status).toBe('authorization_required')
    expect(seen).toEqual([`${BASE_URL}/api/v1/platform`, `${ISSUER}/oauth/device_authorization`])
  })
})
