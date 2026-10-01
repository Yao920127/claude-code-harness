/** The right Sidebar Start-page card that opens a terminal page in the right Sidebar. */
import type { ReactNode } from 'react'
import { PluginArtworkTerminal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './locales.ts'
import css from './TerminalGuideEntry.module.css'

/** Start-page owner share. */
export type TerminalGuideEntryProps = PropsRuntime<'sidebar.right.tab.guide.entry'> & PropsLocale<'terminalPanel'>

/**
 * Render the Start-page card; picking it replaces the Start page with a terminal page.
 * @param props - the guide's title and description and the enclosing tab's actions.
 * @returns the card button.
 */
export function TerminalGuideEntry({ kind, title, description, useTabInfo }: TerminalGuideEntryProps): ReactNode {
  const { tab } = useTabInfo()
  return (
    <button type="button" className={css.entry} data-sidebar-right-guide-entry={kind}
      onClick={() => { tab.actions.openTab('terminal', { replaceTab: true }) }}>
      <span className={css.icon} aria-hidden="true"><PluginArtworkTerminal size={description === undefined ? 22 : 26} /></span>
      <span className={css.text}>
        <span className={css.title}>{title}</span>
        {description !== undefined && <span className={css.description}>{description}</span>}
      </span>
    </button>
  )
}
