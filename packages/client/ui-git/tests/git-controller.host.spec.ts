/** Source Control and GitHub operations against real `git` repositories and a scripted `gh`, in temporary directories. */
import { spawn as spawnChild, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as plugin from '../src/index.ts'
import { GitController, type GitControllerOptions } from '../src/git-controller.ts'

const SESSION = 'session-1' as SessionId
/** Directory of the machine's `git`, so a spec that empties `PATH` still finds it through the search path. */
const GIT_DIR = dirname(spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim())
const STORED = 'session-stored' as SessionId

/**
 * A `ctx.subprocess` that runs real children, collecting or piping output as the spec asks.
 * @param spawned - receives every handle so a spec can end a long-running child.
 * @returns the subprocess service double.
 */
function localSubprocess(spawned: SubprocessHandle[]) {
  return {
    spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
      const child = spawnChild(spec.argv[0] as string, spec.argv.slice(1), {
        cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const collect = typeof spec.stdio.stdout === 'object'
      if (collect) {
        child.stdout.on('data', (chunk: Buffer) => { stdout += String(chunk) })
        child.stderr.on('data', (chunk: Buffer) => { stderr += String(chunk) })
      }
      const done = new Promise<SubprocessOutcome>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', (exitCode, signal) => { resolve({ exitCode, signal }) })
      })
      const read = (text: () => string) => ({ readFrom: () => ({ text: text(), nextOffset: 0, lossy: false }) })
      const handle: SubprocessHandle = {
        stdin: undefined,
        stdout: collect ? undefined : child.stdout,
        stderr: collect ? undefined : child.stderr,
        control: undefined,
        collected: collect ? { stdout: read(() => stdout), stderr: read(() => stderr) } : {},
        done,
        terminate: () => { child.kill() },
        waitForExit: async () => { await done.catch(() => undefined); return true },
      }
      spawned.push(handle)
      return handle
    },
  }
}

/** A `gh` stand-in: state lives in files under `$GH_STATE`. */
const FAKE_GH = `#!/bin/sh
state="$GH_STATE"
case "$1 $2" in
  "api user") if [ -f "$state/login" ]; then cat "$state/login"; else echo "not logged in" >&2; exit 1; fi ;;
  "auth logout") rm -f "$state/login" ;;
  "auth setup-git") touch "$state/setup-git" ;;
  "auth login")
    if [ -f "$state/login-fails" ]; then echo "no network" >&2; exit 1; fi
    echo "! One-time code (ABCD-1234) copied to clipboard" >&2
    echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2
    while [ ! -f "$state/authorized" ]; do sleep 0.05; done
    echo octocat > "$state/login" ;;
  "repo list") [ -f "$state/login" ] || { echo "not logged in" >&2; exit 1; }; cat "$state/repos.json" ;;
  "repo clone") mkdir -p "$4" && git -C "$4" init -q ;;
  "repo create") echo "$@" > "$state/created" ;;
  *) echo "unexpected $*" >&2; exit 2 ;;
esac
`

let root: string
let spawned: SubprocessHandle[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ui-git-'))
  spawned = []
})

