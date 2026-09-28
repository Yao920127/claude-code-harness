/**
 * Host half of Source Control: runs `git` in a Session's working directory
 * and the GitHub CLI (`gh`) for sign-in, repository listing, cloning, and
 * publishing, and serves both over the authenticated `git` Remote namespace.
 * Every command runs through `ctx.subprocess` with an explicit argument
 * vector, so no user text is ever shell-interpreted.
 *
 * @module @deepseek-ai/dsh-client-ui-git/git-controller
 */

import { accessSync, constants, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubprocessHandle, SubprocessOutputReader } from '@deepseek-ai/dsh-subprocess'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { parseLoginPrompt, parseStatus } from './git-status.ts'
import type {
  GitStatusView,
  GithubAccountView,
  GithubCloneResult,
  GithubLoginPrompt,
  GithubRepository,
  GithubVisibility,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Source Control commands for app windows. */
    gitController: GitController
  }
}

/** Resolved deployment choices of the Git Remote. */
export interface GitControllerOptions {
  /** `git` executable name or absolute path. */
  readonly git: string
  /** GitHub CLI executable name or absolute path. */
  readonly gh: string
  /** Directories searched after `PATH` for a bare executable name. */
  readonly searchPath: readonly string[]
  /** Directory that GitHub repositories clone into. */
  readonly cloneDirectory: string
  /** Most repositories one listing returns. */
  readonly repositoryLimit: number
  /** Milliseconds one command may run before it is terminated. */
  readonly commandTimeoutMs: number
  /** Milliseconds a GitHub sign-in waits for the user to enter its code. */
  readonly loginTimeoutMs: number
  /** Grace between termination tiers of a stopped command. */
  readonly graceMs: number
  /** Most bytes of one output stream kept in memory. */
  readonly maxOutputBytes: number
}

interface CommandResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

interface PendingLogin {
  readonly prompt: GithubLoginPrompt
  readonly handle: SubprocessHandle
}

const REPOSITORY_NAME = /^[\w.-]+\/[\w.-]+$/u

/** Fields `gh repo list --json` prints for each repository. */
const REPOSITORY_LIST = z.array(z.object({
  nameWithOwner: z.string(),
  description: z.string().nullable(),
  isPrivate: z.boolean(),
  updatedAt: z.string(),
  url: z.string(),
}))
const GITHUB_HOST = 'github.com'

/** Serves Source Control and GitHub operations over the `git` Remote namespace. */
export class GitController extends TypertRemoteService {
  static inject = ['subprocess', 'sessions']

  private login: PendingLogin | undefined
  private loginStart: Promise<GithubLoginPrompt> | undefined

  /**
   * @param ctx - Host context carrying the subprocess and session services.
   * @param options - executables, clone directory, and command limits.
   */
  constructor(ctx: Context, private readonly options: GitControllerOptions) {
    super(ctx, 'gitController', { namespace: 'git' })
    ctx.effect(() => () => { this.login?.handle.terminate() }, 'ui-git.login')
  }

  /**
   * Read the repository state of a Session's working directory.
   * @param sessionId - Session whose working directory is inspected.
   * @returns the state, or `repository: false` when the directory is not inside a Git repository.
   */
  @Remote
  async status(sessionId: SessionId): Promise<GitStatusView> {
    return await this.statusOf(await this.directory(sessionId))
  }

  /**
   * Create a Git repository in a Session's working directory.
   * @param sessionId - Session whose working directory becomes a repository.
   * @returns the new repository's state.
   */
  @Remote
  async init(sessionId: SessionId): Promise<GitStatusView> {
    const directory = await this.directory(sessionId)
    await this.git(directory, ['init'])
    return await this.statusOf(directory)
  }

  /**
   * Stage changed paths.
   * @param sessionId - Session whose repository changes.
   * @param paths - repository-relative paths; empty stages every change.
   * @returns the repository's state afterwards.
   */
  @Remote
  async stage(sessionId: SessionId, paths: readonly string[]): Promise<GitStatusView> {
    const { root } = await this.repository(sessionId)
    await this.git(root, paths.length === 0 ? ['add', '--all'] : ['add', '--all', '--', ...paths])
    return await this.statusOf(root)
  }

