/** File operations and per-tab drafts behind the text editor; the body holds no Remote or tab-lifetime logic. */
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceFileBytes, WorkspaceFileStat } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionFile } from '../rpc.ts'

/** One tab's editing state: the current text and the file text and version it was loaded or saved as. */
export interface EditorDraft {
  /** Text in the editor, including unsaved changes. */
  text: string
  /** File text at `version`; the draft is unsaved while `text` differs from it. */
  savedText: string
  /** File version `savedText` was read or written at. */
  version: string
}

/** The complete text and version of one file. */
export interface LoadedText {
  readonly text: string
  readonly version: string
}

/** Result of one save: the new version, a refusal because the file changed, or a failure line. */
export type SaveOutcome =
  | { readonly kind: 'saved'; readonly version: string }
  | { readonly kind: 'changed' }
  | { readonly kind: 'failed'; readonly message: string }

/** The file operations the editor body calls; a failed load rejects with a reader-facing message. */
export interface EditorFiles {
  /** @param file - Session and path. @param signal - load lifetime. @returns the file's complete text and version. */
  load(file: SessionFile, signal: AbortSignal): Promise<LoadedText>
  /** @param file - Session and path. @param signal - read lifetime. @returns the file's current version. */
  version(file: SessionFile, signal: AbortSignal): Promise<string>
  /**
   * @param file - Session and path.
   * @param text - complete new text.
   * @param version - version the text was edited from.
   * @returns the outcome.
   */
  save(file: SessionFile, text: string, version: string): Promise<SaveOutcome>
}

/** The `workspaceFiles` Remote members the editor calls. */
export interface EditorFilesRemote {
  readBytes(
    sessionId: SessionFile['sessionId'], path: string, options: Record<string, never>, signal?: AbortSignal,
  ): Promise<RemoteResult<WorkspaceFileBytes>>
  stat(sessionId: SessionFile['sessionId'], path: string, signal?: AbortSignal): Promise<RemoteResult<WorkspaceFileStat>>
  write(
    sessionId: SessionFile['sessionId'], path: string, request: { readonly text: string; readonly version: string }, signal?: AbortSignal,
  ): Promise<RemoteResult<WorkspaceFileStat>>
}

/** Reader-facing messages for failures the operations report. */
export interface EditorFilesCopy {
  /** @param failure - a Remote failure. @returns its message line. */
  readonly failure: (failure: RemoteFailure) => string
  /** Message for bytes that are not UTF-8 text. */
  readonly notText: () => string
}

/**
 * Bind the editor's file operations to the `workspaceFiles` Remote.
 * @param remote - generated `workspaceFiles` namespace.
 * @param copy - failure messages.
 * @returns load, version, and save operations.
 */
export function remoteEditorFiles(remote: EditorFilesRemote, copy: EditorFilesCopy): EditorFiles {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  return {
    load: async (file, signal) => {
      const result = await remote.readBytes(file.sessionId, file.path, {}, signal)
      if (!result.ok) throw new Error(copy.failure(result.error), { cause: result.error })
      let text: string
      try {
        text = decoder.decode(result.value.data)
      } catch (cause: unknown) {
        throw new Error(copy.notText(), { cause })
      }
      if (text.includes(String.fromCharCode(0))) throw new Error(copy.notText())
      return { text, version: result.value.version }
    },
    version: async (file, signal) => {
      const result = await remote.stat(file.sessionId, file.path, signal)
      if (!result.ok) throw new Error(copy.failure(result.error), { cause: result.error })
      return result.value.version
    },
    save: async (file, text, version) => {
      const result = await remote.write(file.sessionId, file.path, { text, version })
      if (result.ok) return { kind: 'saved', version: result.value.version }
      if (result.error.code === 'workspace-file/changed') return { kind: 'changed' }
      return { kind: 'failed', message: copy.failure(result.error) }
    },
  }
}

/** Drafts of every open editor tab, each kept until its tab closes. */
export class EditorDrafts {
  private readonly drafts = new Map<TabId, EditorDraft>()

  /**
   * Read one tab's draft.
   * @param tab - owning tab.
   * @returns its draft, or undefined before the first load.
   */
  get(tab: TabId): EditorDraft | undefined {
    return this.drafts.get(tab)
  }

  /**
   * Keep a tab's first draft until the tab closes.
   * @param tab - owning tab.
   * @param draft - the loaded draft.
   * @param signal - the tab's lifetime; aborting it forgets the draft.
   */
  set(tab: TabId, draft: EditorDraft, signal: AbortSignal): void {
    if (signal.aborted) return
    this.drafts.set(tab, draft)
    signal.addEventListener('abort', () => { this.drafts.delete(tab) }, { once: true })
  }
}
