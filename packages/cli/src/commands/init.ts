/**
 * `kleora init` — from an account and no local setup to working SDK
 * configuration, as one command: approve in a browser, create an App and a
 * client, and print the configuration — without opening the console.
 *
 * It is **the only command that performs more than one API call**, and it
 * earns the exception by being the one thing a newcomer does before they know
 * any nouns. It prints the plan first and asks once; with `--json` and no TTY
 * it refuses rather than guessing, because a non-interactive `init` that
 * silently created an App in the wrong account is the worst possible first
 * experience.
 *
 * `init` prints. It writes a file only with `--write <path>`, appends rather
 * than replaces, and never overwrites an existing key — a tool that rewrote
 * somebody's `.env` on its first run has spent all the trust it was given.
 *
 * It prints the resolved configuration *values*, in `.env` shape, and points
 * at the console's quickstart for the framework snippet rather than carrying
 * its own copy of that snippet: a copy inside this package would drift from
 * the console's on the first improvement to either. The values are what
 * "working SDK configuration" means; the snippet is one `pnpm add` away.
 */
import { appendFileSync, readFileSync } from 'node:fs'

import type { ManagementClient } from '@kleora-io/core'

import type { Flags } from '../argv.js'
import type { Config } from '../config.js'
import { CliFailure, EXIT, usageFailure } from '../exit.js'
import { OPERATIONS, type GeneratedOperation } from '../generated/operations.js'
import { printOwnJson, type Io } from '../output.js'

export interface InitDependencies {
  readonly client: ManagementClient
  readonly config: Config
  readonly flags: Flags
  readonly io: Io
  readonly json: boolean
}

interface AppRow {
  id: string
  slug: string
  name: string
}

interface EnvironmentRow {
  id: string
  kind: string
  issuer: string
}

interface ClientRow {
  id: string
  client_id: string
  name: string
  kind: string
  is_default?: boolean
  redirect_uris?: string[]
}

export async function init(deps: InitDependencies): Promise<void> {
  const { client, flags, io, json } = deps

  if (!io.stdinIsTty) {
    throw usageFailure(
      '`init` will not run without a terminal.',
      '',
      '  It creates an App, which is the one thing that must not happen because a',
      '  script guessed. An `init` that silently created an App in the wrong',
      '  account is the worst possible first experience with this tool.',
      '',
      '  Run it in a terminal, or build the same thing explicitly:',
      '    kleora apps create --name "My app" --slug my-app',
      '    kleora clients list --app my-app --sandbox',
      '    kleora clients update <client> --app my-app --sandbox --redirect-uris <uri>',
    )
  }

  const name = flags.value('name')
  if (name === undefined) {
    throw usageFailure(
      '`init` needs --name, the App\'s display name.',
      '  Optionally --slug (it becomes the issuer hostname) and --redirect-uri.',
    )
  }
  const slug = flags.value('slug')
  const given = flags.values('redirect-uri')
  const redirectUris = given.length > 0 ? given : DEFAULT_REDIRECT_URIS
  for (const uri of redirectUris) assertRedirectUri(uri)
  const writePath = flags.value('write')

  // ---- the plan, printed before anything is created ----------------------
  io.err('This will:\n')
  io.err(`  1. create an App named "${name}"${slug === undefined ? '' : ` with slug \`${slug}\``}\n`)
  io.err('  2. read back its sandbox environment\'s issuer and default client id\n')
  for (const uri of redirectUris) io.err(`  3. register ${uri} as a redirect URI on that client\n`)
  io.err(
    writePath === undefined
      ? '  4. print the configuration (nothing is written to any file)\n'
      : `  4. append the configuration to ${writePath}, never overwriting a key it already has\n`,
  )
  io.err(`\nAccount: whichever \`kleora whoami\` reports. Environment: sandbox, always.\n\n`)
  const answer = await io.readLine('  Continue? [y/N] > ')
  if (answer === null || !/^y(es)?$/i.test(answer.trim())) {
    throw usageFailure('Not confirmed — nothing was created.')
  }

  // ---- the four calls ----------------------------------------------------
  const app = (await client.call(
    operation('create_app_operation'),
    { name, ...(slug === undefined ? {} : { slug }) },
    { headers: { 'Idempotency-Key': idempotencyKey() } },
  )) as AppRow
  io.err(`Created App ${app.slug} (${app.id}).\n`)

  const environments = (await client.call(operation('list_app_environments'), {
    app_id: app.id,
  })) as { items: EnvironmentRow[] }
  const sandbox = environments.items.find((item) => item.kind === 'sandbox')
  if (sandbox === undefined) {
    throw new CliFailure(EXIT.UNEXPECTED, [
      '✗ The App was created but has no sandbox environment.',
      '',
      `  The App is ${app.slug} (${app.id}) and is fine; this is a deployment problem.`,
    ])
  }

  const clients = (await client.call(operation('list_clients'), {
    environment_id: sandbox.id,
    limit: 200,
  })) as { items: ClientRow[] }
  const defaultClient = clients.items.find((item) => item.is_default === true) ?? clients.items[0]
  if (defaultClient === undefined) {
    throw new CliFailure(EXIT.UNEXPECTED, [
      '✗ The App was created but its sandbox environment has no client.',
      '',
      `  Create one: kleora clients create --app ${app.slug} --sandbox --name Web --kind spa`,
    ])
  }

  const existing = defaultClient.redirect_uris ?? []
  const missing = redirectUris.filter((uri) => !existing.includes(uri))
  if (missing.length > 0) {
    await client.call(
      operation('patch_client'),
      {
        environment_id: sandbox.id,
        client_id: defaultClient.id,
        // Appended, never replaced: whatever is already registered on the
        // environment's default client belongs to somebody.
        redirect_uris: [...existing, ...missing],
      },
      { headers: { 'Idempotency-Key': idempotencyKey() } },
    )
    io.err(`Registered ${missing.join(', ')} on client ${defaultClient.client_id}.\n`)
  } else {
    io.err(`Every redirect URI was already registered on ${defaultClient.client_id}.\n`)
  }

  // ---- the output --------------------------------------------------------
  const primary = redirectUris[0]
  if (primary === undefined) throw new Error('invariant: no redirect URI')
  const settings: ReadonlyArray<readonly [string, string]> = [
    ['KLEORA_ISSUER', sandbox.issuer],
    ['KLEORA_CLIENT_ID', defaultClient.client_id],
    ['KLEORA_REDIRECT_URI', primary],
    ['KLEORA_API_BASE', `${deps.config.baseUrl}/api/v1`],
  ]

  if (json) {
    printOwnJson(io, {
      app: { id: app.id, slug: app.slug, name: app.name },
      environment: { id: sandbox.id, kind: sandbox.kind, issuer: sandbox.issuer },
      client: { id: defaultClient.id, client_id: defaultClient.client_id, kind: defaultClient.kind },
      redirect_uris: redirectUris,
      configuration: Object.fromEntries(settings),
    })
  } else {
    io.err('\nWorking configuration for the sandbox environment:\n\n')
    for (const [key, value] of settings) io.out(`${key}=${value}\n`)
    io.err(
      '\nThat is everything an SDK needs. The framework snippet for your stack is on\n' +
        "the App's overview page in the console, and in the SDK's README.\n",
    )
    if (given.length === 0) {
      io.err(
        `\nBoth default callback paths are registered, because the two front-end SDKs\n` +
          `use different ones: @kleora-io/browser's quickstart redirects to\n` +
          `\`/callback\`, and @kleora-io/nuxt mounts its callback page at\n` +
          `\`/auth/callback\`. Registering one of them is how a first sign-in fails with\n` +
          `invalid_redirect_uri. Pass --redirect-uri (repeatable) for your own paths.\n`,
      )
    }
    io.err('Nothing here is a secret: a public client holds none.\n')
  }

  if (writePath !== undefined) appendConfiguration(writePath, settings, io)
}

