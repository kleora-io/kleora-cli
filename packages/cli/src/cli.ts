/**
 * The router: argv in, exit code out, with every side effect injected.
 *
 * `index.ts` is a twelve-line shim around this, which is what makes the whole
 * CLI testable: a suite passes a `RecordingIo`, a fake `fetch`, a temp-directory
 * credential store and a frozen environment, and asserts on the two output
 * streams and the exit code. What a script may rely on (exit codes, which
 * stream carries what) is a contract, and a contract wants a test rather than
 * a reading.
 */
import { defaultConfigDir, type CredentialStore } from '@kleora-io/core'

import { Flags, parseArgv } from './argv.js'
import { authenticate, openStore, type Authenticated } from './auth.js'
import { auditList } from './commands/audit.js'
import { completion } from './commands/completion.js'
import { doctor, version as printVersion } from './commands/doctor.js'
import { init } from './commands/init.js'
import { login } from './commands/login.js'
import { logout } from './commands/logout.js'
import { findCommand, nouns, verbsFor, type CommandSpec } from './commands/registry.js'
import { runCommand } from './commands/run.js'
import { allowedFlags, GLOBAL_FLAGS, TOOL_FLAGS } from './commands/surface.js'
import { whoami } from './commands/whoami.js'
import {
  CONFIG_DIR_NAME,
  loadConfig,
  refuseCredentialFlags,
  type Config,
  type ConfigEnvironment,
} from './config.js'
import { CliFailure, EXIT, usageFailure, type ExitCode } from './exit.js'
import { isKnownNoun, printCommandHelp, printNounHelp, printRootHelp } from './help.js'
import type { Io } from './output.js'
import { findProjectConfig } from './project-config.js'
import { toFailure } from './problems.js'

export interface CliDependencies {
  readonly argv: readonly string[]
  readonly env: ConfigEnvironment
  readonly io: Io
  readonly fetch: typeof globalThis.fetch
  /** The working directory `kleora.toml` is searched upward from. */
  readonly cwd: string
  /** Overridden in tests; never by a flag. */
  readonly store?: CredentialStore
  readonly configDir?: string
  readonly openUrl?: (url: string) => void
  readonly sleep?: (ms: number) => Promise<void>
}

/**
 * Runs one command. Never throws, never calls `process.exit` — it returns the
 * code, so a test can assert on it and `index.ts` is the only thing that knows
 * a process exists.
 */
export async function run(deps: CliDependencies): Promise<ExitCode> {
  const { io } = deps
  let action = 'run that command'
  try {
    return await dispatch(deps, (next) => {
      action = next
    })
  } catch (error) {
    const failure = toFailure(error, { action, underApiKey: deps.env['KLEORA_API_KEY'] !== undefined })
    for (const line of failure.lines) io.err(`${line}\n`)
    return failure.exitCode
  }
}

