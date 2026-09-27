/** The right Sidebar Start-page card that opens the terminal panel below the conversation. */
import type { ReactNode } from 'react'
import { PluginArtworkTerminal, ShortcutKeys } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TerminalGuideEntryInjected } from './face.ts'
import type {} from './locales.ts'
import css from './TerminalGuideEntry.module.css'

/** Start-page owner share, the shortcut catalog, and the open command. */
export type TerminalGuideEntryProps =
  PropsRuntime<'sidebar.right.tab.guide.entry'> & PropsLocale<'terminalPanel'> & InjectFace<TerminalGuideEntryInjected>

/**
 * Render the Start-page card; picking it opens the bottom panel and leaves the Start page in place.
 * @param props - the guide's title and description, the shortcut catalog, and the open command.
 * @returns the card button.
 */
export function TerminalGuideEntry({ kind, title, description, useShortcuts, open }: TerminalGuideEntryProps): ReactNode {
  const shortcut = useShortcuts(entries => entries.find(entry => entry.id === 'terminal.toggle'))
  return (
    <button type="button" className={css.entry} data-sidebar-right-guide-entry={kind} aria-keyshortcuts={shortcut?.aria} onClick={open}>
      <span className={css.icon} aria-hidden="true"><PluginArtworkTerminal size={description === undefined ? 22 : 26} /></span>
      <span className={css.text}>
        <span className={css.title}>{title}</span>
        {description !== undefined && <span className={css.description}>{description}</span>}
      </span>
      {shortcut !== undefined && shortcut.keys.length > 0 && <ShortcutKeys keys={shortcut.keys} />}
    </button>
  )
}