/**
 * Appends, never replaces, and never touches a key the file already has.
 *
 * The read-then-append is not atomic and deliberately is not treated as
 * though it were: the failure mode of a race here is a duplicate line in a
 * `.env`, which the last-wins semantics of every `.env` reader makes harmless,
 * while the failure mode of a rewrite is somebody's configuration gone.
 */
function appendConfiguration(
  path: string,
  settings: ReadonlyArray<readonly [string, string]>,
  io: Io,
): void {
  let existing = ''
  try {
    existing = readFileSync(path, 'utf8')
  } catch {
    // A file that is not there yet is the ordinary case.
  }
  const present = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.split('=')[0]?.trim())
      .filter((key): key is string => key !== undefined && key !== ''),
  )
  const additions = settings.filter(([key]) => !present.has(key))
  const skipped = settings.filter(([key]) => present.has(key))

  if (additions.length > 0) {
    const prefix = existing === '' || existing.endsWith('\n') ? '' : '\n'
    appendFileSync(
      path,
      `${prefix}\n# Added by \`kleora init\`\n${additions.map(([key, value]) => `${key}=${value}`).join('\n')}\n`,
    )
    io.err(`\nAppended ${String(additions.length)} setting(s) to ${path}.\n`)
  }
  for (const [key] of skipped) {
    io.err(`${key} is already in ${path} and was left alone — check it points where you want.\n`)
  }
}

/**
 * The redirect URIs `init` registers when nobody names one.
 *
 * **Both**, and that is the whole point of this constant. The two front-end
 * SDKs use different callback paths — `@kleora-io/browser`'s quickstart
 * redirects to `/callback`, while
 * `@kleora-io/nuxt` mounts its callback page at `/auth/callback` by default —
 * so registering only one sends half of all newcomers into
 * `invalid_redirect_uri` on their very first sign-in. Found exactly that way:
 * `init`'s output was pointed at a Nuxt app, and the first click on "Sign in"
 * landed on the issuer's error page.
 *
 * Two loopback URIs on a client the developer just created costs nothing and
 * removes the worst possible first experience.
 */
const DEFAULT_REDIRECT_URIS = [
  'http://localhost:3000/callback',
  'http://localhost:3000/auth/callback',
] as const

/**
 * A redirect URI has to be something a browser can come back to, and `init`
 * is the one place somebody types one for the first time. A wrong scheme here
 * becomes a baffling `invalid_redirect_uri` at the end of their first sign-in.
 */
function assertRedirectUri(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw usageFailure(
      `--redirect-uri must be an absolute URL, and '${value}' is not.`,
      '  For local development: http://localhost:3000/callback',
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw usageFailure(`--redirect-uri must be http or https, not '${url.protocol}'.`)
  }
}

function operation(id: string): GeneratedOperation {
  const found = OPERATIONS[id]
  if (!found) throw new Error(`invariant: generated operations has no '${id}'`)
  return found
}

function idempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}
