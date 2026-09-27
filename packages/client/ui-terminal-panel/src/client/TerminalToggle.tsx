/** The composer toolbar's button that shows and hides the terminal panel. */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TerminalToggleInjected } from './face.ts'
import { TerminalIcon } from './TerminalIcon.tsx'
import type {} from './locales.ts'
import css from './TerminalToggle.module.css'

/** Composer toolbar share, panel state, shortcut catalog and copy. */
export type TerminalToggleProps =
  PropsRuntime<'conversation.input.right'> & PropsLocale<'terminalPanel'> & InjectFace<TerminalToggleInjected>

/**
 * Render a pressed-state toggle for the Session's terminal panel.
 * @param props - panel state, the toggle command and localized copy.
 * @returns the toggle button, labelled with its effective shortcut.
 */
export function TerminalToggle({ usePanel, useShortcuts, toggle, t }: TerminalToggleProps): ReactNode {
  const open = usePanel(panel => panel.open)
  const shortcut = useShortcuts(entries => entries.find(entry => entry.id === 'terminal.toggle'))
  return (
    <button
      type="button" className={css.toggle} aria-pressed={open} aria-label={t('toggle')} title={t('toggle')}
      aria-keyshortcuts={shortcut?.aria} onClick={toggle}
    >
      <TerminalIcon />
    </button>
  )
}
