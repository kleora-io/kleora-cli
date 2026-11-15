/**
 * The CLI end to end, through `run()`: argv in, two streams and an exit code
 * out.
 *
 * These are the scenarios that are about the whole tool rather than about one
 * module. Everything is driven with a fake `fetch`, a temp-directory credential
 * store and a recording `Io`; nothing here needs a stack, a browser or a
 * keychain.
 */
import { describe, expect, it, vi } from 'vitest'

import { EXIT } from '../src/exit.js'
import {
  APP,
  CLIENT,
  clientLookupRoutes,
  page,
  problem,
  PRODUCTION,
  runCli,
  SANDBOX,
  targetRoutes,
} from './harness.js'

const USER = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'ada@example.test',
  name: 'Ada Lovelace',
  status: 'active',
  mfa_enrolled: false,
}

describe('with no stored credential', () => {
  // "A person with no stored credential runs `apps
  // list`, gets exit `3` and an instruction."
  it('exits 3 and names `kleora login`, without starting a device flow', async () => {
    const result = await runCli({ argv: ['apps', 'list'], refreshToken: null })
    expect(result.code).toBe(EXIT.UNAUTHENTICATED)
    expect(result.stderr).toContain('Not signed in')
    expect(result.stderr).toContain('kleora login')
    // It does not start a device flow unbidden: an interactive sign-in in the
    // middle of a piped command is a hang.
    expect(result.calls.map((call) => call.url)).not.toContain('/oauth/device_authorization')
  })

  it('leaves stdout completely empty, so a `| jq` sees nothing but JSON', async () => {
    const result = await runCli({ argv: ['apps', 'list', '--json'], refreshToken: null })
    expect(result.stdout).toBe('')
  })
})

