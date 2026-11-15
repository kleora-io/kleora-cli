/**
 * A thin, generic `fetch` wrapper over the management API's operations — the
 * whole security argument of both local tools, in code: this is the *only*
 * way either the CLI or the MCP server reaches Kleora's data, over HTTPS, with
 * the caller's own bearer token. No ORM, no service credential, no query the
 * API does not already expose.
 *
 * Generic over an `Operation` rather than one method per endpoint, because
 * both callers already know which operation they are invoking — the MCP
 * server from a tool name, the CLI from a noun and a verb — and a second,
 * hand-written switch here would be the same map twice.
 *
 * `Operation` is declared **structurally** rather than imported from either
 * package's generated tree: each generates its own from the management API's
 * OpenAPI document and both shapes satisfy this one, so this module depends on
 * neither generator's output.
 */
import { ApiError, ManagementApiUnreachable, type ProblemDetails } from './errors.js'

/** What this client needs to know about an operation in order to call it. */
export interface Operation {
  readonly operationId: string
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  readonly path: string
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly hasBody: boolean
}

export interface ManagementClientOptions {
  baseUrl: string
  /** Resolves to a fresh bearer token for every call — never cached here. */
  getAccessToken: () => Promise<string>
  /** `kleora-mcp/{version}` or `kleora-cli/{version}`. */
  userAgent: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  /**
   * Concurrent requests this client will have in flight at once: a small
   * number, deliberately. A host that fires several tool calls at once, or a
   * `--all` walk, must not turn a local tool into a burst against the
   * account's own limits.
   */
  maxConcurrent?: number
  /**
   * Called once per attempt, for the CLI's `--debug`, which prints the
   * request method, path, status, duration and `X-Request-Id` of every call
   * to stderr. It is
   * handed no credential and no body, which is what makes `--debug` output
   * safe to paste into a support reply.
   */
  onTrace?: (trace: RequestTrace) => void
}

/** What `--debug` prints. Deliberately carries nothing secret. */
export interface RequestTrace {
  method: string
  /** Path and query only — never the `Authorization` header, never a body. */
  path: string
  /** `null` when nothing answered at all. */
  status: number | null
  durationMs: number
  requestId: string | undefined
  /** Set when the request failed before a status existed. */
  error?: string
}

export interface CallOptions {
  /**
   * Extra request headers: `Idempotency-Key` on a write, `X-Request-Id` when
   * the caller wants to correlate one. **Never a credential** — the only
   * `Authorization` header this client sends is the one it builds from
   * `getAccessToken`, and it is applied after these so a caller cannot
   * replace it.
   */
  headers?: Record<string, string>
  /**
   * Whether repeating this request is safe after a `429`. Defaults to `true`.
   * A non-idempotent `POST` is never retried without an `Idempotency-Key`, so
   * a caller making a keyless `POST` passes `false`.
   */
  idempotent?: boolean
}

/** A response, body included as the bytes that arrived. */
export interface RawResponse {
  status: number
  /**
   * The body exactly as it arrived, unparsed. The CLI's `--json` prints the
   * response body as it arrived, not a re-serialisation of a parsed object,
   * which is what lets an older CLI against a newer API pass
   * through fields it has never heard of.
   */
  text: string
  headers: Headers
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_CONCURRENT = 4
/** Bounds the `Retry-After` backoff — never an unbounded loop. */
const MAX_RETRIES = 3

export interface OperationArgs {
  [name: string]: unknown
}

export class ManagementClient {
  readonly baseUrl: string
  readonly #getAccessToken: () => Promise<string>
  readonly #userAgent: string
  readonly #fetch: typeof globalThis.fetch
  readonly #timeoutMs: number
  readonly #maxConcurrent: number
  readonly #onTrace: ((trace: RequestTrace) => void) | undefined
  #inFlight = 0
  #queue: Array<() => void> = []

  constructor(options: ManagementClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.#getAccessToken = options.getAccessToken
    this.#userAgent = options.userAgent
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.#maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    this.#onTrace = options.onTrace
  }

  /**
   * Calls one operation and parses the body. `args` is a flat argument
   * object; this method is what splits it back into path, query and body using
   * the operation's own metadata — never a lookup this package invents.
   */
  async call(
    operation: Operation,
    args: OperationArgs,
    options: CallOptions = {},
  ): Promise<unknown> {
    const response = await this.request(operation, args, options)
    if (response.status === 204 || response.text === '') return undefined
    return JSON.parse(response.text) as unknown
  }

