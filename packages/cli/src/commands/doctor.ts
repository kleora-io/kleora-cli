/**
 * `kleora doctor` — is this CLI and this deployment talking about the same
 * API, and where is my credential?
 *
 * The reason it exists is a genuine ambiguity in the wire, not tidiness.
 *
 * **Newer CLI, older deployment.** A route the deployment does not have
 * answers `404` — and, awkwardly, it answers the *same* `not-found` problem
 * document a missing row does, because the management API answers unrouted
 * paths that way too. So the CLI cannot tell "this endpoint does not exist
 * here" from "that id is not in your account" by the response alone.
 *
 * `kleora doctor` resolves it properly by reading the deployment's own
 * `GET /api/v1/openapi.json` and comparing its `operationId` set with the one
 * the CLI was generated against.
 *
 * That document is served **anonymously** — it is the operations behind it that
 * need a principal, not the description of them — so `doctor` works with no
 * credential at all, which is also what makes it the right command to point a
 * confused person at.
 *
 * It prints which local files exist, where, and with what permissions —
 * **never their contents**.
 */
import { statSync } from 'node:fs'
import { join } from 'node:path'

import type { Config } from '../config.js'
import { OPERATION_IDS } from '../generated/operations.js'
import { printOwnJson, type Io } from '../output.js'
import { VERSION } from '../version.js'

export interface DoctorDependencies {
  readonly config: Config
  readonly io: Io
  readonly fetch: typeof globalThis.fetch
  readonly configDir: string
  readonly json: boolean
  readonly storeBackend: 'keychain' | 'file' | null
}

interface Report {
  readonly cli_version: string
  readonly api_base: string
  /** `null` when the API could not name it and none was given (see `notes`). */
  readonly issuer: string | null
  readonly profile: string
  readonly credential_store: string
  readonly local_files: Array<{ path: string; mode: string }>
  readonly document_version: string | null
  readonly service_version: string | null
  /** Commands this CLI knows that the deployment cannot serve. */
  readonly missing_here: string[]
  /** Operations the deployment has that this CLI was not generated against. */
  readonly cli_is_behind: string[]
  readonly notes: string[]
}

export async function doctor(deps: DoctorDependencies): Promise<void> {
  const { config, io, fetch: fetchImpl, json } = deps
  const notes: string[] = []

  const document = await readDocument(config.baseUrl, fetchImpl, notes)
  const serviceVersion = await readServiceVersion(config.baseUrl, fetchImpl, notes)
  const issuer = await readIssuer(config, notes)

  const theirs = document === null ? null : new Set(operationIdsOf(document))
  const ours = new Set(OPERATION_IDS)

  const report: Report = {
    cli_version: VERSION,
    api_base: config.baseUrl,
    issuer,
    profile: config.profile,
    credential_store:
      deps.storeBackend === null
        ? 'KLEORA_API_KEY (this shell only)'
        : deps.storeBackend === 'keychain'
          ? 'OS keychain, service `kleora-cli`'
          : `0600 files under ${deps.configDir}`,
    local_files: localFiles(deps.configDir, config.profile),
    document_version: document === null ? null : versionOf(document),
    service_version: serviceVersion,
    missing_here: theirs === null ? [] : [...ours].filter((id) => !theirs.has(id)).sort(),
    cli_is_behind: theirs === null ? [] : [...theirs].filter((id) => !ours.has(id)).sort(),
    notes,
  }

  if (json) {
    printOwnJson(io, report)
    return
  }

  io.out(`kleora ${report.cli_version}\n`)
  io.out(`api base            ${report.api_base}\n`)
  io.out(`issuer              ${report.issuer ?? '(could not read)'}\n`)
  io.out(`profile             ${report.profile}\n`)
  io.out(`credential store    ${report.credential_store}\n`)
  io.out(`document version    ${report.document_version ?? '(could not read)'}\n`)
  io.out(`service version     ${report.service_version ?? '(could not read)'}\n`)

  io.out(`\nlocal files\n`)
  if (report.local_files.length === 0) io.out('  (none — nothing is stored on this machine)\n')
  for (const file of report.local_files) io.out(`  ${file.mode}  ${file.path}\n`)

  io.out(`\noperations\n`)
  if (theirs === null) {
    io.out('  (the deployment\'s OpenAPI document could not be read — see notes)\n')
  } else if (report.missing_here.length === 0 && report.cli_is_behind.length === 0) {
    io.out('  This CLI and this deployment describe exactly the same API.\n')
  } else {
    if (report.missing_here.length > 0) {
      io.out(`  This deployment cannot serve ${String(report.missing_here.length)} operation(s)\n`)
      io.out('  this CLI knows about — those commands will answer 404 here:\n')
      for (const id of report.missing_here) io.out(`    ${id}\n`)
    }
    if (report.cli_is_behind.length > 0) {
      io.out(`\n  This CLI is behind: the deployment has ${String(report.cli_is_behind.length)}\n`)
      io.out('  operation(s) this build was not generated against. Upgrade the CLI\n')
      io.out('  to reach them:\n')
      for (const id of report.cli_is_behind) io.out(`    ${id}\n`)
    }
  }

  if (notes.length > 0) {
    io.out('\nnotes\n')
    for (const note of notes) io.out(`  ${note}\n`)
  }
}

