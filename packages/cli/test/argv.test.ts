/**
 * Argument parsing, and the version literal.
 *
 * The parser is small and has no dependency, which is exactly why it wants a
 * test: every one of these cases is a shape somebody types, and the ones that
 * matter are where "you forgot a value" and "you meant true" have to stay
 * different answers.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { Flags, parseArgv } from '../src/argv.js'
import { loadConfig } from '../src/config.js'
import { CliFailure } from '../src/exit.js'
import { USER_AGENT, VERSION } from '../src/version.js'

function flagsOf(...argv: string[]): Flags {
  return new Flags(parseArgv(argv))
}

describe('parseArgv', () => {
  it('splits positionals from flags', () => {
    const parsed = parseArgv(['users', 'get', 'u1', '--app', 'acme', '--json'])
    expect(parsed.positionals).toEqual(['users', 'get', 'u1'])
    expect(parsed.flags).toEqual([
      { name: 'app', value: 'acme' },
      { name: 'json', value: null },
    ])
  })

  it('accepts both --flag value and --flag=value', () => {
    expect(flagsOf('--app', 'acme').value('app')).toBe('acme')
    expect(flagsOf('--app=acme').value('app')).toBe('acme')
  })

  it('does not read the next flag as a value', () => {
    const flags = flagsOf('--json', '--profile', 'work')
    expect(flags.boolean('json')).toBe(true)
    expect(flags.value('profile')).toBe('work')
  })

  it('passes everything after `--` through as a positional, verbatim', () => {
    // Which is what lets a `--confirm` string or a search term begin with `-`.
    const parsed = parseArgv(['users', 'list', '--q', '--', '--weird-name'])
    expect(parsed.positionals).toEqual(['users', 'list', '--weird-name'])
  })

  it('keeps `=` inside a value', () => {
    expect(flagsOf('--metadata={"a":"b=c"}').value('metadata')).toBe('{"a":"b=c"}')
  })

  it('keeps every value of a repeated flag, in order', () => {
    expect(flagsOf('--x', 'a', '--x', 'b', '--x=c').values('x')).toEqual(['a', 'b', 'c'])
  })
})

describe('Flags.value', () => {
  it('is undefined when absent', () => {
    expect(flagsOf('--json').value('app')).toBeUndefined()
  })

  it('refuses a flag given twice rather than picking one', () => {
    // Guessing which half they meant is exactly the mistake that naming the
    // environment on every command exists to prevent.
    expect(() => flagsOf('--env', 'sandbox', '--env', 'production').value('env')).toThrow(CliFailure)
  })

  it('says "needs a value" rather than reading it as true', () => {
    expect(() => flagsOf('--app').value('app')).toThrowError(/needs a value/)
  })
})

describe('Flags.boolean', () => {
  it('reads --x as true, --no-x as false, and absence as undefined', () => {
    expect(flagsOf('--x').boolean('x')).toBe(true)
    expect(flagsOf('--no-x').boolean('x')).toBe(false)
    expect(flagsOf().boolean('x')).toBeUndefined()
  })

  it('accepts --x=false, which is what a script building a command line writes', () => {
    expect(flagsOf('--x=false').boolean('x')).toBe(false)
    expect(flagsOf('--x=true').boolean('x')).toBe(true)
  })

  it('refuses --x and --no-x together', () => {
    expect(() => flagsOf('--x', '--no-x').boolean('x')).toThrow(CliFailure)
  })

  it('refuses a value that is neither true nor false', () => {
    expect(() => flagsOf('--x=maybe').boolean('x')).toThrowError(/takes no value/)
  })
})

describe('configuration', () => {
  it('derives no issuer from the API host, and asks the API for it instead', async () => {
    // No label swap and no hard-coded exception: the hosted API (kleora.io)
    // and its issuers (kleora.eu) share no domain.
    const asked: string[] = []
    const fetchMock = vi.fn((url: string | URL) => {
      asked.push(String(url))
      return Promise.resolve(Response.json({ issuer: 'https://login.elsewhere.test' }))
    })
    const config = loadConfig(
      flagsOf(),
      { KLEORA_BASE_URL: 'https://api.kleora.io' },
      fetchMock as unknown as typeof fetch,
    )

    expect(config.issuer).toBeUndefined()
    await expect(config.resolveIssuer()).resolves.toBe('https://login.elsewhere.test')
    expect(asked).toEqual(['https://api.kleora.io/api/v1/platform'])
  })

  it('an explicit issuer wins, from a flag or the environment, and asks nothing', async () => {
    const fetchMock = vi.fn()
    const fromFlag = loadConfig(
      flagsOf('--issuer', 'http://id.localhost:8080/'),
      { KLEORA_ISSUER: 'https://ignored.test' },
      fetchMock,
    )
    const fromEnv = loadConfig(
      flagsOf(),
      { KLEORA_ISSUER: 'https://sso.example.internal' },
      fetchMock,
    )

    await expect(fromFlag.resolveIssuer()).resolves.toBe('http://id.localhost:8080')
    await expect(fromEnv.resolveIssuer()).resolves.toBe('https://sso.example.internal')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets flags win over the environment', () => {
    const config = loadConfig(flagsOf('--profile', 'work'), {
      KLEORA_PROFILE: 'personal',
      KLEORA_BASE_URL: 'https://api.example.test',
    })
    expect(config.profile).toBe('work')
    expect(config.baseUrl).toBe('https://api.example.test')
  })

  it('reads KLEORA_API_KEY from the environment and nothing else credential-shaped', () => {
    const config = loadConfig(flagsOf(), {
      KLEORA_API_KEY: 'kl_test_x',
      KLEORA_TOKEN: 'nope',
      KLEORA_REFRESH_TOKEN: 'nope',
      KLEORA_PASSWORD: 'nope',
    })
    expect(config.apiKey).toBe('kl_test_x')
    expect(JSON.stringify(config)).not.toContain('nope')
  })

  it('treats an empty environment variable as absent', () => {
    expect(loadConfig(flagsOf(), { KLEORA_API_KEY: '' }).apiKey).toBeUndefined()
    expect(loadConfig(flagsOf(), { KLEORA_PROFILE: '' }).profile).toBe('default')
  })

  it('refuses a base URL that is not absolute http(s)', () => {
    expect(() => loadConfig(flagsOf('--base-url', 'api.example.test'), {})).toThrow(CliFailure)
    expect(() => loadConfig(flagsOf('--base-url', 'ftp://api.example.test'), {})).toThrow(CliFailure)
  })
})

describe('the version literal', () => {
  it('equals the manifest, so the two cannot drift silently', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string; name: string }
    expect(VERSION).toBe(manifest.version)
    expect(manifest.name).toBe('@kleora-io/cli')
  })

  it('identifies this package in User-Agent, not an SDK', () => {
    expect(USER_AGENT).toBe(`kleora-cli/${VERSION}`)
  })

  it('is not tied to the SDK version set', () => {
    // The CLI versions independently of the SDKs: a fix to a help string must
    // not force a major bump of `@kleora-io/browser`. So this literal must
    // never become an import from a shared constant, and this test is what says
    // so out loud.
    const source = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
    expect(source).toContain("export const VERSION = '")
    // No `import` statement at all: the version cannot arrive from anywhere
    // else, which is the property the decision above actually needs.
    expect(source.split('\n').filter((line) => /^\s*import\b/.test(line))).toEqual([])
  })
})
