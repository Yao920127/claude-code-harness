/** The resizable terminal panel below one Session's conversation. */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconPlusOutlineRegular, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TerminalLaunchShells } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TerminalPanelInjected } from './face.ts'
import { LazyTerminalBody } from './LazyTerminalBody.tsx'
import type {} from './locales.ts'
import { TerminalTitle } from './TerminalTitle.tsx'
import css from './TerminalPanel.module.css'

/** Session slot share, panel state and commands, and localized copy. */
export type TerminalPanelProps =
  PropsRuntime<'conversation.panel.bottom'> & PropsLocale<'terminalPanel'> & InjectFace<TerminalPanelInjected>

/** Height change of one keyboard step on the resize handle, in CSS pixels. */
const RESIZE_STEP = 24

/**
 * Render the Session's terminal tabs while its panel is shown. Every tab's
 * screen stays mounted so switching tabs keeps each emulator's output.
 * @param props - Session identity, panel state, terminal models and copy.
 * @returns the panel, or null while it is hidden.
 */
export function TerminalPanel(props: TerminalPanelProps): ReactNode {
  const { sessionId, attach, usePanel, t } = props
  useEffect(() => attach(), [attach])
  const panel = usePanel(value => value)
  if (!panel.open || panel.active === undefined) return null
  const id = (key: string, part: 'tab' | 'body'): string => `terminal-panel-${sessionId}-${key}-${part}`
  return (
    <section className={css.root} style={{ height: panel.height }} aria-label={t('title')} data-terminal-panel="">
      <ResizeHandle height={panel.height} label={t('resize')} onResize={props.resize} />
      <div className={css.bar}>
        <div className={css.tabs} role="tablist" aria-label={t('tabs')}>
          {panel.tabs.map(tab => (
            <TerminalTab
              key={tab.key} tabKey={tab.key} active={tab.key === panel.active}
              tabId={id(tab.key, 'tab')} bodyId={id(tab.key, 'body')} {...props}
            />
          ))}
        </div>
        <div className={css.actions}>
          <ShellMenu {...props} />
          <Button variant="ghost" size="sm" className={css.action} aria-label={t('hide')} title={t('hide')} onClick={props.hide}>
            <IconChevronDownOutlineRegular />
          </Button>
        </div>
      </div>
      {panel.tabs.map(tab => (
        <div
          key={tab.key} id={id(tab.key, 'body')} role="tabpanel" aria-labelledby={id(tab.key, 'tab')}
          className={css.body} hidden={tab.key !== panel.active}
        >
          <LazyTerminalBody
            tabKey={tab.key} visible={tab.key === panel.active} onReplace={() => { props.replace(tab.key) }}
            view={props.view} useTerminal={props.useTerminal} useTheme={props.useTheme} t={t}
          />
        </div>
      ))}
    </section>
  )
}

function TerminalTab({ tabKey, active, tabId, bodyId, select, close, view, useTerminal, t }: TerminalPanelProps & {
  readonly tabKey: string
  readonly active: boolean
  readonly tabId: string
  readonly bodyId: string
}): ReactNode {
  const title = useTerminal(tabKey, state => state?.info?.title ?? state?.title) ?? t('title')
  const choose = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    select(tabKey)
  }
  return (
    <div
      id={tabId} role="tab" tabIndex={active ? 0 : -1} aria-selected={active} aria-controls={bodyId}
      className={clsx(css.tab, active && css.tabActive)} data-terminal-tab=""
      onClick={() => { select(tabKey) }} onKeyDown={choose}
    >
      <TerminalTitle tabKey={tabKey} view={view} useTerminal={useTerminal} t={t} />
      <button
        type="button" className={css.tabClose} aria-label={t('closeTab', { title })} title={t('closeTab', { title })}
        onClick={(event) => { event.stopPropagation(); close(tabKey) }}
      >
        <IconCloseOutlineRegular />
      </button>
    </div>
  )
}

type MenuState = { phase: 'loading' } | { phase: 'ready'; choices: TerminalLaunchShells } | { phase: 'failed'; message: string }

/** Open a terminal with the remembered shell, or choose another shell from the menu. */
function ShellMenu({ add, loadShells, selectShell, t }: TerminalPanelProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<MenuState>({ phase: 'loading' })
  useEffect(() => {
    if (!open) return
    const lifetime = new AbortController()
    void loadShells(lifetime.signal).then((choices) => {
      if (!lifetime.signal.aborted) setState({ phase: 'ready', choices })
    }, (error: unknown) => {
      if (!lifetime.signal.aborted) setState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { lifetime.abort() }
  }, [open, attempt, loadShells])
  const items = state.phase === 'ready'
    ? state.choices.shells.map(shell => ({ id: shell.path, label: shell.name }))
    : state.phase === 'loading'
      ? [{ id: 'loading', label: t('shellLoading'), disabled: true }]
      : [{ id: 'error', label: t('failed', { message: state.message }), disabled: true }, { id: 'retry', label: t('retry') }]
  return (
    <span className={css.launch}>
      <Button
        variant="ghost" size="sm" className={css.action} aria-label={t('new')} title={t('new')} data-terminal-panel-new=""
        onClick={() => { add() }}
      >
        <IconPlusOutlineRegular />
      </Button>
      <Menu
        open={open} portal autoFocus align="end"
        items={items.length === 0 ? [{ id: 'empty', label: t('shellEmpty'), disabled: true }] : items}
        selectedId={state.phase === 'ready' ? state.choices.selectedShell : undefined}
        onClose={() => { setOpen(false) }}
        onSelect={(path) => {
          if (state.phase === 'failed') { setState({ phase: 'loading' }); setAttempt(value => value + 1); return }
          selectShell(path)
          setOpen(false)
          add(path)
        }}
        anchor={(
          <Button
            variant="ghost" size="sm" className={css.action} aria-label={t('shell')} aria-haspopup="menu" aria-expanded={open}
            onClick={() => { setState({ phase: 'loading' }); setOpen(value => !value) }}
          >
            <IconChevronDownOutlineRegular />
          </Button>
        )}
      />
    </span>
  )
}

/** The top edge of the panel: drag or use the arrow keys to change its height. */
function ResizeHandle({ height, label, onResize }: {
  readonly height: number
  readonly label: string
  readonly onResize: (height: number) => void
}): ReactNode {
  const drag = useRef<{ pointer: number; startY: number; startHeight: number }>()
  const begin = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointer: event.pointerId, startY: event.clientY, startHeight: height }
  }
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const active = drag.current
    if (active?.pointer !== event.pointerId) return
    // Dragging up grows the panel: the handle is its top edge.
    onResize(active.startHeight + active.startY - event.clientY)
  }
  const end = (): void => { drag.current = undefined }
  const step = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    onResize(height + (event.key === 'ArrowUp' ? RESIZE_STEP : -RESIZE_STEP))
  }
  return (
    <div
      className={css.handle} role="separator" aria-orientation="horizontal" aria-label={label}
      aria-valuenow={height} tabIndex={0}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={step}
    />
  )
}
