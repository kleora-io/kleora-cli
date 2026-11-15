/**
 * One runner for every row in the registry.
 *
 * There is no per-command code in this CLI beyond the seven commands that are
 * about the tool rather than about a resource, and that is the point of the
 * CLI's shape: somebody who has successfully run `kleora clients list` should
 * be able to reach `kleora api-keys list` without reading anything.
 * A promise like that is kept by there being one implementation, not by
 * seventy implementations agreeing.
 */
import { randomUUID } from 'node:crypto'

import type { ManagementClient } from '@kleora-io/core'

import type { Flags } from '../argv.js'
import { confirm } from '../confirm.js'
import { CliFailure, EXIT, usageFailure } from '../exit.js'
import { OPERATIONS, type GeneratedOperation, type OperationField } from '../generated/operations.js'
import { flagName } from '../names.js'
import { printJson, printObject, printTable, type Io } from '../output.js'
import {
  echoTarget,
  resolveApp,
  resolveClientRowId,
  resolveEnvironment,
  targetLine,
  type ResolvedEnvironment,
} from '../targets.js'
import type { ProjectConfig } from '../project-config.js'
import { operationFor, type CommandSpec } from './registry.js'

export interface RunContext {
  readonly client: ManagementClient
  readonly flags: Flags
  readonly io: Io
  readonly positionals: readonly string[]
  readonly project: ProjectConfig | null
  readonly json: boolean
}

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete'])

export async function runCommand(command: CommandSpec, context: RunContext): Promise<void> {
  const operation = operationFor(command)
  const { client, flags, io, json } = context
  const isWrite = WRITE_METHODS.has(operation.method)

  // ---- path parameters ---------------------------------------------------
  const args: Record<string, unknown> = {}
  let environment: ResolvedEnvironment | null = null

  if (command.environmentScoped) {
    environment = await resolveEnvironment({ client, flags, io, project: context.project })
    args['environment_id'] = environment.id
  }

  for (const param of command.flagParams ?? []) {
    const raw = flags.value(param.flag)
    if (raw === undefined) {
      throw usageFailure(
        `This command needs --${param.flag} (${param.describe}).`,
        `  \`kleora ${command.noun} ${command.verb} --help\` lists every flag it takes.`,
      )
    }
    args[param.pathParam] =
      param.resolve === 'app' ? (await resolveApp(client, raw)).id : raw
  }

  const positional = command.positional
  if (positional !== undefined) {
    const value = context.positionals[0]
    if (value === undefined || value === '') {
      throw usageFailure(
        `\`kleora ${command.noun} ${command.verb}\` needs ${positional.name} — ${positional.describe}.`,
      )
    }
    if (positional.pathParams.length === 1) {
      const only = positional.pathParams[0]
      if (only === undefined) throw new Error('invariant: a positional with no path parameter')
      args[only] = await resolvePositional(client, positional.resolve, value, environment)
    } else {
      const parts = value.split('/')
      if (parts.length !== positional.pathParams.length) {
        throw usageFailure(
          `${positional.name} must be ${String(positional.pathParams.length)} values separated by \`/\`, ` +
            `and '${value}' is ${String(parts.length)}.`,
          `  For example: ${positional.pathParams.map((name) => `<${name}>`).join('/')}`,
        )
      }
      positional.pathParams.forEach((name, index) => {
        args[name] = parts[index]
      })
    }
  }

  const extra = context.positionals.slice(positional === undefined ? 0 : 1)
  if (extra.length > 0) {
    throw usageFailure(
      `\`kleora ${command.noun} ${command.verb}\` takes ${
        positional === undefined ? 'no positional argument' : `one positional argument, ${positional.name}`
      } — and got ${String(extra.length + (positional === undefined ? 0 : 1))}.`,
      `  Unexpected: ${extra.join(' ')}`,
    )
  }

  // ---- query and body from flags -----------------------------------------
  for (const field of operation.fields) {
    const value = readField(field, flags)
    if (value !== undefined) args[field.name] = value
  }
  const missing = operation.fields.filter(
    (field) => field.required && args[field.name] === undefined,
  )
  if (missing.length > 0) {
    throw usageFailure(
      `\`kleora ${command.noun} ${command.verb}\` needs ${missing
        .map((field) => `--${flagName(field.name)}`)
        .join(', ')}.`,
      `  \`kleora ${command.noun} ${command.verb} --help\` lists every flag it takes.`,
    )
  }

  // ---- confirmation ------------------------------------------------------
  const needsConfirm =
    command.confirm !== undefined &&
    (command.confirmWhen === undefined ||
      flags.value(command.confirmWhen.flag) === command.confirmWhen.equals)

  if (needsConfirm && command.confirm !== undefined) {
    const expected =
      command.confirmExpected === undefined
        ? undefined
        : await resolveExpected(command, context, args, environment)
    await confirm(
      {
        what: `About to ${command.verb} ${singular(command.noun)}${
          positional === undefined ? '' : ` ${String(context.positionals[0])}`
        }.`,
        target: environment === null ? '(account scope)' : targetLine(environment),
        spec: command.confirm,
        ...(expected === undefined ? {} : { expected }),
      },
      flags,
      io,
    )
  }

  // Every write echoes its resolved target to stderr **before acting**.
  if (isWrite && environment !== null) echoTarget(io, environment)

  // ---- the call ----------------------------------------------------------
  if (operation.method === 'get' && command.columns !== undefined && flags.boolean('all') === true) {
    await walkAllPages(command, context, args)
    return
  }

  const headers: Record<string, string> = {}
  // Every write carries an `Idempotency-Key`, which
  // is also what makes the client's bounded `429` retry safe on a `POST`.
  if (isWrite) headers['Idempotency-Key'] = randomUUID()

  const response = await client.request(operation, args, { headers })

  if (json) {
    printJson(io, response.text === '' ? '{}' : response.text)
    return
  }

  if (response.text === '') {
    io.err(`Done.\n`)
    return
  }
  const body: unknown = JSON.parse(response.text)

  if (command.columns !== undefined && isPage(body)) {
    printTable(io, command.columns, body.items)
    if (typeof body.next_cursor === 'string' && body.next_cursor !== '') {
      io.err(`\nMore rows. Next page: --cursor ${body.next_cursor}\n`)
      io.err(`Or walk every page with --all.\n`)
    }
    return
  }

  if (command.shownOnceSecret !== undefined) {
    revealOnce(io, body, command.shownOnceSecret, command.detailKeys)
    return
  }
  printObject(io, body, command.detailKeys)
}

