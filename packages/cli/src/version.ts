/**
 * The version this CLI reports in `User-Agent` and from `kleora version`.
 *
 * **It is not the SDKs' version.** The CLI versions independently of the
 * SDKs: a fix to a help string must not force a major bump of
 * `@kleora-io/browser`, and a customer pinning an SDK must not have to reason
 * about a terminal tool. It versions together with `@kleora-io/core`, which
 * is released from the same repository.
 *
 * A literal rather than a `package.json` import: `verbatimModuleSyntax` and
 * `moduleResolution: bundler` make a JSON import a build-tool detail this file
 * should not carry, and a unit test asserts it equals the manifest so the two
 * cannot drift silently.
 */
export const VERSION = '0.1.0'

/** `kleora-cli/{version}`, sent with every request this CLI makes. */
export const USER_AGENT = `kleora-cli/${VERSION}`