  /**
   * Remove paths from the index, keeping their working-tree changes.
   * @param sessionId - Session whose repository changes.
   * @param paths - repository-relative paths; empty unstages every change.
   * @returns the repository's state afterwards.
   */
  @Remote
  async unstage(sessionId: SessionId, paths: readonly string[]): Promise<GitStatusView> {
    const { root } = await this.repository(sessionId)
    const head = await this.run(this.options.git, ['rev-parse', '--verify', '--quiet', 'HEAD'], root)
    // Before the first commit there is no HEAD to restore the index from.
    const targets = paths.length === 0 ? ['.'] : paths
    await this.git(root, head.exitCode === 0 ? ['restore', '--staged', '--', ...targets] : ['rm', '--cached', '-r', '--quiet', '--', ...targets])
    return await this.statusOf(root)
  }

  /**
   * Commit the staged changes, staging every change first when none is staged.
   * @param sessionId - Session whose repository commits.
   * @param message - commit message; blank messages are refused.
   * @returns the repository's state afterwards.
   */
  @Remote
  async commit(sessionId: SessionId, message: string): Promise<GitStatusView> {
    if (message.trim().length === 0) throw invalid('the commit message is empty')
    const before = await this.repository(sessionId)
    const root = before.root
    if (!before.changes.some(change => change.staged !== undefined)) {
      if (before.changes.length === 0) throw invalid('there are no changes to commit')
      await this.git(root, ['add', '--all'])
    }
    await this.git(root, ['commit', '--message', message])
    return await this.statusOf(root)
  }

  /**
   * Push the current branch, setting `origin` as its upstream when it has none.
   * @param sessionId - Session whose repository pushes.
   * @returns the repository's state afterwards.
   */
  @Remote
  async push(sessionId: SessionId): Promise<GitStatusView> {
    const before = await this.repository(sessionId)
    const root = before.root
    if (before.upstream === null) {
      if (before.remoteUrl === null) throw invalid('the repository has no origin remote; publish it to GitHub first')
      await this.git(root, ['push', '--set-upstream', 'origin', 'HEAD'])
    } else {
      await this.git(root, ['push'])
    }
    return await this.statusOf(root)
  }

  /**
   * Fast-forward the current branch to its upstream.
   * @param sessionId - Session whose repository pulls.
   * @returns the repository's state afterwards.
   */
  @Remote
  async pull(sessionId: SessionId): Promise<GitStatusView> {
    const { root } = await this.repository(sessionId)
    await this.git(root, ['pull', '--ff-only'])
    return await this.statusOf(root)
  }

  /**
   * Read the GitHub CLI's sign-in.
   * @returns whether the CLI is installed, the signed-in user, and a sign-in in progress.
   */
  @Remote
  async githubAccount(): Promise<GithubAccountView> {
    if (this.locate(this.options.gh) === undefined) return { cli: 'missing' }
    const user = await this.run(this.options.gh, ['api', 'user', '--jq', '.login'], homedir())
    const login = user.exitCode === 0 && user.stdout.trim() !== '' ? user.stdout.trim() : null
    return { cli: 'ready', login, pending: this.login?.prompt ?? null }
  }

  /**
   * Start a GitHub device sign-in, or return the one already waiting for its code.
   * @returns the one-time code and the page to enter it on; the sign-in completes in the background.
   */
  @Remote
  githubLogin(): Promise<GithubLoginPrompt> {
    if (this.login !== undefined) return Promise.resolve(this.login.prompt)
    this.loginStart ??= this.startLogin().finally(() => { this.loginStart = undefined })
    return this.loginStart
  }

  /**
   * Sign the GitHub CLI out of github.com.
   * @returns the sign-in state afterwards.
   */
  @Remote
  async githubLogout(): Promise<GithubAccountView> {
    this.login?.handle.terminate()
    await this.command(this.options.gh, ['auth', 'logout', '--hostname', GITHUB_HOST], homedir())
    return await this.githubAccount()
  }

