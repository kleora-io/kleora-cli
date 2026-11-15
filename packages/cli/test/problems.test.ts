/**
 * Every slug in the management API's problem registry renders a specific
 * message; this test enumerates the registry and fails on a fallback.
 *
 * `REGISTRY` below is that registry, mirrored as data.
 *
 * The 402, 429 and outage cases are here too, because all three are about a
 * message saying the right thing rather than about a status code.
 */
import { ApiError, ManagementApiUnreachable, type ProblemDetails } from '@kleora-io/core'
import { describe, expect, it } from 'vitest'

import { EXIT } from '../src/exit.js'
import { KNOWN_SLUGS, renderProblem, toFailure, type Problem } from '../src/problems.js'

/**
 * The management API's problem registry, by status, plus
 * `service-unavailable` — which the API's rate limiter emits and the registry
 * does not list.
 */
const REGISTRY: ReadonlyArray<readonly [string, number]> = [
  ['invalid-cursor', 400],
  ['unauthenticated', 401],
  ['payment-required', 402],
  ['account-suspended', 403],
  ['email-unverified', 403],
  ['insufficient-permission', 403],
  ['insufficient-scope', 403],
  ['owner-required', 403],
  ['privilege-escalation', 403],
  ['not-found', 404],
  ['user-not-found', 404],
  ['unsupported-media-type', 415],
  ['account-tenant', 409],
  ['already-member', 409],
  ['client-default', 409],
  ['client-not-confidential', 409],
  ['conflict', 409],
  ['default-tenant', 409],
  ['idempotency-in-progress', 409],
  ['invitation-exists', 409],
  ['last-owner', 409],
  ['not-sandbox', 409],
  ['permission-exists', 409],
  ['platform-protected', 409],
  ['role-slug-conflict', 409],
  ['single-mode-membership', 409],
  ['slug-taken', 409],
  ['system-permission', 409],
  ['system-role', 409],
  ['tenant-mode-backfill-pending', 409],
  ['tenant-mode-single', 409],
  ['tenant-mode-switch-blocked', 409],
  ['user-erased', 409],
  ['field-not-nullable', 422],
  ['idempotency-key-reused', 422],
  ['invalid-scope', 422],
  ['limit-exceeded', 422],
  ['password-breached', 422],
  ['password-policy', 422],
  ['reserved-permission', 422],
  ['role-not-assignable', 422],
  ['slug-reserved', 422],
  ['validation-error', 422],
  ['rate-limited', 429],
  ['service-unavailable', 503],
]

const CONTEXT = { action: 'delete that client', underApiKey: false }

function problemFor(slug: string, status: number, document: Record<string, unknown> = {}): Problem {
  return {
    slug,
    status,
    detail: `${slug} happened`,
    document,
    requestId: 'req_01TEST',
    retryAfter: null,
  }
}

/** What the fallback renderer says. No registry slug may produce it. */
const FALLBACK_MARKER = 'has no specific message for'

describe('the slug mapping is exhaustive over the registry', () => {
  it.each(REGISTRY)('%s renders a specific message', (slug, status) => {
    const failure = renderProblem(problemFor(slug, status), CONTEXT)
    const text = failure.lines.join('\n')
    expect(text, `${slug} fell through to the generic renderer`).not.toContain(FALLBACK_MARKER)
    // What was refused, why, what to do next — then the request id, always.
    expect(text).toContain('✗ ')
    expect(text).toContain(`${slug} · ${String(status)} · req_01TEST`)
  })

  it('knows every slug the registry names', () => {
    for (const [slug] of REGISTRY) expect(KNOWN_SLUGS).toContain(slug)
  })

  it('knows nothing the registry does not', () => {
    // A slug this CLI names that the registry does not is either a slug the
    // registry forgot or one this CLI invented; both want a human to look.
    const registry = new Set(REGISTRY.map(([slug]) => slug))
    for (const slug of KNOWN_SLUGS) expect(registry, `unknown slug '${slug}'`).toContain(slug)
  })

  it('still has a fallback, for a deployment newer than this build', () => {
    const failure = renderProblem(problemFor('something-invented-later', 409), CONTEXT)
    expect(failure.lines.join('\n')).toContain(FALLBACK_MARKER)
    expect(failure.exitCode).toBe(EXIT.REFUSED)
  })
})

