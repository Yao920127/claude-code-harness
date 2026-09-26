/** Claude Code sign-in status and login through the Claude Code CLI that the runtime's Agent SDK ships. */

import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { ClaudeCodeLoginResult, ClaudeCodeStatus } from './welcome-api.ts'

const STATUS_TIMEOUT_MS = 20_000
// The Claude Code model route runs the CLI with these names removed, so status reports the login the route uses.
const CREDENTIAL_ENV = /KEY|PASSWORD|SECRET|TOKEN/iu

/**
 * Locate the platform CLI of the Agent SDK that the prepared runtime's Claude Code route imports.
 * @param dsh - Prepared runtime directory holding `node_modules/@deepseek-ai/dsh-llm-claude-code`.
 * @param platform - Operating system naming the SDK platform package.
 * @param arch - CPU architecture naming the SDK platform package.
 * @returns The executable path outside ASAR, or undefined when the route or its platform package is absent.
 */
export function claudeCodeExecutable(dsh: string, platform: NodeJS.Platform, arch: string): string | undefined {
  try {
    const route = createRequire(join(dsh, 'node_modules', '@deepseek-ai', 'dsh-llm-claude-code', 'package.json'))
    // The SDK's `exports` hides its package.json, so its root entry locates the package.
    const sdk = createRequire(route.resolve('@anthropic-ai/claude-agent-sdk'))
    const payload = dirname(sdk.resolve(`@anthropic-ai/claude-agent-sdk-${platform}-${arch}/package.json`))
    return join(payload, platform === 'win32' ? 'claude.exe' : 'claude').replace(/\.asar(?=[\\/])/u, '.asar.unpacked')
  } catch (_missingPackage) {
    // A runtime without the Claude Code route or its optional platform package has no CLI to run.
    return undefined
  }
}

/**
 * Remove credential-named and DSH-owned variables, as the Claude Code route does for its turns.
 * @param environment - Parent environment.
 * @returns Environment for a Claude Code CLI child.
 */
export function claudeCodeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment)
    .filter(([name]) => !CREDENTIAL_ENV.test(name) && !name.toUpperCase().startsWith('DSH_')))
}

/**
 * Parse `claude auth status --json` output.
 * @param output - Complete standard output.
 * @returns The reported sign-in state, or `unavailable` for output without a boolean `loggedIn`.
 */
export function parseClaudeCodeStatus(output: string): ClaudeCodeStatus {
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch (_invalidJson) {
    // Output that is not JSON carries no sign-in state.
    return { state: 'unavailable' }
  }
  if (typeof value !== 'object' || value === null || !('loggedIn' in value) || typeof value.loggedIn !== 'boolean') {
    return { state: 'unavailable' }
  }
  if (!value.loggedIn) return { state: 'signed-out' }
  return 'email' in value && typeof value.email === 'string' ? { state: 'signed-in', email: value.email } : { state: 'signed-in' }
}

/** Reads sign-in state and runs at most one browser login with the bundled Claude Code CLI. */
export class ClaudeCodeLogin {
  private login: ChildProcess | undefined
  private cancelled = false

  /**
   * @param executable - Claude Code CLI, or undefined when the runtime has none.
   * @param environment - Parent environment, scrubbed before each child starts.
   * @param spawnChild - Child-process factory.
   */
  constructor(
    private readonly executable: string | undefined,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly spawnChild: typeof spawn = spawn,
  ) {}

  /** @returns Whether a Claude Code CLI is available to this application. */
  get available(): boolean {
    return this.executable !== undefined
  }

  /**
   * Run `claude auth status --json`; it reads the stored login without contacting a model.
   * @returns The current sign-in state; a missing CLI, start failure, or timeout is `unavailable`.
   */
  status(): Promise<ClaudeCodeStatus> {
    const executable = this.executable
    if (executable === undefined) return Promise.resolve({ state: 'unavailable' })
    return new Promise((resolve) => {
      let output = ''
      const child = this.spawnChild(executable, ['auth', 'status', '--json'], {
        env: claudeCodeEnvironment(this.environment), stdio: ['ignore', 'pipe', 'ignore'], timeout: STATUS_TIMEOUT_MS,
      })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { output += chunk })
      child.once('error', () => { resolve({ state: 'unavailable' }) })
      // A signed-out CLI exits 1 after printing its status, so the output decides the state.
      child.once('close', () => { resolve(parseClaudeCodeStatus(output)) })
    })
  }

  /**
   * Run `claude auth login --claudeai`, which opens the browser and waits for the authorization.
   * A second call while one login runs joins nothing and reports `failed`.
   * @returns How the login process ended.
   */
  signIn(): Promise<ClaudeCodeLoginResult> {
    const executable = this.executable
    if (executable === undefined || this.login !== undefined) return Promise.resolve('failed')
    this.cancelled = false
    return new Promise((resolve) => {
      const child = this.spawnChild(executable, ['auth', 'login', '--claudeai'], {
        env: claudeCodeEnvironment(this.environment), stdio: ['pipe', 'ignore', 'ignore'],
      })
      this.login = child
      child.stdin.on('error', (_closedInput: Error) => {
        // The CLI may exit before a pasted code reaches it; its exit status reports the outcome.
      })
      const settle = (result: ClaudeCodeLoginResult): void => {
        if (this.login === child) this.login = undefined
        resolve(result)
      }
      child.once('error', () => { settle('failed') })
      child.once('close', (code) => { settle(this.cancelled ? 'cancelled' : code === 0 ? 'signed-in' : 'failed') })
    })
  }

  /**
   * Send the authorization code the browser shows when its redirect cannot reach the CLI.
   * @param code - Code copied from the browser.
   * @returns Whether a running login received it.
   */
  submitCode(code: string): boolean {
    const input = this.login?.stdin
    if (input === undefined || input === null || input.destroyed) return false
    input.write(`${code}\n`)
    return true
  }

  /** Stop the running login, if any; its pending {@link signIn} reports `cancelled`. */
  cancel(): void {
    if (this.login === undefined) return
    this.cancelled = true
    this.login.kill('SIGTERM')
  }
}