  /**
   * List the signed-in user's repositories, most recently updated first.
   * @returns the repositories and, for each, its local clone when one exists.
   */
  @Remote
  async githubRepositories(): Promise<GithubRepository[]> {
    const listed = await this.command(this.options.gh, [
      'repo', 'list', '--limit', String(this.options.repositoryLimit),
      '--json', 'nameWithOwner,description,isPrivate,updatedAt,url',
    ], homedir())
    const rows = REPOSITORY_LIST.parse(JSON.parse(listed.stdout))
    return rows.map((row) => {
      const target = this.cloneTarget(row.nameWithOwner)
      return {
        nameWithOwner: row.nameWithOwner,
        description: row.description === '' ? null : row.description,
        isPrivate: row.isPrivate,
        updatedAt: row.updatedAt,
        url: row.url,
        localPath: existsSync(join(target, '.git')) ? target : null,
      }
    })
  }

  /**
   * Clone a repository into the clone directory and add it as a Workspace; an existing clone is reused.
   * @param nameWithOwner - `owner/name` of the repository.
   * @returns the clone's local directory.
   */
  @Remote
  async githubClone(nameWithOwner: string): Promise<GithubCloneResult> {
    if (!REPOSITORY_NAME.test(nameWithOwner)) throw invalid(`'${nameWithOwner}' is not an owner/name repository`)
    const target = this.cloneTarget(nameWithOwner)
    if (!existsSync(join(target, '.git'))) {
      if (existsSync(target)) throw invalid(`${target} already exists and is not a Git repository`)
      mkdirSync(this.options.cloneDirectory, { recursive: true })
      await this.command(this.options.gh, ['repo', 'clone', nameWithOwner, target], this.options.cloneDirectory)
    }
    await this.ctx.get('workspaceRegistry')?.create(target)
    return { path: target }
  }

  /**
   * Create a GitHub repository from a Session's repository, add it as `origin`, and push.
   * @param sessionId - Session whose repository is published.
   * @param visibility - visibility of the new GitHub repository.
   * @returns the repository's state afterwards.
   */
  @Remote
  async githubPublish(sessionId: SessionId, visibility: GithubVisibility): Promise<GitStatusView> {
    const { root } = await this.repository(sessionId)
    await this.command(this.options.gh, [
      'repo', 'create', basename(root), `--${visibility}`, '--source', root, '--remote', 'origin', '--push',
    ], root)
    return await this.statusOf(root)
  }

  private async startLogin(): Promise<GithubLoginPrompt> {
    const executable = this.require(this.options.gh)
    const handle = this.ctx.subprocess.spawn({
      argv: [executable, 'auth', 'login', '--hostname', GITHUB_HOST, '--git-protocol', 'https', '--web', '--skip-ssh-key'],
      cwd: homedir(),
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      graceMs: this.options.graceMs,
      signal: AbortSignal.timeout(this.options.loginTimeoutMs),
      env: this.env(),
    })
    let output = ''
    const prompt = await new Promise<GithubLoginPrompt>((resolve, reject) => {
      const read = (chunk: Buffer | string): void => {
        output += String(chunk)
        const found = parseLoginPrompt(output)
        if (found !== undefined) resolve(found)
      }
      handle.stdout?.on('data', read)
      handle.stderr?.on('data', read)
      handle.done.then(() => {
        reject(new RemoteError('git/command-failed', 'gh auth login ended before showing a code', { command: 'gh auth login', output }))
      }, reject)
    })
    this.login = { prompt, handle }
    void handle.done.then(async (outcome) => {
      // Signing in through the CLI also lets `git push` use the same GitHub credentials.
      if (outcome.exitCode === 0) await this.run(this.options.gh, ['auth', 'setup-git', '--hostname', GITHUB_HOST], homedir())
    }, (error: unknown) => { this.ctx.logger.warn('ui-git: GitHub sign-in failed: %o', error) }).finally(() => {
      // githubLogin starts no other sign-in while this one is pending, so this one is still the current one.
      this.login = undefined
    })
    return prompt
  }

  private cloneTarget(nameWithOwner: string): string {
    return join(this.options.cloneDirectory, nameWithOwner.slice(nameWithOwner.indexOf('/') + 1))
  }