  /** The same call, with the body left as the bytes that arrived. */
  async request(
    operation: Operation,
    args: OperationArgs,
    options: CallOptions = {},
  ): Promise<RawResponse> {
    await this.#acquire()
    try {
      return await this.#withRetry(operation, args, options, 0)
    } finally {
      this.#release()
    }
  }

  async #withRetry(
    operation: Operation,
    args: OperationArgs,
    options: CallOptions,
    attempt: number,
  ): Promise<RawResponse> {
    const url = this.#urlFor(operation, args)
    const body = this.#bodyFor(operation, args)
    const token = await this.#getAccessToken()

    const headers: Record<string, string> = {
      Accept: 'application/json, application/problem+json',
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'User-Agent': this.#userAgent,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const method = operation.method.toUpperCase()
    const startedAt = Date.now()
    let response: Response
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      })
    } catch (error) {
      this.#onTrace?.({
        method,
        path: url.pathname + url.search,
        status: null,
        durationMs: Date.now() - startedAt,
        requestId: undefined,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new ManagementApiUnreachable(`could not reach ${this.baseUrl}`, { cause: error })
    }

    this.#onTrace?.({
      method,
      path: url.pathname + url.search,
      status: response.status,
      durationMs: Date.now() - startedAt,
      requestId: response.headers.get('x-request-id') ?? undefined,
    })

    if (response.status === 429 && attempt < MAX_RETRIES && options.idempotent !== false) {
      const retryAfter = retryAfterSeconds(response)
      if (retryAfter !== null) {
        await sleep(retryAfter * 1000)
        return this.#withRetry(operation, args, options, attempt + 1)
      }
    }

    if (!response.ok) throw await toApiError(response)
    return {
      status: response.status,
      text: response.status === 204 ? '' : await response.text(),
      headers: response.headers,
    }
  }

  #urlFor(operation: Operation, args: OperationArgs): URL {
    const path = operation.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = args[name]
      if (typeof value !== 'string' || value === '') {
        // Unreachable once the caller has validated `args` — ajv against the
        // tool's schema in the MCP server, the command's own parser in the
        // CLI. This is the backstop, not the primary defence.
        throw new Error(`operation '${operation.operationId}' needs a path parameter '${name}'`)
      }
      return encodeURIComponent(value)
    })
    const url = new URL(this.baseUrl + path)
    for (const name of operation.queryParams) {
      const value = args[name]
      if (value === undefined || value === null) continue
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          url.searchParams.append(name, String(item))
        }
      }
    }
    return url
  }

  #bodyFor(operation: Operation, args: OperationArgs): Record<string, unknown> | undefined {
    if (!operation.hasBody) return undefined
    const excluded = new Set<string>([...operation.pathParams, ...operation.queryParams])
    const body: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(args)) {
      if (excluded.has(name)) continue
      if (value !== undefined) body[name] = value
    }
    return body
  }

  /** A tiny counting semaphore — no dependency for something this small. */
  #acquire(): Promise<void> {
    if (this.#inFlight < this.#maxConcurrent) {
      this.#inFlight++
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.#queue.push(() => {
        this.#inFlight++
        resolve()
      })
    })
  }

  #release(): void {
    this.#inFlight--
    const next = this.#queue.shift()
    if (next) next()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** `Retry-After` in seconds, from either the delta-seconds or the HTTP-date form. */
export function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get('retry-after')?.trim()
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 60)
  const at = Date.parse(raw)
  if (Number.isFinite(at)) return Math.min(Math.max(0, Math.round((at - Date.now()) / 1000)), 60)
  return null
}

async function toApiError(response: Response): Promise<ApiError> {
  let document: Record<string, unknown> = {}
  try {
    const body: unknown = JSON.parse(await response.text())
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      document = body as Record<string, unknown>
    }
  } catch {
    // A non-JSON error body (an intermediary's HTML page) still becomes an
    // `ApiError` carrying the status; see this client's callers.
  }
  const problem: ProblemDetails = {
    document,
    retryAfter: retryAfterSeconds(response),
    requestId:
      typeof document['request_id'] === 'string'
        ? document['request_id']
        : (response.headers.get('x-request-id') ?? undefined),
  }
  return new ApiError(
    typeof document['type'] === 'string' ? document['type'] : 'about:blank',
    response.status,
    typeof document['title'] === 'string' ? document['title'] : undefined,
    typeof document['detail'] === 'string' ? document['detail'] : undefined,
    problem,
  )
}
