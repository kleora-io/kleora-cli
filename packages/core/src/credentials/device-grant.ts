/**
 * The OAuth 2.0 device authorization grant (RFC 8628) against the issuer: the
 * credential both the CLI and the MCP server run on.
 */
import { ManagementApiUnreachable } from '../errors.js'

export interface DeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

export interface Tokens {
  accessToken: string
  refreshToken: string | undefined
  expiresIn: number
}

/** RFC 8628 section 3.2 / RFC 6749 section 5.2 error codes this module distinguishes. */
export type OAuthErrorCode =
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'other'

export class OAuthError extends Error {
  readonly code: OAuthErrorCode
  constructor(code: OAuthErrorCode, description: string | undefined) {
    super(description ?? code)
    this.name = 'OAuthError'
    this.code = code
  }
}

export interface DeviceGrantOptions {
  issuer: string
  clientId: string
  /**
   * `kleora-mcp/{version}` or `kleora-cli/{version}`. Passed in rather than
   * read from a constant here, because this module is shared and the whole
   * value of the two tools having their own OAuth client is that an audit event
   * can say which of them acted — a shared `User-Agent` would undo half of that
   * in the request log.
   */
  userAgent: string
  fetch: typeof globalThis.fetch
}

async function postForm(
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof globalThis.fetch,
  userAgent: string,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      body: new URLSearchParams(body),
    })
  } catch (error) {
    throw new ManagementApiUnreachable(`could not reach ${url}`, { cause: error })
  }

  let document: Record<string, unknown> = {}
  try {
    document = (await response.json()) as Record<string, unknown>
  } catch {
    // fall through with an empty document; the status code alone still tells
    // the caller something.
  }

  if (!response.ok) {
    const rawCode = typeof document['error'] === 'string' ? document['error'] : 'other'
    const code: OAuthErrorCode = isKnownCode(rawCode) ? rawCode : 'other'
    const description =
      typeof document['error_description'] === 'string' ? document['error_description'] : undefined
    throw new OAuthError(code, description)
  }
  return document
}

function isKnownCode(value: string): value is OAuthErrorCode {
  return [
    'authorization_pending',
    'slow_down',
    'access_denied',
    'expired_token',
    'invalid_grant',
    'unauthorized_client',
  ].includes(value)
}

/** RFC 8628 sections 3.1–3.2: `POST /oauth/device_authorization`. */
export async function startDeviceAuthorization({
  issuer,
  clientId,
  userAgent,
  fetch: fetchImpl,
}: DeviceGrantOptions): Promise<DeviceAuthorization> {
  const document = await postForm(
    `${issuer}/oauth/device_authorization`,
    { client_id: clientId },
    fetchImpl,
    userAgent,
  )
  return {
    deviceCode: requireString(document, 'device_code'),
    userCode: requireString(document, 'user_code'),
    verificationUri: requireString(document, 'verification_uri'),
    verificationUriComplete:
      typeof document['verification_uri_complete'] === 'string'
        ? document['verification_uri_complete']
        : requireString(document, 'verification_uri'),
    expiresIn: requireNumber(document, 'expires_in'),
    interval: typeof document['interval'] === 'number' ? document['interval'] : 5,
  }
}

/**
 * One poll of `POST /oauth/token` with
 * `urn:ietf:params:oauth:grant-type:device_code`. Throws `OAuthError` for
 * every RFC 8628 poll outcome that is not success — the caller
 * (`session.ts`) is what turns `authorization_pending` into "not an error,
 * this is the sign-in".
 */
export async function pollDeviceToken({
  issuer,
  clientId,
  deviceCode,
  userAgent,
  fetch: fetchImpl,
}: DeviceGrantOptions & { deviceCode: string }): Promise<Tokens> {
  const document = await postForm(
    `${issuer}/oauth/token`,
    {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: clientId,
    },
    fetchImpl,
    userAgent,
  )
  return tokensOf(document)
}

/** `grant_type=refresh_token`, for a stored credential. The refresh token rotates on every use. */
export async function refreshAccessToken({
  issuer,
  clientId,
  refreshToken,
  userAgent,
  fetch: fetchImpl,
}: DeviceGrantOptions & { refreshToken: string }): Promise<Tokens> {
  const document = await postForm(
    `${issuer}/oauth/token`,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId },
    fetchImpl,
    userAgent,
  )
  return tokensOf(document)
}

/**
 * RFC 7009 section 2.1: `POST /oauth/revoke` with the refresh token, which
 * revokes its whole rotation family and writes one
 * `refresh_token.revoked` audit event.
 *
 * This is the server-side half of "uninstalling leaves no live credential
 * behind": deleting the stored token alone would leave the
 * authorization itself alive and refreshable by anyone who had copied the
 * file. An unknown or already-dead token answers `200` with no effect
 * (RFC 7009 section 2.2), so calling this twice is not an error.
 */
export async function revokeRefreshToken({
  issuer,
  clientId,
  refreshToken,
  userAgent,
  fetch: fetchImpl,
}: DeviceGrantOptions & { refreshToken: string }): Promise<void> {
  await postForm(
    `${issuer}/oauth/revoke`,
    { token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId },
    fetchImpl,
    userAgent,
  )
}

function tokensOf(document: Record<string, unknown>): Tokens {
  return {
    accessToken: requireString(document, 'access_token'),
    refreshToken: typeof document['refresh_token'] === 'string' ? document['refresh_token'] : undefined,
    expiresIn: requireNumber(document, 'expires_in'),
  }
}

function requireString(document: Record<string, unknown>, key: string): string {
  const value = document[key]
  if (typeof value !== 'string') throw new ManagementApiUnreachable(`the issuer's response has no '${key}'`)
  return value
}

function requireNumber(document: Record<string, unknown>, key: string): number {
  const value = document[key]
  if (typeof value !== 'number') throw new ManagementApiUnreachable(`the issuer's response has no '${key}'`)
  return value
}