  private async directory(sessionId: SessionId): Promise<string> {
    const live = this.ctx.sessions.get(sessionId)?.header
    const header = live ?? (await this.ctx.get('sessionPersistence')?.stat(sessionId))?.header
    const cwd = header?.cwd
    if (cwd === undefined) throw new RemoteError('git/no-directory', `session ${sessionId} has no working directory`, { sessionId })
    return cwd
  }

  private async repository(sessionId: SessionId): Promise<Extract<GitStatusView, { repository: true }>> {
    const status = await this.statusOf(await this.directory(sessionId))
    if (!status.repository) throw invalid('the directory is not a Git repository')
    return status
  }

  private async statusOf(directory: string): Promise<GitStatusView> {
    const top = await this.run(this.options.git, ['rev-parse', '--show-toplevel'], directory)
    if (top.exitCode !== 0) return { repository: false, directory }
    const root = top.stdout.trim()
    const status = parseStatus((await this.git(root, ['status', '--porcelain=v2', '--branch', '-z'])).stdout)
    const remote = await this.run(this.options.git, ['remote', 'get-url', 'origin'], root)
    return {
      repository: true,
      directory,
      root,
      branch: status.branch,
      upstream: status.upstream,
      ahead: status.ahead,
      behind: status.behind,
      remoteUrl: remote.exitCode === 0 ? remote.stdout.trim() : null,
      changes: status.changes,
    }
  }

  private async git(cwd: string, args: readonly string[]): Promise<CommandResult> {
    return await this.command(this.options.git, args, cwd)
  }

  /** Run a command and reject with its diagnostics when it fails. */
  private async command(program: string, args: readonly string[], cwd: string): Promise<CommandResult> {
    const result = await this.run(program, args, cwd)
    if (result.exitCode !== 0) {
      const command = `${basename(program)} ${args.join(' ')}`
      const output = `${result.stderr}\n${result.stdout}`.trim().slice(-4000)
      throw new RemoteError('git/command-failed', `${command} failed: ${output}`, { command, output })
    }
    return result
  }

  /** Run a command and report its exit code and output. */
  private async run(program: string, args: readonly string[], cwd: string): Promise<CommandResult> {
    const executable = this.require(program)
    const collect = { maxBytes: this.options.maxOutputBytes }
    const handle = this.ctx.subprocess.spawn({
      argv: [executable, ...args],
      cwd,
      stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
      graceMs: this.options.graceMs,
      signal: AbortSignal.timeout(this.options.commandTimeoutMs),
      env: this.env(),
    })
    const outcome = await handle.done
    return {
      exitCode: outcome.exitCode,
      // Collect-mode streams always carry readers.
      stdout: (handle.collected.stdout as SubprocessOutputReader).readFrom(0).text,
      stderr: (handle.collected.stderr as SubprocessOutputReader).readFrom(0).text,
    }
  }

  private env(): NodeJS.ProcessEnv {
    return {
      // Credentials come from the configured helpers; a prompt would wait on a terminal nobody sees.
      GIT_TERMINAL_PROMPT: '0',
      GH_PROMPT_DISABLED: '1',
      PATH: this.searchDirectories().join(delimiter),
      ...process.env.SSH_AUTH_SOCK === undefined ? {} : { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK },
      ...process.env.HOME === undefined ? {} : { HOME: process.env.HOME },
    }
  }

  private require(program: string): string {
    const executable = this.locate(program)
    if (executable === undefined) throw new RemoteError('git/program-missing', `${program} is not installed`, { program })
    return executable
  }

  private locate(program: string): string | undefined {
    const candidates = program.includes('/')
      ? [program]
      : this.searchDirectories().map(dir => join(dir, program))
    return candidates.find(isExecutable)
  }

  /** `PATH`, then the configured search directories. */
  private searchDirectories(): string[] {
    return [...(process.env.PATH ?? '').split(delimiter), ...this.options.searchPath].filter(Boolean)
  }
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch (_notExecutable) {
    // A missing or non-executable candidate: the search moves on.
    return false
  }
}

function invalid(reason: string): RemoteError<'git/invalid-request'> {
  return new RemoteError('git/invalid-request', reason, { reason })
}
