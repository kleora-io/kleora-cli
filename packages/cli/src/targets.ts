/**
 * Resolving `--app acme --sandbox` (or `--environment <uuid>`) to an
 * environment, and saying out loud what it resolved to.
 *
 * Environments are named, never remembered. That is the whole of this
 * module's design:
 *
 * Every environment-scoped command takes an explicit target. Sandbox and
 * production are separate objects that look alike, and ambient state that
 * drifts is how somebody deletes a production client believing it is in
 * sandbox — and it costs one parameter.
 *
 * And **every command that writes echoes its resolved target to stderr before
 * acting** — App slug, environment kind, issuer host and id. This is the
 * console's rule in a terminal: the console paints production submit buttons
 * in an attention variant precisely because the two screens are otherwise
 * identical, and a terminal has no colour to rely on when output is piped.
 *
 * The `--sandbox` / `--prod` pair has to be impossible to confuse, and three
 * things do that here: the two flags refuse to appear together; `--env` accepts
 * *only* the API's own two words, so `--env prod` and `--env live` are usage
 * errors rather than near-misses; and production is spelled `PRODUCTION` in the
 * echoed line, on its own, above the action.
 *
 * Resolution costs one or two reads. That is not a violation of "`init` is the
 * only command that performs more than one API call": `--app acme --env
 * sandbox` resolves to an environment id, so a lookup is part of naming a
 * target rather than part of the command.
 */
import { ApiError, type ManagementClient } from '@kleora-io/core'

import type { Flags } from './argv.js'
import { usageFailure } from './exit.js'
import { OPERATIONS } from './generated/operations.js'
import type { Io } from './output.js'
import type { ProjectConfig } from './project-config.js'

export type EnvironmentKind = 'sandbox' | 'production'

export interface ResolvedEnvironment {
  readonly id: string
  readonly kind: EnvironmentKind
  readonly issuerHost: string
  readonly appId: string
  /**
   * `null` when the App could not be read.
   *
   * An `api_key` principal is scoped to one Environment, so it can reach
   * `GET /environments/{id}` and **not** `GET /apps/{id}` — and the slug is
   * only ever a decoration on the echoed target line. Found by running
   * `users list --environment <id>` under a key against a dev stack: the
   * command failed with `insufficient-scope` pointing at `/apps/…`, a route it
   * had not asked for, while the read it *did* ask for was perfectly allowed.
   * A failed lookup here never fails the call it was decorating.
   */
  readonly appSlug: string | null
  /** Where the target came from — quoted in the echoed line so a stale file is visible. */
  readonly source: 'flags' | 'environment-id' | 'kleora.toml'
}

const LIST_APPS = operation('list_apps')
const LIST_CLIENTS = operation('list_clients')
const READ_APP = operation('read_app')
const LIST_APP_ENVIRONMENTS = operation('list_app_environments')
const READ_ENVIRONMENT = operation('read_environment')

