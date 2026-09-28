/**
 * Source Control plugin, Host half: Git and GitHub CLI operations behind the
 * `git` Remote namespace. The browser half ships through `exports["./client"]`.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-workspace'
import { GitController } from './git-controller.ts'

export { GitController } from './git-controller.ts'
export type { GitControllerOptions } from './git-controller.ts'
export { parseLoginPrompt, parseStatus } from './git-status.ts'
export type { GitBranchStatus } from './git-status.ts'
export type * from './types.ts'

/** Executables, clone directory, and command limits. */
export interface Config {
  /** `git` executable name or absolute path (default `git`). */
  git?: string
  /** GitHub CLI executable name or absolute path (default `gh`). */
  gh?: string
  /**
   * Directories searched after `PATH` for a bare executable name. A Desktop
   * app started from the Dock inherits a short `PATH`, so the default adds the
   * Homebrew and `/usr/local` binary directories.
   */
  searchPath?: string[]
  /** Directory GitHub repositories clone into (default `~/github`). */
  cloneDirectory?: string
  /** Most repositories one GitHub listing returns. */
  repositoryLimit?: number
  /** Milliseconds one command may run before it is terminated. */
  commandTimeoutMs?: number
  /** Milliseconds a GitHub sign-in waits for its one-time code to be entered. */
  loginTimeoutMs?: number
  /** Grace in milliseconds between termination tiers of a stopped command. */
  graceMs?: number
  /** Most bytes of one command output stream kept in memory. */
  maxOutputBytes?: number
}

export const Config: z<Config> = z.object({
  git: z.string().min(1).default('git'),
  gh: z.string().min(1).default('gh'),
  searchPath: z.array(z.string().min(1)).default(['/opt/homebrew/bin', '/usr/local/bin']),
  cloneDirectory: z.string().min(1).default(join(homedir(), 'github')),
  repositoryLimit: z.natural().min(1).max(1000).default(100),
  commandTimeoutMs: z.natural().min(1).default(300_000),
  loginTimeoutMs: z.natural().min(1).default(900_000),
  graceMs: z.natural().min(1).default(3_000),
  maxOutputBytes: z.natural().min(1).default(4 * 1024 * 1024),
})

/**
 * Serve Source Control and GitHub operations.
 * @param ctx - Host context carrying the subprocess and session services.
 * @param config - executables, clone directory, and command limits.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(GitController, {
    git: config.git as string,
    gh: config.gh as string,
    searchPath: config.searchPath as string[],
    cloneDirectory: config.cloneDirectory as string,
    repositoryLimit: config.repositoryLimit as number,
    commandTimeoutMs: config.commandTimeoutMs as number,
    loginTimeoutMs: config.loginTimeoutMs as number,
    graceMs: config.graceMs as number,
    maxOutputBytes: config.maxOutputBytes as number,
  })
}
