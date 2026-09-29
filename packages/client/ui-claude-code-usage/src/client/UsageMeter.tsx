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

/** Which share of each window the meter prints and draws. */
export type UsageDisplay = 'used' | 'remaining'

/** Meter state, the viewer's display choice, and their commands. */
export interface UsageMeterInjected {
  readonly hooks: { readonly usage: HostObservable<UsageState>; readonly display: HostObservable<UsageDisplay> }
  /** Ask Claude Code for current usage. */
  readonly refresh: () => void
  /** Switch between printing the used and the remaining share. */
  readonly setDisplay: (display: UsageDisplay) => void
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
 * Render every reported window as a labelled bar in the wide sidebar, or the first window's share on the rail. The
 * viewer chooses whether values and bars show the used or the remaining share; bar colors follow the used share in
 * both. Nothing renders until a read reports plan windows, so a sign-in without a Claude plan, such as an API key or
 * another provider's route, and a failed or pending read leave the sidebar foot unchanged.
 * @param props - sidebar width, meter state, display choice, commands and copy.
 * @returns the meter, or null while there are no plan windows to show.
 */
export function UsageMeter({ wide, useUsage, useDisplay, refresh, setDisplay, t }: UsageMeterProps): ReactNode {
  const windows = useUsage(value => value.phase === 'ready' && value.view.available ? value.view.windows : undefined)
  const display = useDisplay(value => value === 'used' ? 'used' : 'remaining')
  const first = windows?.[0]
  if (windows === undefined || first === undefined) return null
  if (!wide) {
    const summary = windows.map(window => [windowLabel(window, t), details(window, t)].join(' · ')).join('\n')
    return (
      <button
        type="button" className={css.rail} title={`${t('title')}\n${summary}`} aria-label={t('refresh')} onClick={refresh}
        data-level={level(first)} data-claude-code-usage=""
      >
        {share(first, display, t)}
      </button>
    )
  }
  return (
    <section className={css.root} aria-label={t('title')} data-claude-code-usage="">
      <div className={css.header}>
        <span className={css.title}>{t('title')}</span>
        <div className={css.toggle} role="group" aria-label={t('display')}>
          {(['used', 'remaining'] as const).map(option => (
            <button
              key={option} type="button" className={css.option} aria-pressed={display === option}
              onClick={() => { setDisplay(option) }}
            >
              {t(`display.${option}`)}
            </button>
          ))}
        </div>
        <button type="button" className={css.refresh} title={t('refresh')} aria-label={t('refresh')} onClick={refresh}>
          <IconRefreshOutlineRegular />
        </button>
      </div>
      {windows.map(window => (
        <div key={`${window.kind}:${window.label ?? ''}`} className={css.row} title={details(window, t)}>
          <div className={css.line}>
            <span className={css.label}>{windowLabel(window, t)}</span>
            <span className={css.value} data-level={level(window)}>{share(window, display, t)}</span>
          </div>
          <span
            className={css.bar} role="meter" aria-label={windowLabel(window, t)}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={window.utilization ?? undefined}
          >
            <span className={css.fill} style={{ width: `${barWidth(window, display)}%` }} data-level={level(window)} />
          </span>
        </div>
      ))}
    </section>
  )
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** Color band of a window by its used share: under half, under 80%, or 80% and more. */
function level(window: ClaudeCodeUsageWindow): 'low' | 'medium' | 'high' | undefined {
  if (window.utilization === null) return undefined
  return window.utilization >= 80 ? 'high' : window.utilization >= 50 ? 'medium' : 'low'
}

function barWidth(window: ClaudeCodeUsageWindow, display: UsageDisplay): number {
  const used = clamp(window.utilization ?? 0)
  return display === 'used' || window.utilization === null ? used : 100 - used
}

/** The chosen share of a window, such as `剩余 13%` or `已用 87%`. */
function share(window: ClaudeCodeUsageWindow, display: UsageDisplay, t: Translate): string {
  if (window.utilization === null) return t('unknown')
  const used = Math.round(clamp(window.utilization))
  return display === 'used' ? t('used', { value: String(used) }) : t('remaining', { value: String(100 - used) })
}

/** The used share and reset time of a window, for its hover text. */
function details(window: ClaudeCodeUsageWindow, t: Translate): string {
  const used = share(window, 'used', t)
  const reset = resetText(window, t)
  return reset === undefined ? used : `${used} · ${reset}`
}
