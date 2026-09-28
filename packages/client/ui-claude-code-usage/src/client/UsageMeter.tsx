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
 * Render every reported window as a labelled bar in the wide sidebar, or the five-hour figure on the rail.
 * @param props - sidebar width, meter state, refresh command and copy.
 * @returns the meter.
 */
export function UsageMeter({ wide, useUsage, refresh, t }: UsageMeterProps): ReactNode {
  const state = useUsage(value => value)
  const windows = state.phase === 'ready' ? state.view.windows : []
  const summary = state.phase === 'loading'
    ? t('loading')
    : state.phase === 'failed'
      ? t('failed', { message: state.message })
      : state.view.available
        ? windows.map(window => [windowLabel(window, t), details(window, t)].join(' · ')).join('\n')
        : t('unavailable')
  if (!wide) {
    const first = windows[0]
    return (
      <button type="button" className={css.rail} title={`${t('title')}\n${summary}`} aria-label={t('refresh')} onClick={refresh} data-claude-code-usage="">
        {first === undefined ? <IconRefreshOutlineRegular /> : remaining(first, t)}
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
      {state.phase !== 'ready' || !state.view.available
        ? <p className={css.note} role={state.phase === 'failed' ? 'alert' : undefined}>{summary}</p>
        : windows.map(window => (
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
