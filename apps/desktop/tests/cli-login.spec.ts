/** Sign-in status and login for the CLIs other than the bundled Claude Code CLI. */

import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLI_COMMANDS, CommandCliLogin, cliEnvironment, cliSearchDirectories, parseJsonArrayStatus, resolveCliExecutable, terminalLauncher,
  type CliHost,
} from '../src/cli-login.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function tempHome(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-cli-login-')))
  roots.push(root)
  return root
}

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly unref = vi.fn()
  readonly kill = vi.fn(() => { this.emit('close', null); return true })
}

function fakeSpawn(child: FakeChild) {
  const calls: { command: string; args: readonly string[]; options: { env: NodeJS.ProcessEnv; detached?: boolean } }[] = []
  const factory = ((command: string, args: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
    calls.push({ command, args, options })
    return child
  }) as never as typeof spawn
  return { calls, factory }
}

const host = (home: string, platform: NodeJS.Platform = 'darwin'): CliHost =>
  ({ environment: { PATH: '/usr/bin', DSH_SECRET: 'x', HOME: home }, home, platform })

describe('resolveCliExecutable', () => {
  it('searches PATH, then the common and CLI-specific install directories', () => {
    const home = tempHome()
    expect(cliSearchDirectories(CLI_COMMANDS.grok, host(home)))
      .toEqual(['/usr/bin', '/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'), join(home, '.bun', 'bin'), join(home, '.npm-global', 'bin'), join(home, '.grok', 'bin')])
    const seen: string[] = []
    const found = resolveCliExecutable(CLI_COMMANDS.grok, host(home), (path) => { seen.push(path); return path === join(home, '.grok', 'bin', 'grok') })
    expect(found).toBe(join(home, '.grok', 'bin', 'grok'))
    expect(seen[0]).toBe('/usr/bin/grok')
    expect(resolveCliExecutable(CLI_COMMANDS.codex, host(home), () => false)).toBeUndefined()
  })

  it('tries Windows executable extensions without the POSIX install directories', () => {
    const home = tempHome()
    const seen: string[] = []
    resolveCliExecutable(CLI_COMMANDS.codex, host(home, 'win32'), (path) => { seen.push(path); return false })
    expect(seen.slice(0, 3)).toEqual(['/usr/bin/codex.exe', '/usr/bin/codex.cmd', '/usr/bin/codex'])
    expect(seen.some(path => path.startsWith('/opt/homebrew'))).toBe(false)
  })

  it('removes DSH-owned variables and puts the CLI directory first on PATH', () => {
    const home = tempHome()
    const environment = cliEnvironment('/opt/tools/codex', CLI_COMMANDS.codex, host(home))
    expect(environment.DSH_SECRET).toBeUndefined()
    expect(environment.HOME).toBe(home)
    expect(environment.PATH!.split(delimiter).slice(0, 2)).toEqual(['/opt/tools', '/usr/bin'])
  })
})

