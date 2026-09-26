/** Claude Code sign-in status and browser login through the runtime's bundled CLI. */

import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeCodeLogin, claudeCodeEnvironment, claudeCodeExecutable, parseClaudeCodeStatus } from '../src/claude-code-login.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function writePackage(directory: string, name: string, exports?: object): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...exports === undefined ? {} : { exports } }))
}

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stdin = new PassThrough()
  readonly kill = vi.fn(() => { this.emit('close', null); return true })
}

function fakeSpawn(child: FakeChild) {
  const calls: { command: string; args: readonly string[]; env: NodeJS.ProcessEnv }[] = []
  const factory = ((command: string, args: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
    calls.push({ command, args, env: options.env })
    return child
  }) as never as typeof spawn
  return { calls, factory }
}

describe('claudeCodeExecutable', () => {
  it('resolves the SDK platform CLI next to the Claude Code route and rewrites ASAR paths', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-claude-code-')))
    roots.push(root)
    const modules = join(root, 'app.asar', 'dsh', 'node_modules')
    writePackage(join(modules, '@deepseek-ai', 'dsh-llm-claude-code'), '@deepseek-ai/dsh-llm-claude-code')
    writePackage(join(modules, '@anthropic-ai', 'claude-agent-sdk'), '@anthropic-ai/claude-agent-sdk', { '.': { types: './sdk.d.ts', default: './sdk.mjs' } })
    writeFileSync(join(modules, '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'), '')
    writePackage(join(modules, '@anthropic-ai', 'claude-agent-sdk-darwin-arm64'), '@anthropic-ai/claude-agent-sdk-darwin-arm64')
    writePackage(join(modules, '@anthropic-ai', 'claude-agent-sdk-win32-x64'), '@anthropic-ai/claude-agent-sdk-win32-x64')
    expect(claudeCodeExecutable(join(root, 'app.asar', 'dsh'), 'darwin', 'arm64'))
      .toBe(join(root, 'app.asar.unpacked', 'dsh', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-darwin-arm64', 'claude'))
    expect(claudeCodeExecutable(join(root, 'app.asar', 'dsh'), 'win32', 'x64'))
      .toBe(join(root, 'app.asar.unpacked', 'dsh', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe'))
    expect(claudeCodeExecutable(join(root, 'app.asar', 'dsh'), 'linux', 'x64')).toBeUndefined()
    expect(claudeCodeExecutable(join(root, 'missing'), 'aix', 'ppc64')).toBeUndefined()
  })
})

describe('Claude Code status', () => {
  it('parses signed-in, signed-out, and unusable CLI output', () => {
    expect(parseClaudeCodeStatus('{"loggedIn":true,"email":"person@example.com"}')).toEqual({ state: 'signed-in', email: 'person@example.com' })
    expect(parseClaudeCodeStatus('{"loggedIn":true}')).toEqual({ state: 'signed-in' })
    expect(parseClaudeCodeStatus('{"loggedIn":false,"authMethod":"none"}')).toEqual({ state: 'signed-out' })
    expect(parseClaudeCodeStatus('{"authMethod":"none"}')).toEqual({ state: 'unavailable' })
    expect(parseClaudeCodeStatus('null')).toEqual({ state: 'unavailable' })
    expect(parseClaudeCodeStatus('not json')).toEqual({ state: 'unavailable' })
  })

  it('removes credential-named and DSH variables from the CLI environment', () => {
    expect(claudeCodeEnvironment({ PATH: '/bin', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 't', DSH_HOME: '/h', HOME: '/u' }))
      .toEqual({ PATH: '/bin', HOME: '/u' })
  })

  it('reports unavailable without a CLI or when the CLI cannot start', async () => {
    expect(await new ClaudeCodeLogin(undefined).status()).toEqual({ state: 'unavailable' })
    expect(new ClaudeCodeLogin(undefined).available).toBe(false)
    const child = new FakeChild()
    const { factory } = fakeSpawn(child)
    const login = new ClaudeCodeLogin('/claude', {}, factory)
    expect(login.available).toBe(true)
    const status = login.status()
    child.emit('error', new Error('ENOENT'))
    expect(await status).toEqual({ state: 'unavailable' })
  })

  it('reads the JSON status printed before a signed-out exit', async () => {
    const child = new FakeChild()
    const { calls, factory } = fakeSpawn(child)
    const status = new ClaudeCodeLogin('/claude', { PATH: '/bin', ANTHROPIC_API_KEY: 'k' }, factory).status()
    child.stdout.write('{"loggedIn":')
    child.stdout.write('false}')
    await new Promise(resolve => setImmediate(resolve))
    child.emit('close', 1)
    expect(await status).toEqual({ state: 'signed-out' })
    expect(calls).toEqual([{ command: '/claude', args: ['auth', 'status', '--json'], env: { PATH: '/bin' } }])
  })
})

describe('Claude Code login', () => {
  it('reports signed-in after the login process exits successfully and forwards a pasted code', async () => {
    const child = new FakeChild()
    const { calls, factory } = fakeSpawn(child)
    const login = new ClaudeCodeLogin('/claude', {}, factory)
    expect(login.submitCode('early')).toBe(false)
    const result = login.signIn()
    expect(await login.signIn()).toBe('failed')
    const received: string[] = []
    child.stdin.on('data', (chunk: Buffer) => { received.push(chunk.toString()) })
    expect(login.submitCode('abc123')).toBe(true)
    child.stdin.emit('error', new Error('EPIPE'))
    child.emit('close', 0)
    expect(await result).toBe('signed-in')
    expect(received).toEqual(['abc123\n'])
    expect(calls[0]!.args).toEqual(['auth', 'login', '--claudeai'])
    expect(login.submitCode('late')).toBe(false)
  })

  it('reports failed for a non-zero exit or start failure', async () => {
    const exited = new FakeChild()
    const exiting = new ClaudeCodeLogin('/claude', {}, fakeSpawn(exited).factory).signIn()
    exited.emit('close', 1)
    expect(await exiting).toBe('failed')
    const broken = new FakeChild()
    const breaking = new ClaudeCodeLogin('/claude', {}, fakeSpawn(broken).factory).signIn()
    broken.emit('error', new Error('EACCES'))
    expect(await breaking).toBe('failed')
    expect(await new ClaudeCodeLogin(undefined).signIn()).toBe('failed')
  })

  it('reports cancelled after cancel stops the running login', async () => {
    const child = new FakeChild()
    const login = new ClaudeCodeLogin('/claude', {}, fakeSpawn(child).factory)
    login.cancel()
    const result = login.signIn()
    login.cancel()
    expect(await result).toBe('cancelled')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
