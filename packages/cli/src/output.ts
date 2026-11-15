/**
 * Where bytes go, and which stream they go to.
 *
 * Two rules, and each is a bug somebody has met in another tool:
 *
 * **Data goes to stdout; everything else goes to stderr** — the resolved
 * target, prompts, progress, warnings, the API-key notice. `kleora users list
 * --json | jq` must work without a filter for our own chatter, and it does
 * because none of it is on that stream.
 *
 * It uses colour and box characters only when stdout is a TTY, and no spinner,
 * progress bar or cursor movement when it is not — captured output that is
 * full of escape sequences is the single most common way a CLI's log becomes
 * unreadable.
 *
 * Everything is behind an injected `Io` rather than `console` and
 * `process.stdout`, which is what lets the whole CLI be tested without a
 * terminal: a test passes a recording `Io` and asserts on the two streams
 * separately, which is the only way to check the rule above holds.
 */

export interface Io {
  /** Data. Nothing else, ever. */
  out(text: string): void
  /** Everything that is not data: targets, prompts, warnings, progress, errors. */
  err(text: string): void
  /** Whether stdout is a terminal — decides colour and box characters. */
  readonly stdoutIsTty: boolean
  /** Whether stdin is a terminal — decides whether a prompt is possible at all. */
  readonly stdinIsTty: boolean
  /** One line from stdin, or `null` at end of input. Only ever called when `stdinIsTty`. */
  readLine(prompt: string): Promise<string | null>
}

/** A `Io` that records instead of printing — the test double, and the only one. */
export class RecordingIo implements Io {
  readonly stdout: string[] = []
  readonly stderr: string[] = []
  stdoutIsTty: boolean
  stdinIsTty: boolean
  /** Answers handed to successive `readLine` calls. */
  answers: string[]

  constructor(options: { stdoutIsTty?: boolean; stdinIsTty?: boolean; answers?: string[] } = {}) {
    this.stdoutIsTty = options.stdoutIsTty ?? false
    this.stdinIsTty = options.stdinIsTty ?? false
    this.answers = options.answers ?? []
  }

  out(text: string): void {
    this.stdout.push(text)
  }

  err(text: string): void {
    this.stderr.push(text)
  }

  readLine(prompt: string): Promise<string | null> {
    this.stderr.push(prompt)
    const next = this.answers.shift()
    return Promise.resolve(next ?? null)
  }

  /** Everything written to stdout, joined — what a pipe would have received. */
  get stdoutText(): string {
    return this.stdout.join('')
  }

  get stderrText(): string {
    return this.stderr.join('')
  }
}

/**
 * `--json` output: the response body, as it arrived, and a newline.
 *
 * Not `JSON.stringify(JSON.parse(text))`: printing the body as it arrived,
 * rather than a re-serialisation of a parsed object, is what lets an older CLI
 * against a newer API pass through fields it has never heard of. A typed
 * client that re-emitted its own model would silently drop them, and a
 * customer would conclude the API does not return what its documentation
 * says.
 */
export function printJson(io: Io, body: string): void {
  io.out(body.endsWith('\n') ? body : `${body}\n`)
}

/** A JSON document this CLI composed itself (`whoami`, `doctor`, `login --device-code-only`). */
export function printOwnJson(io: Io, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`)
}

export interface Column {
  readonly header: string
  /** Dotted path into the row: `environment.kind`, `id`. */
  readonly path: string
}

/**
 * A left-aligned table, with a header row, padded to the widest cell.
 *
 * Box characters only on a TTY. On a pipe the separator is
 * plain `-` so that the captured text stays greppable — and a person who pipes
 * a human table into a file has usually done it by accident and still needs to
 * read it.
 */
export function printTable(io: Io, columns: readonly Column[], rows: readonly unknown[]): void {
  if (rows.length === 0) {
    io.err('No rows.\n')
    return
  }
  const cells = rows.map((row) => columns.map((column) => cell(row, column.path)))
  const widths = columns.map((column, index) =>
    Math.max(column.header.length, ...cells.map((line) => (line[index] ?? '').length)),
  )
  const rule = io.stdoutIsTty ? '─' : '-'

  io.out(`${columns.map((column, i) => pad(column.header, widths[i] ?? 0)).join('  ').trimEnd()}\n`)
  io.out(`${widths.map((width) => rule.repeat(width)).join('  ')}\n`)
  for (const line of cells) {
    io.out(`${line.map((value, i) => pad(value, widths[i] ?? 0)).join('  ').trimEnd()}\n`)
  }
}

/** An aligned key/value block — the single-object rendering. */
export function printObject(io: Io, value: unknown, keys?: readonly string[]): void {
  if (typeof value !== 'object' || value === null) {
    io.out(`${String(value)}\n`)
    return
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key]) => keys === undefined || keys.includes(key),
  )
  if (entries.length === 0) {
    io.err('Nothing to show.\n')
    return
  }
  const width = Math.max(...entries.map(([key]) => key.length))
  for (const [key, item] of entries) {
    io.out(`${pad(key, width)}  ${scalar(item)}\n`)
  }
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

function cell(row: unknown, path: string): string {
  let current: unknown = row
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return ''
    current = (current as Record<string, unknown>)[segment]
  }
  return scalar(current)
}

/**
 * One cell's text.
 *
 * An object gets a **label**, not its JSON. The audit log is what forced this:
 * `actor.display` is an `AuditDisplay` object, and `JSON.stringify` turned the
 * `ACTOR` and `TARGET` columns into 90-character blobs that made the table
 * unreadable — found by running `audit list` against a real environment.
 *
 * A column is a label by definition; anything that wants the whole object
 * asks for `--json`, where it arrives unmodified. So the first identifying
 * member wins, and an object with none of them is named as an object rather
 * than dumped as one.
 */
function scalar(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(scalar).join(', ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['name', 'email', 'slug', 'display', 'kid', 'id']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate !== '') return candidate
      if (typeof candidate === 'object' && candidate !== null) {
        const nested = scalar(candidate)
        if (nested !== '{…}') return nested
      }
    }
    return '{…}'
  }
  // A `symbol`, a `function` or a `bigint`: nothing this API returns, and
  // `String()` on the first two is a `TypeError` or `[object Object]`.
  return typeof value === 'bigint' ? value.toString() : `<${typeof value}>`
}
