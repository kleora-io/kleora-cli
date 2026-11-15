# Changelog

`@kleora-io/core` and `@kleora-io/cli` are released together, from one
workflow. A release that changes only the CLI bumps only the CLI, so the two
versions can differ; each entry says which packages it covers.

## 0.1.2 — `@kleora-io/cli` only (`@kleora-io/core` stays 0.1.1)

### Fixed

- **`kleora logout` can no longer be undone by a refresh in flight.** The
  store read, the revocation at the issuer and the local delete now run holding
  the profile's credential lock (`CredentialStore.lock`, added in core 0.1.1),
  the same lock every refresh takes. Before, another process part-way through a
  refresh could finish after the delete and write its rotated refresh token
  back, leaving the profile signed in. Now the logout waits for that refresh,
  then revokes and deletes the token it stored. A failed revocation still
  deletes locally. (kleora-io/kleora#1098)

## 0.1.1

### Fixed

- **A concurrent refresh no longer signs you out.** Refresh tokens rotate, and
  two refreshes of one stored credential at once presented the same token
  twice — a replay the issuer answers by revoking the grant. `Session` now
  shares one in-flight refresh (and one device-flow start or poll) between
  concurrent calls, and holds a lock file beside the credential
  (`credentials-<profile>.lock` in the config directory) around every refresh,
  so two processes sharing one keychain entry or file take turns. A process
  that waited re-reads the store and uses the token the other one rotated to.
- **Logout takes effect in a running process on its next call.** Before a
  cached access token is used, the store is read; if the refresh token there
  is gone or has changed, the cached access token is dropped.

### Added

- `authorization_required` carries a `reason` — `no_credential`,
  `refresh_rejected` or `signed_out` — and its message says which. A rejected
  refresh names the OAuth error code, never a token.
- `CredentialStore.lock` (optional), `withFileLock`, `CredentialLockTimeout`
  and the `AuthorizationRequiredReason` type.
