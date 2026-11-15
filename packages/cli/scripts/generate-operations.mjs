/**
 * Regenerate `src/generated/operations.ts` from the management API's OpenAPI
 * document, as Kleora's deployment serves it.
 *
 *   pnpm generate:operations
 *
 * Fetches https://api.kleora.io/api/v1/openapi.json (`MANAGEMENT_OPENAPI_URL`
 * overrides it) and writes two files, both committed:
 *
 * - `openapi/management-v1.json` at the repository root: the document itself,
 *   with object keys sorted so the file changes only when the API does, and so
 *   the input a client was generated from is reviewable in the diff that
 *   changed it;
 * - `packages/cli/src/generated/operations.ts`: the operation table below.
 *
 * CI runs this and fails when either file differs from what is committed, so a
 * change to the deployed API surfaces as a red check rather than as a CLI that
 * silently disagrees with the server.
 *
 * What it emits per operation: the method, the path template, which top-level
 * argument names are path or query parameters, whether there is a body, and —
 * for each body field the CLI may expose as a flag — its name, type, whether
 * it repeats, whether it is required, and its one-line description. That last
 * part is what makes `--help` a description of the API rather than a
 * transcription of it.
 *
 * **Every** operation in the document is emitted, not a curated subset. Two
 * reasons: `doctor` compares this `operationId` set with the deployment's own
 * `GET /api/v1/openapi.json` to tell "this endpoint does not exist here" from
 * "that id is not in your account", which needs the whole set; and which
 * operations are *commands* is `src/commands/registry.ts`'s decision, kept
 * separate so that adding a command is never a regeneration.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MANAGEMENT_URL = 'https://api.kleora.io/api/v1/openapi.json'
const url = process.env.MANAGEMENT_OPENAPI_URL || MANAGEMENT_URL

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')
const documentPath = resolve(repoRoot, 'openapi/management-v1.json')
const outputPath = resolve(here, '../src/generated/operations.ts')

// Object keys sorted, array order kept: the committed document then changes
// only when the API does, never because the server serialised a mapping in a
// different order.
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])]),
        )
      : value

// An explicit User-Agent: the deployment sits behind a CDN that refuses
// requests carrying a generic library default.
const response = await globalThis.fetch(url, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'kleora-cli-generator (+https://github.com/kleora-io/kleora-cli)',
  },
})
if (!response.ok) {
  throw new Error(`GET ${url} answered ${response.status}`)
}
const document = sorted(await response.json())
const schemas = document.components.schemas

const METHODS = ['get', 'post', 'put', 'patch', 'delete']

/**
 * Body field names the CLI must never turn into a flag, whatever the document
 * says:
 *
 * > A secret in `argv` is in the shell history, in `ps` output for every other
 * > process on the machine, and in the terminal scrollback of the screenshot
 * > somebody pastes into a support ticket.
 *
 * Applied here, at generation, rather than in the command layer, so that a
 * field the API gains tomorrow cannot become a flag by default. `POST /users`
 * really does accept `password`, and `users create` really does not offer it —
 * creating a user sends a verification or invitation mail instead.
 */
const NEVER_A_FLAG = new Set([
  'password',
  'new_password',
  'current_password',
  'secret',
  'client_secret',
  'api_key',
  'key',
  'token',
  'access_token',
  'refresh_token',
  'credential',
  'credentials',
])

function refName(ref) {
  const prefix = '#/components/schemas/'
  if (!ref.startsWith(prefix)) throw new Error(`unsupported $ref ${ref}`)
  return ref.slice(prefix.length)
}

function deref(node) {
  let current = node
  let hops = 0
  while (current && typeof current === 'object' && typeof current.$ref === 'string') {
    current = schemas[refName(current.$ref)]
    if (++hops > 10) throw new Error('$ref cycle')
  }
  return current ?? {}
}

/**
 * One field's shape as the command layer needs it: the scalar type to coerce a
 * flag value to, and whether the flag repeats.
 *
 * `anyOf` is how the document spells both nullability and a merge-patch
 * sentinel, so the branches are searched for the first concrete type rather
 * than reported as a union the CLI would have no flag syntax for.
 */
function describe(schema, depth = 0) {
  const node = deref(schema)
  if (depth > 4) return { type: 'string', repeated: false }

  if (node.type === 'array') {
    const item = describe(node.items ?? {}, depth + 1)
    return { type: item.type, repeated: true }
  }
  if (node.type === 'boolean') return { type: 'boolean', repeated: false }
  if (node.type === 'integer' || node.type === 'number') return { type: 'number', repeated: false }
  if (node.type === 'object') return { type: 'json', repeated: false }
  if (node.type === 'string') return { type: 'string', repeated: false }

  for (const branch of node.anyOf ?? node.oneOf ?? []) {
    const inner = deref(branch)
    if (inner.type === 'null') continue
    return describe(branch, depth + 1)
  }
  // No `type` at all and no usable branch: an open object (`params`-shaped) or
  // an untyped field. `json` means "the flag value is parsed as JSON", which is
  // the only honest thing a shell can offer for one.
  return { type: 'json', repeated: false }
}

/** The document's `description`, first sentence, collapsed onto one line. */
function oneLine(text) {
  if (typeof text !== 'string' || text.trim() === '') return undefined
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const stop = collapsed.search(/\.\s|\.$/)
  const first = stop === -1 ? collapsed : collapsed.slice(0, stop + 1)
  return first.length > 160 ? `${first.slice(0, 157)}…` : first
}