describe('402 says one of two opposite things, never the wrong one', () => {
  // The plan gate and the payment block share a slug and mean opposite things.
  it('a plan gate names the feature and the plans, and never mentions an invoice', () => {
    const failure = renderProblem(
      problemFor('payment-required', 402, {
        feature: 'passkeys',
        plan: 'pro',
        required_plans: ['scale'],
      }),
      CONTEXT,
    )
    const text = failure.lines.join('\n')
    expect(text).toContain('passkeys')
    expect(text).toContain('pro')
    expect(text).toContain('scale')
    expect(text.toLowerCase()).not.toContain('invoice')
    expect(text.toLowerCase()).not.toContain('portal')
    expect(failure.exitCode).toBe(EXIT.PAYMENT_REQUIRED)
  })

  it('a dunning block names the portal, says reads still work, and never mentions a plan', () => {
    const failure = renderProblem(problemFor('payment-required', 402), CONTEXT)
    const text = failure.lines.join('\n')
    expect(text).toContain('portal')
    expect(text).toContain('Reads')
    expect(text.toLowerCase()).not.toContain('plan does not include')
    expect(failure.exitCode).toBe(EXIT.PAYMENT_REQUIRED)
  })

  it('reads the plan-gate members off the document, not off ApiError', () => {
    // `feature`, `plan`, `required_plans` and `params`
    // are *not* fields on any SDK's `ApiError`, and no SDK parses them. This is
    // the path that has to work.
    const details: ProblemDetails = {
      document: { feature: 'mfa_required', plan: 'starter', required_plans: ['pro', 'scale'] },
      retryAfter: null,
      requestId: 'req_01TEST',
    }
    const error = new ApiError(
      'https://kleora.io/problems/payment-required',
      402,
      'Payment required',
      'A plan gate',
      details,
    )
    const failure = toFailure(error, CONTEXT)
    const text = failure.lines.join('\n')
    expect(text).toContain('mfa_required')
    expect(text).toContain('starter')
    expect(text).toContain('pro')
  })
})

describe('429 never blames a plan a person cannot buy their way out of', () => {
  // The plan tier meters `api_key` and `tenant_member`
  // and **not** `console_user`, whose limit is a flat 600 a minute.
  it('says nothing about upgrading for a signed-in person', () => {
    const failure = renderProblem(problemFor('rate-limited', 429), CONTEXT)
    const text = failure.lines.join('\n').toLowerCase()
    expect(text).toContain('abuse control')
    expect(text).not.toContain('upgrade')
    expect(text).not.toContain('bigger plan')
    expect(failure.exitCode).toBe(EXIT.RATE_LIMITED)
  })

  it('does mention the plan tier under an API key, where it applies', () => {
    const failure = renderProblem(problemFor('rate-limited', 429), {
      ...CONTEXT,
      underApiKey: true,
    })
    const text = failure.lines.join('\n')
    expect(text).toContain('plan tier')
    expect(text).toContain('RateLimit-*')
  })

  it('reports the Retry-After it was given', () => {
    const failure = renderProblem(
      { ...problemFor('rate-limited', 429), retryAfter: 17 },
      CONTEXT,
    )
    expect(failure.lines.join('\n')).toContain('17 seconds')
  })
})

