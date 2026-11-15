/**
 * The error shapes the two local tools throw and pass through.
 *
 * Declared here rather than imported from `@kleora-io/node`: neither tool
 * depends on any published SDK. The tools have no database connection and no
 * service credential of their own, and the same isolation argument applies to
 * code: a process that administers a person's whole
 * Account should not inherit behaviour from a package meant for verifying
 * end-user tokens in someone else's backend).
 *
 * One copy, not two, and that is a correctness requirement rather than
 * tidiness: the MCP server and the CLI both render these, and a second
 * `ApiError` in the dependency graph would make `instanceof` lie in whichever
 * of them imported the other's.
 */

/** Base class for everything these packages throw. */
export class KleoraToolError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'KleoraToolError'
    this.code = code
  }
}

/**
 * What `ApiError` carries beyond `type`/`status`/`detail` — the same shape
 * `@kleora-io/node` calls `ProblemDetails`.
 */
export interface ProblemDetails {
  /** The RFC 9457 document exactly as it arrived, extension members included. */
  document: Record<string, unknown>
  /** `Retry-After` in seconds, falling back to the document's `retry_after`. */
  retryAfter: number | null
  requestId: string | undefined
}

/**
 * An RFC 9457 problem document from the management API, passed through with
 * its `type`, `title`, `detail` and `status`.
 */
export class ApiError extends KleoraToolError {
  readonly type: string
  readonly title: string | undefined
  readonly status: number
  readonly detail: string | undefined
  readonly problem: ProblemDetails

  constructor(
    type: string,
    status: number,
    title: string | undefined,
    detail: string | undefined,
    problem: ProblemDetails,
  ) {
    super('api_error', detail ?? title ?? type)
    this.name = 'ApiError'
    this.type = type
    this.status = status
    this.title = title
    this.detail = detail
    this.problem = problem
  }

  /** The RFC 9457 document, verbatim plus its four standard fields. */
  toProblemDocument(): Record<string, unknown> {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      ...this.problem.document,
    }
  }
}

/**
 * The management API could not be reached at all — refused, timed out, DNS
 * failure. Deliberately distinguishable from a permission failure: an agent
 * or a script must not read an outage as "you cannot do that".
 */
export class ManagementApiUnreachable extends KleoraToolError {
  constructor(message: string, options?: ErrorOptions) {
    super('management_api_unreachable', message, options)
    this.name = 'ManagementApiUnreachable'
  }
}

/**
 * The person denied the device approval (RFC 8628 `access_denied`). Surfaced
 * plainly; nothing is stored.
 */
export class AuthorizationDenied extends KleoraToolError {
  constructor() {
    super('access_denied', 'The device authorization was denied.')
    this.name = 'AuthorizationDenied'
  }
}