async function dispatch(
  deps: CliDependencies,
  setAction: (action: string) => void,
): Promise<ExitCode> {
  const { io } = deps
  const parsed = parseArgv(deps.argv)
  const flags = new Flags(parsed)
  const wantsHelp = flags.boolean('help') === true
  const json = flags.boolean('json') === true
  const debug = flags.boolean('debug') === true

  // Before anything else, including before the noun is looked at: a flag that
  // would put a credential in `argv` is refused by name, wherever it appears.
  refuseCredentialFlags(parsed.flags.map((flag) => flag.name))

  const [noun, ...rest] = parsed.positionals

  if (noun === undefined) {
    printRootHelp(io)
    // No command was asked for, so this is not a usage error — it is the
    // answer to `kleora`.
    return EXIT.OK
  }

  // `--version` is spelled as a command (`kleora version`) *and* as the flag
  // every tool has, because a person types both and neither should be a
  // mystery.
  if (noun === 'version' || flags.boolean('version') === true) {
    const config = loadConfig(flags, deps.env, deps.fetch)
    setAction('read the version')
    await printVersion({
      config,
      io,
      fetch: deps.fetch,
      configDir: deps.configDir ?? defaultConfigDir(CONFIG_DIR_NAME),
      json,
      storeBackend: null,
    })
    return EXIT.OK
  }

  if (noun === 'completion') {
    // Deliberately before any configuration is read and any store is opened:
    // a completion script must be printable on a machine that has never signed
    // in, with no network and no keychain.
    completion(rest[0], io)
    return EXIT.OK
  }

  // ---- everything that is a usage question, answered before any credential
  // is read and before any request is made.
  //
  // A `--help` that needed a credential would be useless to the person who
  // most needs it, and a usage error that first refreshed an access token would
  // spend a rate-limit budget telling somebody they mistyped a flag.
  const resolved = resolveCommand(noun, rest, wantsHelp, flags, parsed.flags.map((flag) => flag.name), io)
  if (resolved.kind === 'printed') return resolved.code

  const config = loadConfig(flags, deps.env, deps.fetch)
  const configDir = deps.configDir ?? defaultConfigDir(CONFIG_DIR_NAME)

  if (noun === 'login') {
    setAction('sign in')
    const store = deps.store ?? (await openStore(configDir))
    await login({
      config,
      flags,
      io,
      fetch: deps.fetch,
      store,
      configDir,
      json,
      ...(deps.openUrl === undefined ? {} : { openUrl: deps.openUrl }),
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
    })
    return EXIT.OK
  }

  if (noun === 'logout') {
    setAction('sign out')
    const store = deps.store ?? (await openStore(configDir))
    await logout({ config, flags, io, fetch: deps.fetch, store, configDir, json })
    return EXIT.OK
  }

  if (noun === 'doctor') {
    setAction('run doctor')
    // `doctor` reads a document that is served anonymously, so it must work
    // with no credential at all — that is exactly when somebody reaches for it.
    let backend: CredentialStore['backend'] | null
    try {
      backend = (deps.store ?? (await openStore(configDir))).backend
    } catch {
      // A store that cannot even be opened is itself a finding, and `doctor`
      // is the command whose job is to report findings rather than fail on one.
      backend = null
    }
    await doctor({
      config,
      io,
      fetch: deps.fetch,
      configDir,
      json,
      storeBackend: config.apiKey === undefined ? backend : null,
    })
    return EXIT.OK
  }

  // Everything below needs a credential.
  const auth = await authenticate({
    config,
    io,
    fetch: deps.fetch,
    debug,
    ...(deps.store === undefined ? {} : { store: deps.store }),
  })

  if (noun === 'whoami') {
    setAction('read who you are')
    await whoami({ client: auth.client, config, io, json, auth })
    return EXIT.OK
  }

  if (noun === 'init') {
    setAction('initialise an App')
    await init({ client: auth.client, config, flags, io, json })
    return EXIT.OK
  }

  const project = findProjectConfig({ from: deps.cwd })

  if (noun === 'audit') {
    setAction('read the audit log')
    await auditList({ client: auth.client, flags, io, json, project, positionals: rest })
    return EXIT.OK
  }

  if (resolved.kind !== 'command') {
    // Every `tool` resolution is answered by name above. Reaching here means a
    // name was added to `isToolCommand` and not to `dispatch`, which is a bug in
    // this file rather than anything a person typed.
    throw new Error(`invariant: '${noun}' resolved as a tool command with no handler`)
  }
  const command = resolved.command
  setAction(actionPhrase(command.noun, command.verb))
  await runCommand(command, {
    client: auth.client,
    flags,
    io,
    positionals: rest.slice(1),
    project,
    json,
  })
  return EXIT.OK
}

type Resolution =
  /** Nothing more to do: help was printed, or `kleora <noun>` with no verb. */
  | { readonly kind: 'printed'; readonly code: ExitCode }
  /** A tool command, which `dispatch` handles by name below. */
  | { readonly kind: 'tool' }
  /** A registry row, validated and ready to run once a credential exists. */
  | { readonly kind: 'command'; readonly command: CommandSpec }

/**
 * Everything that can be decided from `argv` alone: is this a real noun, a real
 * verb, are its flags real, and did somebody ask for help?
 *
 * Kept as one function *before* authentication so that none of those answers
 * ever costs a request or a stored credential. It is also what makes "a typo
 * must not be reported by a command that has already deleted something" true:
 * the flag check happens here, and nothing has been sent yet.
 */
