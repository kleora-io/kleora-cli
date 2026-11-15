/**
 * The whole CLI, driven with no terminal, no network and no keychain.
 *
 * `src/cli.ts` takes every side effect as a dependency precisely so that this
 * file can exist: a test names the requests it will answer, the answers a
 * prompt would get, and whether stdin and stdout are terminals — and then reads
 * the two output streams and the exit code, which is exactly the surface
 * CLI promises scripts they may rely on.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileCredentialStore, type CredentialStore } from '@kleora-io/core'

import { run } from '../src/cli.js'
import { RecordingIo } from '../src/output.js'
import type { ExitCode } from '../src/exit.js'

export const BASE_URL = 'https://api.example.test'
export const ISSUER = 'https://id.example.test'

/** One canned answer. `body` is sent verbatim so a test can assert on bytes. */
export interface Route {
  readonly method: string
  /** Matched against `pathname` exactly, or as a prefix when it ends in `*`. */
  readonly path: string
  readonly status?: number
  readonly body?: string
  readonly headers?: Record<string, string>
}

export interface FakeFetch {
  readonly fetch: typeof globalThis.fetch
  /** Every request made, in order: method, path with query, and the headers sent. */
  readonly calls: Array<{ method: string; url: string; headers: Record<string, string>; body: string | null }>
}

export function fakeFetch(routes: readonly Route[]): FakeFetch {
  const calls: FakeFetch['calls'] = []
  const remaining = routes.map((route) => ({ route, used: false }))

  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = value
    }
    calls.push({
      method,
      url: url.pathname + url.search,
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
    })

    // First unused match wins, so a test can queue two different answers for
    // the same request — which is how a `slow_down` followed by a success, or a
    // poll sequence, is expressed.
    const entry =
      remaining.find(
        (candidate) =>
          !candidate.used && candidate.route.method === method && matches(candidate.route.path, url.pathname),
      ) ??
      remaining.find(
        (candidate) => candidate.route.method === method && matches(candidate.route.path, url.pathname),
      )
    if (entry === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ test_error: `no route for ${method} ${url.pathname}` }), {
          status: 599,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    entry.used = true
    const route = entry.route
    return Promise.resolve(
      new Response(route.status === 204 ? null : (route.body ?? '{}'), {
        status: route.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...(route.headers ?? {}) },
      }),
    )
  }

  return { fetch: impl, calls }
}

function matches(pattern: string, pathname: string): boolean {
  return pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pattern === pathname
}

export interface HarnessOptions {
  readonly argv: readonly string[]
  readonly routes?: readonly Route[]
  readonly env?: Record<string, string | undefined>
  readonly stdinIsTty?: boolean
  readonly stdoutIsTty?: boolean
  readonly answers?: string[]
  /** A stored refresh token, so the command is signed in. */
  readonly refreshToken?: string | null
  readonly cwd?: string
  readonly openUrl?: (url: string) => void
}

export interface HarnessResult {
  readonly code: ExitCode
  readonly stdout: string
  readonly stderr: string
  readonly calls: FakeFetch['calls']
  /**
   * The credential left in the store when the command finished, read **before**
   * the temp directory is removed.
   *
   * Read here rather than by the test, because the harness deletes the directory
   * on the way out: a test that asked the store afterwards would get `null` from
   * a deleted file and pass whatever the command did, which is a test that
   * proves nothing. (It did, until this comment.)
   */
  readonly stored: string | null
  readonly store: CredentialStore
  readonly configDir: string
}

/**
 * Runs one command and cleans up after itself.
 *
 * A fresh `mkdtemp` per call, so the credential store is never the developer's
 * own and two tests can never see each other's — the same isolation
 * `@kleora-io/core`'s store suite relies on.
 */
export async function runCli(options: HarnessOptions): Promise<HarnessResult> {
  const root = mkdtempSync(join(tmpdir(), 'kleora-cli-test-'))
  const configDir = join(root, 'config')
  const store = new FileCredentialStore(configDir)
  try {
    const refreshToken = options.refreshToken === undefined ? 'refresh-token' : options.refreshToken
    if (refreshToken !== null) await store.set('default', refreshToken)

    const io = new RecordingIo({
      stdinIsTty: options.stdinIsTty ?? false,
      stdoutIsTty: options.stdoutIsTty ?? false,
      answers: options.answers ?? [],
    })
    const supplied = options.routes ?? []
    // A refresh is what every signed-in command does first, so it is available
    // by default rather than repeated in every test — but only when the test has
    // not queued its own `/oauth/token` answers, which is how `login`'s poll
    // sequence is expressed.
    const suppliesTokenRoute = supplied.some(
      (route) => route.method === 'POST' && route.path === '/oauth/token',
    )
    const routes: Route[] = [
      ...(suppliesTokenRoute
        ? []
        : [
            {
              method: 'POST',
              path: '/oauth/token',
              body: JSON.stringify({ access_token: 'access-token', expires_in: 3600 }),
            },
          ]),
      ...supplied,
    ]
    const { fetch, calls } = fakeFetch(routes)

    const code = await run({
      argv: options.argv,
      env: {
        KLEORA_BASE_URL: BASE_URL,
        KLEORA_ISSUER: ISSUER,
        ...options.env,
      },
      io,
      fetch,
      cwd: options.cwd ?? root,
      store,
      configDir,
      ...(options.openUrl === undefined ? {} : { openUrl: options.openUrl }),
      // Nothing waits: a poll loop that slept for real would make the suite as
      // slow as a device grant.
      sleep: () => Promise.resolve(),
    })

    const stored = await store.get('default')
    return { code, stdout: io.stdoutText, stderr: io.stderrText, calls, stored, store, configDir }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** A paginated response body, as the management API shapes one. */
export function page(items: readonly unknown[], nextCursor: string | null = null): string {
  return JSON.stringify({ items, next_cursor: nextCursor })
}

/** An RFC 9457 problem document. */
export function problem(
  slug: string,
  status: number,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type: `https://kleora.io/problems/${slug}`,
    title: slug,
    status,
    detail: `${slug} happened`,
    request_id: 'req_01TEST',
    ...extra,
  })
}

export const APP = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  name: 'Acme',
  is_platform: false,
}

export const SANDBOX = {
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'sandbox',
  issuer: 'https://acme-sandbox.example.test',
  app_id: APP.id,
  tenant_mode: 'multi',
}

export const PRODUCTION = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'production',
  issuer: 'https://acme.example.test',
  app_id: APP.id,
  tenant_mode: 'multi',
}

export const CLIENT = {
  id: '55555555-5555-4555-8555-555555555555',
  client_id: 'web',
  name: 'Web',
  kind: 'spa',
  is_default: false,
  redirect_uris: [],
}

/**
 * The extra read a client positional costs.
 *
 * `/clients/{client_id}` takes the Client row's UUID, and the value a person
 * copies out of `clients list` is the OAuth `client_id` — so anything that is
 * not a UUID is looked up first.
 */
export function clientLookupRoutes(environmentId: string): Route[] {
  return [
    { method: 'GET', path: `/api/v1/environments/${environmentId}/clients`, body: page([CLIENT]) },
  ]
}

/** The three reads `--app acme --sandbox` costs, as routes. */
export function targetRoutes(): Route[] {
  return [
    { method: 'GET', path: '/api/v1/apps', body: page([APP]) },
    { method: 'GET', path: `/api/v1/apps/${APP.id}/environments`, body: page([SANDBOX, PRODUCTION]) },
  ]
}
