/**
 * `kleora <noun> <verb> [target] [flags]`, parsed with no dependency.
 *
 * Long flags only. There are no short aliases and no `-abc` bundling, which is
 * the same decision as "nothing is aliased" one level up, for nouns and verbs:
 * aliases look like generosity and cost predictability — once two spellings
 * work, a person cannot infer the third from either. A person who
 * has to look up whether `-e` is `--env` or `--environment` has been given a
 * puzzle, not a shortcut.
 *
 * What this module does **not** do is decide what any flag means. It produces
 * raw strings; `config.ts`, `targets.ts` and `commands/run.ts` interpret them.
 * That split is what lets a test assert the parse without a network, a
 * keychain or a TTY.
 */
import { usageFailure } from './exit.js'

export interface ParsedArgv {
  /** Everything before the first `--flag`, in order. */
  readonly positionals: readonly string[]
  /**
   * Every `--flag` seen, in order of appearance, with its raw value.
   *
   * A list rather than a map because repeatable flags are a real part of the
   * surface (`--redirect-uris a --redirect-uris b`) and collapsing them here
   * would lose the second value before anything could ask for it.
   */
  readonly flags: ReadonlyArray<{ readonly name: string; readonly value: string | null }>
}

/**
 * Splits `argv` into positionals and flags.
 *
 * `--flag value` and `--flag=value` are both accepted, because both are what
 * people type. A bare `--flag` carries `null`, which the interpreting layer
 * reads as `true` for a boolean and as a missing value for anything else —
 * the distinction matters, since "you forgot the value" and "you meant true"
 * must not be the same message.
 *
 * `--` ends flag parsing: everything after it is a positional, verbatim. A
 * value that begins with `-` therefore has a way through, which matters for a
 * `--confirm` string or a `q` search term somebody's data actually contains.
 */
export function parseArgv(argv: readonly string[]): ParsedArgv {
  const positionals: string[] = []
  const flags: Array<{ name: string; value: string | null }> = []
  let literal = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue

    if (literal) {
      positionals.push(arg)
      continue
    }
    if (arg === '--') {
      literal = true
      continue
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }

    const body = arg.slice(2)
    if (body === '') throw usageFailure('`--` on its own ends flag parsing; `----` means nothing.')
    const eq = body.indexOf('=')
    if (eq !== -1) {
      flags.push({ name: body.slice(0, eq), value: body.slice(eq + 1) })
      continue
    }
    const next = argv[i + 1]
    // A value is the next token only when it is not itself a flag. `--json
    // --profile work` must not read `--profile` as `--json`'s value, and
    // `--limit -5` must not silently become a positional.
    if (next !== undefined && (!next.startsWith('--') || next === '--')) {
      if (next === '--') {
        flags.push({ name: body, value: null })
        continue
      }
      flags.push({ name: body, value: next })
      i++
      continue
    }
    flags.push({ name: body, value: null })
  }

  return { positionals, flags }
}

/**
 * A read-only view over the parsed flags, with the usage errors attached.
 *
 * It does not know which flags are legitimate — `commands/surface.ts` computes
 * that from the registry and the generated operations, and `cli.ts` refuses an
 * unknown one **before** any request is made. A check based on "which flags did
 * the command happen to read" would have to run after the command, which is too
 * late for a typo on a `delete`.
 */
export class Flags {
  readonly #entries: ReadonlyArray<{ name: string; value: string | null }>

  constructor(parsed: ParsedArgv) {
    this.#entries = parsed.flags
  }

  /** Every name that was passed, deduplicated, in first-seen order. */
  names(): readonly string[] {
    const seen: string[] = []
    for (const entry of this.#entries) if (!seen.includes(entry.name)) seen.push(entry.name)
    return seen
  }

  has(name: string): boolean {
    return this.#entries.some((entry) => entry.name === name)
  }

  /**
   * The single value of `name`, or `undefined`.
   *
   * A flag passed twice is a usage error rather than a last-one-wins:
   * `--env sandbox --env production` is somebody's shell history colliding with
   * their intention, and guessing which half they meant is exactly the mistake
   * that environments being named on every command, never remembered, exists
   * to prevent.
   */
  value(name: string): string | undefined {
    const matches = this.#all(name)
    if (matches.length === 0) return undefined
    if (matches.length > 1) {
      throw usageFailure(
        `--${name} was given ${String(matches.length)} times and it takes one value.`,
        `  Values seen: ${matches.join(', ')}. Pass it once.`,
      )
    }
    const only = matches[0]
    if (only === null || only === undefined) {
      throw usageFailure(`--${name} needs a value.`)
    }
    return only
  }

  /** Every value of a repeatable flag, in order. `null` (a bare flag) is dropped. */
  values(name: string): readonly string[] {
    return this.#all(name).filter((value): value is string => value !== null)
  }

  /**
   * A boolean flag: `--x` is true, `--no-x` is false, absent is `undefined`.
   *
   * `--x=false` is honoured too, because a script building a command line from
   * a variable writes that rather than branching on whether to emit the flag.
   */
  boolean(name: string): boolean | undefined {
    const positive = this.#all(name)
    const negative = this.#all(`no-${name}`)
    if (positive.length > 0 && negative.length > 0) {
      throw usageFailure(`--${name} and --no-${name} were both given.`)
    }
    if (negative.length > 0) return false
    if (positive.length === 0) return undefined
    const raw = positive[positive.length - 1]
    if (raw === null || raw === undefined) return true
    if (raw === 'true') return true
    if (raw === 'false') return false
    throw usageFailure(`--${name} takes no value, or \`true\` or \`false\` — not '${raw}'.`)
  }

  #all(name: string): ReadonlyArray<string | null> {
    return this.#entries.filter((entry) => entry.name === name).map((entry) => entry.value)
  }
}