function operation(id: string): (typeof OPERATIONS)[string] {
  const found = OPERATIONS[id]
  if (!found) throw new Error(`invariant: generated operations has no '${id}'`)
  return found
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The environment kind the flags name, or `undefined`.
 *
 * `--sandbox` and `--prod` are the short spellings; `--env` takes the API's own
 * words and nothing else. A near-miss is refused by name rather than guessed,
 * because the guess is the failure mode.
 */
export function kindFromFlags(flags: Flags): EnvironmentKind | undefined {
  const sandbox = flags.boolean('sandbox') === true
  const prod = flags.boolean('prod') === true
  const named = flags.value('env')

  if (sandbox && prod) {
    throw usageFailure(
      '--sandbox and --prod were both given.',
      '  These are different environments that look alike. Name one.',
    )
  }
  if ((sandbox || prod) && named !== undefined) {
    throw usageFailure(
      `--env was given alongside ${sandbox ? '--sandbox' : '--prod'}.`,
      '  They mean the same thing; pass one of them.',
    )
  }
  if (sandbox) return 'sandbox'
  if (prod) return 'production'
  if (named === undefined) return undefined
  if (named === 'sandbox' || named === 'production') return named
  throw usageFailure(
    `--env takes \`sandbox\` or \`production\`, not '${named}'.`,
    '  Those are the two words the API uses, so the CLI uses them too — there is',
    '  no `prod`, `live`, `dev` or `staging`. `--sandbox` and `--prod` are the',
    '  short spellings.',
  )
}

export interface TargetResolution {
  readonly client: ManagementClient
  readonly flags: Flags
  readonly io: Io
  readonly project: ProjectConfig | null
}

/**
 * Resolves the environment a command is addressed at.
 *
 * `--environment <uuid>` wins, because it is the least ambiguous thing a person
 * can pass. Otherwise `--app` plus a kind. A `kleora.toml` may supply either
 * half, with one deliberate asymmetry: it may never supply
 * `production`.
 */
export async function resolveEnvironment({
  client,
  flags,
  io,
  project,
}: TargetResolution): Promise<ResolvedEnvironment> {
  const explicitId = flags.value('environment')
  if (explicitId !== undefined) {
    if (!UUID_RE.test(explicitId)) {
      throw usageFailure(
        `--environment takes an environment id, and '${explicitId}' is not one.`,
        '  For a name, use `--app <slug>` with `--sandbox` or `--prod`.',
      )
    }
    const environment = (await client.call(READ_ENVIRONMENT, { environment_id: explicitId })) as {
      id: string
      kind: string
      issuer: string
      app_id: string
    }
    let appSlug: string | null = null
    try {
      appSlug = ((await client.call(READ_APP, { app_id: environment.app_id })) as { slug: string }).slug
    } catch {
      // Best-effort, deliberately: see `appSlug` above. The issuer host on the
      // echoed line identifies the target on its own.
    }
    return {
      id: environment.id,
      kind: asKind(environment.kind),
      issuerHost: hostOf(environment.issuer),
      appId: environment.app_id,
      appSlug,
      source: 'environment-id',
    }
  }

  const flagApp = flags.value('app')
  const flagKind = kindFromFlags(flags)

  if (project?.rejectedEnv !== undefined && flagKind === undefined) {
    io.err(
      `kleora.toml sets env = "${project.rejectedEnv}" and it is ignored: a production ` +
        `target is never taken from a file (${project.path}).\n`,
    )
  }

  const appName = flagApp ?? project?.app
  if (appName === undefined) {
    throw usageFailure(
      'This command needs an environment and none was named.',
      '',
      '  Either:  --app <slug> --sandbox        (or --prod)',
      '      or:  --environment <environment-id>',
      '',
      '  Nothing is remembered between commands, deliberately: sandbox and',
      '  production look alike, and ambient state that drifts is how somebody',
      '  deletes a production client believing it is in sandbox.',
    )
  }

  // A kind is *never* defaulted to production. When the file names `sandbox`
  // that is honoured; otherwise the command must say.
  const kind = flagKind ?? project?.env
  if (kind === undefined) {
    throw usageFailure(
      `--app ${appName} names an App but not which of its two environments.`,
      '  Pass --sandbox or --prod. There is no default, and production is never',
      '  the one assumed.',
    )
  }

  const source: ResolvedEnvironment['source'] =
    flagApp !== undefined && flagKind !== undefined ? 'flags' : 'kleora.toml'

  const app = await resolveAppForTarget(client, appName)
  const environments = (await client.call(LIST_APP_ENVIRONMENTS, { app_id: app.id })) as {
    items: Array<{ id: string; kind: string; issuer: string }>
  }
  const found = environments.items.find((item) => item.kind === kind)
  if (found === undefined) {
    throw usageFailure(
      `App '${appName}' has no ${kind} environment.`,
      `  It has: ${environments.items.map((item) => item.kind).join(', ')}.`,
    )
  }
  return {
    id: found.id,
    kind,
    issuerHost: hostOf(found.issuer),
    appId: app.id,
    appSlug: app.slug,
    source,
  }
}

/**
 * `resolveApp`, with the one refusal a person needs help with turned into an
 * instruction.
 *
 * Naming an App means reading `/apps`, which is account-level and therefore
 * closed to an `api_key` principal by construction. Passed through, that is a
 * `403` about a route the person never typed; here it says which flag to use
 * instead.
 */
async function resolveAppForTarget(client: ManagementClient, nameOrId: string): Promise<ResolvedApp> {
  try {
    return await resolveApp(client, nameOrId)
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw usageFailure(
        `--app names an App, and reading Apps needs an account-level credential.`,
        '',
        '  An API key is scoped to one Environment, so it cannot look an App up by',
        '  slug. Name the environment directly instead:',
        '',
        '    --environment <environment-id>',
        '',
        '  Or run the command as a person: unset KLEORA_API_KEY and `kleora login`.',
      )
    }
    throw error
  }
}

