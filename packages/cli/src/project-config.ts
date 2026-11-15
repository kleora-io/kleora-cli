/**
 * `kleora.toml` — a project's App slug and default environment kind, and
 * **never a credential of any kind**.
 *
 * Two limits on it, both because ambient state drifts:
 *
 * > a production target is never taken from the file, only from an explicit
 * > flag on the command; and the resolved target is echoed whether it came from
 * > a flag or a file, so a stale file is visible rather than silent.
 *
 * A hand-written reader rather than a TOML dependency. The file this CLI reads
 * has two keys, both bare strings at the top level, and a parser for that is
 * twenty lines — where a dependency is a supply-chain surface on a tool that
 * holds a person's credential. Anything richer than two keys is ignored rather
 * than rejected, so a file that grows a section for something else still works.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, parse as parsePath } from 'node:path'

export interface ProjectConfig {
  /** Where it was found, for the echoed target line. */
  readonly path: string
  readonly app: string | undefined
  /**
   * `sandbox` only. A `production` value is read and **discarded** with a
   * warning: a production target is never taken from a file, and
   * silently ignoring it would be worse than saying so.
   */
  readonly env: 'sandbox' | undefined
  /** Set when the file named `production`, so the caller can warn. */
  readonly rejectedEnv: string | undefined
}

export interface ProjectConfigSearch {
  /** Where to start looking; each parent is tried in turn. */
  readonly from: string
  readonly readFile?: (path: string) => string
}

const FILENAME = 'kleora.toml'

/**
 * Walks up from `from` to the filesystem root, returning the first
 * `kleora.toml` that parses.
 *
 * Upward, because a developer runs `kleora` from wherever they happen to be
 * inside a repository and the file belongs beside the repository's other
 * project files.
 */
export function findProjectConfig({
  from,
  readFile = (path) => readFileSync(path, 'utf8'),
}: ProjectConfigSearch): ProjectConfig | null {
  let dir = from
  const root = parsePath(from).root
  for (;;) {
    const path = join(dir, FILENAME)
    let text: string
    try {
      text = readFile(path)
    } catch {
      if (dir === root) return null
      const parent = dirname(dir)
      if (parent === dir) return null
      dir = parent
      continue
    }
    return parseProjectConfig(path, text)
  }
}

/** The two keys, and nothing else. Exported for its own test. */
export function parseProjectConfig(path: string, text: string): ProjectConfig {
  let app: string | undefined
  let env: 'sandbox' | undefined
  let rejectedEnv: string | undefined
  let inTopLevel = true

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    if (line.startsWith('[')) {
      // A table header. Everything this reader wants is at the top level, so
      // once a section opens, nothing further is ours.
      inTopLevel = false
      continue
    }
    if (!inTopLevel) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = unquote(line.slice(eq + 1).trim())
    if (value === undefined) continue
    if (key === 'app') app = value
    else if (key === 'env' || key === 'environment') {
      if (value === 'sandbox') env = 'sandbox'
      else rejectedEnv = value
    }
  }

  return { path, app, env, rejectedEnv }
}

/** `"acme"` → `acme`; `acme # a comment` → `acme`; anything empty → `undefined`. */
function unquote(value: string): string | undefined {
  const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : null
  if (quote !== null) {
    const end = value.indexOf(quote, 1)
    return end === -1 ? undefined : value.slice(1, end)
  }
  const bare = (value.split('#')[0] ?? '').trim()
  return bare === '' ? undefined : bare
}