describe('an outage and a refusal never read the same', () => {
  // An agent that reads an outage as "you cannot do that" is a known failure
  // mode, and a person does the same thing.
  it('an unreachable API exits 9 and cannot be read as a permission refusal', () => {
    const failure = toFailure(new ManagementApiUnreachable('connect ECONNREFUSED'), CONTEXT)
    const text = failure.lines.join('\n')
    expect(failure.exitCode).toBe(EXIT.UNREACHABLE)
    expect(text).toContain('nothing was asked')
    expect(text.toLowerCase()).not.toContain('permission')
    expect(text.toLowerCase()).not.toContain('not allowed')
  })

  it('a 403 exits 4 and says it was a refusal', () => {
    const failure = renderProblem(problemFor('insufficient-permission', 403), CONTEXT)
    expect(failure.exitCode).toBe(EXIT.FORBIDDEN)
    expect(failure.lines.join('\n')).toContain('permission is missing')
  })

  it('a 5xx joins the outage class, not the refusal class', () => {
    const failure = renderProblem(problemFor('service-unavailable', 503), CONTEXT)
    expect(failure.exitCode).toBe(EXIT.UNREACHABLE)
  })
})

describe('validation errors name the field, and a null field is not the word null', () => {
  it('prints one line per entry with the field first', () => {
    const failure = renderProblem(
      problemFor('validation-error', 422, {
        errors: [
          { field: 'redirect_uris[1]', message: 'must be an absolute URL', code: 'invalid_url' },
          { field: null, message: 'session_idle_ttl must be below session_ttl', code: 'invalid' },
        ],
      }),
      CONTEXT,
    )
    const text = failure.lines.join('\n')
    expect(text).toContain('`redirect_uris[1]`: must be an absolute URL')
    expect(text).toContain('the request as a whole: session_idle_ttl must be below session_ttl')
    expect(text).not.toContain('null:')
  })

  it('carries a line number where an entry has one', () => {
    const failure = renderProblem(
      problemFor('validation-error', 422, {
        errors: [{ field: 'body_html', message: 'unclosed tag', line: 12, construct: 'if' }],
      }),
      CONTEXT,
    )
    expect(failure.lines.join('\n')).toContain('(line 12, if)')
  })

  it('carries an offset where an entry has one', () => {
    const failure = renderProblem(
      problemFor('validation-error', 422, {
        errors: [{ field: 'custom_css', message: 'disallowed at-rule', offset: 340 }],
      }),
      CONTEXT,
    )
    expect(failure.lines.join('\n')).toContain('(offset 340)')
  })
})

describe('the messages that have to say something specific', () => {
  it('insufficient-scope distinguishes an API key from a permission problem', () => {
    const asKey = renderProblem(problemFor('insufficient-scope', 403), {
      ...CONTEXT,
      underApiKey: true,
    })
    expect(asKey.lines.join('\n')).toContain('not something a')
    expect(asKey.lines.join('\n')).toContain('permission grant fixes')
  })

  it('insufficient-permission points at whoami', () => {
    const failure = renderProblem(problemFor('insufficient-permission', 403), CONTEXT)
    expect(failure.lines.join('\n')).toContain('kleora whoami')
  })

  it('not-found says it may mean "outside your scope" and names the target', () => {
    const failure = renderProblem(problemFor('not-found', 404), {
      ...CONTEXT,
      target: '→ sandbox · acme · acme-sandbox.example.test · 2222',
    })
    const text = failure.lines.join('\n')
    expect(text).toContain('outside your scope')
    expect(text).toContain('acme-sandbox.example.test')
    expect(failure.exitCode).toBe(EXIT.NOT_FOUND)
  })

  it('invalid-cursor says the listing must restart and why', () => {
    const failure = renderProblem(problemFor('invalid-cursor', 400), CONTEXT)
    const text = failure.lines.join('\n')
    expect(text).toContain('Restart the listing')
    expect(text).toContain('Changing a filter')
  })

  it('idempotency-key-reused says a fresh attempt needs a fresh key', () => {
    const failure = renderProblem(problemFor('idempotency-key-reused', 422), CONTEXT)
    expect(failure.lines.join('\n')).toContain('fresh key')
  })

  it('states the rule for the four refusals that are rules, so nobody retries', () => {
    for (const slug of ['platform-protected', 'account-tenant', 'last-owner', 'default-tenant']) {
      const text = renderProblem(problemFor(slug, 409), CONTEXT).lines.join('\n')
      expect(text.toLowerCase(), slug).toMatch(/rule|must always|nothing to retry/)
    }
  })
})