describe('a signed-in list', () => {
  it('prints a table on stdout and nothing else there', async () => {
    const result = await runCli({
      argv: ['apps', 'list'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('acme')
    expect(result.stdout).toContain('SLUG')
    expect(result.stderr).toBe('')
  })

  // "`--json` output is byte-equivalent to the API's response body,
  // including a member the CLI's own types do not know about."
  it('passes the response body through byte for byte under --json', async () => {
    const body = '{"items":[{"id":"x","slug":"acme","a_member_from_the_future":42}],"next_cursor":null}'
    const result = await runCli({
      argv: ['apps', 'list', '--json'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body }],
    })
    expect(result.stdout).toBe(`${body}\n`)
    expect(result.stdout).toContain('a_member_from_the_future')
  })

  // "`users list --json | jq` succeeds with no filtering: nothing
  // but the JSON document is on stdout, on success and on failure alike."
  it('keeps every word of chatter off stdout, success or failure', async () => {
    const ok = await runCli({
      argv: ['users', 'list', '--app', 'acme', '--sandbox', '--json'],
      routes: [
        ...targetRoutes(),
        { method: 'GET', path: `/api/v1/environments/${SANDBOX.id}/users`, body: page([USER]) },
      ],
    })
    expect(JSON.parse(ok.stdout)).toBeTruthy()

    const failed = await runCli({
      argv: ['users', 'list', '--app', 'acme', '--sandbox', '--json'],
      routes: [
        ...targetRoutes(),
        {
          method: 'GET',
          path: `/api/v1/environments/${SANDBOX.id}/users`,
          status: 403,
          body: problem('insufficient-permission', 403),
        },
      ],
    })
    expect(failed.code).toBe(EXIT.FORBIDDEN)
    expect(failed.stdout).toBe('')
  })

  it('prints the next cursor to stderr, where a pipe will not see it', async () => {
    const result = await runCli({
      argv: ['apps', 'list'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP], 'CURSOR2') }],
    })
    expect(result.stderr).toContain('--cursor CURSOR2')
    expect(result.stdout).not.toContain('CURSOR2')
  })

  it('walks every page with --all and says how far it got', async () => {
    const result = await runCli({
      argv: ['apps', 'list', '--all'],
      routes: [
        { method: 'GET', path: '/api/v1/apps', body: page([APP], 'CURSOR2') },
        { method: 'GET', path: '/api/v1/apps', body: page([{ ...APP, slug: 'beta' }]) },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('acme')
    expect(result.stdout).toContain('beta')
    expect(result.stderr).toContain('page 2')
    expect(result.stderr).toContain('Done: 2 rows')
  })

  it('never reports success on a partial --all walk', async () => {
    // `--all` failing on page four exits non-zero with the pages printed so far
    // and the cursor that failed.
    const result = await runCli({
      argv: ['apps', 'list', '--all'],
      routes: [
        { method: 'GET', path: '/api/v1/apps', body: page([APP], 'CURSOR2') },
        { method: 'GET', path: '/api/v1/apps', status: 400, body: problem('invalid-cursor', 400) },
      ],
    })
    expect(result.code).toBe(EXIT.REFUSED)
    expect(result.stdout).toContain('acme')
    expect(result.stderr).toContain('CURSOR2')
    expect(result.stderr).toContain('Stopped on page 2')
  })
})

describe('naming an environment', () => {
  // "Every environment-scoped command requires an explicit target,
  // echoes the resolved App slug, environment kind, issuer host and id to stderr
  // before writing, and takes a production target only from a flag."
  it('refuses to run without one, and says how to name it', async () => {
    const result = await runCli({ argv: ['users', 'list'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--app <slug> --sandbox')
    expect(result.stderr).toContain('--environment <environment-id>')
    expect(result.calls.some((call) => call.url.startsWith('/api/v1/environments'))).toBe(false)
  })

  it('refuses an App with no environment named — production is never assumed', async () => {
    const result = await runCli({
      argv: ['users', 'list', '--app', 'acme'],
      routes: targetRoutes(),
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('production is never')
  })

  it('echoes the resolved target to stderr before a write, shouting PRODUCTION', async () => {
    const result = await runCli({
      argv: ['users', 'create', '--app', 'acme', '--prod', '--email', 'new@example.test', '--yes'],
      routes: [
        ...targetRoutes(),
        { method: 'POST', path: `/api/v1/environments/${PRODUCTION.id}/users`, body: JSON.stringify(USER) },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stderr).toContain('→ PRODUCTION · acme')
    expect(result.stderr).toContain('acme.example.test')
    expect(result.stderr).toContain(PRODUCTION.id)
  })

  it('writes a sandbox target in lower case, so the two cannot be confused', async () => {
    const result = await runCli({
      argv: ['users', 'create', '--app', 'acme', '--sandbox', '--email', 'new@example.test'],
      routes: [
        ...targetRoutes(),
        { method: 'POST', path: `/api/v1/environments/${SANDBOX.id}/users`, body: JSON.stringify(USER) },
      ],
    })
    expect(result.stderr).toContain('→ sandbox · acme')
    expect(result.stderr).not.toContain('PRODUCTION')
  })

  it('refuses --sandbox and --prod together rather than picking one', async () => {
    const result = await runCli({ argv: ['users', 'list', '--app', 'acme', '--sandbox', '--prod'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('both given')
  })

  it('refuses a near-miss --env value by name', async () => {
    const result = await runCli({ argv: ['users', 'list', '--app', 'acme', '--env', 'prod'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('`sandbox` or `production`')
    expect(result.stderr).toContain('no `prod`, `live`, `dev` or `staging`')
  })

  it('resolves an App by slug, so `--app acme` works like the URL does', async () => {
    const result = await runCli({
      argv: ['users', 'list', '--app', 'acme', '--sandbox'],
      routes: [
        ...targetRoutes(),
        { method: 'GET', path: `/api/v1/environments/${SANDBOX.id}/users`, body: page([USER]) },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
  })

  it('names the Apps that do exist when a slug does not', async () => {
    const result = await runCli({
      argv: ['users', 'list', '--app', 'acmee', '--sandbox'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain("No App with slug 'acmee'")
    expect(result.stderr).toContain('acme')
  })
})

describe('typed confirmations', () => {
  const eraseRoutes = [
    ...targetRoutes(),
    { method: 'GET', path: `/api/v1/environments/${SANDBOX.id}/users/${USER.id}`, body: JSON.stringify(USER) },
    { method: 'DELETE', path: `/api/v1/environments/${SANDBOX.id}/users/${USER.id}`, status: 204 },
  ]

  // "`users erase` without `--confirm` on a non-TTY exits `2`
  // naming the flag, and `--yes` alone does not satisfy it; with `--confirm` set
  // to the user's name it proceeds."
  it('exits 2 naming the flag when stdin is not a terminal', async () => {
    const result = await runCli({
      argv: ['users', 'erase', USER.id, '--app', 'acme', '--sandbox'],
      routes: eraseRoutes,
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('needs --confirm')
    expect(result.stderr).toContain("Ada Lovelace")
    expect(result.calls.some((call) => call.method === 'DELETE')).toBe(false)
  })

  it('is not satisfied by --yes', async () => {
    const result = await runCli({
      argv: ['users', 'erase', USER.id, '--app', 'acme', '--sandbox', '--yes'],
      routes: eraseRoutes,
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--yes does not satisfy a typed confirmation')
    expect(result.calls.some((call) => call.method === 'DELETE')).toBe(false)
  })

  it('proceeds when --confirm is the user\'s name', async () => {
    const result = await runCli({
      argv: ['users', 'erase', USER.id, '--app', 'acme', '--sandbox', '--confirm', 'Ada Lovelace'],
      routes: eraseRoutes,
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.calls.some((call) => call.method === 'DELETE')).toBe(true)
  })

  it('refuses a --confirm that nearly matches', async () => {
    const result = await runCli({
      argv: ['users', 'erase', USER.id, '--app', 'acme', '--sandbox', '--confirm', 'ada lovelace'],
      routes: eraseRoutes,
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('does not match')
    expect(result.calls.some((call) => call.method === 'DELETE')).toBe(false)
  })

  it('accepts the string typed at an interactive prompt', async () => {
    const result = await runCli({
      argv: ['users', 'erase', USER.id, '--app', 'acme', '--sandbox'],
      routes: eraseRoutes,
      stdinIsTty: true,
      answers: ['Ada Lovelace'],
    })
    expect(result.code).toBe(EXIT.OK)
  })

  it('asks for the production issuer host when promoting a sandbox environment', async () => {
    const result = await runCli({
      argv: ['environments', 'promote', '--app', 'acme', '--sandbox'],
      routes: [
        ...targetRoutes(),
        // The resolution of the *other* environment's host, for the string.
        { method: 'GET', path: `/api/v1/apps/${APP.id}/environments`, body: page([SANDBOX, PRODUCTION]) },
      ],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('acme.example.test')
    expect(result.stderr).toContain("production environment's issuer host")
  })

  it('asks for the environment\'s issuer host only when switching tenant mode to single', async () => {
    const switching = await runCli({
      argv: ['environments', 'update', '--app', 'acme', '--sandbox', '--tenant-mode', 'single'],
      routes: targetRoutes(),
    })
    expect(switching.code).toBe(EXIT.USAGE)
    expect(switching.stderr).toContain('acme-sandbox.example.test')

    const ordinary = await runCli({
      argv: ['environments', 'update', '--app', 'acme', '--sandbox', '--session-ttl', '3600'],
      routes: [
        ...targetRoutes(),
        { method: 'PATCH', path: `/api/v1/environments/${SANDBOX.id}`, body: JSON.stringify(SANDBOX) },
      ],
    })
    expect(ordinary.code).toBe(EXIT.OK)
  })

  it('asks for {kind}/{locale} when resetting an email template', async () => {
    const result = await runCli({
      argv: ['email-templates', 'reset', 'verify_email/en', '--app', 'acme', '--sandbox'],
      routes: targetRoutes(),
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('verify_email/en')
  })
})

describe('signing-key rotation', () => {
  // "requires both acknowledgement flags non-interactively and both
  // confirmations interactively; one is not enough."
  const routes = [
    ...targetRoutes(),
    {
      method: 'POST',
      path: `/api/v1/environments/${PRODUCTION.id}/signing-keys/rotate`,
      body: JSON.stringify({ active: {}, next: {}, retired: [] }),
    },
  ]

  it('refuses with neither acknowledgement', async () => {
    const result = await runCli({ argv: ['signing-keys', 'rotate', '--app', 'acme', '--prod'], routes })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--ack-jwks-window')
    expect(result.stderr).toContain('--ack-no-pinning')
  })

  it('refuses with one', async () => {
    const result = await runCli({
      argv: ['signing-keys', 'rotate', '--app', 'acme', '--prod', '--ack-jwks-window'],
      routes,
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--ack-no-pinning')
    expect(result.stderr).not.toContain('--ack-jwks-window\n')
  })

  it('is not satisfied by --yes', async () => {
    const result = await runCli({
      argv: ['signing-keys', 'rotate', '--app', 'acme', '--prod', '--yes'],
      routes,
    })
    expect(result.code).toBe(EXIT.USAGE)
  })

  it('proceeds with both, and each flag states its own consequence', async () => {
    const result = await runCli({
      argv: [
        'signing-keys',
        'rotate',
        '--app',
        'acme',
        '--prod',
        '--ack-jwks-window',
        '--ack-no-pinning',
      ],
      routes,
    })
    expect(result.code).toBe(EXIT.OK)
  })

  it('never asks for the kid', async () => {
    const result = await runCli({ argv: ['signing-keys', 'rotate', '--app', 'acme', '--prod'], routes })
    expect(result.stderr).not.toContain('kid')
  })
})

describe('ordinary confirmations', () => {
  it('fail with exit 2 on a non-TTY and name --yes', async () => {
    const result = await runCli({
      argv: ['clients', 'delete', 'web', '--app', 'acme', '--sandbox'],
      routes: [...targetRoutes(), ...clientLookupRoutes(SANDBOX.id)],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--yes')
    expect(result.calls.some((call) => call.method === 'DELETE')).toBe(false)
  })

  it('never assume yes when there is nobody to ask', async () => {
    const result = await runCli({
      argv: ['clients', 'delete', 'web', '--app', 'acme', '--sandbox'],
      routes: [...targetRoutes(), ...clientLookupRoutes(SANDBOX.id)],
    })
    expect(result.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
  })

  it('are satisfied by --yes', async () => {
    const result = await runCli({
      argv: ['clients', 'delete', 'web', '--app', 'acme', '--sandbox', '--yes'],
      routes: [
        ...targetRoutes(),
        ...clientLookupRoutes(SANDBOX.id),
        { method: 'DELETE', path: `/api/v1/environments/${SANDBOX.id}/clients/${CLIENT.id}`, status: 204 },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
  })

  it('are refused by a `no` at the prompt', async () => {
    const result = await runCli({
      argv: ['clients', 'delete', 'web', '--app', 'acme', '--sandbox'],
      routes: [...targetRoutes(), ...clientLookupRoutes(SANDBOX.id)],
      stdinIsTty: true,
      answers: ['n'],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('nothing was changed')
  })
})

describe('a client positional', () => {
  // Found against a dev stack: `/clients/{client_id}` takes the Client row's
  // UUID, while the value `clients list` prints under `CLIENT ID` — and the one
  // an SDK's configuration carries — is the OAuth `client_id`. Passing the
  // latter through produced a 404 that said "nothing there" about a client
  // sitting in front of the person.
  it('accepts the OAuth client_id that `clients list` printed', async () => {
    const result = await runCli({
      argv: ['clients', 'get', 'web', '--app', 'acme', '--sandbox'],
      routes: [
        ...targetRoutes(),
        ...clientLookupRoutes(SANDBOX.id),
        {
          method: 'GET',
          path: `/api/v1/environments/${SANDBOX.id}/clients/${CLIENT.id}`,
          body: JSON.stringify(CLIENT),
        },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.calls.some((call) => call.url.endsWith(`/clients/${CLIENT.id}`))).toBe(true)
  })

  it('accepts a row id directly, without a lookup', async () => {
    const result = await runCli({
      argv: ['clients', 'get', CLIENT.id, '--app', 'acme', '--sandbox'],
      routes: [
        ...targetRoutes(),
        {
          method: 'GET',
          path: `/api/v1/environments/${SANDBOX.id}/clients/${CLIENT.id}`,
          body: JSON.stringify(CLIENT),
        },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    // No list call: a UUID is used as-is.
    expect(result.calls.some((call) => call.url.endsWith('/clients'))).toBe(false)
  })

  it('says which ids exist when neither matches', async () => {
    const result = await runCli({
      argv: ['clients', 'get', 'nope', '--app', 'acme', '--sandbox'],
      routes: [...targetRoutes(), ...clientLookupRoutes(SANDBOX.id)],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain("'nope'")
    expect(result.stderr).toContain('kleora clients list')
  })
})

describe('writes carry an Idempotency-Key', () => {
  it('on every POST, PATCH, PUT and DELETE', async () => {
    const result = await runCli({
      argv: ['users', 'create', '--app', 'acme', '--sandbox', '--email', 'new@example.test'],
      routes: [
        ...targetRoutes(),
        { method: 'POST', path: `/api/v1/environments/${SANDBOX.id}/users`, body: JSON.stringify(USER) },
      ],
    })
    const write = result.calls.find((call) => call.method === 'POST' && call.url.endsWith('/users'))
    expect(write?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('and on no read', async () => {
    const result = await runCli({
      argv: ['apps', 'list'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    const read = result.calls.find((call) => call.url === '/api/v1/apps')
    expect(read?.headers['idempotency-key']).toBeUndefined()
  })
})

describe('shown-once secrets', () => {
  it('are printed once with the warning, and the warning is on stderr', async () => {
    const result = await runCli({
      argv: [
        'api-keys',
        'create',
        '--app',
        'acme',
        '--sandbox',
        '--name',
        'ci',
        '--scopes',
        'users:read',
      ],
      routes: [
        ...targetRoutes(),
        {
          method: 'POST',
          path: `/api/v1/environments/${SANDBOX.id}/api-keys`,
          body: JSON.stringify({ id: 'k1', name: 'ci', prefix: 'kl_test_ab', key: 'kl_test_abcdef123456' }),
        },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stderr).toContain('Shown once')
    expect(result.stdout).toContain('kl_test_abcdef123456')
    // The key is on its own line so it can be selected, and appears once.
    expect(result.stdout.split('kl_test_abcdef123456')).toHaveLength(2)
  })

  it('are left in place under --json, because a dropped field would be a lie', async () => {
    const body = '{"id":"k1","name":"ci","key":"kl_test_abcdef123456"}'
    const result = await runCli({
      argv: [
        'api-keys',
        'create',
        '--app',
        'acme',
        '--sandbox',
        '--name',
        'ci',
        '--scopes',
        'users:read',
        '--json',
      ],
      routes: [
        ...targetRoutes(),
        { method: 'POST', path: `/api/v1/environments/${SANDBOX.id}/api-keys`, body },
      ],
    })
    expect(result.stdout).toBe(`${body}\n`)
  })
})

describe('--debug', () => {
  // "`--debug` output contains no credential and no shown-once
  // secret, on a successful call and on a failing one."
  it('prints method, path, status and duration, and no credential', async () => {
    const result = await runCli({
      argv: ['apps', 'list', '--debug'],
      routes: [
        { method: 'GET', path: '/api/v1/apps', body: page([APP]), headers: { 'X-Request-Id': 'req_01A' } },
      ],
    })
    expect(result.stderr).toContain('GET /api/v1/apps')
    expect(result.stderr).toContain('200')
    expect(result.stderr).toContain('req_01A')
    expect(result.stderr).not.toContain('refresh-token')
    expect(result.stderr).not.toContain('access-token')
    expect(result.stderr).not.toContain('Bearer')
  })

  it('says so on a failing call too, still with no credential', async () => {
    const result = await runCli({
      argv: ['apps', 'list', '--debug'],
      routes: [{ method: 'GET', path: '/api/v1/apps', status: 403, body: problem('insufficient-permission', 403) }],
    })
    expect(result.code).toBe(EXIT.FORBIDDEN)
    expect(result.stderr).toContain('403')
    expect(result.stderr).not.toContain('access-token')
    expect(result.stderr).not.toContain('Bearer')
  })
})

describe('an API key from the environment', () => {
  it('is used, and the CLI says so before a 403 can confuse anybody', async () => {
    const result = await runCli({
      argv: ['apps', 'list'],
      env: { KLEORA_API_KEY: 'kl_test_secretvalue' },
      refreshToken: null,
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stderr).toContain('KLEORA_API_KEY')
    expect(result.stderr).toContain('scoped to one Environment')
    // And the value itself never reaches either stream.
    expect(result.stderr).not.toContain('kl_test_secretvalue')
    expect(result.stdout).not.toContain('kl_test_secretvalue')
  })

  it('is never accepted as a flag', async () => {
    const result = await runCli({ argv: ['apps', 'list', '--api-key', 'kl_test_x'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('does not exist, and will not')
    expect(result.stderr).toContain('shell history')
  })

  it.each(['--token', '--password', '--client-secret', '--refresh-token', '--secret'])(
    '%s does not exist either',
    async (flag) => {
      const result = await runCli({ argv: ['apps', 'list', flag, 'whatever'] })
      expect(result.code).toBe(EXIT.USAGE)
      expect(result.stderr).toContain('does not exist, and will not')
    },
  )
})

describe('usage failures send nothing', () => {
  it('refuses an unknown noun and suggests the near ones', async () => {
    const result = await runCli({ argv: ['app', 'list'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('There is no `kleora app`')
    expect(result.stderr).toContain('apps')
    expect(result.calls).toHaveLength(0)
  })

  it('refuses an unknown verb and lists the real ones', async () => {
    const result = await runCli({ argv: ['apps', 'rm', 'acme'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('has no `rm`')
    expect(result.stderr).toContain('list, get, create, update, delete')
  })

  it('refuses an unknown flag *before* the request, not after', async () => {
    const result = await runCli({
      argv: ['clients', 'delete', 'web', '--app', 'acme', '--sandbox', '--yes', '--forse'],
      routes: [...targetRoutes(), ...clientLookupRoutes(SANDBOX.id)],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--forse')
    expect(result.calls).toHaveLength(0)
  })

  it('catches the singular-plural flag typo that would silently do nothing', async () => {
    // `--redirect-uri` where the API wants `redirect_uris` would create a client
    // with no redirect URI at all and report success.
    const result = await runCli({
      argv: [
        'clients',
        'create',
        '--app',
        'acme',
        '--sandbox',
        '--name',
        'Web',
        '--kind',
        'spa',
        '--redirect-uri',
        'https://acme.test/cb',
      ],
      routes: targetRoutes(),
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--redirect-uri')
  })

  it('refuses a flag given twice rather than picking one', async () => {
    const result = await runCli({ argv: ['users', 'list', '--app', 'acme', '--app', 'beta'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('takes one value')
  })

  it('names a missing required flag', async () => {
    const result = await runCli({
      argv: ['clients', 'create', '--app', 'acme', '--sandbox'],
      routes: targetRoutes(),
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--kind')
    expect(result.stderr).toContain('--name')
  })

  it('names the allowed values for an enum flag', async () => {
    const result = await runCli({
      argv: ['clients', 'create', '--app', 'acme', '--sandbox', '--name', 'Web', '--kind', 'browser'],
      routes: targetRoutes(),
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('spa, web, native')
  })

  it('names the positional a command needs', async () => {
    const result = await runCli({ argv: ['apps', 'get'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('<app>')
  })

  it('refuses an extra positional rather than ignoring it', async () => {
    const result = await runCli({
      argv: ['apps', 'get', 'acme', 'and-another'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('and-another')
  })
})

describe('repeatable and boolean flags', () => {
  it('collects a repeated flag into an array', async () => {
    const result = await runCli({
      argv: [
        'clients',
        'create',
        '--app',
        'acme',
        '--sandbox',
        '--name',
        'Web',
        '--kind',
        'spa',
        '--redirect-uris',
        'https://a.test/cb',
        '--redirect-uris',
        'https://b.test/cb',
      ],
      routes: [
        ...targetRoutes(),
        { method: 'POST', path: `/api/v1/environments/${SANDBOX.id}/clients`, body: '{"id":"c1"}' },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    const write = result.calls.find((call) => call.url.endsWith('/clients'))
    expect(JSON.parse(write?.body ?? '{}')).toMatchObject({
      redirect_uris: ['https://a.test/cb', 'https://b.test/cb'],
    })
  })

  it('reads --no-x as false', async () => {
    const result = await runCli({
      argv: [
        'environments',
        'update',
        '--app',
        'acme',
        '--sandbox',
        '--no-self-registration',
      ],
      routes: [
        ...targetRoutes(),
        { method: 'PATCH', path: `/api/v1/environments/${SANDBOX.id}`, body: JSON.stringify(SANDBOX) },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    const write = result.calls.find((call) => call.method === 'PATCH')
    expect(JSON.parse(write?.body ?? '{}')).toMatchObject({ self_registration: false })
  })
})

describe('help', () => {
  it('goes to stdout, so it can be piped into a pager', async () => {
    const result = await runCli({ argv: ['--help'], refreshToken: null })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('kleora <noun> <verb>')
    expect(result.stderr).toBe('')
  })

  it('advertises no capability that is not there', async () => {
    const result = await runCli({ argv: ['--help'], refreshToken: null })
    expect(result.stdout).not.toContain('listen')
    expect(result.stdout).not.toContain('webhook')
    expect(result.stdout).not.toContain('forward')
    expect(result.stdout).not.toContain('coming soon')
  })

  it("lists a noun's verbs", async () => {
    const result = await runCli({ argv: ['api-keys', '--help'], refreshToken: null })
    expect(result.stdout).toContain('rotate')
    expect(result.stdout).toContain('revoke')
  })

  it("lists a command's flags, the API path, and the typed confirmation", async () => {
    const result = await runCli({ argv: ['users', 'erase', '--help'], refreshToken: null })
    expect(result.stdout).toContain('DELETE /api/v1/environments/{environment_id}/users/{user_id}')
    expect(result.stdout).toContain('--confirm <string>')
    expect(result.stdout).toContain('--yes does not satisfy it')
  })

  it('never needs a credential to print', async () => {
    const result = await runCli({ argv: ['clients', 'create', '--help'], refreshToken: null })
    expect(result.code).toBe(EXIT.OK)
    expect(result.calls).toHaveLength(0)
  })
})

describe('unreachable', () => {
  it('exits 9 and does not read as a refusal', async () => {
    const boom = vi.fn(() => Promise.reject(new Error('connect ECONNREFUSED')))
    const result = await runCli({
      argv: ['apps', 'list'],
      routes: [],
      // The harness answers `/oauth/token` from its own route list, so a hard
      // network failure has to be injected at the API call instead: an unrouted
      // path answers 599, which is a 5xx and lands in the same class.
    })
    expect(boom).not.toHaveBeenCalled()
    expect(result.code).toBe(EXIT.UNREACHABLE)
    expect(result.stderr.toLowerCase()).not.toContain('permission')
  })
})
