/** The conversation's corner button that shows a hidden terminal panel. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TerminalLauncherInjected } from './face.ts'
import type {} from './locales.ts'
import { TerminalIcon } from './TerminalIcon.tsx'
import css from './TerminalLauncher.module.css'

/** Session slot share, the panel state, the shortcut catalog, and the show command. */
export type TerminalLauncherProps =
  PropsRuntime<'conversation.panel.bottom'> & PropsLocale<'terminalPanel'> & InjectFace<TerminalLauncherInjected>

/**
 * Render the button at the conversation's bottom-right corner while the Session's panel is hidden. The
 * button hides while a docked composer spans the column's width, since it would cover the send control.
 * @param props - panel state, shortcut catalog, show command and copy.
 * @returns the button, or null while the panel is shown.
 */
export function TerminalLauncher({ usePanel, useShortcuts, show, t }: TerminalLauncherProps): ReactNode {
  const open = usePanel(panel => panel.open)
  const shortcut = useShortcuts(entries => entries.find(entry => entry.id === 'terminal.toggle'))
  if (open) return null
  const label = shortcut === undefined || shortcut.keys.length === 0 ? t('open') : `${t('open')} (${shortcut.keys.join('')})`
  return (
    <div className={css.seat}>
      <Button
        variant="ghost" size="sm" className={css.launcher} aria-label={t('open')} title={label}
        aria-keyshortcuts={shortcut?.aria} data-terminal-launcher="" onClick={show}
      >
        <TerminalIcon />
      </Button>
    </div>
  )
}
