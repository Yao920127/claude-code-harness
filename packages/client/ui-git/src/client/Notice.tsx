/** The outcome line under Source Control and GitHub controls. */
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type {} from './locales.ts'
import type { GitNotice } from './source-control.ts'
import css from './SourceControlBody.module.css'

/**
 * Render a command's failure or a finished clone.
 * @param props - the notice, if any, and Source Control copy.
 * @returns the message, or null without a notice.
 */
export function Notice({ notice, t }: { readonly notice: GitNotice | null; readonly t: TranslateNS<'sourceControl'> }): ReactNode {
  if (notice === null) return null
  return notice.kind === 'error'
    ? <p className={css.error} role="alert">{t('failed', { message: notice.message })}</p>
    : <p className={css.success} role="status">{t('clonedTo', { path: notice.path })}</p>
}