/**
 * `--all` walks the pages.
 *
 * It is opt-in, it prints progress to stderr, and it stops on the first error
 * rather than partially succeeding in silence. When it fails it exits non-zero
 * with the pages printed so far and the cursor that failed. It never reports
 * success on a partial walk.
 */
async function walkAllPages(
  command: CommandSpec,
  context: RunContext,
  baseArgs: Record<string, unknown>,
): Promise<void> {
  const operation = operationFor(command)
  const { client, io, json } = context
  let cursor: string | undefined = typeof baseArgs['cursor'] === 'string' ? baseArgs['cursor'] : undefined
  let page = 0
  let rows = 0

  for (;;) {
    page += 1
    const args = { ...baseArgs, ...(cursor === undefined ? {} : { cursor }) }
    let response
    try {
      response = await client.request(operation, args)
    } catch (error) {
      io.err(
        `\nStopped on page ${String(page)} after ${String(rows)} rows. The cursor that failed: ` +
          `${cursor ?? '(the first page)'}\n`,
      )
      throw error
    }
    const body: unknown = JSON.parse(response.text)
    if (!isPage(body)) {
      throw new CliFailure(EXIT.UNEXPECTED, [
        `✗ --all expected a paginated response and got something else.`,
      ])
    }
    rows += body.items.length
    if (json) {
      // NDJSON-shaped in spirit: one page document per line, flushed as it
      // arrives, so a walk that is stopped part-way has still emitted valid
      // documents rather than half of one.
      printJson(io, response.text)
    } else if (command.columns !== undefined) {
      printTable(io, command.columns, body.items)
    }
    io.err(`… page ${String(page)}, ${String(rows)} rows so far\n`)
    const next = body.next_cursor
    if (typeof next !== 'string' || next === '') break
    cursor = next
  }
  io.err(`Done: ${String(rows)} rows over ${String(page)} page${page === 1 ? '' : 's'}.\n`)
}

/**
 * A one-time secret, called out as one.
 *
 * It is never retrievable again. The
 * console shows a dialog with "Shown once — store it now"; a terminal has no
 * dialog, so it gets the same sentence and the value on a line of its own,
 * which is the shape a person can select.
 */
function revealOnce(io: Io, body: unknown, field: string, keys: readonly string[] | undefined): void {
  if (typeof body !== 'object' || body === null) {
    printObject(io, body, keys)
    return
  }
  const record = body as Record<string, unknown>
  const secret = record[field]
  const rest = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field))
  printObject(io, rest, keys)
  if (typeof secret !== 'string') {
    io.err(`\n(No ${field} in the response — this resource has none.)\n`)
    return
  }
  io.err(`\nShown once — store it now. It cannot be retrieved again.\n`)
  io.out(`${secret}\n`)
}

