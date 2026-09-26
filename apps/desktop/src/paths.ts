/** Filesystem ownership for the Electron-managed desktop installation. */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { DSH_HOME_ENV, resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Data home of Claude Code Harness; DeepSeek Harness keeps `~/.dsh`, so the two never share the reserved desktop profile. */
export const DESKTOP_DATA_HOME_DIR_NAME = '.cch'

/**
 * Select the application's data home before any profile access; an explicit `DSH_HOME` keeps priority.
 * @param env - Process environment, updated in place so the Desktop Host child inherits the same home.
 * @param home - User home directory.
 */
export function selectDesktopDataHome(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): void {
  const configured = env[DSH_HOME_ENV]
  if (configured !== undefined && configured.trim() !== '') return
  env[DSH_HOME_ENV] = join(home, DESKTOP_DATA_HOME_DIR_NAME)
}

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome()): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', 'desktop'),
    lock: join(dshHome, 'profiles', 'desktop', 'lock'),
  }
}