afterEach(() => {
  for (const handle of spawned) handle.terminate()
  rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout
}

/**
 * @param overrides - option changes.
 * @param directory - the Session's working directory; null gives the Session none.
 */
function harness(overrides: Partial<GitControllerOptions> = {}, directory: string | null = join(root, 'work')) {
  const cwd = directory ?? undefined
  if (cwd !== undefined) mkdirSync(cwd, { recursive: true })
  const bin = join(root, 'bin')
  const state = join(root, 'gh-state')
  mkdirSync(bin, { recursive: true })
  mkdirSync(state, { recursive: true })
  writeFileSync(join(bin, 'gh'), FAKE_GH)
  chmodSync(join(bin, 'gh'), 0o755)
  vi.stubEnv('GH_STATE', state)
  const ctx = new Context()
  const create = vi.fn(async (_path: string) => undefined)
  const subprocess = localSubprocess(spawned)
  ctx.provide('subprocess', subprocess as never)
  ctx.provide('sessions', { get: (id: SessionId) => id === SESSION ? { header: cwd === undefined ? {} : { cwd } } : undefined } as never)
  ctx.provide('sessionPersistence', { stat: async (id: SessionId) => id === STORED ? { header: { cwd } } : undefined } as never)
  ctx.provide('workspaceRegistry', { create } as never)
  const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
  const options: GitControllerOptions = {
    git: 'git',
    // Always the scripted stand-in: a real GitHub CLI on this machine must never run from a spec.
    gh: join(bin, 'gh'),
    searchPath: [GIT_DIR],
    cloneDirectory: join(root, 'clones'),
    repositoryLimit: 10,
    commandTimeoutMs: 30_000,
    loginTimeoutMs: 30_000,
    graceMs: 100,
    maxOutputBytes: 1024 * 1024,
    ...overrides,
  }
  const controller = new GitController(ctx, options)
  return { ctx, controller, subprocess, options, cwd: cwd as string, state, create, warn }
}

function identify(cwd: string): void {
  git(cwd, 'config', 'user.name', 'Tester')
  git(cwd, 'config', 'user.email', 'tester@example.com')
  git(cwd, 'config', 'commit.gpgsign', 'false')
}

describe('GitController repositories', () => {
  it('initializes, stages, unstages, and commits without a first commit or a remote', async () => {
    const h = harness()
    await expect(h.controller.status(SESSION)).resolves.toEqual({ repository: false, directory: h.cwd })
    await expect(h.controller.stage(SESSION, [])).rejects.toMatchObject({ code: 'git/invalid-request' })
    const initialized = await h.controller.init(SESSION)
    expect(initialized).toMatchObject({ repository: true, upstream: null, remoteUrl: null, changes: [] })
    identify(h.cwd)
    writeFileSync(join(h.cwd, 'a.txt'), 'a\n')
    writeFileSync(join(h.cwd, 'b.txt'), 'b\n')
    expect((await h.controller.stage(SESSION, ['a.txt'])).repository && (await h.controller.status(SESSION))).toMatchObject({
      changes: [{ path: 'a.txt', staged: 'added' }, { path: 'b.txt', unstaged: 'untracked' }],
    })
    // Before the first commit there is no HEAD, so unstaging removes paths from the index.
    await expect(h.controller.unstage(SESSION, ['a.txt'])).resolves.toMatchObject({
      changes: [{ path: 'a.txt', unstaged: 'untracked' }, { path: 'b.txt', unstaged: 'untracked' }],
    })
    await h.controller.stage(SESSION, [])
    await expect(h.controller.unstage(SESSION, [])).resolves.toMatchObject({ changes: [{ unstaged: 'untracked' }, { unstaged: 'untracked' }] })
    await expect(h.controller.commit(SESSION, '  ')).rejects.toMatchObject({ code: 'git/invalid-request', details: { reason: 'the commit message is empty' } })
    // Nothing staged: the commit stages every change first.
    await expect(h.controller.commit(SESSION, 'first')).resolves.toMatchObject({ changes: [] })
    await expect(h.controller.commit(SESSION, 'again')).rejects.toMatchObject({ details: { reason: 'there are no changes to commit' } })
    writeFileSync(join(h.cwd, 'a.txt'), 'changed\n')
    await h.controller.stage(SESSION, ['a.txt'])
    await expect(h.controller.unstage(SESSION, [])).resolves.toMatchObject({ changes: [{ path: 'a.txt', unstaged: 'modified' }] })
    await h.controller.stage(SESSION, [])
    await expect(h.controller.unstage(SESSION, ['a.txt'])).resolves.toMatchObject({ changes: [{ path: 'a.txt', unstaged: 'modified' }] })
    await h.controller.stage(SESSION, ['a.txt'])
    writeFileSync(join(h.cwd, 'b.txt'), 'b2\n')
    // Staged changes commit alone.
    await expect(h.controller.commit(SESSION, 'second')).resolves.toMatchObject({ changes: [{ path: 'b.txt', unstaged: 'modified' }] })
    await expect(h.controller.push(SESSION)).rejects.toMatchObject({ code: 'git/invalid-request' })
    await expect(h.controller.pull(SESSION)).rejects.toMatchObject({ code: 'git/command-failed' })
  })

  it('pushes with and without an upstream and pulls from origin', async () => {
    const h = harness()
    const origin = join(root, 'origin.git')
    git(root, 'init', '--bare', '-q', origin)
    await h.controller.init(SESSION)
    identify(h.cwd)
    git(h.cwd, 'remote', 'add', 'origin', origin)
    writeFileSync(join(h.cwd, 'a.txt'), 'a\n')
    await h.controller.commit(SESSION, 'first')
    const pushed = await h.controller.push(SESSION)
    expect(pushed).toMatchObject({ remoteUrl: origin, ahead: 0, behind: 0 })
    expect(pushed.repository && pushed.upstream).toMatch(/^origin\//u)
    writeFileSync(join(h.cwd, 'a.txt'), 'b\n')
    await expect(h.controller.commit(SESSION, 'second')).resolves.toMatchObject({ ahead: 1 })
    await expect(h.controller.push(SESSION)).resolves.toMatchObject({ ahead: 0 })
    await expect(h.controller.pull(SESSION)).resolves.toMatchObject({ behind: 0 })
  })

  it('reads a stored Session\'s directory and refuses a Session without one', async () => {
    const h = harness()
    await expect(h.controller.status(STORED)).resolves.toEqual({ repository: false, directory: h.cwd })
    await expect(h.controller.status('missing' as SessionId)).rejects.toMatchObject({ code: 'git/no-directory', details: { sessionId: 'missing' } })
    const bare = harness({}, null)
    await expect(bare.controller.status(SESSION)).rejects.toMatchObject({ code: 'git/no-directory' })
  })

  it('reports a missing program and finds programs by absolute path', async () => {
    const h = harness({ git: 'dsh-missing-git' })
    await expect(h.controller.status(SESSION)).rejects.toMatchObject({ code: 'git/program-missing', details: { program: 'dsh-missing-git' } })
    writeFileSync(join(root, 'not-executable'), '')
    const absolute = harness({ gh: join(root, 'not-executable') })
    await expect(absolute.controller.githubAccount()).resolves.toEqual({ cli: 'missing' })
  })

  it('runs commands with credential prompts disabled and forwards the SSH agent and home', async () => {
    vi.stubEnv('SSH_AUTH_SOCK', '/tmp/agent.sock')
    vi.stubEnv('PATH', undefined)
    const h = harness()
    await h.controller.status(SESSION)
    vi.stubEnv('SSH_AUTH_SOCK', undefined)
    vi.stubEnv('HOME', undefined)
    await h.controller.status(SESSION)
  })
})

describe('GitController GitHub', () => {
  it('reports the sign-in, lists repositories, clones, publishes, and signs out', async () => {
    const h = harness()
    await expect(h.controller.githubAccount()).resolves.toEqual({ cli: 'ready', login: null, pending: null })
    writeFileSync(join(h.state, 'login'), '\n')
    await expect(h.controller.githubAccount()).resolves.toEqual({ cli: 'ready', login: null, pending: null })
    writeFileSync(join(h.state, 'login'), 'octocat\n')
    await expect(h.controller.githubAccount()).resolves.toEqual({ cli: 'ready', login: 'octocat', pending: null })
    writeFileSync(join(h.state, 'repos.json'), JSON.stringify([
      { nameWithOwner: 'octocat/hello', description: '', isPrivate: false, updatedAt: '2026-09-01T00:00:00Z', url: 'https://github.com/octocat/hello' },
      { nameWithOwner: 'octocat/secret', description: 'Private notes', isPrivate: true, updatedAt: '2026-09-02T00:00:00Z', url: 'https://github.com/octocat/secret' },
    ]))
    const listed = await h.controller.githubRepositories()
    expect(listed.map(repository => [repository.nameWithOwner, repository.description, repository.localPath]))
      .toEqual([['octocat/hello', null, null], ['octocat/secret', 'Private notes', null]])
    await expect(h.controller.githubClone('not a repository')).rejects.toMatchObject({ code: 'git/invalid-request' })
    const target = join(root, 'clones', 'hello')
    await expect(h.controller.githubClone('octocat/hello')).resolves.toEqual({ path: target })
    expect(h.create).toHaveBeenCalledWith(target)
    await expect(h.controller.githubClone('octocat/hello')).resolves.toEqual({ path: target })
    expect((await h.controller.githubRepositories())[0]?.localPath).toBe(target)
    mkdirSync(join(root, 'clones', 'secret'))
    await expect(h.controller.githubClone('octocat/secret')).rejects.toMatchObject({ code: 'git/invalid-request' })

    await h.controller.init(SESSION)
    await expect(h.controller.githubPublish(SESSION, 'private')).resolves.toMatchObject({ repository: true })
    expect(readFileSync(join(h.state, 'created'), 'utf8')).toContain('repo create work --private --source')
    await expect(h.controller.githubLogout()).resolves.toEqual({ cli: 'ready', login: null, pending: null })
    await expect(h.controller.githubRepositories()).rejects.toMatchObject({ code: 'git/command-failed' })
  })

  it('clones without a workspace registry', async () => {
    const h = harness()
    const bare = new Context()
    bare.provide('subprocess', h.subprocess as never)
    bare.provide('sessions', { get: () => undefined } as never)
    const controller = new GitController(bare, h.options)
    await expect(controller.githubClone('octocat/hello')).resolves.toMatchObject({ path: join(root, 'clones', 'hello') })
  })

  it('shows one device code, completes the sign-in in the background, and configures Git credentials', async () => {
    const h = harness()
    const [first, second] = await Promise.all([h.controller.githubLogin(), h.controller.githubLogin()])
    expect(first).toEqual({ code: 'ABCD-1234', url: 'https://github.com/login/device' })
    expect(second).toEqual(first)
    await expect(h.controller.githubLogin()).resolves.toEqual(first)
    await expect(h.controller.githubAccount()).resolves.toEqual({ cli: 'ready', login: null, pending: first })
    writeFileSync(join(h.state, 'authorized'), '')
    await vi.waitFor(async () => {
      await expect(h.controller.githubAccount()).resolves.toEqual({ cli: 'ready', login: 'octocat', pending: null })
      expect(existsSync(join(h.state, 'setup-git'))).toBe(true)
    })
  })

  it('reports a sign-in that ends before its code and one whose process cannot start', async () => {
    const h = harness()
    writeFileSync(join(h.state, 'login-fails'), '')
    const failure = await h.controller.githubLogin().catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'git/command-failed' })
    expect((failure as { details: { output: string } }).details.output).toContain('no network')
    rmSync(join(h.state, 'login-fails'))
    const broken = harness()
    const spawn = broken.subprocess.spawn.bind(broken.subprocess)
    let fail!: (error: Error) => void
    vi.spyOn(broken.subprocess, 'spawn').mockImplementationOnce((spec) => {
      const handle = spawn(spec)
      return { ...handle, done: new Promise((_resolve, reject) => { fail = reject }) }
    })
    const prompt = broken.controller.githubLogin()
    await expect(prompt).resolves.toMatchObject({ code: 'ABCD-1234' })
    fail(new Error('provider lost the process'))
    await vi.waitFor(() => { expect(broken.warn).toHaveBeenCalledWith('ui-git: GitHub sign-in failed: %o', expect.any(Error)) })
    await expect(broken.controller.githubAccount()).resolves.toMatchObject({ pending: null })
  })

  it('ends a waiting sign-in when signing out or unloading', async () => {
    const h = harness()
    await h.controller.githubLogin()
    await expect(h.controller.githubLogout()).resolves.toMatchObject({ cli: 'ready', login: null })
    await vi.waitFor(async () => { await expect(h.controller.githubAccount()).resolves.toMatchObject({ pending: null }) })
    const ctx = new Context()
    ctx.provide('subprocess', localSubprocess(spawned) as never)
    ctx.provide('sessions', { get: () => undefined } as never)
    const fiber = await ctx.plugin(plugin, plugin.Config({ gh: join(root, 'bin', 'gh'), cloneDirectory: join(root, 'clones') }))
    await ctx.gitController.githubLogin()
    const handle = spawned.at(-1) as SubprocessHandle
    await fiber.dispose()
    await expect(handle.done).resolves.toMatchObject({ signal: 'SIGTERM' })
  })
})
