/** Live terminal names in the panel's tab strip and the right Sidebar's tab strip. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { TerminalIcon } from './TerminalIcon.tsx'
import type { TerminalInjected } from './face.ts'
import type {} from './locales.ts'
import css from './TerminalTitle.module.css'

/**
 * Render the terminal name, editable in place on a double-click of its tab.
 * @param props - panel or Sidebar tab key, terminal model and localized copy.
 * @returns the terminal icon and current name or its editor.
 */
export function TerminalTitle({ tabKey, useTerminal, view, t }: { readonly tabKey: string } & PropsLocale<'terminalPanel'> & InjectFace<TerminalInjected>): ReactNode {
  const title = useTerminal(tabKey, state => state?.info?.title ?? state?.title) ?? t('title')
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const cancelled = useRef(false)
  useLayoutEffect(() => {
    if (editing) return
    // The whole tab chip receives the double-click, not only the name; Dockkit
    // captures the pointer on a Sidebar tab's drag handle.
    const chip = label.current?.closest('[data-terminal-tab], [data-dockkit-tab], [data-dockkit-float-grip]')
    const rename = (event: Event): void => {
      event.stopPropagation()
      cancelled.current = false
      setEditing(true)
    }
    chip?.addEventListener('dblclick', rename)
    return () => { chip?.removeEventListener('dblclick', rename) }
  }, [editing])
  useLayoutEffect(() => {
    if (!editing) return
    input.current?.focus()
    input.current?.select()
  }, [editing])
  return <>
    <TerminalIcon />
    {editing ? <input ref={input} className={css.name} defaultValue={title} maxLength={120} aria-label={t('rename')}
      onPointerDown={(event) => { event.stopPropagation() }}
      onClick={(event) => { event.stopPropagation() }}
      onDoubleClick={(event) => { event.stopPropagation() }}
      onBlur={(event) => {
        setEditing(false)
        const next = event.currentTarget.value.trim()
        if (!cancelled.current && next !== '' && next !== title) void view(tabKey).rename(next)
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        // oxlint-disable-next-line typescript/no-deprecated -- Some IMEs report composition only through keyCode 229.
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
        if (event.key === 'Escape') {
          cancelled.current = true
          event.currentTarget.blur()
        } else if (event.key === 'Enter') event.currentTarget.blur()
      }} />
      : <span ref={label} className={css.title}>{title}</span>}
  </>
}
