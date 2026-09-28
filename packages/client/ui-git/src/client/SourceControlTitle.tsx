/** The Source Control tab's chip: a branch glyph before the tab's title. */
import type { ReactNode } from 'react'
import { IconBranchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import css from './SourceControlBody.module.css'

/**
 * Render the title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the glyph followed by the tab's title text.
 */
export function SourceControlTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <IconBranchOutlineRegular className={css.titleIcon} />
      {tab.title}
    </>
  )
}
