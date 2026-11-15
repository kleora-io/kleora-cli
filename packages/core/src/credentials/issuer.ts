/**
 * Where the device grant runs: the platform issuer, as the management API
 * reports it.
 *
 * Both tools used to *derive* it, by swapping the first DNS label of the API's
 * origin for `id`. The hosted API is on `kleora.io` and every issuer is on
 * `kleora.eu`, so the derivation held only through a hard-coded exception,
 * and would have named a host nobody serves for the next region. Now the tool
 * asks the deployment — `GET {baseUrl}/api/v1/platform`, anonymously, since
 * the answer is where a credential comes from — and uses what it says.
 *
 * An explicit issuer (`--issuer`, `KLEORA_ISSUER`, `KLEORA_MCP_ISSUER`) still
 * wins and makes no request at all: a development topology the deployment
 * cannot describe from the inside is exactly what the override is for.
 */
import { ManagementApiUnreachable } from '../errors.js'

export const PLATFORM_PATH = '/api/v1/platform'

export interface IssuerDiscoveryOptions {
  /** The management API's origin, e.g. `https://api.kleora.io`, no trailing slash. */
  baseUrl: string
  userAgent: string
  fetch?: typeof globalThis.fetch
}

/**
 * `GET {baseUrl}/api/v1/platform` → its `issuer`, without a trailing slash.
 *
 * Every failure is a `ManagementApiUnreachable` naming the URL it asked, because
 * the only thing a person can do about any of them is check the base URL or
 * pass the issuer explicitly — and the message says both.
 */
export async function discoverIssuer({
  baseUrl,
  userAgent,
  fetch: fetchImpl = globalThis.fetch,
}: IssuerDiscoveryOptions): Promise<string> {
  const url = `${baseUrl}${PLATFORM_PATH}`
  const hint = 'Check the API base URL, or pass the issuer explicitly.'
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
    })
  } catch (error) {
    throw new ManagementApiUnreachable(`could not reach ${url} to find the issuer. ${hint}`, {
      cause: error,
    })
  }
  if (!response.ok) {
    throw new ManagementApiUnreachable(
      `${url} answered ${String(response.status)}, so the issuer is unknown. ${hint}`,
    )
  }

  let document: unknown
  try {
    document = await response.json()
  } catch {
    document = null
  }
  const issuer =
    typeof document === 'object' && document !== null
      ? (document as Record<string, unknown>)['issuer']
      : undefined
  if (typeof issuer !== 'string' || !isHttpUrl(issuer)) {
    throw new ManagementApiUnreachable(`${url} did not name an issuer. ${hint}`)
  }
  return issuer.replace(/\/+$/, '')
}

/**
 * The issuer to use, asked for at most once: `explicit` when given, otherwise
 * whatever `discoverIssuer` answers.
 *
 * Lazy on purpose. A command that never reaches the issuer — anything run
 * under an API key, `--help`, a usage error — makes no discovery request, and a
 * long-lived MCP server makes one per process rather than one per tool call. A
 * failed discovery is not remembered, so the next call asks again.
 */
export function issuerResolver(
  explicit: string | undefined,
  options: IssuerDiscoveryOptions,
): () => Promise<string> {
  if (explicit !== undefined) {
    const value = explicit
    return () => Promise.resolve(value)
  }
  let pending: Promise<string> | null = null
  return () => {
    pending ??= discoverIssuer(options).catch((error: unknown) => {
      pending = null
      throw error
    })
    return pending
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
