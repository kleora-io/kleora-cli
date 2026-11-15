/**
 * `@kleora-io/core`: the part of the Kleora MCP server that was never
 * MCP-shaped, extracted so that the MCP server and the CLI share one
 * implementation of it.
 *
 * That is a correctness requirement rather than tidiness: the thing that
 * would drift between two copies is **where a refresh token is written**, and
 * a credential the tool that created it can no longer find is a credential
 * nobody can revoke.
 *
 * What is here: the credential store, the device-grant client, issuer
 * discovery, the in-memory session, the generic `ManagementClient` over an
 * operation, and the problem types. What is deliberately *not* here: anything
 * that knows it is talking to an LLM host or to a terminal. The two tools keep
 * their own configuration, their own `User-Agent`, their own Client row, their
 * own keychain service and their own config directory — they share the code,
 * never a stored credential.
 */
export {
  ApiError,
  AuthorizationDenied,
  ManagementApiUnreachable,
  KleoraToolError,
  type ProblemDetails,
} from './errors.js'

export {
  createCredentialStore,
  defaultConfigDir,
  FileCredentialStore,
  type CredentialStore,
  type CredentialStoreOptions,
} from './credentials/store.js'

export {
  OAuthError,
  pollDeviceToken,
  refreshAccessToken,
  revokeRefreshToken,
  startDeviceAuthorization,
  type DeviceAuthorization,
  type DeviceGrantOptions,
  type OAuthErrorCode,
  type Tokens,
} from './credentials/device-grant.js'

export {
  discoverIssuer,
  issuerResolver,
  PLATFORM_PATH,
  type IssuerDiscoveryOptions,
} from './credentials/issuer.js'

export {
  Session,
  SessionNotReady,
  type NotReadyState,
  type SessionOptions,
  type SessionState,
} from './credentials/session.js'

export {
  ManagementClient,
  retryAfterSeconds,
  type CallOptions,
  type ManagementClientOptions,
  type Operation,
  type OperationArgs,
  type RawResponse,
  type RequestTrace,
} from './management-client.js'
