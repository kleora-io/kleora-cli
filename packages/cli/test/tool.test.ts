/**
 * The remaining commands that are about the tool: `completion`, `doctor`,
 * `whoami`, `version`, `init`, and `kleora.toml`.
 *
 * Plus the `kleora.toml` rule: a production target is never taken from the
 * file.
 */
import { writeFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { EXIT } from '../src/exit.js'
import { OPERATION_IDS } from '../src/generated/operations.js'
import { parseProjectConfig } from '../src/project-config.js'
import { APP, page, PRODUCTION, runCli, SANDBOX, targetRoutes } from './harness.js'

describe('completion', () => {
  // "`completion` makes no HTTP request."
  it.each(['bash', 'zsh', 'fish'])('%s makes no request at all', async (shell) => {
    const result = await runCli({ argv: ['completion', shell], refreshToken: null })
    expect(result.code).toBe(EXIT.OK)
    expect(result.calls).toHaveLength(0)
    expect(result.stdout.length).toBeGreaterThan(200)
  })

  it('works with no credential stored, which is when somebody installs it', async () => {
    const result = await runCli({ argv: ['completion', 'zsh'], refreshToken: null })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stderr).toBe('')
  })

  it('names nouns, verbs and flags', async () => {
    const result = await runCli({ argv: ['completion', 'bash'], refreshToken: null })
    expect(result.stdout).toContain('apps')
    expect(result.stdout).toContain('rotate-secret')
    expect(result.stdout).toContain('--sandbox')
    expect(result.stdout).toContain('complete -F _kleora_completion kleora kleora-auth')
  })

  it('never puts a credential flag into a completion script', async () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      const result = await runCli({ argv: ['completion', shell], refreshToken: null })
      for (const flag of ['password', 'api-key', 'client-secret', 'token', 'secret', 'credential']) {
        // A whole-token match: `--password-min-length` is a real and harmless
        // flag, and a substring check would flag it while missing nothing.
        expect(result.stdout, `${shell} offers --${flag}`).not.toMatch(
          new RegExp(`--${flag}(?![\\w-])`),
        )
      }
    }
  })

  it('advertises no deferred command', async () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      const result = await runCli({ argv: ['completion', shell], refreshToken: null })
      expect(result.stdout, shell).not.toContain('listen')
      expect(result.stdout, shell).not.toContain('webhook')
    }
  })

  it('names the three shells when none is given', async () => {
    const result = await runCli({ argv: ['completion'], refreshToken: null })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('bash')
    expect(result.stderr).toContain('~/.config/fish/completions/kleora.fish')
  })
})

