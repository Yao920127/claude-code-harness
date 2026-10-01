/** CodeMirror text editor, loaded on demand when a file is first opened for editing. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { basicSetup } from 'codemirror'
import { indentWithTab } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { languageForFile } from './languages.ts'

/** Initial text and the callbacks one mounted editor reports through. */
export interface CodeEditorProps {
  /** Document text at mount; later prop changes are ignored, so a new document remounts the editor. */
  readonly initialText: string
  /** File name selecting syntax highlighting. */
  readonly filename: string
  /** Accessible name of the editing area. */
  readonly label: string
  /** @param text - the complete document after each change. */
  readonly onChange: (text: string) => void
  /** Requested by Mod-S inside the editor. */
  readonly onSave: () => void
  /** Host element class; the eager body owns the stylesheet so this lazy chunk shares no CSS module with it. */
  readonly className?: string | undefined
}

/** Colors and fonts from the app theme, so the editor follows light and dark mode. */
const appTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--dsw-alias-label-primary)',
    backgroundColor: 'var(--dsw-alias-bg-base)',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--ds-font-family-code)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--dsw-alias-label-primary)' },
  '.cm-gutters': {
    color: 'var(--dsw-alias-label-tertiary)',
    backgroundColor: 'var(--dsw-alias-bg-base)',
    borderRight: '0.5px solid var(--dsw-alias-border-l3)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--dsw-alias-bg-layer-1)' },
})

/**
 * Mount one CodeMirror view over the initial text, highlighted for the file name.
 * @param props - initial text, file name, accessible label, change and save callbacks, and host class.
 * @returns the editor host element.
 */
export function CodeEditor({ initialText, filename, label, onChange, onSave, className }: CodeEditorProps): ReactNode {
  const host = useRef<HTMLDivElement | null>(null)
  const [initial] = useState(initialText)
  const callbacks = useRef({ onChange, onSave })
  callbacks.current = { onChange, onSave }
  useEffect(() => {
    const parent = host.current
    /* v8 ignore next -- React attaches the host ref before it runs effects. */
    if (parent === null) return
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => { callbacks.current.onSave(); return true } },
            indentWithTab,
          ]),
          languageForFile(filename) ?? [],
          appTheme,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    return () => { view.destroy() }
  }, [initial, filename, label])
  return <div ref={host} className={className} data-text-editor="" />
}
