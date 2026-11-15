/**
 * `--help`, at three levels: the whole tool, one noun, one command.
 *
 * Help goes to **stdout**, which looks like an exception to "data goes to
 * stdout" and is not: when somebody asks for help, the help is the data, and
 * `kleora apps create --help | less` has to work. Everything else this CLI
 * says about itself — targets, warnings, progress — is on stderr.
 *
 * One rule governs what may appear here: **nothing we ship may advertise a
 * capability that is not there.** There is no `listen`, no `webhooks`, and no
 * "coming soon" line for either. A person reading this list can run everything
 * in it.
 */
import { COMMANDS, nouns, operationFor, verbsFor, type CommandSpec } from './commands/registry.js'
import { TOOL_COMMANDS } from './commands/surface.js'
import { flagName } from './names.js'
import type { Io } from './output.js'
import { VERSION } from './version.js'

export function printRootHelp(io: Io): void {
  io.out(`kleora ${VERSION} — manage a Kleora account from a terminal.

  kleora <noun> <verb> [target] [flags]

Nouns are the management API's resources and verbs are list, get, create,
update, delete plus each resource's own named actions. Nothing is aliased, so
what worked for one noun works for the next.

`)
  const width = Math.max(...[...nouns(), ...TOOL_COMMANDS].map((name) => name.length))
  for (const noun of nouns()) {
    io.out(`  ${noun.padEnd(width)}  ${verbsFor(noun).map((command) => command.verb).join(', ')}\n`)
  }
  io.out(`  ${'audit'.padEnd(width)}  list\n`)
  io.out(`\nAbout the tool rather than a resource:\n\n`)
  io.out(`  ${'login'.padEnd(width)}  Sign in with a device grant, approved in a browser.\n`)
  io.out(`  ${'logout'.padEnd(width)}  Revoke at the issuer and delete the local credential.\n`)
  io.out(`  ${'whoami'.padEnd(width)}  Who this credential is, and where it is kept.\n`)
  io.out(`  ${'version'.padEnd(width)}  This CLI, the API document, the service.\n`)
  io.out(`  ${'doctor'.padEnd(width)}  Compare this CLI with the deployment; check local files.\n`)
  io.out(`  ${'completion'.padEnd(width)}  A completion script for bash, zsh or fish.\n`)
  io.out(`  ${'init'.padEnd(width)}  Create an App and print working SDK configuration.\n`)

  io.out(`
Global flags

  --json                 Print the API's response body, unmodified, on stdout.
  --profile <name>       Which stored credential to use (or KLEORA_PROFILE).
  --debug                One line per request on stderr. Safe to paste: it
                         carries no credential and no shown-once secret.
  --yes                  Satisfy an ordinary confirmation. Never a typed one.
  --confirm <string>     Satisfy a typed confirmation, matched exactly.
  --help                 This, or a noun's, or a command's.

Naming an environment — always explicitly, never remembered between commands

  --app <slug> --sandbox        or --prod
  --environment <environment-id>

Credentials are never flags and never environment variables, with one named
exception: KLEORA_API_KEY, for CI, which has no browser to approve a device
grant in. An API key reaches one Environment, so account-level commands answer
403 under one and the CLI says so before you meet it.

  kleora <noun> --help         every verb on that noun
  kleora <noun> <verb> --help  every flag that verb takes
`)
}

export function printNounHelp(noun: string, io: Io): void {
  const commands = verbsFor(noun)
  io.out(`kleora ${noun}\n\n`)
  const width = Math.max(...commands.map((command) => command.verb.length))
  for (const command of commands) {
    io.out(`  ${command.verb.padEnd(width)}  ${command.summary}\n`)
  }
  io.out(`\n  kleora ${noun} <verb> --help  every flag that verb takes\n`)
}

export function printCommandHelp(command: CommandSpec, io: Io): void {
  const operation = operationFor(command)
  const positional = command.positional === undefined ? '' : ` ${command.positional.name}`
  io.out(`kleora ${command.noun} ${command.verb}${positional} [flags]\n\n`)
  io.out(`  ${command.summary}\n\n`)
  io.out(`  ${operation.method.toUpperCase()} ${operation.path}\n`)

  if (command.positional !== undefined) {
    io.out(`\nArgument\n\n  ${command.positional.name}  ${command.positional.describe}\n`)
  }

  const rows: Array<[string, string]> = []
  if (command.environmentScoped) {
    rows.push(['--app <slug>', 'the App, by slug or id'])
    rows.push(['--sandbox | --prod', 'which of its two environments (no default)'])
    rows.push(['--environment <id>', 'the environment id, instead of the two above'])
  }
  for (const param of command.flagParams ?? []) {
    rows.push([`--${param.flag} <value>`, param.describe])
  }
  for (const field of operation.fields) {
    const name = flagName(field.name)
    const shape =
      field.type === 'boolean'
        ? `--${name} | --no-${name}`
        : field.enum !== undefined
          ? `--${name} <${field.enum.join('|')}>`
          : `--${name} <${field.type}>`
    const notes = [
      field.required ? 'required' : null,
      field.repeated ? 'repeatable' : null,
      field.where === 'query' ? 'filter' : null,
      field.description ?? null,
    ].filter((note): note is string => note !== null)
    rows.push([shape, notes.join('; ')])
  }
  if (operation.method === 'get' && command.columns !== undefined) {
    rows.push(['--all', 'walk every page, printing progress to stderr'])
  }
  if (command.confirm?.kind === 'acknowledge') {
    for (const ack of command.confirm.acknowledgements) {
      rows.push([`--${ack.flag}`, `required: ${ack.consequence}`])
    }
  }
  if (command.confirm?.kind === 'typed') {
    rows.push([
      '--confirm <string>',
      `required non-interactively: ${command.confirm.describe}. --yes does not satisfy it.`,
    ])
  }
  if (command.confirm?.kind === 'prompt') {
    rows.push(['--yes', 'confirm non-interactively'])
  }

  if (rows.length > 0) {
    io.out('\nFlags\n\n')
    const width = Math.min(30, Math.max(...rows.map(([shape]) => shape.length)))
    for (const [shape, note] of rows) {
      io.out(`  ${shape.padEnd(width)}  ${note}\n`)
    }
  }

  if (command.shownOnceSecret !== undefined) {
    io.out(
      `\n  The response carries \`${command.shownOnceSecret}\` exactly once and it is never\n` +
        '  retrievable again. Store it when you see it.\n',
    )
  }
  io.out('\n  --json prints the API\'s own response body; see `kleora --help`.\n')
}

/** Whether a noun exists at all, for the "did you mean" in the router. */
export function isKnownNoun(noun: string): boolean {
  return COMMANDS.some((command) => command.noun === noun) || noun === 'audit'
}