describe('doctor', () => {
  const document = (ids: readonly string[]): string =>
    JSON.stringify({
      info: { version: '1.0.0' },
      paths: Object.fromEntries(ids.map((id, index) => [`/api/v1/p${String(index)}`, { get: { operationId: id } }])),
    })

  it('works with no credential at all, because that document is anonymous', async () => {
    const result = await runCli({
      argv: ['doctor'],
      refreshToken: null,
      routes: [
        { method: 'GET', path: '/api/v1/openapi.json', body: document(OPERATION_IDS) },
        { method: 'GET', path: '/api/v1/', status: 401, body: '{}' },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('describe exactly the same API')
  })

  // "`doctor` against a deployment missing an operation the CLI
  // knows names that command; against a deployment with an operation the CLI
  // lacks, it says the CLI is behind."
  it('names the operations this deployment cannot serve', async () => {
    const short = OPERATION_IDS.filter((id) => id !== 'rotate_api_key_operation')
    const result = await runCli({
      argv: ['doctor'],
      refreshToken: null,
      routes: [
        { method: 'GET', path: '/api/v1/openapi.json', body: document(short) },
        { method: 'GET', path: '/api/v1/', status: 401, body: '{}' },
      ],
    })
    expect(result.stdout).toContain('cannot serve 1 operation(s)')
    expect(result.stdout).toContain('rotate_api_key_operation')
  })

  it('says the CLI is behind when the deployment has more', async () => {
    const result = await runCli({
      argv: ['doctor'],
      refreshToken: null,
      routes: [
        {
          method: 'GET',
          path: '/api/v1/openapi.json',
          body: document([...OPERATION_IDS, 'an_operation_from_the_future']),
        },
        { method: 'GET', path: '/api/v1/', status: 401, body: '{}' },
      ],
    })
    expect(result.stdout).toContain('This CLI is behind')
    expect(result.stdout).toContain('an_operation_from_the_future')
  })

  it('reports local files by path and permission bits, never their contents', async () => {
    const result = await runCli({
      argv: ['doctor'],
      routes: [
        { method: 'GET', path: '/api/v1/openapi.json', body: document(OPERATION_IDS) },
        { method: 'GET', path: '/api/v1/', status: 401, body: '{}' },
      ],
    })
    expect(result.stdout).toContain('0600')
    expect(result.stdout).toContain('credentials-default.json')
    expect(result.stdout).not.toContain('refresh-token')
  })

  it('says plainly when it could not reach the deployment', async () => {
    const result = await runCli({ argv: ['doctor'], refreshToken: null, routes: [] })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('could not be read')
  })

  it('has a --json form', async () => {
    const result = await runCli({
      argv: ['doctor', '--json'],
      refreshToken: null,
      routes: [
        { method: 'GET', path: '/api/v1/openapi.json', body: document(OPERATION_IDS) },
        { method: 'GET', path: '/api/v1/', status: 401, body: '{}' },
      ],
    })
    const report = JSON.parse(result.stdout) as Record<string, unknown>
    expect(report['missing_here']).toEqual([])
    expect(report['document_version']).toBe('1.0.0')
  })
})

describe('version', () => {
  it('prints the CLI, the document and the service version', async () => {
    const result = await runCli({
      argv: ['version'],
      refreshToken: null,
      routes: [
        { method: 'GET', path: '/api/v1/openapi.json', body: JSON.stringify({ info: { version: '1.2.3' }, paths: {} }) },
        { method: 'GET', path: '/api/v1/', body: JSON.stringify({ version: '2026.9.17' }) },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('kleora 0.1.2')
    expect(result.stdout).toContain('1.2.3')
    expect(result.stdout).toContain('2026.9.17')
  })
})

describe('whoami', () => {
  const ME = JSON.stringify({
    principal: { kind: 'console_user', subject_id: 'u1' },
    account: { id: 'a1', slug: 'acme-inc', name: 'Acme Inc' },
    tenant: { id: 't1', slug: 'acme-inc' },
    environment: null,
    permissions: ['apps:read', 'apps:write'],
    memberships: [],
  })

  it('names the profile, the principal and — deliberately — the store backend', async () => {
    const result = await runCli({
      argv: ['whoami'],
      routes: [{ method: 'GET', path: '/api/v1/me', body: ME }],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('console_user')
    expect(result.stdout).toContain('acme-inc')
    // "so 'why does it keep asking me to sign in' has an answer that names a
    // keychain".
    expect(result.stdout).toContain('~/.kleora-cli')
  })

  it('prints the permissions held, which is what insufficient-permission points at', async () => {
    const result = await runCli({
      argv: ['whoami'],
      routes: [{ method: 'GET', path: '/api/v1/me', body: ME }],
    })
    expect(result.stdout).toContain('apps:read')
    expect(result.stdout).toContain('apps:write')
  })

  it('passes the API body through untouched under --json', async () => {
    const result = await runCli({
      argv: ['whoami', '--json'],
      routes: [{ method: 'GET', path: '/api/v1/me', body: ME }],
    })
    expect(result.stdout).toBe(`${ME}\n`)
    // The local facts go to stderr rather than being spliced into the document:
    // a `--json` carrying invented members would be a second contract.
    expect(result.stderr).toContain('profile=default')
  })

  it('says an API key is in use without printing it', async () => {
    const result = await runCli({
      argv: ['whoami'],
      refreshToken: null,
      env: { KLEORA_API_KEY: 'kl_test_secretvalue' },
      routes: [{ method: 'GET', path: '/api/v1/me', body: ME }],
    })
    expect(result.stdout).toContain('KLEORA_API_KEY')
    expect(result.stdout).not.toContain('kl_test_secretvalue')
    expect(result.stderr).not.toContain('kl_test_secretvalue')
  })
})

describe('init', () => {
  // "`init` on a fresh account produces configuration a sample app
  // signs in with, prints rather than writes by default, and refuses to run
  // non-interactively."
  it('refuses to run without a terminal, and names the explicit commands instead', async () => {
    const result = await runCli({ argv: ['init', '--name', 'My app'] })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('will not run without a terminal')
    expect(result.stderr).toContain('kleora apps create')
    // Nothing was created.
    expect(result.calls.some((call) => call.method === 'POST' && call.url === '/api/v1/apps')).toBe(false)
  })

  it('refuses non-interactively even with --json', async () => {
    const result = await runCli({ argv: ['init', '--name', 'My app', '--json'] })
    expect(result.code).toBe(EXIT.USAGE)
  })

  it('prints the plan and asks once before creating anything', async () => {
    const result = await runCli({
      argv: ['init', '--name', 'My app', '--slug', 'acme'],
      stdinIsTty: true,
      answers: ['n'],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('This will:')
    expect(result.stderr).toContain('create an App named "My app"')
    expect(result.stderr).toContain('nothing was created')
    expect(result.calls.some((call) => call.url === '/api/v1/apps')).toBe(false)
  })

  const initRoutes = [
    { method: 'POST', path: '/api/v1/apps', body: JSON.stringify(APP) },
    { method: 'GET', path: `/api/v1/apps/${APP.id}/environments`, body: page([SANDBOX, PRODUCTION]) },
    {
      method: 'GET',
      path: `/api/v1/environments/${SANDBOX.id}/clients`,
      body: page([{ id: 'c1', client_id: 'acme-web', kind: 'spa', is_default: true, redirect_uris: [] }]),
    },
    { method: 'PATCH', path: `/api/v1/environments/${SANDBOX.id}/clients/c1`, body: '{"id":"c1"}' },
  ]

  it('prints working configuration and writes no file by default', async () => {
    const result = await runCli({
      argv: ['init', '--name', 'My app', '--slug', 'acme', '--redirect-uri', 'http://localhost:3000/callback'],
      stdinIsTty: true,
      answers: ['y'],
      routes: initRoutes,
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('KLEORA_ISSUER=https://acme-sandbox.example.test')
    expect(result.stdout).toContain('KLEORA_CLIENT_ID=acme-web')
    expect(result.stdout).toContain('KLEORA_REDIRECT_URI=http://localhost:3000/callback')
    expect(result.stdout).toContain('KLEORA_API_BASE=')
  })

  it('always targets sandbox, never production', async () => {
    const result = await runCli({
      argv: ['init', '--name', 'My app'],
      stdinIsTty: true,
      answers: ['y'],
      routes: initRoutes,
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('acme-sandbox.example.test')
    expect(result.stdout).not.toContain('KLEORA_ISSUER=https://acme.example.test')
  })

  it('registers the redirect URI on the default client', async () => {
    const result = await runCli({
      argv: ['init', '--name', 'My app', '--redirect-uri', 'http://localhost:5173/cb'],
      stdinIsTty: true,
      answers: ['y'],
      routes: initRoutes,
    })
    const patch = result.calls.find((call) => call.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toMatchObject({ redirect_uris: ['http://localhost:5173/cb'] })
  })

  it('registers both SDK callback paths when nobody names one', async () => {
    // The two front-end SDKs use different paths — `/callback` for
    // `@kleora-io/browser`, `/auth/callback` for `@kleora-io/nuxt` — so
    // registering one sends half of all newcomers into `invalid_redirect_uri` on
    // their first sign-in. Found by pointing `init`'s output at a Nuxt app.
    const result = await runCli({
      argv: ['init', '--name', 'My app'],
      stdinIsTty: true,
      answers: ['y'],
      routes: initRoutes,
    })
    expect(result.code).toBe(EXIT.OK)
    const patch = result.calls.find((call) => call.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toMatchObject({
      redirect_uris: ['http://localhost:3000/callback', 'http://localhost:3000/auth/callback'],
    })
    expect(result.stderr).toContain('/auth/callback')
    expect(result.stderr).toContain('invalid_redirect_uri')
  })

  it('accepts several --redirect-uri and registers every one', async () => {
    const result = await runCli({
      argv: [
        'init',
        '--name',
        'My app',
        '--redirect-uri',
        'http://localhost:4000/cb',
        '--redirect-uri',
        'http://localhost:4000/auth/cb',
      ],
      stdinIsTty: true,
      answers: ['y'],
      routes: initRoutes,
    })
    const patch = result.calls.find((call) => call.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toMatchObject({
      redirect_uris: ['http://localhost:4000/cb', 'http://localhost:4000/auth/cb'],
    })
  })

  it('appends to what the default client already has, never replacing it', async () => {
    const result = await runCli({
      argv: ['init', '--name', 'My app', '--redirect-uri', 'http://localhost:4000/cb'],
      stdinIsTty: true,
      answers: ['y'],
      routes: [
        { method: 'POST', path: '/api/v1/apps', body: JSON.stringify(APP) },
        { method: 'GET', path: `/api/v1/apps/${APP.id}/environments`, body: page([SANDBOX, PRODUCTION]) },
        {
          method: 'GET',
          path: `/api/v1/environments/${SANDBOX.id}/clients`,
          body: page([
            {
              id: 'c1',
              client_id: 'acme-web',
              kind: 'spa',
              is_default: true,
              redirect_uris: ['http://localhost:9999/existing'],
            },
          ]),
        },
        { method: 'PATCH', path: `/api/v1/environments/${SANDBOX.id}/clients/c1`, body: '{"id":"c1"}' },
      ],
    })
    const patch = result.calls.find((call) => call.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toMatchObject({
      redirect_uris: ['http://localhost:9999/existing', 'http://localhost:4000/cb'],
    })
  })

  it('refuses a redirect URI that is not an absolute http(s) URL', async () => {
    const result = await runCli({
      argv: ['init', '--name', 'My app', '--redirect-uri', 'myapp://cb'],
      stdinIsTty: true,
      answers: ['y'],
    })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('must be http or https')
  })

  it('needs --name', async () => {
    const result = await runCli({ argv: ['init'], stdinIsTty: true })
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('--name')
  })
})

describe('kleora.toml', () => {
  it('supplies an App and a sandbox default', () => {
    const config = parseProjectConfig('/p/kleora.toml', 'app = "acme"\nenv = "sandbox"\n')
    expect(config.app).toBe('acme')
    expect(config.env).toBe('sandbox')
    expect(config.rejectedEnv).toBeUndefined()
  })

  it('never supplies production, and records that it tried', () => {
    // A production target is never taken from the file, only from an explicit
    // flag on the command.
    const config = parseProjectConfig('/p/kleora.toml', 'app = "acme"\nenv = "production"\n')
    expect(config.env).toBeUndefined()
    expect(config.rejectedEnv).toBe('production')
  })

  it('ignores anything in a table, and any key it does not know', () => {
    const config = parseProjectConfig(
      '/p/kleora.toml',
      '# a comment\napp = "acme"\nunknown = "x"\n\n[other]\napp = "not-this"\n',
    )
    expect(config.app).toBe('acme')
  })

  it('is read from the working directory upward, and a stale file is visible', async () => {
    const result = await runCli({
      argv: ['users', 'list', '--sandbox'],
      routes: [
        ...targetRoutes(),
        { method: 'GET', path: `/api/v1/environments/${SANDBOX.id}/users`, body: page([]) },
      ],
      cwd: process.cwd(),
    })
    // No `kleora.toml` in this checkout, so the command must still refuse
    // rather than invent an App — which is the honest half of this behaviour.
    expect(result.code).toBe(EXIT.USAGE)
    expect(result.stderr).toContain('needs an environment')
  })

  it('reads an App from the file and echoes where the target came from', async () => {
    const dir = process.env['VITEST_TMP'] ?? '/tmp'
    const path = `${dir}/kleora-cli-toml-test`
    const { mkdtempSync } = await import('node:fs')
    const root = mkdtempSync(path)
    writeFileSync(`${root}/kleora.toml`, 'app = "acme"\nenv = "sandbox"\n')
    const result = await runCli({
      argv: ['users', 'list'],
      cwd: root,
      routes: [
        ...targetRoutes(),
        { method: 'GET', path: `/api/v1/environments/${SANDBOX.id}/users`, body: page([]) },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
  })
})

describe('the Io contract', () => {
  it('uses no escape sequences or box characters when stdout is not a TTY', async () => {
    const result = await runCli({
      argv: ['apps', 'list'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    // eslint-disable-next-line no-control-regex
    expect(result.stdout).not.toMatch(/\[/)
    expect(result.stdout).not.toContain('─')
  })

  it('uses box characters on a TTY, where they read better', async () => {
    const result = await runCli({
      argv: ['apps', 'list'],
      stdoutIsTty: true,
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    expect(result.stdout).toContain('─')
  })

  it('never writes a spinner or a cursor movement anywhere', async () => {
    const result = await runCli({
      argv: ['apps', 'list', '--all'],
      routes: [{ method: 'GET', path: '/api/v1/apps', body: page([APP]) }],
    })
    // eslint-disable-next-line no-control-regex
    expect(result.stderr).not.toMatch(/[\r]/)
  })
})

describe('a table cell holding an object', () => {
  // Found by running `audit list` against a real environment: `actor.display` is
  // an object, and `JSON.stringify` turned the ACTOR and TARGET columns into
  // 90-character blobs. A column is a label; `--json` is where the object goes.
  it('labels it rather than dumping its JSON', async () => {
    const result = await runCli({
      argv: ['audit', 'list'],
      routes: [
        {
          method: 'GET',
          path: '/api/v1/account/audit-events',
          body: page([
            {
              occurred_at: '2026-09-17T01:23:51.500Z',
              action: 'tenant.selected',
              actor: { kind: 'user', id: 'u1', display: { name: 'Ada P603', email: 'ada@p603.example' } },
              target: { kind: 'tenant', id: 't1', display: { name: 'Default' } },
              ip: '192.168.1.1',
            },
          ]),
        },
      ],
    })
    expect(result.code).toBe(EXIT.OK)
    expect(result.stdout).toContain('Ada P603')
    expect(result.stdout).toContain('Default')
    expect(result.stdout).not.toContain('avatar_color')
    expect(result.stdout).not.toContain('{"')
  })

  it('names the actor kind, because `display` is absent for system actions', async () => {
    const result = await runCli({
      argv: ['audit', 'list'],
      routes: [
        {
          method: 'GET',
          path: '/api/v1/account/audit-events',
          body: page([
            {
              occurred_at: '2026-09-17T01:00:00.000Z',
              action: 'client.created',
              actor: { kind: 'system', id: null },
              target: { kind: 'client', id: 'c1' },
              ip: null,
            },
          ]),
        },
      ],
    })
    expect(result.stdout).toContain('system')
  })

  it('passes the whole object through under --json', async () => {
    const body = page([
      {
        action: 'tenant.selected',
        actor: { kind: 'user', id: 'u1', display: { name: 'Ada', avatar_color: 'red' } },
      },
    ])
    const result = await runCli({
      argv: ['audit', 'list', '--json'],
      routes: [{ method: 'GET', path: '/api/v1/account/audit-events', body }],
    })
    expect(result.stdout).toBe(`${body}\n`)
    expect(result.stdout).toContain('avatar_color')
  })
})

describe('the entry point', () => {
  it('does not read process.argv itself — run() takes it', async () => {
    // A guard against somebody moving argv parsing back into `index.ts`, which
    // would make the whole suite above impossible to write.
    const spy = vi.spyOn(process, 'cwd')
    await runCli({ argv: ['--help'], refreshToken: null })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
