/** Sign-in status and login for the coding-agent CLIs that the welcome offers, each through its own installed CLI. */

import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { ClaudeCodeLogin } from './claude-code-login.ts'
import type { CliLoginResult, CliProviderId, CliStatus } from './welcome-api.ts'

const STATUS_TIMEOUT_MS = 20_000
// macOS starts GUI applications with a minimal PATH, so the usual install locations are searched after PATH.
const COMMON_DIRECTORIES = ['/opt/homebrew/bin', '/usr/local/bin']
const COMMON_HOME_DIRECTORIES = [['.local', 'bin'], ['.bun', 'bin'], ['.npm-global', 'bin']]

/** Login operations of one CLI; the main process owns at most one running login per CLI. */
export interface CliLogin {
  /** @returns the CLI's stored sign-in state; a missing CLI, start failure, or timeout is `unavailable`. */
  status(): Promise<CliStatus>
  /** @returns how the login ended; `terminal` means it continues in a terminal window the user drives. */
  signIn(): Promise<CliLoginResult>
  /** @param code - authorization code shown by the browser. @returns whether a running login received it. */
  submitCode(code: string): boolean
  /** Stop the running login, if any; its pending sign-in reports `cancelled`. */
  cancel(): void
}

/** How a CLI reports its stored sign-in. */
export type CliStatusProbe =
  /** Exit status 0 means signed in. */
  | { readonly kind: 'exit-code'; readonly args: readonly string[] }
  /** Standard output is a JSON array; a non-empty array means signed in. */
  | { readonly kind: 'json-array'; readonly args: readonly string[] }
  /** A non-empty credential file at this home-relative path means signed in. */
  | { readonly kind: 'file'; readonly path: readonly string[] }

/** Commands that read and create one CLI's sign-in. */
export interface CliCommandSpec {
  /** Executable name searched on PATH and in the install directories. */
  readonly command: string
  /** Home-relative install directories searched after PATH and the common directories. */
  readonly homeDirectories: readonly (readonly string[])[]
  readonly status: CliStatusProbe
  /** Arguments that start the CLI's own login. */
  readonly login: readonly string[]
  /** Whether the login needs an interactive terminal instead of a browser redirect. */
  readonly terminal: boolean
}

/** Login commands of the CLIs other than the bundled Claude Code CLI. */
export const CLI_COMMANDS: { readonly [Id in Exclude<CliProviderId, 'claude-code'>]: CliCommandSpec } = {
  codex: {
    command: 'codex', homeDirectories: [],
    status: { kind: 'exit-code', args: ['login', 'status'] }, login: ['login'], terminal: false,
  },
  antigravity: {
    command: 'agy', homeDirectories: [],
    status: { kind: 'file', path: ['.gemini', 'jetski-standalone-oauth-token'] }, login: [], terminal: true,
  },
  grok: {
    command: 'grok', homeDirectories: [['.grok', 'bin']],
    status: { kind: 'file', path: ['.grok', 'auth.json'] }, login: ['login', '--oauth'], terminal: false,
  },
  opencode: {
    command: 'opencode', homeDirectories: [['.opencode', 'bin']],
    status: { kind: 'json-array', args: ['auth', 'list', '--format', 'json'] }, login: ['auth', 'login'], terminal: true,
  },
}

/** Host facts used to locate and run the CLIs. */
export interface CliHost {
  readonly environment: NodeJS.ProcessEnv
  readonly home: string
  readonly platform: NodeJS.Platform
}

/**
 * List the directories searched for a CLI, in order.
 * @param spec - CLI whose install directories are added.
 * @param host - environment PATH, home directory, and platform.
 * @returns PATH entries followed by the common and CLI-specific install directories.
 */
