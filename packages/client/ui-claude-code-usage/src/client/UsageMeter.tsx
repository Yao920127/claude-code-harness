/** Claude Code plan usage at the sidebar foot. */
import type { ReactNode } from 'react'
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClaudeCodeUsageWindow } from '@deepseek-ai/dsh-llm-claude-code/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'
import type { UsageState } from './usage-source.ts'
import css from './UsageMeter.module.css'

/** Meter state and the refresh command. */
export interface UsageMeterInjected {
  readonly hooks: { readonly usage: HostObservable<UsageState> }
  /** Ask Claude Code for current usage. */
  readonly refresh: () => void
}

/** Sidebar-foot share, meter state and copy. */
export type UsageMeterProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<'claudeCodeUsage'> & InjectFace<UsageMeterInjected>

type Translate = UsageMeterProps['t']

/**
 * Name one window.
 * @param window - reported plan window.
 * @param t - usage copy.
 * @returns its localized name.
 */
export function windowLabel(window: ClaudeCodeUsageWindow, t: Translate): string {
  return window.kind === 'model' ? t('window.model', { label: window.label ?? '' }) : t(`window.${window.kind}`)
}

/**
 * Describe when a window resets.
 * @param window - reported plan window.
 * @param t - usage copy.
 * @returns the localized reset time, or undefined when the server reported none.
 */
export function resetText(window: ClaudeCodeUsageWindow, t: Translate): string | undefined {
  if (window.resetsAt === null) return undefined
  const time = new Date(window.resetsAt)
  if (Number.isNaN(time.getTime())) return undefined
  return t('resets', { time: time.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })
}

/**
 * Render every reported window as a labelled bar in the wide sidebar, or the first window's remaining share on the
 * rail. Nothing renders until a read reports plan windows, so a sign-in without a Claude plan, such as an API key
 * or another provider's route, and a failed or pending read leave the sidebar foot unchanged.
 * @param props - sidebar width, meter state, refresh command and copy.
 * @returns the meter, or null while there are no plan windows to show.
 */
export function UsageMeter({ wide, useUsage, refresh, t }: UsageMeterProps): ReactNode {
  const windows = useUsage(value => value.phase === 'ready' && value.view.available ? value.view.windows : undefined)
  const first = windows?.[0]
  if (windows === undefined || first === undefined) return null
  if (!wide) {
    const summary = windows.map(window => [windowLabel(window, t), details(window, t)].join(' · ')).join('\n')
    return (
      <button type="button" className={css.rail} title={`${t('title')}\n${summary}`} aria-label={t('refresh')} onClick={refresh} data-claude-code-usage="">
        {remaining(first, t)}
      </button>
    )
  }
  return (
    <section className={css.root} aria-label={t('title')} data-claude-code-usage="">
      <div className={css.header}>
        <span className={css.title}>{t('title')}</span>
        <button type="button" className={css.refresh} title={t('refresh')} aria-label={t('refresh')} onClick={refresh}>
          <IconRefreshOutlineRegular />
        </button>
      </div>
      {windows.map(window => (
        <div key={`${window.kind}:${window.label ?? ''}`} className={css.row} title={details(window, t)}>
          <span className={css.label}>{windowLabel(window, t)}</span>
          <span
            className={css.bar} role="meter" aria-label={windowLabel(window, t)}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={window.utilization ?? undefined}
          >
            <span className={css.fill} style={{ width: `${clamp(window.utilization ?? 0)}%` }} data-high={(window.utilization ?? 0) >= 80 || undefined} />
          </span>
          <span className={css.value}>{remaining(window, t)}</span>
        </div>
      ))}
    </section>
  )
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** The share of a window still available, such as `剩 13%`. */
function remaining(window: ClaudeCodeUsageWindow, t: Translate): string {
  return window.utilization === null ? t('unknown') : t('remaining', { value: String(100 - Math.round(clamp(window.utilization))) })
}

/** The used share and reset time of a window, for its hover text. */
function details(window: ClaudeCodeUsageWindow, t: Translate): string {
  const used = window.utilization === null ? t('unknown') : t('used', { value: String(Math.round(clamp(window.utilization))) })
  const reset = resetText(window, t)
  return reset === undefined ? used : `${used} · ${reset}`
}
