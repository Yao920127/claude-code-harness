/**
 * Text editor body: loads the whole file, keeps the tab's draft across
 * remounts, saves with the version the draft was based on, and reports a file
 * changed elsewhere instead of overwriting it.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import { hostFileOf, type SessionFile } from '../rpc.ts'
import type { EditorDraft, EditorDrafts, EditorFiles } from './files.ts'
import type {} from './locales.ts'
import common from '../TextPreview.module.css'
import css from './EditorBody.module.css'

const CodeEditor = lazy(async () => ({ default: (await import('./code-editor.tsx')).CodeEditor }))

/** File operations and per-tab drafts supplied by the plugin. */
export interface EditorBodyInjected {
  readonly files: EditorFiles
  readonly drafts: EditorDrafts
}

/** Document owner props, the injected operations, and the editor's copy. */
export type EditorBodyProps = DocumentPreviewProps & EditorBodyInjected & PropsLocale<'sidebarTextEditor'>

/** A notice above the editor: the file changed under a save, or on disk under unsaved changes. */
type Notice = 'changed' | 'external'

/** Load progress of the tab's draft. */
type Phase = { readonly kind: 'loading' } | { readonly kind: 'ready' } | { readonly kind: 'failed'; readonly message: string }

/** @param error - a rejection. @returns its reader-facing message. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** @param draft - a tab's draft. @returns whether it holds unsaved changes. */
function isDirty(draft: EditorDraft): boolean {
  return draft.text !== draft.savedText
}

/**
 * Render the editor for a renderer-owned document request.
 * @param props - document request, file operations, drafts, and copy.
 * @returns the editor, or the loading or failure state; nothing for a non-renderer request.
 */
export function EditorBody(props: EditorBodyProps): ReactNode {
  const { files, drafts, resourceAddress, t } = props
  const { tab } = props.useTabInfo()
  const request = props.content.kind === 'renderer' ? props.content : undefined
  const file = useMemo(() => hostFileOf(resourceAddress), [resourceAddress])
  const [phase, setPhase] = useState<Phase>(() => (drafts.get(tab.id) === undefined ? { kind: 'loading' } : { kind: 'ready' }))
  const [editorKey, setEditorKey] = useState(0)
  const [notice, setNotice] = useState<Notice>()

  // Each content revision (first open, Reload, a change on disk) reads the file
  // again; the request's callbacks belong to the revision that started the read.
  const requestRef = useRef(request)
  requestRef.current = request
  const revision = request?.revision
  useEffect(() => {
    const current = requestRef.current
    if (current === undefined) return
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, tab.signal])
    files.load(file, signal).then((loaded) => {
      if (signal.aborted) return
      const draft = drafts.get(tab.id)
      if (draft === undefined) {
        drafts.set(tab.id, { text: loaded.text, savedText: loaded.text, version: loaded.version }, tab.signal)
        setPhase({ kind: 'ready' })
      } else if (loaded.version !== draft.version && loaded.text !== draft.savedText) {
        // Unsaved changes stay; a clean draft follows the file.
        if (isDirty(draft)) setNotice('external')
        else {
          Object.assign(draft, { text: loaded.text, savedText: loaded.text, version: loaded.version })
          setEditorKey(key => key + 1)
        }
      } else {
        draft.version = loaded.version
      }
      current.loaded(loaded.version)
    }, (error: unknown) => {
      if (signal.aborted) return
      setPhase({ kind: 'failed', message: messageOf(error) })
      current.failed()
    })
    return () => { controller.abort() }
  }, [revision, file, files, drafts, tab.id, tab.signal])

  if (request === undefined) return null
  if (phase.kind === 'failed') {
    return <div className={common.empty} data-text-editor-failed="">
      <p className={common.emptyLine}>{t('failed', { message: phase.message })}</p>
      <Button size="sm" onClick={request.reload}>{t('retry')}</Button>
    </div>
  }
  const draft = drafts.get(tab.id)
  if (phase.kind === 'loading' || draft === undefined) return <LoadingIndicator label={t('loading')} />
  return <LoadedEditor
    draft={draft} file={file} files={files} signal={tab.signal} filename={pathPartsOf(resourceAddress).name}
    editorKey={editorKey} notice={notice} setNotice={setNotice} replaced={() => { setEditorKey(key => key + 1) }} t={t}
  />
}

/** A loaded draft with its save bar, notices, and editor. */
interface LoadedEditorProps extends PropsLocale<'sidebarTextEditor'> {
  readonly draft: EditorDraft
  readonly file: SessionFile
  readonly files: EditorFiles
  /** The tab's lifetime, bounding reads the bar starts. */
  readonly signal: AbortSignal
  readonly filename: string
  /** Changes whenever the draft text was replaced, remounting the editor over it. */
  readonly editorKey: number
  readonly notice: Notice | undefined
  readonly setNotice: (notice: Notice | undefined) => void
  /** Report that the draft text was replaced. */
  readonly replaced: () => void
}

function LoadedEditor({ draft, file, files, signal, filename, editorKey, notice, setNotice, replaced, t }: LoadedEditorProps): ReactNode {
  const [dirty, setDirty] = useState(() => isDirty(draft))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const loading = <LoadingIndicator label={t('loading')} />

  const save = async (overwrite: boolean): Promise<void> => {
    if (saving) return
    setSaving(true)
    setSaveError(undefined)
    try {
      const text = draft.text
      const version = overwrite ? await files.version(file, signal) : draft.version
      const outcome = await files.save(file, text, version)
      switch (outcome.kind) {
        case 'saved':
          Object.assign(draft, { savedText: text, version: outcome.version })
          setNotice(undefined)
          break
        case 'changed':
          setNotice('changed')
          break
        case 'failed':
          setSaveError(outcome.message)
          break
      }
    } catch (error: unknown) {
      setSaveError(messageOf(error))
    } finally {
      setDirty(isDirty(draft))
      setSaving(false)
    }
  }

  const reload = (): void => {
    setNotice(undefined)
    setSaveError(undefined)
    files.load(file, signal).then((loaded) => {
      Object.assign(draft, { text: loaded.text, savedText: loaded.text, version: loaded.version })
      setDirty(false)
      replaced()
    }, (error: unknown) => { setSaveError(messageOf(error)) })
  }

  return <div className={css.root}>
    <div className={css.bar}>
      <span className={css.status} role="status">{saving ? t('saving') : dirty ? t('unsaved') : t('saved')}</span>
      <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={() => { void save(false) }}>{t('save')}</Button>
    </div>
    {notice !== undefined && <div className={css.notice} role="alert">
      <span>{t(notice)}</span>
      <Button size="sm" onClick={reload}>{t('reload')}</Button>
      <Button size="sm" disabled={saving} onClick={() => { void save(true) }}>{t('overwrite')}</Button>
    </div>}
    {saveError !== undefined && <div className={css.notice} role="alert">{t('saveFailed', { message: saveError })}</div>}
    <div className={css.body}>
      <Suspense fallback={loading}>
        <CodeEditor
          key={editorKey}
          initialText={draft.text}
          filename={filename}
          label={t('title')}
          className={css.editor}
          onChange={(text) => { draft.text = text; setDirty(isDirty(draft)) }}
          onSave={() => { void save(false) }}
        />
      </Suspense>
    </div>
  </div>
}
