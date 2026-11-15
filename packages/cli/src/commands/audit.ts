/**
 * `kleora audit list` — the one noun whose operation depends on the scope the
 * flags name, which is why it is not a row in the registry.
 *
 * The audit log is read at three levels and they are three endpoints: the
 * Account's, one environment's, and one tenant's. A caller with `--app x
 * --sandbox` means the second; `--tenant <id>` means the third; neither means
 * the first. Collapsing them into one row would have required the registry to
 * grow a notion of "the operation depends on the flags", for exactly one noun —
 * cheaper and clearer to write the choice out here, where a reader can see all
 * three and why.
 *
 * Ordering is descending, which is what a person reading a log wants and why
 * this needs no `--sort` the API does not have.
 */
import type { ManagementClient } from '@kleora-io/core'

import type { Flags } from '../argv.js'
import { usageFailure } from '../exit.js'
import { OPERATIONS, type GeneratedOperation } from '../generated/operations.js'
import { printJson, printTable, type Io, type Column } from '../output.js'
import type { ProjectConfig } from '../project-config.js'
import { echoTarget, kindFromFlags, resolveEnvironment } from '../targets.js'
import { flagName } from '../names.js'

export interface AuditDependencies {
  readonly client: ManagementClient
  readonly flags: Flags
  readonly io: Io
  readonly json: boolean
  readonly project: ProjectConfig | null
  readonly positionals: readonly string[]
}

/**
 * `actor.display` is absent — not null — for `api_key`, `system` and
 * `anonymous`, none of which has a name, so `KIND` carries the answer for those
 * rows and `ACTOR` is the label where there is one. Printing only `display`
 * left a column of dashes for every system action, which is most of a fresh
 * environment's log.
 */
const COLUMNS: readonly Column[] = [
  { header: 'WHEN', path: 'occurred_at' },
  { header: 'ACTION', path: 'action' },
  { header: 'ACTOR', path: 'actor.display' },
  { header: 'KIND', path: 'actor.kind' },
  { header: 'TARGET', path: 'target.display' },
  { header: 'IP', path: 'ip' },
]

export async function auditList(deps: AuditDependencies): Promise<void> {
  const { client, flags, io, json } = deps

  const verb = deps.positionals[0]
  if (verb !== 'list') {
    throw usageFailure(
      `\`kleora audit\` has one verb, \`list\`${verb === undefined ? '' : `, not '${verb}'`}.`,
      '',
      '  kleora audit list                          the Account\'s log',
      '  kleora audit list --app acme --sandbox     one environment\'s log',
      '  kleora audit list --tenant <tenant-id>     one tenant\'s log',
    )
  }

  const tenant = flags.value('tenant')
  const hasEnvironmentTarget =
    flags.value('app') !== undefined ||
    flags.value('environment') !== undefined ||
    kindFromFlags(flags) !== undefined

  if (tenant !== undefined && hasEnvironmentTarget) {
    throw usageFailure(
      '--tenant and an environment target name two different logs.',
      '  Pass one: --tenant <id>, or --app <slug> with --sandbox/--prod.',
    )
  }

  let operationId: string
  const args: Record<string, unknown> = {}
  if (tenant !== undefined) {
    operationId = 'list_tenant_audit_events'
    args['tenant_id'] = tenant
  } else if (hasEnvironmentTarget) {
    operationId = 'list_environment_audit_events'
    const environment = await resolveEnvironment({ client, flags, io, project: deps.project })
    args['environment_id'] = environment.id
    // A read, but the target is echoed anyway: an audit log read against the
    // wrong environment looks exactly like an empty one.
    echoTarget(io, environment)
  } else {
    operationId = 'list_account_audit_events'
  }

  const operation = operationFor(operationId)
  for (const field of operation.fields) {
    const name = flagName(field.name)
    if (field.repeated) {
      const values = flags.values(name)
      if (values.length > 0) args[field.name] = values
      continue
    }
    const value = flags.value(name)
    if (value !== undefined) args[field.name] = field.type === 'number' ? Number(value) : value
  }

  const response = await client.request(operation, args)
  if (json) {
    printJson(io, response.text)
    return
  }
  const body = JSON.parse(response.text) as { items: unknown[]; next_cursor?: string | null }
  printTable(io, COLUMNS, body.items)
  if (typeof body.next_cursor === 'string' && body.next_cursor !== '') {
    io.err(`\nMore events. Next page: --cursor ${body.next_cursor}\n`)
  }
}

function operationFor(id: string): GeneratedOperation {
  const found = OPERATIONS[id]
  if (!found) {
    throw new Error(
      `the generated operations have no '${id}' — run \`pnpm generate:operations\``,
    )
  }
  return found
}
