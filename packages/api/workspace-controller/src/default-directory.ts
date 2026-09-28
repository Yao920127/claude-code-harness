/** Resolve the Host account's default Workspace directory under its Documents or home directory. */

import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { DEFAULT_WORKSPACE_DIRECTORY } from './default-workspace.ts'

/** Host account directory that holds the default Workspace. */
export type DefaultWorkspaceBase = 'documents' | 'home'

/** Where the default Workspace directory is placed. */
export interface DefaultWorkspaceLocation {
  /** Account directory the path starts from. */
  readonly baseDirectory: DefaultWorkspaceBase
  /** Explicit Documents directory replacing the system lookup; used only under `documents`. */
  readonly documentsDirectory: string | undefined
  /** One path segment between the base directory and the Workspace directory; empty adds none. */
  readonly productDirectory: string
}

/** Platform observations replaceable in directory-resolution tests. */
interface DocumentsDirectoryInternals {
  readonly platform?: NodeJS.Platform
  readonly home?: string
  readonly run?: NativeCommandRunner
}

/**
 * Validate a configured or OS-returned Documents path without resolving it against cwd.
 * @param directory - fully qualified directory spelling.
 * @param platform - Host platform.
 * @returns the normalized directory.
 */
export function validateDocumentsDirectory(directory: string, platform: NodeJS.Platform = process.platform): string {
  const paths = platform === 'win32' ? win32 : posix
  const root = paths.parse(directory).root
  if (!paths.isAbsolute(directory) || (platform === 'win32' && (root === '\\' || root === '/'))) {
    throw new Error(`Documents directory must be fully qualified: '${directory}'`)
  }
  return paths.normalize(directory)
}

/**
 * Resolve the default Workspace directory on the Host without creating files.
 * A `home` base uses the account home directory and needs no system lookup.
 * @param location - base directory, Documents override, and product directory.
 * @param signal - caller lifetime and lookup deadline.
 * @param internals - platform facts and native command runner.
 * @returns the absolute candidate path.
 */
export async function defaultWorkspaceDirectory(
  location: DefaultWorkspaceLocation,
  signal: AbortSignal,
  internals: DocumentsDirectoryInternals = {},
): Promise<string> {
  const platform = internals.platform ?? process.platform
  const paths = platform === 'win32' ? win32 : posix
  signal.throwIfAborted()
  let directory = location.baseDirectory === 'home' ? internals.home ?? homedir() : location.documentsDirectory
  if (directory === undefined) {
    const run = internals.run ?? runNativeCommand
    let stdout: string
    switch (platform) {
      case 'darwin':
        ({ stdout } = await run('osascript', [
          '-e', 'POSIX path of (path to documents folder from user domain without folder creation)',
        ], signal))
        break
      case 'win32':
        ({ stdout } = await run('powershell.exe', [
          '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
          '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); '
          + '[Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments, '
          + '[Environment+SpecialFolderOption]::DoNotVerify)',
        ], signal))
        break
      case 'linux':
        ({ stdout } = await run('xdg-user-dir', ['DOCUMENTS'], signal))
        break
      default:
        throw new Error(`system Documents directory is unavailable on ${platform}`)
    }
    directory = stdout.replace(/[\r\n]+$/, '')
    // XDG reports the home directory when this user directory is disabled.
    if (directory === '' || (platform === 'linux' && paths.normalize(directory) === (internals.home ?? homedir()))) {
      throw new Error('system Documents directory is unavailable')
    }
  }
  directory = validateDocumentsDirectory(directory, platform)
  signal.throwIfAborted()
  return paths.join(directory, location.productDirectory, DEFAULT_WORKSPACE_DIRECTORY)
}
