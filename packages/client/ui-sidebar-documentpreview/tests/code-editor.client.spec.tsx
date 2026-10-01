// @vitest-environment jsdom
/** The real CodeMirror editor: initial text, change reports, Mod-S, and teardown. */
import { cleanup, render } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CodeEditor } from '../src/client/editor/code-editor.tsx'

beforeEach(() => {
  // jsdom lays nothing out and lacks Range geometry; CodeMirror measures ranges while it renders.
  // jsdom reports no macOS platform, so CodeMirror's Mod is Ctrl here.
  Object.assign(Range.prototype, {
    getClientRects: () => Object.assign([], { item: () => null }),
    getBoundingClientRect: () => new DOMRect(),
  })
})
afterEach(() => { cleanup() })

it('shows the initial text, reports edits, saves on Mod-S, and ignores later initial text', () => {
  const onChange = vi.fn()
  const onSave = vi.fn()
  const props = { filename: 'main.py', label: 'Edit', onChange, onSave, className: 'editor' }
  const view = render(<CodeEditor {...props} initialText={'a = 1\n'} />)
  const host = view.container.querySelector('[data-text-editor]')
  expect(host?.className).toBe('editor')
  const editor = host?.querySelector('.cm-editor')
  const cm = editor instanceof HTMLElement ? EditorView.findFromDOM(editor) : null
  expect(cm?.state.doc.toString()).toBe('a = 1\n')
  expect(host?.querySelector('.cm-content')?.getAttribute('aria-label')).toBe('Edit')
  cm?.dispatch({ changes: { from: 0, insert: '# hi\n' } })
  expect(onChange).toHaveBeenLastCalledWith('# hi\na = 1\n')
  cm?.dispatch({ selection: { anchor: 0 } })
  expect(onChange).toHaveBeenCalledOnce()
  cm?.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }))
  expect(onSave).toHaveBeenCalledOnce()
  view.rerender(<CodeEditor {...props} initialText="ignored" />)
  expect(cm?.state.doc.toString()).toBe('# hi\na = 1\n')
  view.unmount()
  expect(host?.querySelector('.cm-editor')).toBeNull()
})

it('edits files without highlighting as plain text', () => {
  const view = render(<CodeEditor initialText="plain" filename="notes.txt" label="Edit" onChange={vi.fn()} onSave={vi.fn()} className="editor" />)
  const editor = view.container.querySelector('.cm-editor')
  expect(editor instanceof HTMLElement ? EditorView.findFromDOM(editor)?.state.doc.toString() : undefined).toBe('plain')
})
