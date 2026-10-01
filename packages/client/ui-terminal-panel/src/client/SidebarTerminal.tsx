/** A terminal page of the right Sidebar: its screen and its tab title, both addressed by the Sidebar tab id. */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TerminalBodyInjected, TerminalInjected } from './face.ts'
import { LazyTerminalBody } from './LazyTerminalBody.tsx'
import { TerminalTitle } from './TerminalTitle.tsx'
import type {} from './locales.ts'

/** Sidebar page share, terminal model, theme, and localized copy. */
export type SidebarTerminalBodyProps =
  PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'terminalPanel'> & InjectFace<TerminalBodyInjected>

/**
 * Render the page's terminal; replacing an ended terminal opens a new terminal page in its place.
 * @param props - the page's tab information, terminal model, theme, and copy.
 * @returns the terminal screen.
 */
export function SidebarTerminalBody({ useTabInfo, ...props }: SidebarTerminalBodyProps): ReactNode {
  const { tab } = useTabInfo()
  return <LazyTerminalBody {...props} tabKey={tab.id} visible={tab.visible}
    onReplace={() => { tab.actions.openTab('terminal', { replaceTab: true }) }} />
}

/** Sidebar tab-title share, terminal model, and localized copy. */
export type SidebarTerminalTitleProps =
  PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'terminalPanel'> & InjectFace<TerminalInjected>

/**
 * Render the page's live terminal name in the Sidebar tab strip.
 * @param props - the page's tab information, terminal model, and copy.
 * @returns the terminal icon and name.
 */
export function SidebarTerminalTitle({ useTabInfo, ...props }: SidebarTerminalTitleProps): ReactNode {
  const { tab } = useTabInfo()
  return <TerminalTitle {...props} tabKey={tab.id} />
}
