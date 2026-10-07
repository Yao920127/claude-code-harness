import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './index.ts'
import { CLAUDE_MARK_COLOR, CLAUDE_MARK_PATH, CLAUDE_MARK_VIEWBOX } from './mark.ts'

/** Square edge of the blank-session hero mark, which stands alone without a headline. */
export const CLAUDE_HERO_MARK_SIZE = 64

/** Presentation shared by the sidebar and hero mark positions. */
interface ClaudeMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class preserving the surrounding mark geometry. */
  className?: string | undefined
}

/**
 * Render the Claude mark at the requested square size.
 * @param props - Host-supplied size and optional placement class.
 * @returns the decorative mark.
 */
export function ClaudeMark({ size, className }: ClaudeMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${CLAUDE_MARK_VIEWBOX} ${CLAUDE_MARK_VIEWBOX}`}
      aria-hidden="true"
    >
      <path d={CLAUDE_MARK_PATH} fill={CLAUDE_MARK_COLOR} />
    </svg>
  )
}

/**
 * Render the product name beside the sidebar mark.
 * @param props - The framework translate seat for the `brand.claude` namespace.
 * @returns the name text.
 */
export function ClaudeBrandName({ t }: PropsLocale<'brand.claude'>) {
  return <span>{t('name')}</span>
}

/**
 * Render the blank-session hero mark at {@link CLAUDE_HERO_MARK_SIZE} in place
 * of the host's headline-sized request.
 * @param props - Host placement class; the host size is replaced.
 * @returns the decorative mark.
 */
export function ClaudeHeroMark({ className }: ClaudeMarkProps) {
  return <ClaudeMark size={CLAUDE_HERO_MARK_SIZE} className={className} />
}

/**
 * Occupy the hero headline seat with no text, so the hero shows the mark alone
 * instead of the host's fallback headline.
 * @returns nothing.
 */
export function ClaudeHeroHeadline() {
  return null
}
