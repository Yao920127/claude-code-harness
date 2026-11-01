/**
 * Location of an installed coding CLI and the PATH its process runs with.
 *
 * Desktop applications start with a minimal PATH, so the CLI is searched in
 * PATH first and then in the directories its installers use.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/locate
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

/** Host facts used to locate a CLI. */
export interface CliSearchHost {
  /** PATH of the harness process. */
  readonly path: string | undefined
  readonly home: string
  readonly platform: NodeJS.Platform
}

/** Install directories of package managers on POSIX hosts. */
const SYSTEM_DIRECTORIES = ['/opt/homebrew/bin', '/usr/local/bin']

/** Home-relative install directories shared by the CLIs' installers. */
const HOME_DIRECTORIES: readonly (readonly string[])[] = [['.local', 'bin'], ['.bun', 'bin'], ['.npm-global', 'bin']]

/**
 * List the directories searched for a CLI, in search order and without repeats.
 * @param homeDirectories - the CLI's own home-relative install directories.
 * @param host - PATH, home directory, and platform.
 * @returns PATH entries, then the system, shared, and CLI-specific install directories.
 */
export function searchDirectories(homeDirectories: readonly (readonly string[])[], host: CliSearchHost): string[] {
  const fromPath = (host.path ?? '').split(delimiter).filter(entry => entry.length > 0)
  const system = host.platform === 'win32' ? [] : SYSTEM_DIRECTORIES
  const home = [...HOME_DIRECTORIES, ...homeDirectories].map(parts => join(host.home, ...parts))
  return [...new Set([...fromPath, ...system, ...home])]
}

function runnableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch (_absent) {
    // A missing or non-executable candidate is not the CLI.
    return false
  }
}

/**
 * Find a CLI executable.
 * @param command - executable name.
 * @param homeDirectories - the CLI's own home-relative install directories.
 * @param host - PATH, home directory, and platform.
 * @param runnable - decides whether a path is a runnable file.
 * @returns the first runnable candidate, or undefined when the CLI is not installed.
 */
export function locateCli(
  command: string,
  homeDirectories: readonly (readonly string[])[],
  host: CliSearchHost,
  runnable: (path: string) => boolean = runnableFile,
): string | undefined {
  const suffixes = host.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  for (const directory of searchDirectories(homeDirectories, host)) {
    const found = suffixes.map(suffix => join(directory, command + suffix)).find(runnable)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Build the PATH of a CLI process, so a CLI that starts helper programs finds them.
 * @param executable - the located CLI.
 * @param homeDirectories - the CLI's own home-relative install directories.
 * @param host - PATH, home directory, and platform.
 * @returns the CLI's directory followed by every searched directory.
 */
export function cliPath(executable: string, homeDirectories: readonly (readonly string[])[], host: CliSearchHost): string {
  return [...new Set([dirname(executable), ...searchDirectories(homeDirectories, host)])].join(delimiter)
}
