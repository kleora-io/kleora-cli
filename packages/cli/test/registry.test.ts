/**
 * The command table's own rules, checked rather than remembered.
 *
 * The CLI's promise — "a customer can guess" — rests on three rules, and the
 * whole value of a table is that a rule can be enforced over all of it at once
 * instead of reviewed row by row. The most important one here: no command
 * anywhere accepts a password, token, client secret or API key as a flag
 * value, and **a test over the command metadata proves it**.
 */
import { describe, expect, it } from 'vitest'

import { COMMANDS, findCommand, nouns, operationFor, verbsFor } from '../src/commands/registry.js'
import { allowedFlags, GLOBAL_FLAGS, TARGET_FLAGS, TOOL_FLAGS } from '../src/commands/surface.js'
import { OPERATIONS } from '../src/generated/operations.js'

describe('every row names a real operation', () => {
  it.each(COMMANDS.map((command) => [`${command.noun} ${command.verb}`, command] as const))(
    '%s',
    (_label, command) => {
      expect(() => operationFor(command)).not.toThrow()
    },
  )

  it('never names the same noun and verb twice', () => {
    const seen = COMMANDS.map((command) => `${command.noun} ${command.verb}`)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('never maps two commands onto one operation', () => {
    const ids = COMMANDS.map((command) => command.operationId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('every path parameter is filled from somewhere', () => {
  // A path parameter with no source would build a URL with a literal `{id}` in
  // it, which the API answers 404 to — the single most confusing possible
  // failure, because the command looks right.
  it.each(COMMANDS.map((command) => [`${command.noun} ${command.verb}`, command] as const))(
    '%s',
    (_label, command) => {
      const operation = operationFor(command)
      const covered = new Set<string>([
        ...(command.environmentScoped ? ['environment_id'] : []),
        ...(command.flagParams ?? []).map((param) => param.pathParam),
        ...(command.positional?.pathParams ?? []),
      ])
      for (const param of operation.pathParams) {
        expect(covered, `${command.noun} ${command.verb} does not fill {${param}}`).toContain(param)
      }
      // And nothing is filled that the path does not have.
      for (const param of covered) {
        expect(operation.pathParams, `${command.noun} ${command.verb} fills an absent {${param}}`).toContain(
          param,
        )
      }
    },
  )

  it('declares environmentScoped exactly when the path carries {environment_id}', () => {
    for (const command of COMMANDS) {
      const operation = operationFor(command)
      expect(
        command.environmentScoped,
        `${command.noun} ${command.verb}: ${operation.path}`,
      ).toBe(operation.pathParams.includes('environment_id'))
    }
  })
})

describe('no flag anywhere carries a credential', () => {
  // A secret in `argv` is in the
  // shell history, in `ps` output for every other process on the machine, and
  // in the scrollback of the screenshot somebody pastes into a support ticket.
  const FORBIDDEN = [
    'password',
    'new-password',
    'current-password',
    'secret',
    'client-secret',
    'api-key',
    'key',
    'token',
    'access-token',
    'refresh-token',
    'credential',
  ]

  it.each(COMMANDS.map((command) => [`${command.noun} ${command.verb}`, command] as const))(
    '%s',
    (_label, command) => {
      for (const flag of allowedFlags(command)) {
        expect(FORBIDDEN, `--${flag} on ${command.noun} ${command.verb}`).not.toContain(flag)
      }
    },
  )

  it('holds for the seven tool commands too', () => {
    for (const [name, flags] of Object.entries(TOOL_FLAGS)) {
      for (const flag of [...flags, ...GLOBAL_FLAGS]) {
        expect(FORBIDDEN, `--${flag} on ${name}`).not.toContain(flag)
      }
    }
  })

  it('is not vacuous: the API really does accept a password on POST /users', () => {
    // The guarantee above is only worth something if the generator is dropping
    // a field that exists. If this ever fails because the API stopped taking a
    // password, the test above stops proving anything and this one says so.
    const raw = OPERATIONS['create_user_operation']
    expect(raw).toBeDefined()
    expect(raw?.fields.map((field) => field.name)).not.toContain('password')
    expect(raw?.fields.map((field) => field.name)).toContain('email')
  })
})

describe('nothing is aliased', () => {
  // No `ls`, no `rm`, no `kleora app` beside `kleora apps`. Aliases look like
  // generosity and cost predictability: once two spellings work, a person
  // cannot infer the third from either.
  it('has no short verb aliases', () => {
    const verbs = new Set(COMMANDS.map((command) => command.verb))
    for (const alias of ['ls', 'rm', 'mk', 'new', 'del', 'show', 'add', 'set']) {
      expect(verbs).not.toContain(alias)
    }
  })

  it('has only plural nouns', () => {
    for (const noun of nouns()) {
      expect(noun, `${noun} should be plural`).toMatch(/s$/)
    }
  })

  it('never has both a singular and a plural of the same noun', () => {
    const all = new Set(nouns())
    for (const noun of all) {
      expect(all, `${noun} and its singular both exist`).not.toContain(noun.replace(/s$/, ''))
    }
  })
})

describe('a verb means the same thing on every noun', () => {
  it('spells every GET-one as `get` and every POST-many as `create`', () => {
    for (const command of COMMANDS) {
      const operation = operationFor(command)
      if (command.verb === 'get') expect(operation.method).toBe('get')
      if (command.verb === 'list') expect(operation.method).toBe('get')
      if (command.verb === 'create') expect(operation.method).toBe('post')
      if (command.verb === 'update') expect(['patch', 'put']).toContain(operation.method)
      if (command.verb === 'delete') expect(operation.method).toBe('delete')
    }
  })

  it('gives every `list` a column set and a cursor, and nothing else one', () => {
    for (const command of COMMANDS) {
      expect(command.columns !== undefined, `${command.noun} ${command.verb}`).toBe(
        command.verb === 'list',
      )
    }
  })

  it('offers --all on every list and nowhere else', () => {
    for (const command of COMMANDS) {
      expect(allowedFlags(command).has('all'), `${command.noun} ${command.verb}`).toBe(
        command.verb === 'list',
      )
    }
  })

  it('never marks a read destructive', () => {
    for (const command of COMMANDS) {
      if (operationFor(command).method === 'get') {
        expect(command.confirm, `${command.noun} ${command.verb}`).toBeUndefined()
      }
    }
  })
})

describe('the four typed confirmations are the console\'s four', () => {
  // The console's typed confirmations: `users erase` (the user's name),
  // `environments promote` (the production issuer host), `environments update
  // --tenant-mode single` (the environment's issuer host), `email-templates
  // reset` (the template's {kind}/{locale}).
  const typed = COMMANDS.filter((command) => command.confirm?.kind === 'typed')

  it('is exactly those four commands', () => {
    expect(typed.map((command) => `${command.noun} ${command.verb}`).sort()).toEqual([
      'email-templates reset',
      'environments promote',
      'environments update',
      'users erase',
    ])
  })

  it('knows how to resolve the string each one wants', () => {
    for (const command of typed) {
      expect(command.confirmExpected, `${command.noun} ${command.verb}`).toBeDefined()
    }
  })

  it('makes `environments update` typed only for the tenant-mode switch', () => {
    const command = findCommand('environments', 'update')
    expect(command?.confirmWhen).toEqual({ flag: 'tenant-mode', equals: 'single' })
  })

  it('asks for the *production* host on promote, not the sandbox one it addresses', () => {
    expect(findCommand('environments', 'promote')?.confirmExpected).toEqual({
      from: 'production-issuer-host',
    })
  })
})

describe('signing-key rotation asks two questions, not for a kid', () => {
  // As in the console: a `kid` is a long random string with no
  // meaning to the person reading it, so retyping it is transcription rather
  // than deliberation.
  const rotate = findCommand('signing-keys', 'rotate')

  it('uses two named acknowledgements', () => {
    expect(rotate?.confirm?.kind).toBe('acknowledge')
    if (rotate?.confirm?.kind !== 'acknowledge') throw new Error('unreachable')
    expect(rotate.confirm.acknowledgements.map((ack) => ack.flag)).toEqual([
      'ack-jwks-window',
      'ack-no-pinning',
    ])
  })

  it('never asks for the kid', () => {
    expect([...allowedFlags(rotate!)]).not.toContain('kid')
  })
})

describe('the deferred half is absent, not stubbed', () => {
  // Webhook forwarding (`kleora listen`) is not built yet, and nothing we ship
  // may advertise a capability that is not there. The API's stream endpoint
  // exists, so this is the only thing stopping a half-built command reaching
  // `--help`.
  it('has no webhook noun and no listen command', () => {
    expect(nouns()).not.toContain('webhooks')
    expect(nouns()).not.toContain('webhook-endpoints')
    expect(COMMANDS.map((command) => command.verb)).not.toContain('listen')
    expect(COMMANDS.map((command) => command.verb)).not.toContain('forward')
  })

  it('maps no command onto the streaming endpoint', () => {
    expect(COMMANDS.map((command) => command.operationId)).not.toContain('stream_webhook_events')
  })
})

describe('an environment-scoped command accepts the target flags', () => {
  it.each(COMMANDS.filter((command) => command.environmentScoped).map((c) => [`${c.noun} ${c.verb}`, c] as const))(
    '%s',
    (_label, command) => {
      for (const flag of TARGET_FLAGS) expect(allowedFlags(command)).toContain(flag)
    },
  )

  it('does not offer them where there is no environment to name', () => {
    for (const command of COMMANDS.filter((entry) => !entry.environmentScoped)) {
      expect(allowedFlags(command), `${command.noun} ${command.verb}`).not.toContain('sandbox')
    }
  })
})

describe('every noun has at least a list or a get', () => {
  it.each(nouns())('%s', (noun) => {
    const verbs = verbsFor(noun).map((command) => command.verb)
    expect(verbs.some((verb) => verb === 'list' || verb === 'get')).toBe(true)
  })
})
