/**
 * Turning an RFC 9457 problem document into something a person can act on.
 *
 * An RFC 9457 problem document is the right wire format and the wrong thing
 * to show a person. The CLI renders every problem as three things: what was
 * refused, why, and what to do next — then the `request_id`, always, because
 * that is the one value support can correlate.
 *
 * The mapping is exhaustive over the management API's registry of problem
 * slugs. That registry exists so that a client can name every error it will
 * one day receive, and a CLI that fell back to printing `detail` for a slug it
 * had not been taught would be the reason somebody reads a problem document by
 * hand.
 *
 * So `SLUGS` below mirrors that registry, including slugs whose endpoints this
 * CLI has no command for yet: the registry is deliberately written ahead of
 * the endpoints, and a client that can only name the errors it has already met
 * is a client that will one day print a JSON blob at somebody.
 *
 * The mirror is checked-in data, and `test/problems.test.ts` asserts every
 * entry renders something specific.
 */
import { ApiError, ManagementApiUnreachable, type ProblemDetails } from '@kleora-io/core'

import { CliFailure, EXIT, exitCodeForStatus, type ExitCode } from './exit.js'

/** What the CLI knows about the command that was refused. */
export interface ProblemContext {
  /**
   * What was attempted, as a verb phrase completing "Cannot …":
   * `delete this client`, `list users`.
   */
  readonly action: string
  /** The resolved target, echoed back on a `404` so a wrong-environment id is obvious. */
  readonly target?: string
  /**
   * Whether the credential in use came from `KLEORA_API_KEY`.
   *
   * It changes two messages materially — `insufficient-scope` and
   * `rate-limited` — and getting either wrong sends somebody to buy something
   * that will not help.
   */
  readonly underApiKey: boolean
}

interface Rendered {
  /** One sentence: what was refused. */
  readonly what: string
  /** Why, in the API's own terms. */
  readonly why: readonly string[]
  /** What to do next. Empty only where there is genuinely nothing to do. */
  readonly next: readonly string[]
}

type Renderer = (problem: Problem, context: ProblemContext) => Rendered

/** The problem document, with the members this CLI actually reads named. */
export interface Problem {
  readonly slug: string
  readonly status: number
  readonly detail: string | undefined
  readonly document: Record<string, unknown>
  readonly requestId: string | undefined
  readonly retryAfter: number | null
}

const PROBLEM_TYPE_BASE = 'https://kleora.io/problems/'

/** `https://kleora.io/problems/client-default` → `client-default`. */
export function slugOf(type: string): string {
  return type.startsWith(PROBLEM_TYPE_BASE) ? type.slice(PROBLEM_TYPE_BASE.length) : type
}

export function problemOf(error: ApiError): Problem {
  const details: ProblemDetails = error.problem
  return {
    slug: slugOf(error.type),
    status: error.status,
    detail: error.detail,
    document: details.document,
    requestId: details.requestId,
    retryAfter: details.retryAfter,
  }
}

function member(problem: Problem, name: string): string | undefined {
  const value = problem.document[name]
  return typeof value === 'string' ? value : undefined
}

function stringList(problem: Problem, name: string): readonly string[] {
  const value = problem.document[name]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

interface ErrorEntry {
  field: string | null
  message: string
  code?: string
  line?: number
  offset?: number
  construct?: string
}

function entries(problem: Problem): readonly ErrorEntry[] {
  const value = problem.document['errors']
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is ErrorEntry => typeof item === 'object' && item !== null && 'message' in item,
  )
}

/**
 * `validation-error`'s per-entry lines:
 * "One line per `errors[]` entry, `field` first, with `line`/`offset` where the
 * entry carries one (email templates, custom CSS). A `null` `field` prints as a
 * whole-body rule, not as the word 'null'."
 */
function entryLines(problem: Problem): readonly string[] {
  return entries(problem).map((entry) => {
    const where =
      entry.field === null || entry.field === undefined
        ? 'the request as a whole'
        : `\`${entry.field}\``
    const position =
      entry.line !== undefined
        ? ` (line ${String(entry.line)}${entry.construct === undefined ? '' : `, ${entry.construct}`})`
        : entry.offset !== undefined
          ? ` (offset ${String(entry.offset)})`
          : ''
    return `${where}${position}: ${entry.message}`
  })
}