function enumValues(schema) {
  const node = deref(schema)
  if (Array.isArray(node.enum)) return node.enum.filter((value) => typeof value === 'string')
  for (const branch of node.anyOf ?? node.oneOf ?? []) {
    const inner = deref(branch)
    if (inner.type === 'null') continue
    if (Array.isArray(inner.enum)) return inner.enum.filter((value) => typeof value === 'string')
  }
  return undefined
}

function buildOperation(method, path, op) {
  const pathParams = []
  const queryParams = []
  const fields = []

  for (const raw of op.parameters ?? []) {
    const param = raw.$ref ? deref(raw) : raw
    if (param.in === 'path') {
      pathParams.push(param.name)
      continue
    }
    if (param.in === 'header') {
      // `GET E/webhook-events/stream` declares `Last-Event-ID`. A header is
      // never a flag and never part of a command's argument surface, so it is
      // recorded nowhere: the one caller that would need it is a hand-written
      // stream client, which this CLI does not carry yet.
      continue
    }
    if (param.in !== 'query') throw new Error(`${op.operationId}: parameter in '${param.in}'`)
    queryParams.push(param.name)
    if (NEVER_A_FLAG.has(param.name)) {
      throw new Error(
        `${op.operationId}: query parameter '${param.name}' is on the never-a-flag list — ` +
          'a credential must not travel in a URL either',
      )
    }
    const shape = describe(param.schema ?? {})
    fields.push({
      name: param.name,
      where: 'query',
      type: shape.type,
      repeated: shape.repeated,
      required: param.required === true,
      description: oneLine(param.description),
      enum: enumValues(param.schema ?? {}),
    })
  }

  const hasBody = op.requestBody !== undefined
  if (hasBody) {
    const raw = op.requestBody.content?.['application/json']?.schema
    if (!raw) throw new Error(`${op.operationId}: request body is not application/json`)
    const body = deref(raw)
    const required = new Set(body.required ?? [])
    for (const [name, schema] of Object.entries(body.properties ?? {})) {
      if (NEVER_A_FLAG.has(name)) continue
      if (pathParams.includes(name) || queryParams.includes(name)) {
        throw new Error(`${op.operationId}: '${name}' is both a parameter and a body field`)
      }
      const shape = describe(schema)
      fields.push({
        name,
        where: 'body',
        type: shape.type,
        repeated: shape.repeated,
        required: required.has(name),
        description: oneLine(deref(schema).description ?? schema.description),
        enum: enumValues(schema),
      })
    }
  }

  return {
    operationId: op.operationId,
    method,
    path,
    tag: op.tags?.[0] ?? '',
    summary: op.summary ?? '',
    pathParams,
    queryParams,
    hasBody,
    fields: fields.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

const built = []
for (const [path, item] of Object.entries(document.paths)) {
  for (const method of METHODS) {
    const op = item[method]
    if (!op) continue
    if (!op.operationId) throw new Error(`${method.toUpperCase()} ${path} has no operationId`)
    built.push(buildOperation(method, path, op))
  }
}
built.sort((a, b) => a.operationId.localeCompare(b.operationId))

const file = `/**
 * GENERATED — do not edit. \`pnpm generate:operations\` writes it from the
 * deployed management API document (${MANAGEMENT_URL}).
 *
 * Every operation in that document: its method, path
 * template, which argument names are path or query parameters, and the fields a
 * command may expose as flags. Which of these are *commands* is
 * \`src/commands/registry.ts\`'s decision, not this file's.
 *
 * Credential-shaped body fields are **absent by construction** — the generator
 * drops them, so no flag anywhere in
 * this CLI can carry a password, a token, a client secret or an API key.
 */

/** The scalar a flag value is coerced to. \`json\` is parsed with \`JSON.parse\`. */
export type FieldType = 'string' | 'number' | 'boolean' | 'json'

export interface OperationField {
  readonly name: string
  readonly where: 'query' | 'body'
  readonly type: FieldType
  /** A repeatable flag: \`--redirect-uris a --redirect-uris b\`. */
  readonly repeated: boolean
  readonly required: boolean
  readonly description?: string
  readonly enum?: readonly string[]
}

export interface GeneratedOperation {
  readonly operationId: string
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  readonly path: string
  readonly tag: string
  readonly summary: string
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly hasBody: boolean
  readonly fields: readonly OperationField[]
}

export const OPERATIONS: Readonly<Record<string, GeneratedOperation>> = {
${built.map((entry) => `  ${JSON.stringify(entry.operationId)}: ${indent(JSON.stringify(entry, null, 2), 2)},`).join('\n')}
}

/** Every \`operationId\` this CLI was generated against, for \`doctor\`. */
export const OPERATION_IDS: readonly string[] = Object.keys(OPERATIONS)
`

function indent(text, spaces) {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line, index) => (index === 0 ? line : pad + line))
    .join('\n')
}

mkdirSync(dirname(documentPath), { recursive: true })
writeFileSync(documentPath, JSON.stringify(document, null, 2) + '\n', 'utf8')
console.log(`wrote ${relative(repoRoot, documentPath)} from ${url}`)
writeFileSync(outputPath, file, 'utf8')
console.log(`wrote ${relative(repoRoot, outputPath)}: ${built.length} operations`)