interface Page {
  items: unknown[]
  next_cursor?: unknown
}

function isPage(body: unknown): body is Page {
  return (
    typeof body === 'object' &&
    body !== null &&
    'items' in body &&
    Array.isArray(body.items)
  )
}

function readField(field: OperationField, flags: Flags): unknown {
  const name = flagName(field.name)
  if (field.type === 'boolean') return flags.boolean(name)
  if (field.repeated) {
    const values = flags.values(name)
    if (values.length === 0) return undefined
    return values.map((value) => coerce(field, value, name))
  }
  const raw = flags.value(name)
  if (raw === undefined) return undefined
  return coerce(field, raw, name)
}

function coerce(field: OperationField, raw: string, name: string): unknown {
  if (field.enum !== undefined && !field.enum.includes(raw)) {
    throw usageFailure(
      `--${name} takes one of: ${field.enum.join(', ')} — not '${raw}'.`,
    )
  }
  switch (field.type) {
    case 'number': {
      const value = Number(raw)
      if (!Number.isFinite(value)) throw usageFailure(`--${name} takes a number, not '${raw}'.`)
      return value
    }
    case 'boolean':
      return raw === 'true'
    case 'json':
      try {
        return JSON.parse(raw)
      } catch {
        throw usageFailure(
          `--${name} takes a JSON value and '${raw}' does not parse.`,
          `  For example: --${name} '{"plan":"pro"}'`,
        )
      }
    default:
      return raw
  }
}

/**
 * The exact string a typed confirmation wants, read off the row about to change.
 *
 * Each of these costs one read, and it is the read that makes the mechanism
 * worth anything: a `--confirm` that matches is evidence the person looked at
 * the right row, which a constant string typed from memory would not be.
 */
async function resolveExpected(
  command: CommandSpec,
  context: RunContext,
  args: Record<string, unknown>,
  environment: ResolvedEnvironment | null,
): Promise<string | undefined> {
  const expected = command.confirmExpected
  if (expected === undefined) return undefined

  switch (expected.from) {
    case 'positional':
      return context.positionals[0]
    case 'issuer-host':
      return environment?.issuerHost
    case 'production-issuer-host': {
      if (environment === null) return undefined
      if (environment.kind === 'production') return environment.issuerHost
      // Promotion is addressed at sandbox and changes production, so the string
      // to type is the *other* environment's host.
      const page = (await context.client.call(operation('list_app_environments'), {
        app_id: environment.appId,
      })) as { items: Array<{ kind: string; issuer: string }> }
      const production = page.items.find((item) => item.kind === 'production')
      if (production === undefined) return undefined
      try {
        return new URL(production.issuer).host
      } catch {
        return production.issuer
      }
    }
    case 'user-name': {
      const userId = args['user_id']
      if (typeof userId !== 'string') return undefined
      const user = (await context.client.call(operation('read_user'), {
        environment_id: args['environment_id'],
        user_id: userId,
      })) as { name?: string | null; email?: string | null }
      // A user may have no name; the console's dialog then shows the address,
      // which is the only identifying string there is.
      return user.name ?? user.email ?? undefined
    }
  }
}

/**
 * The positional, turned into whatever the path parameter actually wants.
 *
 * Both resolutions exist because the value a person has in front of them is not
 * the value the URL takes: an App is named by slug and addressed by id, and a
 * Client is *printed* by its OAuth `client_id` and addressed by its row id.
 */
async function resolvePositional(
  client: ManagementClient,
  resolve: 'app' | 'client' | undefined,
  value: string,
  environment: ResolvedEnvironment | null,
): Promise<string> {
  if (resolve === 'app') return (await resolveApp(client, value)).id
  if (resolve === 'client') {
    if (environment === null) throw new Error('invariant: a client positional outside an environment')
    return resolveClientRowId(client, environment.id, value)
  }
  return value
}

/** A generated operation by id, for the two lookups this module makes itself. */
function operation(id: string): GeneratedOperation {
  const found = OPERATIONS[id]
  if (!found) throw new Error(`invariant: generated operations has no '${id}'`)
  return found
}

function singular(noun: string): string {
  if (noun.endsWith('ies')) return `${noun.slice(0, -3)}y`
  if (noun.endsWith('s')) return noun.slice(0, -1)
  return noun
}
