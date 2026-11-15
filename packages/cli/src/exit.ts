/**
 * Exit codes. They are part of the CLI's contract with scripts.
 *
 * The split a script needs is between **retry later** (7, 9), **fix the
 * request** (2, 6), **fix the authority** (3, 4) and **pay** (8) — so these are
 * a contract — part of what a script may rely on — and
 * changing one is a breaking change even though no message text is.
 *
 * Two of them are worth reading twice. `4` and `5` are separate although both
 * mean "no": a `404` on this API also means "outside your scope", so a pipeline
 * that treated it as a missing row would retry against an environment it will
 * never be allowed to read. And `8` exists because the alternative is a script
 * treating a plan gate as a transient failure and retrying it until somebody
 * notices the bill.
 */
export const EXIT = {
  /** Success. */
  OK: 0,
  /** An unexpected failure — a bug, or something with no better code. */
  UNEXPECTED: 1,
  /** Usage: unknown command, missing or malformed flag. Nothing was sent. */
  USAGE: 2,
  /** Not authenticated, or the credential is gone (`401`). Run `login`. */
  UNAUTHENTICATED: 3,
  /** Refused for authority (`403`, any slug). */
  FORBIDDEN: 4,
  /** Not found, or outside this principal's scope (`404`). */
  NOT_FOUND: 5,
  /** Refused for a reason the caller can fix (`400`, `409`, `415`, `422`). */
  REFUSED: 6,
  /** Rate limited (`429`). Retryable, after `Retry-After`. */
  RATE_LIMITED: 7,
  /** Payment required (`402`) — an unpaid invoice or a plan gate. */
  PAYMENT_REQUIRED: 8,
  /** The API is unreachable, or answered `5xx`. Retryable. */
  UNREACHABLE: 9,
  /** Interrupted (SIGINT), the shell convention. */
  INTERRUPTED: 130,
} as const

export type ExitCode = (typeof EXIT)[keyof typeof EXIT]

/**
 * An HTTP status to its exit code.
 *
 * `5xx` joins the unreachable class deliberately: "A DNS failure, a refused
 * connection, a timeout and a `5xx` are one class — 'we could not ask' — and
 * exit `9`; every `4xx` is 'we asked and were told no'."
 */
export function exitCodeForStatus(status: number): ExitCode {
  if (status >= 500) return EXIT.UNREACHABLE
  switch (status) {
    case 401:
      return EXIT.UNAUTHENTICATED
    case 402:
      return EXIT.PAYMENT_REQUIRED
    case 403:
      return EXIT.FORBIDDEN
    case 404:
      return EXIT.NOT_FOUND
    case 429:
      return EXIT.RATE_LIMITED
    case 400:
    case 409:
    case 415:
    case 422:
      return EXIT.REFUSED
    default:
      // Any other `4xx` is still "we asked and were told no", and the closest
      // honest code is "refused for a reason the caller can fix".
      return status >= 400 ? EXIT.REFUSED : EXIT.UNEXPECTED
  }
}

/**
 * A failure that has already been rendered and only needs an exit code.
 *
 * Thrown rather than returned so that a command's happy path reads as one
 * sequence; `cli.ts` is the only thing that catches it.
 */
export class CliFailure extends Error {
  readonly exitCode: ExitCode
  /** Lines already formatted for stderr. Never contains a credential. */
  readonly lines: readonly string[]

  constructor(exitCode: ExitCode, lines: readonly string[]) {
    super(lines.join('\n'))
    this.name = 'CliFailure'
    this.exitCode = exitCode
    this.lines = lines
  }
}

/** A usage failure: nothing was sent, and the message names what was missing. */
export function usageFailure(...lines: readonly string[]): CliFailure {
  return new CliFailure(EXIT.USAGE, lines)
}
