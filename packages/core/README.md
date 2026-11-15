# `@kleora-io/core`

The code the Kleora CLI ([`@kleora-io/cli`](../cli)) and the Kleora MCP server
(`@kleora-io/mcp`) share:

- **the credential store**: the refresh token in the OS keychain (through the
  optional `@napi-rs/keyring`), falling back to a mode-`0600` file under the
  user's config directory. Never an environment variable, never a command-line
  argument;
- **the device-grant client** (RFC 8628): start an authorization, poll for the
  token, refresh it, revoke it (RFC 7009);
- **issuer discovery**: the issuer a device grant runs against is what the
  deployment reports at `GET /api/v1/platform`, unless one is given explicitly;
- **the session**: one profile's credential lifecycle, with the access token
  held in memory only. Concurrent calls share one refresh, a lock file beside
  the credential serialises refreshes across processes, and a credential
  removed from the store (a logout) stops the cached access token being used
  on the next call;
- **a generic management API client**: a thin `fetch` wrapper that calls one
  operation of the management API with the caller's own bearer token, with
  bounded `Retry-After` handling and a cap on concurrent requests;
- **the error types** both tools throw and render, including the RFC 9457
  problem document as `ApiError`.

Each tool keeps its own configuration, `User-Agent`, OAuth client, keychain
service and config directory. They share the code, never a stored credential.

This is a library for building Kleora's own local tools. If you are integrating
Kleora into an application, you want one of the SDKs instead
(`@kleora-io/node`, `@kleora-io/browser`, `@kleora-io/nuxt`); Kleora's
documentation is at https://kleora.io/en/docs.

## Install

```bash
npm install @kleora-io/core
```

Node 20 or newer, ESM only.

## Versioning

`@kleora-io/core` and `@kleora-io/cli` are released together from
[`kleora-io/kleora-cli`](https://github.com/kleora-io/kleora-cli) and carry the
same version.

Licensed under Apache-2.0; see `LICENSE`.
