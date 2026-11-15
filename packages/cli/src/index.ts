/**
 * The binary. `bin.kleora` and `bin.kleora-auth` in `package.json` point
 * here.
 *
 * Everything below is a shim: it gathers the real world — `process.argv`,
 * `process.env`, the two streams, `fetch`, the working directory, a readline —
 * and hands them to `cli.ts`, which returns an exit code. That split is what
 * makes the CLI testable, and `cli.ts` is where the reasoning lives.
 *
 * The `SIGINT` handler is the one behaviour worth having here rather than
 * there: the exit-code table gives `130` to an interrupt, the shell
 * convention, and a command interrupted mid-write "may have landed" — which is
 * why the message says so instead of claiming nothing happened.
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { run } from './cli.js'
import { EXIT } from './exit.js'
import type { Io } from './output.js'

const io: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  stdoutIsTty: process.stdout.isTTY === true,
  stdinIsTty: process.stdin.isTTY === true,
  readLine: (prompt) =>
    new Promise((resolve) => {
      // Output goes to stderr, input comes from stdin: a prompt on stdout would
      // land in the middle of whatever a pipe is collecting.
      const rl = createInterface({ input: process.stdin, output: process.stderr })
      rl.question(prompt, (answer) => {
        rl.close()
        resolve(answer)
      })
    }),
}

/**
 * `kleora login --open`'s opener.
 *
 * It lives here rather than in `cli.ts` for the same reason every other side
 * effect does — a test must never spawn a browser — but it does have to exist:
 * the flag is in `--help`, and a flag that prints "not available in this build"
 * is the same failure as a command that advertises a capability it does not
 * have.
 *
 * `spawn` with the URL as its own argv element, never a shell string: the URL
 * comes from the issuer's response, and a shell would make that a place to put
 * a semicolon. Detached, with stdio ignored and `unref()`, so the CLI's own
 * poll loop is not holding a browser process open and nothing can block on a
 * child's output.
 */
function openUrl(url: string): void {
  const [command, ...args] =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url]
  if (command === undefined) return
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    // A browser that could not be launched is not a reason to fail a sign-in
    // that is otherwise proceeding — the URL is already on the screen.
    child.on('error', () => {
      process.stderr.write(`Could not launch a browser (${command}); open the URL above yourself.\n`)
    })
    child.unref()
  } catch {
    process.stderr.write(`Could not launch a browser (${command}); open the URL above yourself.\n`)
  }
}

process.on('SIGINT', () => {
  process.stderr.write(
    '\nInterrupted. If a write was in flight it may still have landed — read the\n' +
      'resource back before assuming either way.\n',
  )
  process.exit(EXIT.INTERRUPTED)
})

run({
  argv: process.argv.slice(2),
  env: process.env,
  io,
  fetch: globalThis.fetch,
  cwd: process.cwd(),
  openUrl,
})
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    // `run` is written not to throw, so reaching here is a bug in this CLI
    // rather than anything the API did. Say that, rather than dressing it up.
    process.stderr.write(
      `✗ kleora crashed: ${error instanceof Error ? error.stack : String(error)}\n`,
    )
    process.exitCode = EXIT.UNEXPECTED
  })
