/**
 * Open the installed Claude Code Harness Desktop application for `cch`.
 * The CLI never boots the Desktop profile itself: the Electron application
 * owns it, so opening the application is the only way `cch` reaches it.
 * @module @deepseek-ai/dsh/open-desktop
 */

import { execFile } from 'node:child_process'

/** Application opened when `CCH_DESKTOP_APP` names none: the Desktop product name. */
export const DESKTOP_APPLICATION = 'Claude Code Harness'

/** How {@link openDesktop} reaches the operating system. */
export interface OpenDesktopOptions {
  /** `process.platform` of the running CLI. */
  readonly platform: NodeJS.Platform
  /** Launch environment; `CCH_DESKTOP_APP` names the application to open. */
  readonly env: Readonly<Record<string, string | undefined>>
  /**
   * Run one command to completion.
   * @param file - executable.
   * @param args - its arguments.
   * @returns the exit code and captured error output.
   */
  readonly run: (file: string, args: readonly string[]) => Promise<{ readonly code: number; readonly stderr: string }>
}

/**
 * Run a command with `execFile`, reporting its exit code instead of throwing.
 * @param file - executable.
 * @param args - its arguments.
 * @returns the exit code and captured error output.
 */
export function runCommand(file: string, args: readonly string[]): Promise<{ readonly code: number; readonly stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], (error, _stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1
      resolve({ code, stderr: stderr.trim() })
    })
  })
}

/**
 * Open the Desktop application.
 * @param options - platform, launch environment, and command runner.
 * @returns undefined once the application opened, or the message explaining why it could not.
 */
export async function openDesktop(options: OpenDesktopOptions): Promise<string | undefined> {
  const application = options.env.CCH_DESKTOP_APP?.trim() || DESKTOP_APPLICATION
  if (options.platform !== 'darwin') {
    return 'cch: opening the desktop app is supported on macOS only; run \'cch web\' to use Claude Code Harness in a browser'
  }
  const result = await options.run('open', ['-a', application])
  if (result.code === 0) return undefined
  const detail = result.stderr === '' ? '' : ` (${result.stderr})`
  return `cch: cannot open the desktop app ${JSON.stringify(application)}${detail}; install it, set CCH_DESKTOP_APP to its name or path, or run 'cch web'`
}
