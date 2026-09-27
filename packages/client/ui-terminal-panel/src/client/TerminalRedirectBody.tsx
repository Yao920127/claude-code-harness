/** A `terminal` Sidebar page, such as one a saved layout restores, hands off to the bottom panel. */
import { useEffect, useRef, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TerminalRedirectInjected } from './face.ts'

/** Sidebar page share and the open command. */
export type TerminalRedirectBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<TerminalRedirectInjected>

/**
 * Open the bottom panel and close this Sidebar page once it mounts.
 * @param props - the page's tab information and the open command.
 * @returns nothing; the page closes itself.
 */
export function TerminalRedirectBody({ useTabInfo, open }: TerminalRedirectBodyProps): ReactNode {
  const { tab } = useTabInfo()
  // One hand-off per page: a re-render before the close commits must not open a second terminal.
  const handedOff = useRef(false)
  useEffect(() => {
    if (handedOff.current) return
    handedOff.current = true
    open()
    tab.actions.close()
  }, [open, tab.actions])
  return null
}