export function cliSearchDirectories(spec: CliCommandSpec, host: CliHost): string[] {
  const path = (host.environment.PATH ?? '').split(delimiter).filter(entry => entry !== '')
  const home = [...COMMON_HOME_DIRECTORIES, ...spec.homeDirectories].map(parts => join(host.home, ...parts))
  return [...new Set([...path, ...(host.platform === 'win32' ? [] : COMMON_DIRECTORIES), ...home])]
}

/**
 * Locate a CLI executable.
 * @param spec - CLI to locate.
 * @param host - environment PATH, home directory, and platform.
 * @param executable - predicate deciding whether a path is a runnable file.
 * @returns The first runnable match, or undefined when the CLI is not installed.
 */
export function resolveCliExecutable(spec: CliCommandSpec, host: CliHost, executable = isExecutable): string | undefined {
  const extensions = host.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  for (const directory of cliSearchDirectories(spec, host)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${spec.command}${extension}`)
      if (executable(candidate)) return candidate
    }
  }
  return undefined
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch (_missing) {
    // An absent or non-executable candidate is not this CLI.
    return false
  }
}

/**
 * Build a CLI child's environment: DSH-owned variables removed and the CLI's directory and install directories on PATH.
 * @param executable - resolved CLI path.
 * @param spec - CLI whose install directories are added.
 * @param host - parent environment, home directory, and platform.
 * @returns Environment for the CLI child.
 */
export function cliEnvironment(executable: string, spec: CliCommandSpec, host: CliHost): NodeJS.ProcessEnv {
  const kept = Object.entries(host.environment).filter(([name]) => !name.toUpperCase().startsWith('DSH_'))
  const path = [...new Set([dirname(executable), ...cliSearchDirectories(spec, host)])].join(delimiter)
  return { ...Object.fromEntries(kept), PATH: path }
}

const shellQuote = (value: string): string => `'${value.replaceAll("'", '\'\\\'\'')}'`
const appleScriptString = (value: string): string => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

/** Process that opens a terminal window; `verbatim` passes the arguments to Windows `cmd.exe` unquoted. */
export interface TerminalLauncher {
  readonly command: string
  readonly args: readonly string[]
  readonly verbatim: boolean
}

/**
 * Build the command that opens a new terminal window running a CLI login.
 * @param platform - operating system hosting the terminal.
 * @param executable - resolved CLI path.
 * @param args - login arguments.
 * @returns The launcher command, arguments, and whether the arguments are passed verbatim.
 */
export function terminalLauncher(platform: NodeJS.Platform, executable: string, args: readonly string[]): TerminalLauncher {
  if (platform === 'darwin') {
    const script = [executable, ...args].map(shellQuote).join(' ')
    return { command: 'osascript', args: ['-e', 'tell application "Terminal" to activate', '-e', `tell application "Terminal" to do script ${appleScriptString(script)}`], verbatim: false }
  }
  if (platform === 'win32') {
    const line = [`"${executable}"`, ...args].join(' ')
    return { command: 'cmd.exe', args: ['/d', '/c', 'start', '""', 'cmd.exe', '/k', line], verbatim: true }
  }
  return { command: 'x-terminal-emulator', args: ['-e', executable, ...args], verbatim: false }
}

/** Reads and creates one CLI's sign-in through the commands of its {@link CliCommandSpec}. */
export class CommandCliLogin implements CliLogin {
  private login: ChildProcess | undefined
  private cancelled = false

  /**
   * @param spec - CLI commands.
   * @param executable - resolved CLI path, or undefined when the CLI is not installed.
   * @param host - parent environment, home directory, and platform.
   * @param spawnChild - child-process factory.
   */
  constructor(
    private readonly spec: CliCommandSpec,
    private readonly executable: string | undefined,
    private readonly host: CliHost,
    private readonly spawnChild: typeof spawn = spawn,
  ) {}

  status(): Promise<CliStatus> {
    const executable = this.executable
    if (executable === undefined) return Promise.resolve({ state: 'unavailable' })
    const probe = this.spec.status
    if (probe.kind === 'file') return Promise.resolve(credentialFileStatus(join(this.host.home, ...probe.path)))
    return new Promise((resolve) => {
      let output = ''
      const child = this.spawnChild(executable, probe.args, {
        env: cliEnvironment(executable, this.spec, this.host), stdio: ['ignore', 'pipe', 'ignore'], timeout: STATUS_TIMEOUT_MS,
      })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { output += chunk })
      child.once('error', () => { resolve({ state: 'unavailable' }) })
      child.once('close', (code) => {
        if (probe.kind === 'exit-code') resolve({ state: code === 0 ? 'signed-in' : 'signed-out' })
        else resolve(parseJsonArrayStatus(output))
      })
    })
  }

  signIn(): Promise<CliLoginResult> {
    const executable = this.executable
    if (executable === undefined || this.login !== undefined) return Promise.resolve('failed')
    if (this.spec.terminal) return this.signInInTerminal(executable)
    this.cancelled = false
    return new Promise((resolve) => {
      const child = this.spawnChild(executable, this.spec.login, {
        env: cliEnvironment(executable, this.spec, this.host), stdio: ['ignore', 'ignore', 'ignore'],
      })
      this.login = child
      const settle = (result: CliLoginResult): void => {
        if (this.login === child) this.login = undefined
        resolve(result)
      }
      child.once('error', () => { settle('failed') })
      child.once('close', (code) => { settle(this.cancelled ? 'cancelled' : code === 0 ? 'signed-in' : 'failed') })
    })
  }

  submitCode(_code: string): boolean {
    return false
  }

  cancel(): void {
    if (this.login === undefined) return
    this.cancelled = true
    this.login.kill('SIGTERM')
  }

  private signInInTerminal(executable: string): Promise<CliLoginResult> {
    const launcher = terminalLauncher(this.host.platform, executable, this.spec.login)
    return new Promise((resolve) => {
      const child = this.spawnChild(launcher.command, launcher.args, {
        env: cliEnvironment(executable, this.spec, this.host), stdio: 'ignore', detached: true, windowsVerbatimArguments: launcher.verbatim,
      })
      child.once('error', () => { resolve('failed') })
      child.once('spawn', () => {
        child.unref()
        resolve('terminal')
      })
    })
  }
}

function credentialFileStatus(path: string): CliStatus {
  try {
    return { state: statSync(path).size > 0 ? 'signed-in' : 'signed-out' }
  } catch (_missingFile) {
    // A CLI that never signed in has not written its credential file.
    return { state: 'signed-out' }
  }
}

/**
 * Parse a CLI's JSON credential list.
 * @param output - complete standard output.
 * @returns `signed-in` for a non-empty array, `signed-out` for an empty one, otherwise `unavailable`.
 */
export function parseJsonArrayStatus(output: string): CliStatus {
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch (_invalidJson) {
    // Output that is not JSON carries no sign-in state.
    return { state: 'unavailable' }
  }
  if (!Array.isArray(value)) return { state: 'unavailable' }
  return { state: value.length > 0 ? 'signed-in' : 'signed-out' }
}

/**
 * Create the login operations of every CLI the welcome offers.
 * @param claudeCodeExecutable - bundled Claude Code CLI, or undefined when the runtime has none.
 * @param host - parent environment, home directory, and platform.
 * @returns One login per CLI.
 */
export function createCliLogins(claudeCodeExecutable: string | undefined, host: CliHost): { readonly [Id in CliProviderId]: CliLogin } {
  const command = (id: keyof typeof CLI_COMMANDS): CliLogin =>
    new CommandCliLogin(CLI_COMMANDS[id], resolveCliExecutable(CLI_COMMANDS[id], host), host)
  return {
    'claude-code': new ClaudeCodeLogin(claudeCodeExecutable, host.environment),
    codex: command('codex'),
    antigravity: command('antigravity'),
    grok: command('grok'),
    opencode: command('opencode'),
  }
}