describe('CommandCliLogin status', () => {
  it('reports a CLI that is not installed as unavailable', async () => {
    expect(await new CommandCliLogin(CLI_COMMANDS.codex, undefined, host(tempHome())).status()).toEqual({ state: 'unavailable' })
  })

  it('reads the exit status of a status command', async () => {
    for (const [code, state] of [[0, 'signed-in'], [1, 'signed-out']] as const) {
      const child = new FakeChild()
      const { calls, factory } = fakeSpawn(child)
      const pending = new CommandCliLogin(CLI_COMMANDS.codex, '/bin/codex', host(tempHome()), factory).status()
      child.emit('close', code)
      expect(await pending).toEqual({ state })
      expect(calls[0]).toMatchObject({ command: '/bin/codex', args: ['login', 'status'] })
    }
  })

  it('reads a JSON credential list and treats a start failure as unavailable', async () => {
    const child = new FakeChild()
    const { factory } = fakeSpawn(child)
    const pending = new CommandCliLogin(CLI_COMMANDS.opencode, '/bin/opencode', host(tempHome()), factory).status()
    child.stdout.write('[{"id":"anthropic"}]')
    await new Promise(resolve => setImmediate(resolve))
    child.emit('close', 0)
    expect(await pending).toEqual({ state: 'signed-in' })
    const failing = new FakeChild()
    const failed = new CommandCliLogin(CLI_COMMANDS.opencode, '/bin/opencode', host(tempHome()), fakeSpawn(failing).factory).status()
    failing.emit('error', new Error('ENOENT'))
    expect(await failed).toEqual({ state: 'unavailable' })
  })

  it('treats a non-empty credential file as signed in', async () => {
    const home = tempHome()
    const login = new CommandCliLogin(CLI_COMMANDS.grok, '/bin/grok', host(home))
    expect(await login.status()).toEqual({ state: 'signed-out' })
    mkdirSync(join(home, '.grok'))
    writeFileSync(join(home, '.grok', 'auth.json'), '')
    expect(await login.status()).toEqual({ state: 'signed-out' })
    writeFileSync(join(home, '.grok', 'auth.json'), '{"token":"t"}')
    expect(await login.status()).toEqual({ state: 'signed-in' })
  })

  it('parses JSON credential lists', () => {
    expect(parseJsonArrayStatus('[]')).toEqual({ state: 'signed-out' })
    expect(parseJsonArrayStatus('{}')).toEqual({ state: 'unavailable' })
    expect(parseJsonArrayStatus('not json')).toEqual({ state: 'unavailable' })
  })
})

describe('CommandCliLogin sign-in', () => {
  it('runs a browser login, refuses a second one, and reports cancellation', async () => {
    const child = new FakeChild()
    const { calls, factory } = fakeSpawn(child)
    const login = new CommandCliLogin(CLI_COMMANDS.grok, '/bin/grok', host(tempHome()), factory)
    const pending = login.signIn()
    expect(calls[0]).toMatchObject({ command: '/bin/grok', args: ['login', '--oauth'] })
    expect(await login.signIn()).toBe('failed')
    expect(login.submitCode('code')).toBe(false)
    login.cancel()
    expect(await pending).toBe('cancelled')
    const second = new FakeChild()
    const retry = new CommandCliLogin(CLI_COMMANDS.codex, '/bin/codex', host(tempHome()), fakeSpawn(second).factory).signIn()
    second.emit('close', 0)
    expect(await retry).toBe('signed-in')
  })

  it('opens an interactive login in a detached terminal window', async () => {
    const child = new FakeChild()
    const { calls, factory } = fakeSpawn(child)
    const pending = new CommandCliLogin(CLI_COMMANDS.opencode, '/opt/my tools/opencode', host(tempHome()), factory).signIn()
    child.emit('spawn')
    expect(await pending).toBe('terminal')
    expect(child.unref).toHaveBeenCalledOnce()
    expect(calls[0]!.command).toBe('osascript')
    expect(calls[0]!.options.detached).toBe(true)
    expect(calls[0]!.args.at(-1)).toBe('tell application "Terminal" to do script "\'/opt/my tools/opencode\' \'auth\' \'login\'"')
  })

  it('builds terminal launchers for Windows and Linux', () => {
    expect(terminalLauncher('win32', 'C:\\Tools\\agy.exe', [])).toEqual({ command: 'cmd.exe', args: ['/d', '/c', 'start', '""', 'cmd.exe', '/k', '"C:\\Tools\\agy.exe"'], verbatim: true })
    expect(terminalLauncher('linux', '/usr/bin/agy', ['x'])).toEqual({ command: 'x-terminal-emulator', args: ['-e', '/usr/bin/agy', 'x'], verbatim: false })
    expect(terminalLauncher('darwin', '/a/it\'s', []).args.at(-1)).toBe('tell application "Terminal" to do script "\'/a/it\'\\\\\'\'s\'"')
  })
})
