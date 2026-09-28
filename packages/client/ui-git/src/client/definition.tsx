/** Static Source Control tab type, its guide entry, and its artwork. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ReactNode } from 'react'
import type {} from './locales.ts'

/** Source Control tab kind. */
export const SOURCE_CONTROL_KIND = 'source-control'

/** Source Control implementation identity and keyed Slot dispatch key. */
export const SOURCE_CONTROL_ID = '@deepseek-ai/dsh-client-ui-git'

/**
 * Render the guide entry's fixed-palette branch artwork.
 * @param props - requested edge in pixels.
 * @returns the decorative artwork.
 */
export function GuideArtworkSourceControl({ size = 36, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="12" cy="10" r="3" stroke="#F05033" strokeWidth="2" />
      <circle cx="12" cy="26" r="3" stroke="#F05033" strokeWidth="2" />
      <circle cx="24" cy="14" r="3" stroke="#F05033" strokeWidth="2" />
      <path d="M12 13v10M24 17c0 4-4 5-10.5 6.5" stroke="#F05033" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Build the Source Control type with locale-live copy.
 * @param t - Source Control copy.
 * @returns the tab type and its Start-page guide entry.
 */
export function sourceControlDefinition(t: TranslateNS<'sourceControl'>): SidebarRightTabDefinition {
  return {
    id: SOURCE_CONTROL_ID,
    kind: SOURCE_CONTROL_KIND,
    priority: 'builtin',
    title: () => t('title'),
    guide: [{
      id: 'open', order: 25, title: () => t('title'), description: () => t('guideDescription'), icon: GuideArtworkSourceControl,
    }],
  }
}