export interface ResolvedApp {
  readonly id: string
  readonly slug: string
  readonly name: string
}

/**
 * An App by slug or by id.
 *
 * A slug costs one list call, and it is worth it: `kleora apps get <slug>`
 * should work because `kleora users get <id>` does,
 * and a person types the slug they see in a URL rather than a UUID they would
 * have to look up first.
 */
export async function resolveApp(client: ManagementClient, nameOrId: string): Promise<ResolvedApp> {
  if (UUID_RE.test(nameOrId)) {
    const app = (await client.call(READ_APP, { app_id: nameOrId })) as {
      id: string
      slug: string
      name: string
    }
    return { id: app.id, slug: app.slug, name: app.name }
  }
  const page = (await client.call(LIST_APPS, { limit: 200 })) as {
    items: Array<{ id: string; slug: string; name: string }>
  }
  const found = page.items.find((item) => item.slug === nameOrId)
  if (found === undefined) {
    throw usageFailure(
      `No App with slug '${nameOrId}' in this Account.`,
      `  Apps here: ${page.items.map((item) => item.slug).join(', ') || '(none)'}.`,
      '  Run `kleora apps list` to see them, or pass an App id.',
    )
  }
  return { id: found.id, slug: found.slug, name: found.name }
}

/**
 * The line every write echoes before acting, on stderr.
 *
 * Production is shouted on a line of its own. There is no colour to rely on —
 * this output is routinely piped — so the difference between the two
 * environments has to be carried by the words themselves.
 */
/**
 * A Client's **row id**, from either of the two identifiers a person has.
 *
 * `/environments/{e}/clients/{client_id}` takes the row's UUID, and a `Client`
 * carries two ids: that one and the OAuth `client_id`, which is the one
 * `clients list` prints in a column headed `CLIENT ID`, the one that goes into
 * an SDK's configuration, and therefore the one somebody copies. Passing it
 * through produced a `404` that said "nothing there" about a client sitting in
 * front of them — found by doing exactly that against a dev stack.
 *
 * So a UUID is used as-is and anything else is looked up, the same bargain
 * `resolveApp` makes for a slug: one list call to keep the promise that
 * somebody who has successfully run `kleora clients list` can reach the next
 * command without reading anything.
 */
export async function resolveClientRowId(
  client: ManagementClient,
  environmentId: string,
  nameOrId: string,
): Promise<string> {
  if (UUID_RE.test(nameOrId)) return nameOrId
  const page = (await client.call(LIST_CLIENTS, {
    environment_id: environmentId,
    limit: 200,
  })) as { items: Array<{ id: string; client_id: string; name: string }> }
  const found = page.items.find(
    (item) => item.client_id === nameOrId || item.name === nameOrId,
  )
  if (found === undefined) {
    throw usageFailure(
      `No client with id or name '${nameOrId}' in that environment.`,
      `  Run \`kleora clients list\` for the ids this environment has.`,
    )
  }
  return found.id
}

export function targetLine(environment: ResolvedEnvironment): string {
  const from = environment.source === 'kleora.toml' ? ' (from kleora.toml)' : ''
  const app = environment.appSlug ?? '(App not readable by this credential)'
  const head =
    environment.kind === 'production' ? `→ PRODUCTION · ${app}` : `→ sandbox · ${app}`
  return `${head} · ${environment.issuerHost} · ${environment.id}${from}`
}

export function echoTarget(io: Io, environment: ResolvedEnvironment): void {
  io.err(`${targetLine(environment)}\n`)
}

function asKind(value: string): EnvironmentKind {
  if (value === 'sandbox' || value === 'production') return value
  throw new Error(`the API reported an environment kind this CLI does not know: '${value}'`)
}

function hostOf(issuer: string): string {
  try {
    return new URL(issuer).host
  } catch {
    return issuer
  }
}
