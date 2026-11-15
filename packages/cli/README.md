# `@kleora-io/cli`

Manage a Kleora account from a terminal: Apps, environments, clients, users,
tenants, roles, permissions, invitations, API keys, signing keys, email
templates, and the audit log.

Kleora's documentation is at https://kleora.io/en/docs.

## Install

Node 20 or newer. Run it without installing:

```bash
npx @kleora-io/cli login
```

or install the `kleora` binary globally:

```bash
npm install -g @kleora-io/cli
kleora login
kleora whoami
```

`kleora login` prints a code and a URL; approve the sign-in in a browser and the
CLI stores the credential (see [below](#where-the-credential-lives)).
`kleora whoami` prints who you are signed in as, the account, your permissions
and where the credential is kept.

## In CI

There is no browser in CI, so the CLI reads an API key from the environment
instead. Create an API key for the environment in the console, store it in your
CI's secret store, and expose it as `KLEORA_API_KEY`:

```bash
export KLEORA_API_KEY=...   # from your CI's secret store, never from a file in the repository
kleora users list --environment <environment-id> --json
```

An API key is scoped to one environment, so account-level commands (`apps`,
the account audit log) answer `403` under one; the CLI says so up front.

## Usage

```
kleora <noun> <verb> [target] [flags]
```

Nouns are the management API's resources, plural, in the API's own words. Verbs
are `list`, `get`, `create`, `update`, `delete` plus each resource's own named
actions (`rotate-secret`, `revoke`, `rotate`, `promote`, `erase`, `resend`,
`reset`). **Nothing is aliased** — no `ls`, no `rm`, no singular nouns — so what
you learned on one noun is true of the next, and what you read in the API
reference is what you type.

Seven commands are about the tool rather than a resource: `login`, `logout`,
`whoami`, `version`, `doctor`, `completion`, `init`.

## Getting from nothing to a working sign-in

```bash
kleora login                 # prints a code and a URL; approve in a browser
kleora init --name "My app"  # creates an App, prints SDK configuration
```

`init` prints; it writes a file only with `--write <path>`, appends rather than
replaces, and never overwrites a key the file already has.

## The five things worth knowing

**Environments are named, never remembered.** Every environment-scoped command
takes `--app <slug>` with `--sandbox` or `--prod`, or `--environment <id>`.
Nothing is carried between invocations, and production is never the default.
Every write echoes its resolved target to stderr before acting.

**`--json` is the API's own body, byte for byte.** Data goes to stdout and
everything else to stderr, so `kleora users list --json | jq` needs no filter.
An older CLI against a newer API therefore passes through fields it has never
heard of.

**No credential is ever a flag.** There is no `--password`, no `--token`, no
`--api-key`; a secret in `argv` is in your shell history and in `ps` output for
every other process on the machine. For CI, set `KLEORA_API_KEY` in the
environment — that is what a secret store is for, and an API key's environment
scope is the point rather than a limitation. Under one, the CLI says so up front,
because every account-level command will answer `403`.

**Destructive commands ask, exactly as the console does.** Four require typing
the target back — `users erase`, `environments promote`, `environments update
--tenant-mode single`, `email-templates reset` — and `--yes` never satisfies one
of those. `signing-keys rotate` takes two named acknowledgement flags instead,
each stating a distinct consequence. With stdin not a terminal, nothing prompts
and nothing is assumed: the command fails with exit `2`, naming the flag it
needed.

**Exit codes are a contract.** `0` success, `2` usage, `3` sign in, `4`
forbidden, `5` not found (which on this API also means outside your scope), `6`
fix the request, `7` rate limited, `8` payment, `9` we could not ask at all,
`130` interrupted. The split a script needs is retry-later (7, 9) against
fix-the-request (2, 6) against fix-the-authority (3, 4) against pay (8).

## Where the credential lives

The OS keychain (service `kleora-cli`) where there is one, and a mode-`0600`
file under `~/.kleora-cli` otherwise — **never inside your project**, where a
careless `git add` would publish it. `kleora whoami` names which backend is in
use; `kleora doctor` lists the local files and their permission bits, never
their contents.

The CLI and the MCP server share the code that stores a credential and
deliberately not the credential itself: each is its own OAuth client, so revoking
the CLI on a machine you have lost does not also kill the agent in your editor.

## Shell completion

```bash
kleora completion bash >> ~/.bashrc
kleora completion zsh  >> ~/.zshrc
kleora completion fish > ~/.config/fish/completions/kleora.fish
```

The generated script makes no network request. It cannot: every noun, verb and
flag is baked in when you print it.

## Not here

`kleora listen` and everything webhook-shaped. Forwarding webhooks to a local
server is not built yet, and nothing we ship advertises a capability that is
not there. There is no stub and no "coming soon".

Also absent, on purpose: any command that needs an endpoint the management API
does not have; bulk membership administration behind one word (`--json` composes
with `xargs`, and the console is where somebody reviews the list before sending
it); a `--watch` on ordinary lists; and anything outside the management API's
surface.

## Development

See the [repository README](https://github.com/kleora-io/kleora-cli#development). In short:

```bash
pnpm install
pnpm build                                          # @kleora-io/core first, then the CLI
pnpm --filter @kleora-io/cli test
pnpm --filter @kleora-io/cli generate:operations    # re-download the API document
```

`src/generated/operations.ts` is generated from the management API's OpenAPI
document as https://api.kleora.io/api/v1/openapi.json serves it, and never
edited by hand. CI regenerates it and fails when the committed file differs.

Licensed under Apache-2.0; see `LICENSE`.