function resolveCommand(
  noun: string,
  rest: readonly string[],
  wantsHelp: boolean,
  flags: Flags,
  passedFlags: readonly string[],
  io: Io,
): Resolution {
  if (isToolCommand(noun)) {
    if (wantsHelp) {
      printRootHelp(io)
      return { kind: 'printed', code: EXIT.OK }
    }
    refuseUnknownToolFlags(passedFlags, noun)
    return { kind: 'tool' }
  }

  if (noun === 'audit') {
    if (wantsHelp) {
      io.out('kleora audit list [flags]\n\n  Read an audit log.\n\n')
      io.out("  No target      the Account's log\n")
      io.out("  --app/--env    one environment's log\n")
      io.out("  --tenant <id>  one tenant's log\n")
      return { kind: 'printed', code: EXIT.OK }
    }
    refuseUnknownToolFlags(passedFlags, 'audit')
    return { kind: 'tool' }
  }

  if (!isKnownNoun(noun)) throw unknownNoun(noun)

  const verb = rest[0]
  if (verb === undefined) {
    printNounHelp(noun, io)
    // `kleora apps` alone is an incomplete command, not a request for help —
    // so the list is printed but the exit code says nothing ran.
    return { kind: 'printed', code: wantsHelp ? EXIT.OK : EXIT.USAGE }
  }

  const command = findCommand(noun, verb)
  if (command === undefined) throw unknownVerb(noun, verb)

  if (wantsHelp) {
    printCommandHelp(command, io)
    return { kind: 'printed', code: EXIT.OK }
  }

  refuseUnknownFlags(passedFlags, allowedFlags(command), command)
  // Reading `--yes` here keeps `Flags`' duplicate-value check honest for it on
  // commands that never reach `confirm()`.
  flags.boolean('yes')
  return { kind: 'command', command }
}

/**
 * A flag this command does not have is a usage error, and nothing is sent.
 *
 * A silently ignored flag is the worst kind of typo: `--redirect-uri` where the
 * API wants `redirect_uris` would create a client with no redirect URI at all
 * and report success. `--no-x` is accepted wherever `--x` is, since that is how
 * `argv.ts` spells `false`.
 */
function refuseUnknownFlags(
  passed: readonly string[],
  allowed: ReadonlySet<string>,
  command: CommandSpec,
): void {
  const unknown = [
    ...new Set(passed.filter((name) => !allowed.has(name) && !allowed.has(stripNo(name)))),
  ]
  if (unknown.length === 0) return
  throw usageFailure(
    `Unknown flag${unknown.length === 1 ? '' : 's'} for \`${command.noun} ${command.verb}\`: ` +
      `${unknown.map((name) => `--${name}`).join(', ')}.`,
    `  \`kleora ${command.noun} ${command.verb} --help\` lists every flag it takes.`,
  )
}

/** The same check for the seven tool commands, whose flags are a fixed list. */
function refuseUnknownToolFlags(passed: readonly string[], name: string): void {
  const allowed = new Set<string>([...GLOBAL_FLAGS, ...(TOOL_FLAGS[name] ?? [])])
  const unknown = [
    ...new Set(passed.filter((flag) => !allowed.has(flag) && !allowed.has(stripNo(flag)))),
  ]
  if (unknown.length === 0) return
  throw usageFailure(
    `Unknown flag${unknown.length === 1 ? '' : 's'} for \`${name}\`: ` +
      `${unknown.map((flag) => `--${flag}`).join(', ')}.`,
    `  \`kleora --help\` lists the global flags.`,
  )
}

function stripNo(name: string): string {
  return name.startsWith('no-') ? name.slice(3) : name
}

function isToolCommand(noun: string): boolean {
  return ['login', 'logout', 'whoami', 'version', 'doctor', 'completion', 'init'].includes(noun)
}

function unknownNoun(noun: string): CliFailure {
  const known = [...nouns(), 'audit']
  const near = known.filter((candidate) => candidate.startsWith(noun.slice(0, 3)))
  return usageFailure(
    `There is no \`kleora ${noun}\`.`,
    ...(near.length > 0 ? [`  Did you mean: ${near.join(', ')}?`] : []),
    `  \`kleora --help\` lists every noun.`,
  )
}

function unknownVerb(noun: string, verb: string): CliFailure {
  return usageFailure(
    `\`kleora ${noun}\` has no \`${verb}\`.`,
    `  It has: ${verbsFor(noun).map((command) => command.verb).join(', ')}.`,
  )
}

/**
 * What `Cannot …` completes with when a command is refused.
 *
 * A `list` is about the collection and everything else about one row, so
 * "Cannot list users" and "Cannot delete that client" — rather than the
 * uniform singular, which produced "Cannot list that user" for `users list`
 * against a live stack.
 */
function actionPhrase(noun: string, verb: string): string {
  const readable = noun.replace(/-/g, ' ')
  if (verb === 'list') return `list ${readable}`
  if (verb === 'create') return `create that ${singular(readable)}`
  return `${verb.replace(/-/g, ' ')} that ${singular(readable)}`
}

function singular(noun: string): string {
  if (noun.endsWith('ies')) return `${noun.slice(0, -3)}y`
  if (noun.endsWith('s')) return noun.slice(0, -1)
  return noun
}

export type { Config }
export type { Authenticated }