const detailOr = (problem: Problem, fallback: string): string => problem.detail ?? fallback

/**
 * Every slug in the management API's problem registry, plus
 * `service-unavailable` (which the API's rate limiter emits and the registry
 * does not list).
 *
 * Ordered as the registry orders it: by status, then alphabetically, so the two
 * can be read side by side.
 */
const SLUGS: Readonly<Record<string, Renderer>> = {
  // ---- 400 ----------------------------------------------------------------
  'invalid-cursor': (problem, context) => ({
    what: `Cannot ${context.action}: that cursor is no longer usable.`,
    why: [
      'A cursor is server-issued and belongs to the query that issued it — the',
      'same path, the same filters, the same ordering. Changing a filter',
      'part-way through a walk invalidates it, and so does a cursor that has',
      'aged past the page it named.',
    ],
    next: ['Restart the listing from the beginning, without --cursor.'],
  }),

  // ---- 401 ----------------------------------------------------------------
  unauthenticated: (problem, context) => ({
    what: `Cannot ${context.action}: not signed in.`,
    why: context.underApiKey
      ? ['The API key in KLEORA_API_KEY was refused: it may be revoked, expired, or for another deployment.']
      : ['There is no usable credential for this profile, or the one there has expired.'],
    next: context.underApiKey
      ? ['Check KLEORA_API_KEY, or create a fresh key: `kleora api-keys create`.']
      : ['Run `kleora login`.'],
  }),

  // ---- 402 ----------------------------------------------------------------
  // Two refusals share this slug and say opposite things: the plan gate (a
  // feature the plan does not include) and the payment block (an unpaid
  // invoice). Sending somebody to settle a bill that will not lift their
  // refusal is the precise mistake the problem's extra members exist to
  // prevent.
  'payment-required': (problem, context) => {
    const feature = member(problem, 'feature')
    if (feature === undefined) {
      return {
        what: `Cannot ${context.action}: an unpaid invoice is blocking writes.`,
        why: [
          'Reads, exports and the routes that let you pay or keep your own',
          'access still work — only writes are refused.',
        ],
        next: ['Settle the invoice in the billing portal: `kleora billing portal`.'],
      }
    }
    const plan = member(problem, 'plan')
    const required = stringList(problem, 'required_plans')
    return {
      what: `Cannot ${context.action}: \`${feature}\` is not included in your plan.`,
      why: [
        plan === undefined
          ? `This Account's plan does not include \`${feature}\`.`
          : `This Account is on \`${plan}\`, which does not include \`${feature}\`.`,
        ...(required.length === 0
          ? []
          : [`It is available on ${required.map((name) => `\`${name}\``).join(', ')}.`]),
      ],
      // Deliberately silent about invoices: paying the current one changes
      // nothing here, and saying so would waste somebody's afternoon.
      next: ['Change the plan to one that includes it.'],
    }
  },

  // ---- 403 ----------------------------------------------------------------
  'account-suspended': (problem, context) => ({
    what: `Cannot ${context.action}: this Account is suspended.`,
    why: [
      'This is an Account state, not a missing permission — no role or',
      'permission grant lifts it, and every environment under the Account is',
      'refused the same way.',
    ],
    next: ['Contact Kleora support; an audit event records when the suspension began.'],
  }),

  'email-unverified': (problem, context) => ({
    what: `Cannot ${context.action}: your email address is not verified.`,
    why: ['Creating an Account requires a verified address on the signing-in principal.'],
    next: ['Verify the address from the email you were sent, then run this again.'],
  }),

  'insufficient-permission': (problem, context) => ({
    what: `Cannot ${context.action}: a permission is missing.`,
    why: [
      detailOr(problem, 'The route requires a permission this principal does not hold.'),
      'The scope is right — this is the Account and environment you think it is —',
      'and only the permission is absent.',
    ],
    next: [
      'Run `kleora whoami` to see the permissions you do hold, then ask an',
      'admin for the one named above by name.',
    ],
  }),

  'insufficient-scope': (problem, context) => ({
    what: `Cannot ${context.action}: this credential cannot reach that route.`,
    why: context.underApiKey
      ? [
          'An API key reaches only the routes open to its kind, inside the one',
          'Environment it is scoped to — never an account-level route, and never',
          'one the API restricts to a signed-in person (managing clients, for',
          'instance). This is not something a permission grant fixes.',
        ]
      : [
          "The route is outside this principal's kind or scope level — a",
          'tenant-scoped token cannot reach an account-level route.',
        ],
    next: context.underApiKey
      ? ['Run the command as a person: unset KLEORA_API_KEY and `kleora login`.']
      : ['Sign in as a principal whose scope covers the route: `kleora login`.'],
  }),

  'owner-required': (problem, context) => ({
    what: `Cannot ${context.action}: only an owner may assign or remove \`owner\`.`,
    why: ['The caller does not hold `owner` in the tenant this change is about.'],
    next: ['Ask an owner of that tenant to make the change.'],
  }),

  'privilege-escalation': (problem, context) => ({
    what: `Cannot ${context.action}: a role may not carry more than you hold.`,
    why: [
      'A tenant member cannot create, update or delete a role carrying',
      'permissions they do not themselves hold — otherwise a role edit would',
      'be a way to grant yourself anything.',
    ],
    next: [
      'Remove the permissions you do not hold from the role, or ask somebody',
      'who holds them to make the change.',
    ],
  }),

  // ---- 404 ----------------------------------------------------------------
  // Adds that it may mean "outside your scope", and names the resolved target —
  // the `404` a person gets when they typed the right id against the wrong
  // environment is otherwise baffling.
  'not-found': (problem, context) => ({
    what: `Cannot ${context.action}: nothing there.`,
    why: [
      'On this API a 404 also means "outside your scope", so this is either a',
      'row that does not exist or one you are not allowed to see.',
      ...(context.target === undefined ? [] : [`Resolved target: ${context.target}.`]),
    ],
    next: [
      'Check the id, and check that the target above is the one you meant — a',
      'right id against the wrong environment answers exactly this.',
    ],
  }),

  'user-not-found': (problem, context) => ({
    what: `Cannot ${context.action}: no such user in this environment.`,
    why: [
      'The address or id names nobody in this environment, or names a user who',
      'has been erased. This endpoint does not send an invitation.',
    ],
    next: ['Create the user first, or invite them: `kleora invitations create`.'],
  }),

  // ---- 409 ----------------------------------------------------------------
  'account-tenant': (problem, context) => ({
    what: `Cannot ${context.action}: an Account is linked to that tenant.`,
    why: [
      "This is an Account's own tenant in the `id` App. It is a rule, not a",
      'transient conflict — retrying will not change it.',
    ],
    next: ['Nothing to retry. Delete the Account if that is really what you meant.'],
  }),

  'already-member': (problem, context) => ({
    what: `Cannot ${context.action}: they are already a member.`,
    why: ['The user is already a member of this tenant, or an open invitation names them.'],
    next: ['Change their roles instead: `kleora members update <member-id> --roles …`.'],
  }),

  'client-default': (problem, context) => ({
    what: `Cannot ${context.action}.`,
    why: [
      "It is the environment's default client, and an environment must always",
      'have one.',
    ],
    next: ['Make another client the default first, then run this again.'],
  }),

  'client-not-confidential': (problem, context) => ({
    what: `Cannot ${context.action}: that client has no secret.`,
    why: [
      'Only a `web` client is confidential. A `spa` or `native` client is',
      'public and holds no secret to rotate.',
    ],
    next: ['Nothing to rotate. A public client is secured by PKCE, not by a secret.'],
  }),

  conflict: (problem, context) => ({
    what: `Cannot ${context.action}: it conflicts with the current state.`,
    why: [detailOr(problem, 'Another row already holds a unique value, or the row moved under this write.')],
    next: ['Re-read the resource and try again with what is there now.'],
  }),

  'default-tenant': (problem, context) => ({
    what: `Cannot ${context.action}: that is the environment's default tenant.`,
    why: ['Every environment keeps a default tenant; it is a rule, not a conflict.'],
    next: ['Nothing to retry.'],
  }),

  'idempotency-in-progress': (problem, context) => ({
    what: `Cannot ${context.action} yet: an identical request is still running.`,
    why: ['The same Idempotency-Key is in flight, so this one is held rather than duplicated.'],
    next: ['Wait a second and run exactly the same command again.'],
  }),

  'invitation-exists': (problem, context) => ({
    what: `Cannot ${context.action}: an invitation is already open for that address.`,
    why: ['One open invitation per address per tenant.'],
    next: ['Resend it instead: `kleora invitations resend <invitation-id>`.'],
  }),

  'last-owner': (problem, context) => ({
    what: `Cannot ${context.action}: that is the tenant's last owner.`,
    why: ['A tenant must keep at least one owner. This is a rule, not a conflict.'],
    next: ['Give somebody else `owner` first, then run this again.'],
  }),

  'not-sandbox': (problem, context) => ({
    what: `Cannot ${context.action}: promotion runs from sandbox.`,
    why: ['The environment named is production; promotion is source-addressed and its source is sandbox.'],
    next: ['Target the sandbox environment: `--app <slug> --sandbox`.'],
  }),

  'permission-exists': (problem, context) => ({
    what: `Cannot ${context.action}: that permission name is taken.`,
    why: [
      ...entryLines(problem),
      'A Permission name is unique within an environment.',
    ],
    next: ['Choose another name, or update the existing permission instead.'],
  }),

  'platform-protected': (problem, context) => ({
    what: `Cannot ${context.action}: the \`id\` App is structurally protected.`,
    why: [
      'The `id` App and its environments are what the platform itself runs on,',
      'so deleting, promoting or changing their tenancy is refused by rule.',
    ],
    next: ['Nothing to retry. Do this on one of your own Apps.'],
  }),

  'role-slug-conflict': (problem, context) => ({
    what: `Cannot ${context.action}: that role slug is taken.`,
    why: ['A slug already exists in this scope, or is blocked by one in the other scope.'],
    next: ['Choose another slug.'],
  }),

  'single-mode-membership': (problem, context) => ({
    what: `Cannot ${context.action}: the environment is in \`single\` tenant mode.`,
    why: [
      'In `single` mode every user belongs to the default tenant, so removing',
      'that membership would leave them unable to sign in.',
    ],
    next: ['Block or erase the user instead, or switch the environment to `multi` first.'],
  }),

  'slug-taken': (problem, context) => ({
    what: `Cannot ${context.action}: that slug is already in use.`,
    why: [
      'Account and App slugs are global namespaces, because an App slug is its',
      "issuer's hostname.",
    ],
    next: ['Choose another slug.'],
  }),

  'system-permission': (problem, context) => ({
    what: `Cannot ${context.action}: that is a reserved management permission.`,
    why: ['A system permission may be re-described but never deleted.'],
    next: ['Nothing to retry. Update its description instead if that is what you wanted.'],
  }),

  'system-role': (problem, context) => ({
    what: `Cannot ${context.action}: that is a platform-created role.`,
    why: ['A system role cannot be renamed or deleted; its permissions can be read.'],
    next: ['Create your own role instead: `kleora roles create`.'],
  }),

  'tenant-mode-backfill-pending': (problem, context) => ({
    what: `Cannot ${context.action} yet: an earlier tenant-mode switch is still running.`,
    why: ["The previous switch's membership backfill has not finished."],
    next: ['Wait for the backfill to finish, then run exactly the same command again.'],
  }),

  'tenant-mode-single': (problem, context) => ({
    what: `Cannot ${context.action}: the environment is in \`single\` tenant mode.`,
    why: ['A `single`-mode environment has exactly one tenant, the default one.'],
    next: ['Switch the environment to `multi` first, if multiple tenants are what you want.'],
  }),

  'tenant-mode-switch-blocked': (problem, context) => ({
    what: `Cannot ${context.action}: other tenants still exist.`,
    why: [
      ...entryLines(problem),
      'Switching `multi` to `single` requires that only the default tenant remains.',
    ],
    next: ['Delete or migrate the tenants named above, then run this again.'],
  }),

  'user-erased': (problem, context) => ({
    what: `Cannot ${context.action}: that user has been erased.`,
    why: ['An erased user accepts no mutation; the row is a tombstone by design.'],
    next: ['Nothing to retry. Create a new user if somebody needs access.'],
  }),

  // ---- 415 ----------------------------------------------------------------
  'unsupported-media-type': (problem, context) => ({
    what: `Cannot ${context.action}: the request's content type was refused.`,
    why: [
      'This API takes `application/json` (and `application/merge-patch+json`',
      'on a PATCH). The CLI always sends the former, so this is a bug in the',
      'CLI or something rewriting the request in between.',
    ],
    next: ['Re-run with --debug and include the output in a bug report.'],
  }),

  // ---- 422 ----------------------------------------------------------------
  'field-not-nullable': (problem, context) => ({
    what: `Cannot ${context.action}: a field cannot be cleared.`,
    why: [...entryLines(problem), 'A merge patch sent `null` for a field that has no empty state.'],
    next: ['Send a value instead of clearing it.'],
  }),

  'idempotency-key-reused': (problem, context) => ({
    what: `Cannot ${context.action}: that Idempotency-Key was used for a different request.`,
    why: [
      'A key is bound to the body it was first seen with, so reusing one with',
      'different values is refused rather than silently replaying the old call.',
    ],
    next: ['A fresh attempt needs a fresh key — run the command again.'],
  }),

  'invalid-scope': (problem, context) => ({
    what: `Cannot ${context.action}: a scope is not allowed.`,
    why: [...entryLines(problem), 'Each entry is outside the allowed set, duplicated, or empty.'],
    next: ['Run `kleora permissions list` for the names this environment offers.'],
  }),

  'limit-exceeded': (problem, context) => ({
    what: `Cannot ${context.action}: a ceiling was reached.`,
    why: [detailOr(problem, 'A plan or per-environment ceiling refused this row.')],
    next: ['Delete something you no longer need, or move to a plan with a higher ceiling.'],
  }),

  'password-breached': (problem, context) => ({
    what: `Cannot ${context.action}: that password appears in a breach corpus.`,
    why: ['The breach check matched, so the value is refused whatever its length.'],
    next: ['Choose a different password. The CLI never accepts one as a flag; this came from elsewhere.'],
  }),

  'password-policy': (problem, context) => ({
    what: `Cannot ${context.action}: the password fails this environment's policy.`,
    why: [detailOr(problem, "Its length is outside the environment's configured range.")],
    next: ['Read the policy with `kleora environments get`, then choose a conforming value.'],
  }),

  'reserved-permission': (problem, context) => ({
    what: `Cannot ${context.action}: that name is in the reserved management namespace.`,
    why: ['Customer permissions may not use the resource names the management API reserves.'],
    next: ['Choose a resource name of your own — `invoices:read` rather than `users:read`.'],
  }),

  'role-not-assignable': (problem, context) => ({
    what: `Cannot ${context.action}: that role belongs to another tenant.`,
    why: ['A tenant-scoped role is assignable only inside its own tenant.'],
    next: ['Use an environment-scoped role, or one scoped to this tenant: `kleora roles list`.'],
  }),

  'slug-reserved': (problem, context) => ({
    what: `Cannot ${context.action}: that slug is reserved.`,
    why: [...entryLines(problem), 'It is on the reserved list — a rule, not a collision with an existing row.'],
    next: ['Choose another slug.'],
  }),

  'validation-error': (problem, context) => ({
    what: `Cannot ${context.action}: the request failed validation.`,
    why: entryLines(problem).length > 0 ? entryLines(problem) : [detailOr(problem, 'The body or query is not valid.')],
    next: ['Fix the values named above and run it again.'],
  }),

  // ---- 429 ----------------------------------------------------------------
  // The message must not blame the plan for a `console_user`. The plan's tier
  // meters `api_key` and `tenant_member` principals and *not* `console_user`,
  // whose limit is a flat 600 a minute. "Telling them to upgrade would be wrong
  // and expensive."
  'rate-limited': (problem, context) => ({
    what: `Cannot ${context.action}: rate limited.`,
    why: context.underApiKey
      ? [
          "This API key's Account is metered by its plan tier as well as by the",
          'abuse limit, and the RateLimit-* headers on the response say which',
          'window bound.',
        ]
      : [
          'A signed-in person has a flat per-principal limit that no plan',
          'changes. This is an abuse control, not a ceiling you can buy your',
          'way past.',
        ],
    next: [
      problem.retryAfter === null
        ? 'Wait a moment and try again.'
        : `Wait ${String(problem.retryAfter)} seconds and try again.`,
    ],
  }),

  // ---- 503 ---------------------------------------------------------------
  // Emitted by the API's rate limiter. Not in the problem registry.
  'service-unavailable': (problem, context) => ({
    what: `Cannot ${context.action}: the service is temporarily unavailable.`,
    why: ['We could not ask — this is not a refusal of what you asked for.'],
    next: ['Retry shortly. Nothing was changed.'],
  }),
}

/** Every slug this CLI can name. Exported so a test can enumerate it. */
export const KNOWN_SLUGS: readonly string[] = Object.keys(SLUGS)

/**
 * The lines for a problem, and the exit code that goes with it.
 *
 * A slug with no entry still gets the three-part shape rather than a dumped
 * document — this is the "fallback" `test/problems.test.ts` proves is never
 * reached for a registry slug, and it exists only because a
 * deployment newer than this CLI may one day answer with a slug the registry
 * gained after this build.
 */
export function renderProblem(problem: Problem, context: ProblemContext): CliFailure {
  const renderer = SLUGS[problem.slug]
  const rendered: Rendered = renderer
    ? renderer(problem, context)
    : {
        what: `Cannot ${context.action}.`,
        why: [
          detailOr(problem, 'The API refused the request.'),
          `This CLI has no specific message for \`${problem.slug}\`, which usually`,
          'means the deployment is newer than the CLI.',
        ],
        next: ['Run `kleora doctor` to compare this CLI with the deployment.'],
      }

  const lines: string[] = [`✗ ${rendered.what}`, '']
  for (const line of rendered.why) lines.push(`  ${line}`)
  if (rendered.next.length > 0) {
    lines.push('')
    for (const line of rendered.next) lines.push(`  ${line}`)
  }
  lines.push('')
  lines.push(
    `  ${problem.slug} · ${String(problem.status)}${
      problem.requestId === undefined ? '' : ` · ${problem.requestId}`
    }`,
  )
  return new CliFailure(exitCodeForStatus(problem.status), lines)
}

/**
 * Every error this CLI can throw, as lines and an exit code.
 *
 * The one distinction that must never blur: "An unreachable API and a `403`
 * must never print the same way… An agent that reads an outage as 'you cannot
 * do that' is a known failure mode and a person does the same thing."
 */
export function toFailure(error: unknown, context: ProblemContext): CliFailure {
  if (error instanceof CliFailure) return error
  if (error instanceof ApiError) return renderProblem(problemOf(error), context)
  if (error instanceof ManagementApiUnreachable) {
    return new CliFailure(EXIT.UNREACHABLE, [
      `✗ Could not reach the API, so nothing was asked.`,
      '',
      '  This is not a refusal: the request never arrived. A DNS failure, a',
      '  refused connection or a timeout all land here.',
      '',
      '  Check the network and --base-url, then try again.',
      '',
      `  unreachable · ${error.message}`,
    ])
  }
  return new CliFailure(EXIT.UNEXPECTED, [
    `✗ Unexpected failure while trying to ${context.action}.`,
    '',
    `  ${error instanceof Error ? error.message : String(error)}`,
    '',
    '  Re-run with --debug and include the output in a bug report.',
  ])
}

export type { ExitCode }