/**
 * The issuer `login` would use, and where it came from. A deployment that
 * cannot name it is a finding, and one `login` would otherwise report only as a
 * failure to sign in.
 */
async function readIssuer(config: Config, notes: string[]): Promise<string | null> {
  try {
    const issuer = await config.resolveIssuer()
    if (config.issuer !== undefined) notes.push('issuer: given explicitly (--issuer or KLEORA_ISSUER).')
    return issuer
  } catch (error) {
    notes.push(`issuer: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * `GET /api/v1/openapi.json`, anonymously.
 *
 * Almost nothing under `/api/v1/` answers without a principal, but this
 * document does: it is the operations behind it that need one, not the
 * description of them.
 */
async function readDocument(
  baseUrl: string,
  fetchImpl: typeof globalThis.fetch,
  notes: string[],
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchImpl(`${baseUrl}/api/v1/openapi.json`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      notes.push(
        `GET /api/v1/openapi.json answered ${String(response.status)}. That document is served ` +
          'anonymously, so this is a deployment or proxy problem rather than a permission one.',
      )
      return null
    }
    return (await response.json()) as Record<string, unknown>
  } catch (error) {
    notes.push(
      `Could not reach ${baseUrl}: ${error instanceof Error ? error.message : String(error)}. ` +
        'Nothing below about operations could be checked.',
    )
    return null
  }
}

async function readServiceVersion(
  baseUrl: string,
  fetchImpl: typeof globalThis.fetch,
  notes: string[],
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${baseUrl}/api/v1/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'version' in body) {
      const { version } = body
      return typeof version === 'string' ? version : null
    }
    return null
  } catch {
    // `GET /api/v1/` needs a principal, so an unauthenticated `doctor` is
    // expected to miss this. Not worth a note of its own; the document above
    // is the one that matters.
    notes.push('The service version needs a credential; run `kleora login` to see it.')
    return null
  }
}

function operationIdsOf(document: Record<string, unknown>): string[] {
  const paths = document['paths']
  if (typeof paths !== 'object' || paths === null) return []
  const ids: string[] = []
  for (const item of Object.values(paths as Record<string, unknown>)) {
    if (typeof item !== 'object' || item === null) continue
    for (const operation of Object.values(item as Record<string, unknown>)) {
      if (typeof operation !== 'object' || operation === null) continue
      const id = (operation as { operationId?: unknown }).operationId
      if (typeof id === 'string') ids.push(id)
    }
  }
  return ids
}

function versionOf(document: Record<string, unknown>): string | null {
  const info = document['info']
  if (typeof info !== 'object' || info === null) return null
  const version = (info as { version?: unknown }).version
  return typeof version === 'string' ? version : null
}

/**
 * Which of the local files exist and with what permission bits — never their
 * contents. The mode is the point: a credential file that is not `0600` is the
 * one finding worth printing.
 */
function localFiles(configDir: string, profile: string): Array<{ path: string; mode: string }> {
  const candidates = [
    join(configDir, `credentials-${encodeURIComponent(profile)}.json`),
    join(configDir, 'profiles.json'),
  ]
  const found: Array<{ path: string; mode: string }> = []
  for (const path of candidates) {
    try {
      const stat = statSync(path)
      found.push({ path, mode: `0${(stat.mode & 0o777).toString(8)}` })
    } catch {
      // Absent is the ordinary case on the keychain backend.
    }
  }
  return found
}

/** `version` prints the same three numbers `doctor` reports, and nothing else. */
export async function version(deps: DoctorDependencies): Promise<void> {
  const { config, io, fetch: fetchImpl, json } = deps
  const notes: string[] = []
  const document = await readDocument(config.baseUrl, fetchImpl, notes)
  const service = await readServiceVersion(config.baseUrl, fetchImpl, notes)
  if (json) {
    printOwnJson(io, {
      cli: VERSION,
      document: document === null ? null : versionOf(document),
      service,
    })
    return
  }
  io.out(`kleora ${VERSION}\n`)
  io.out(`document ${document === null ? '(could not read)' : (versionOf(document) ?? '(unversioned)')}\n`)
  io.out(`service  ${service ?? '(could not read)'}\n`)
}
