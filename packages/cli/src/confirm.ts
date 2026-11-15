/**
 * Guard rails on destructive commands.
 *
 * A terminal is not a licence to make deleting an environment easy. The CLI
 * uses the console's own confirmations, target for target, because a person
 * who learned one should not meet a weaker rule in the other.
 *
 * Three mechanisms, and the differences between them are the point:
 *
 * 1. **An ordinary prompt** — anything the console treats as a
 *    security-relevant action. Names the target, and `--yes` satisfies it.
 * 2. **A typed confirmation** — the four the console requires typing for, with
 *    the same string. `--confirm <string>` non-interactively, matched exactly,
 *    and **`--yes` never satisfies one**: "a blanket flag that could stand in
 *    for the string would make the whole mechanism a spelling of `--force`".
 * 3. **Two named acknowledgements** — signing-key rotation only, where the
 *    console asks for two checkboxes each stating a distinct consequence.
 *    It used to ask for the `kid`, and a `kid` is a
 *    long random string with no meaning to the person reading it, so retyping
 *    it was transcription rather than deliberation and taught operators to
 *    paste.
 *
 * And the rule that governs all three when nobody is watching:
 *
 * **No prompt when stdin is not a TTY.** The command fails with exit `2`
 * naming the flag it needed. A tool that blocks forever on a prompt nobody can
 * see is the reason CI jobs time out at their limit instead of failing in a
 * second, and a tool that *assumes* yes is worse.
 */
import type { Flags } from './argv.js'
import { usageFailure } from './exit.js'
import type { Io } from './output.js'

export interface Acknowledgement {
  /** The flag that stands in for the checkbox, e.g. `ack-jwks-window`. */
  readonly flag: string
  /** The consequence the person must acknowledge, stated in full. */
  readonly consequence: string
}

export type ConfirmSpec =
  | { readonly kind: 'prompt' }
  | {
      readonly kind: 'typed'
      /** What the person must type back, in prose: "the user's name". */
      readonly describe: string
    }
  | { readonly kind: 'acknowledge'; readonly acknowledgements: readonly Acknowledgement[] }

export interface ConfirmRequest {
  /** What is about to happen, as a sentence: "Erase user 9f1c… (ada@example.com)." */
  readonly what: string
  /** The resolved target line, already formatted. */
  readonly target: string
  readonly spec: ConfirmSpec
  /**
   * The exact string a typed confirmation wants. Resolved by the command from
   * the row it is about to change — the user's name, the production issuer
   * host, the template's `{kind}/{locale}` — so a `--confirm` that matches is
   * evidence the person looked at the right row.
   */
  readonly expected?: string
}

/**
 * Asks, or refuses to ask. Returns normally when the action may proceed.
 *
 * Everything it writes goes to stderr, including the prompt, because a
 * confirmation is not data.
 */
export async function confirm(request: ConfirmRequest, flags: Flags, io: Io): Promise<void> {
  const yes = flags.boolean('yes') === true

  if (request.spec.kind === 'typed') {
    const expected = request.expected
    if (expected === undefined || expected === '') {
      // A typed confirmation with nothing to type would be a prompt wearing a
      // disguise; refusing is the only honest outcome.
      throw usageFailure(
        `Cannot confirm this: the string to type back could not be resolved.`,
        '  Re-run with --debug; this is a bug in the CLI, not in your command.',
      )
    }
    const provided = flags.value('confirm')
    if (provided !== undefined) {
      if (provided !== expected) {
        throw usageFailure(
          `--confirm does not match.`,
          `  It must be exactly ${request.spec.describe}: ${expected}`,
        )
      }
      return
    }
    if (!io.stdinIsTty) {
      throw usageFailure(
        `This command needs --confirm and stdin is not a terminal.`,
        '',
        `  ${request.what}`,
        `  ${request.target}`,
        '',
        `  Pass --confirm '${expected}' (${request.spec.describe}).`,
        '  --yes does not satisfy a typed confirmation, deliberately.',
      )
    }
    io.err(`${request.what}\n${request.target}\n\n`)
    io.err(`This cannot be undone. Type ${request.spec.describe} to continue.\n`)
    const answer = await io.readLine(`  ${expected} > `)
    if (answer === null || answer.trim() !== expected) {
      throw usageFailure('Not confirmed — nothing was changed.')
    }
    return
  }

  if (request.spec.kind === 'acknowledge') {
    const missing = request.spec.acknowledgements.filter((ack) => flags.boolean(ack.flag) !== true)
    if (missing.length === 0) return
    if (!io.stdinIsTty) {
      throw usageFailure(
        `This command needs every acknowledgement flag and stdin is not a terminal.`,
        '',
        `  ${request.what}`,
        `  ${request.target}`,
        '',
        ...missing.flatMap((ack) => [`  --${ack.flag}`, `      ${ack.consequence}`]),
        '',
        '  Each flag states a distinct consequence, so a script has to state both',
        '  rather than one generic yes. --yes does not satisfy either.',
      )
    }
    io.err(`${request.what}\n${request.target}\n\n`)
    for (const ack of missing) {
      io.err(`${ack.consequence}\n`)
      const answer = await io.readLine('  Understood? [y/N] > ')
      if (answer === null || !isYes(answer)) {
        throw usageFailure('Not confirmed — nothing was changed.')
      }
    }
    return
  }

  if (yes) return
  if (!io.stdinIsTty) {
    throw usageFailure(
      `This command needs confirmation and stdin is not a terminal.`,
      '',
      `  ${request.what}`,
      `  ${request.target}`,
      '',
      '  Pass --yes to confirm it non-interactively.',
    )
  }
  io.err(`${request.what}\n${request.target}\n\n`)
  const answer = await io.readLine('  Continue? [y/N] > ')
  if (answer === null || !isYes(answer)) {
    throw usageFailure('Not confirmed — nothing was changed.')
  }
}

function isYes(answer: string): boolean {
  const normalised = answer.trim().toLowerCase()
  return normalised === 'y' || normalised === 'yes'
}
