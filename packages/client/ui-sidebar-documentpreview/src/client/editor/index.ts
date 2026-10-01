/** Text editor registration: a viewer choice offered beside plain text that edits and saves the file. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type {} from '../index.ts'
import { failureLine } from '../failure-line.ts'
import { EditorBody, type EditorBodyInjected } from './EditorBody.tsx'
import { EditorDrafts, remoteEditorFiles, type EditorFiles } from './files.ts'
import { en, zh } from './locales.ts'

/** Stable text editor implementation identity within this package. */
export const EDITOR_BODY_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/editor'

const NS = 'sidebarTextEditor'

/**
 * Register the editor as a text alternative, backed by the `workspaceFiles` Remote while it is mounted.
 * @param ctx - owning plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  const t = ctx.locale.bind(NS)
  const documentT = ctx.locale.bind('sidebarDocumentPreview')
  const unavailable: EditorFiles = {
    load: () => Promise.reject(new Error(t('unavailable'))),
    version: () => Promise.reject(new Error(t('unavailable'))),
    save: () => Promise.resolve({ kind: 'failed', message: t('unavailable') }),
  }
  let files = unavailable
  const current: EditorFiles = {
    load: (file, signal) => files.load(file, signal),
    version: (file, signal) => files.version(file, signal),
    save: (file, text, version) => files.save(file, text, version),
  }
  const drafts = new EditorDrafts()
  ctx.effect(() => ctx.documentPreviews.register({
    id: EDITOR_BODY_ID, extensions: [], textAlternative: true, priority: 'builtin',
    title: () => t('title'), loading: 'renderer', wrap: false,
  }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document', key: EDITOR_BODY_ID, locale: NS,
    inject: (): EditorBodyInjected => ({ files: current, drafts }),
  }, EditorBody)))
  ctx.inject(['remote', 'remote.workspaceFiles'], (scope) => {
    const { workspaceFiles } = scope.remote
    scope.effect(() => {
      files = remoteEditorFiles(workspaceFiles, {
        failure: failure => failureLine(documentT, failure),
        notText: () => documentT('error.notText'),
      })
      return () => { files = unavailable }
    })
  })
}
