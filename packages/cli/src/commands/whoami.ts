/**
 * `kleora whoami` — who this credential is, and **where it is kept**.
 *
 * It prints the profile, the account, the principal, and — deliberately — the
 * store backend, so "why does it keep asking me to sign in" has an answer that
 * names a keychain.
 *
 * It is also the command `insufficient-permission` points at, so it prints the
 * permissions held. A person told "you are missing `clients:write`" can then
 * read this list and ask their admin for a named thing rather than for
 * "access".
 */
import type { ManagementClient } from '@kleora-io/core'

import type { Authenticated } from '../auth.js'
import type { Config } from '../config.js'
import { OPERATIONS } from '../generated/operations.js'
import { printJson, type Io } from '../output.js'

export interface WhoamiDependencies {
  readonly client: ManagementClient
  readonly config: Config
  readonly io: Io
  readonly json: boolean
  readonly auth: Authenticated
}

interface Me {
  principal?: { kind?: string; subject_id?: string }
  account?: { slug?: string; name?: string; id?: string } | null
  tenant?: { slug?: string; id?: string } | null
  environment?: { kind?: string; issuer?: string; app?: { slug?: string } } | null
  permissions?: string[]
  memberships?: unknown[]
}

export async function whoami(deps: WhoamiDependencies): Promise<void> {
  const { client, config, io, json, auth } = deps
  const operation = OPERATIONS['me']
  if (!operation) throw new Error("invariant: generated operations has no 'me'")

  const response = await client.request(operation, {})

  if (json) {
    // The API's own body, unmodified. The local facts below —
    // profile, store backend — are not part of `GET /me` and are deliberately
    // not spliced into it: a `--json` that carried invented members would be a
    // second contract.
    printJson(io, response.text)
    io.err(`profile=${config.profile} store=${auth.backend ?? 'n/a (KLEORA_API_KEY)'}\n`)
    return
  }

  const me = JSON.parse(response.text) as Me
  const lines: Array<[string, string]> = [
    ['profile', config.profile],
    ['principal', `${me.principal?.kind ?? '—'} ${me.principal?.subject_id ?? ''}`.trim()],
    ['account', label(me.account?.slug, me.account?.name)],
    ['tenant', me.tenant?.slug ?? '—'],
    ['environment', environmentLabel(me)],
    ['api base', config.baseUrl],
    ['issuer', await config.resolveIssuer().catch(() => '(could not read — try `kleora doctor`)')],
    // Named deliberately: this is the answer to "why does it keep asking me to
    // sign in", and it is a sentence about a keychain rather than about us.
    ['credential', auth.source === 'api-key' ? 'KLEORA_API_KEY (this shell)' : where(auth)],
  ]

  const width = Math.max(...lines.map(([key]) => key.length))
  for (const [key, value] of lines) io.out(`${key.padEnd(width)}  ${value}\n`)

  const permissions = me.permissions ?? []
  io.out(`\npermissions (${String(permissions.length)})\n`)
  if (permissions.length === 0) {
    io.out('  (none — this principal can read `GET /me` and nothing else)\n')
  } else {
    for (const permission of [...permissions].sort()) io.out(`  ${permission}\n`)
  }
}

function where(auth: Authenticated): string {
  return auth.backend === 'keychain'
    ? 'OS keychain, service `kleora-cli`'
    : '0600 file under ~/.kleora-cli'
}

function label(slug: string | undefined, name: string | undefined): string {
  if (slug === undefined) return '—'
  return name === undefined ? slug : `${slug} (${name})`
}

function environmentLabel(me: Me): string {
  const environment = me.environment
  if (environment === null || environment === undefined) return '— (account scope)'
  const app = environment.app?.slug === undefined ? '' : `${environment.app.slug} · `
  return `${app}${environment.kind ?? '?'} · ${environment.issuer ?? ''}`.trim()
}
