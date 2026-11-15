/**
 * Which flags a command accepts — one calculation, three readers.
 *
 * `--help` prints them, `completion` bakes them into a shell script, and the
 * router refuses the ones that are not here. All three have to agree or the
 * CLI lies about itself in one of them: a flag that completes but is refused,
 * or one that is documented and does nothing.
 *
 * The refusal is the reason this is computed rather than described. A silently
 * ignored `--redirect-uri` where the API wants `--redirect_uris` would create a
 * client with no redirect URI at all and report success.
 */
import { operationFor, type CommandSpec } from './registry.js'
import { flagName } from '../names.js'

/** Accepted everywhere, including on the seven tool commands. */
export const GLOBAL_FLAGS = [
  'json',
  'profile',
  'debug',
  'help',
  'version',
  'yes',
  'confirm',
  'base-url',
  'issuer',
  'client-id',
] as const

/** Accepted by every environment-scoped command. */
export const TARGET_FLAGS = ['app', 'env', 'sandbox', 'prod', 'environment'] as const

/** Commands that are about the tool rather than about a resource. */
export const TOOL_COMMANDS = [
  'login',
  'logout',
  'whoami',
  'version',
  'doctor',
  'completion',
  'init',
] as const

/**
 * Every flag name (without `--`) this command accepts.
 *
 * A boolean field also accepts its `--no-` form, which `argv.ts` reads as
 * `false`; the caller adds that rather than this list carrying both spellings
 * of everything.
 */
export function allowedFlags(command: CommandSpec): ReadonlySet<string> {
  const operation = operationFor(command)
  const allowed = new Set<string>(GLOBAL_FLAGS)
  if (command.environmentScoped) for (const flag of TARGET_FLAGS) allowed.add(flag)
  for (const param of command.flagParams ?? []) allowed.add(param.flag)
  for (const field of operation.fields) allowed.add(flagName(field.name))
  if (command.confirm?.kind === 'acknowledge') {
    for (const ack of command.confirm.acknowledgements) allowed.add(ack.flag)
  }
  if (operation.method === 'get' && command.columns !== undefined) allowed.add('all')
  return allowed
}

/** The flags the seven tool commands accept, beyond the global set. */
export const TOOL_FLAGS: Readonly<Record<string, readonly string[]>> = {
  login: ['open', 'device-code-only'],
  logout: ['all'],
  whoami: [],
  version: [],
  doctor: [],
  completion: [],
  init: ['name', 'slug', 'redirect-uri', 'write'],
  audit: [
    ...TARGET_FLAGS,
    'tenant',
    'action',
    'actor-id',
    'target-id',
    'tenant-id',
    'environment-id',
    'from',
    'to',
    'format',
    'limit',
    'cursor',
  ],
}
