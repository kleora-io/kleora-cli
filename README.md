# kleora-cli

The Kleora CLI and the library it shares with the Kleora MCP server. Two npm
packages, released together from `kleora-io/kleora-cli`:

| Package | What it is |
| --- | --- |
| [`@kleora-io/cli`](packages/cli) | The `kleora` command: manage Apps, environments, clients, users, tenants, roles, API keys, signing keys, email templates and the audit log from a terminal, through Kleora's management API. |
| [`@kleora-io/core`](packages/core) | The credential store, device-grant client, issuer discovery, in-memory session and generic management API client shared by the CLI and the MCP server. |

Kleora's documentation is at https://kleora.io/en/docs.

## Quick start

```bash
npx @kleora-io/cli login     # prints a code and a URL; approve in a browser
npx @kleora-io/cli whoami    # who you are, and where the credential is kept
```

Or install the `kleora` binary with `npm install -g @kleora-io/cli`. In CI, set
`KLEORA_API_KEY` from your secret store instead of signing in. See
[`packages/cli/README.md`](packages/cli/README.md) for the rest.

## Development

Node 20 or newer and pnpm (the version is pinned in `package.json`'s
`packageManager`; `corepack enable` picks it up).

```bash
pnpm install
pnpm build        # builds @kleora-io/core first: the CLI imports its build
pnpm lint
pnpm typecheck
pnpm test
```

Build before linting, type-checking or testing: the CLI consumes
`@kleora-io/core` through its published entry point (`dist/`), exactly as it
will from npm.

### The generated operation table

`packages/cli/src/generated/operations.ts` describes every operation of the
management API: its method, path, parameters and the body fields a command may
expose as flags. It is generated, never edited by hand, from the OpenAPI
document Kleora's deployment serves:

```bash
pnpm generate:operations
```

That downloads https://api.kleora.io/api/v1/openapi.json
(`MANAGEMENT_OPENAPI_URL` overrides it), writes it to
`openapi/management-v1.json` with its keys sorted, and regenerates the table.
Both files are committed. CI runs the same command and fails when either
differs from what is committed, so a change to the deployed API shows up as a
red check rather than as a CLI that silently disagrees with the server.

## Releasing

`.github/workflows/release.yml` is started by hand (`workflow_dispatch`) and
publishes to npm through trusted publishing, so no npm token exists anywhere.
It runs in the `npm` environment, which needs a maintainer's approval. It
builds and tests, then publishes `@kleora-io/core` before `@kleora-io/cli`
(the CLI depends on it), skipping any package whose version is already on npm,
so a re-run after a partial failure is safe.

To release: bump `version` in both `packages/*/package.json` and the literal in
`packages/cli/src/version.ts` (a test holds the two equal), merge to `main`,
then run the workflow.

## License

Apache-2.0; see [`LICENSE`](LICENSE).
