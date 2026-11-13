/**
 * Workflow view: Session totals, the list of user turns, and the selected
 * turn's model calls, each drawn as request → response → tool calls.
 */

import { useCallback, useMemo, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonTreeProps } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  appendTrajectoryPartialLayout, deriveTrajectoryLayout, lastCellIndex,
} from './layout.ts'
import { deriveWorkflow, summarizeWorkflow, type WorkflowTurn } from './workflow-model.ts'
import { clockTime, StatusMark, WorkflowCallCard } from './WorkflowCallCard.tsx'
import { formatDuration, recordSummary } from './WorkflowDetails.tsx'
import type { TrajectoryTranslate } from './locales.ts'
import css from './FlowView.module.css'

/** Session-bound controls not already supplied by the conversation view slot. */
export interface FlowViewInjected {
  /** Shared wrapping preference read by JSON string expansion. */
  jsonStringWrapping?: Omit<NonNullable<JsonTreeProps['stringWrapping']>, 'label'>
  /** Page older Session history into the resident window. @returns Whether older records arrived. */
  loadOlder: () => Promise<boolean>
}

function turnHeading(turn: WorkflowTurn, t: TrajectoryTranslate): string {
  if (turn.turn === null) return t('section.betweenTurns')
  const title = turn.input === undefined ? '' : recordSummary(turn.input)
  return title === '' ? t('turn.label', { turn: turn.turn }) : t('flow.turnTitle', { turn: turn.turn, title })
}

function TurnList({ turns, selectedId, t, onSelect }: {
  turns: readonly WorkflowTurn[]
  selectedId: string | undefined
  t: TrajectoryTranslate
  onSelect: (id: string) => void
}) {
  return (
    <nav className={css.turnList} aria-label={t('flow.turnList')}>
      <h2 className={css.listTitle}>
        <span>{t('flow.userTurns')}</span>
        <span className={css.count}>{turns.length}</span>
      </h2>
      <ul className={css.turns}>
        {turns.map(turn => (
          <li key={turn.id}>
            <button
              type="button"
              className={css.turnButton}
              aria-current={turn.id === selectedId ? 'true' : undefined}
              onClick={() => { onSelect(turn.id) }}
            >
              <span className={css.turnLine}>
                <span className={css.turnName}>{turnHeading(turn, t)}</span>
                <span className={css.turnTime}>{clockTime(turn.startedAt)}</span>
              </span>
              <span className={css.turnLine}>
                <span className={css.turnCounts}>
                  {t('flow.turnCounts', { calls: turn.calls.length, tools: turn.toolCount })}
                </span>
                <StatusMark status={turn.status} t={t} withLabel />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function TurnPane({ turn, t, stringWrapping, onOpenTrajectory }: {
  turn: WorkflowTurn
  t: TrajectoryTranslate
  stringWrapping: JsonTreeProps['stringWrapping']
  onOpenTrajectory: (callId: string) => void
}) {
  // One expanded item per call, keyed by call id.
  const [expanded, setExpanded] = useState<ReadonlyMap<string, string>>(new Map())
  const toggle = useCallback((callId: string, item: string) => {
    setExpanded((current) => {
      const next = new Map(current)
      if (next.get(callId) === item) next.delete(callId)
      else next.set(callId, item)
      return next
    })
  }, [])
  const meta = [
    clockTime(turn.startedAt),
    formatDuration(turn.durationSeconds, t),
    `${turn.calls.length} ${t('flow.modelCalls')}`,
    `${turn.toolCount} ${t('flow.toolCalls')}`,
  ].filter(part => part !== '')
  return (
    <section className={css.turnPane} aria-label={turnHeading(turn, t)}>
      <header className={css.turnHeader}>
        <h2 className={css.turnHeading}>{turnHeading(turn, t)}</h2>
        <span className={css.turnMeta}>{meta.join(' · ')}</span>
      </header>
      <div className={css.calls}>
        {turn.calls.length === 0 && <p className={css.note}>{t('flow.empty')}</p>}
        {turn.calls.map(call => (
          <WorkflowCallCard
            key={call.id}
            call={call}
            expanded={expanded.get(call.id)}
            t={t}
            stringWrapping={stringWrapping}
            onToggle={(item) => { toggle(call.id, item) }}
            onOpenTrajectory={onOpenTrajectory}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Render the Session's records as a workflow: totals across the top, the
 * user turns on the left, and the selected turn's model calls on the right.
 * @param props - Conversation view standard props plus the injected history pager.
 * @returns The workflow header, turn list, and selected turn.
 */
export function FlowView({
  useSession, useTrajectory, loadOlder, openView, t, jsonStringWrapping,
}: ConvViewProps & InjectFace<FlowViewInjected> & PropsLocale<'trajectory'>) {
  const inspection = useTrajectory(snapshot => snapshot)
  const historyLoading = useSession(snapshot => snapshot.openState === 'loading')
  const olderHistoryLoading = useSession(snapshot => snapshot.loadingOlder)
  const hasOlderHistory = useSession(snapshot => snapshot.hasMore)
  // `undefined` follows the newest turn until a turn is picked.
  const [pickedId, setPickedId] = useState<string | undefined>(undefined)
  const turns = useMemo(() => {
    const { partial } = inspection
    const finalized = deriveTrajectoryLayout({
      nodes: inspection.eventNodes,
      eventLocations: inspection.eventLocations,
      partial: partial === null ? null : { turn: partial.turn, step: partial.step, blocks: [] },
      runningCalls: inspection.runningCalls,
      requests: inspection.requests,
      systemPrompts: inspection.systemPrompts,
      callSchemas: inspection.callSchemas,
    }, t)
    const layout = appendTrajectoryPartialLayout(finalized, partial, lastCellIndex(finalized), t)
    return deriveWorkflow(layout, inspection.requests)
  }, [inspection, t])
  const summary = useMemo(() => summarizeWorkflow(turns), [turns])
  const selected = turns.find(turn => turn.id === pickedId) ?? turns.at(-1)
  const stringWrapping = jsonStringWrapping === undefined
    ? undefined
    : { ...jsonStringWrapping, label: t('record.wrapLines') }
  const openTrajectory = useCallback((callId: string) => { openView('trajectory', callId) }, [openView])
  const stats: readonly (readonly [string, string])[] = [
    [t('flow.userTurns'), String(summary.turns)],
    [t('flow.modelCalls'), String(summary.modelCalls)],
    [t('flow.toolCalls'), String(summary.toolCalls)],
    [t('flow.totalTime'), formatDuration(summary.durationSeconds, t) || '—'],
  ]

  return (
    <div className={css.root} data-conversation-composer-overlay="" data-flow-view="">
      <div className={css.header} role="toolbar" aria-label={t('flow.toolbar')}>
        <span className={css.headerTitle}>{t('view.flow')}</span>
        {hasOlderHistory && (
          <button
            type="button"
            className={css.toggle}
            disabled={olderHistoryLoading}
            onClick={() => { void loadOlder() }}
          >
            {olderHistoryLoading ? t('history.loadingEarlier') : t('history.loadEarlier')}
          </button>
        )}
        <dl className={css.stats} aria-label={t('flow.stats')}>
          {stats.map(([label, value]) => (
            <div key={label} className={css.stat}>
              <dt className={css.statLabel}>{label}</dt>
              <dd className={css.statValue}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {selected === undefined
        ? (
          <div className={css.empty} role="status">
            {historyLoading ? t('flow.loading') : t('flow.empty')}
          </div>
        )
        : (
          <div className={css.body}>
            <TurnList turns={turns} selectedId={selected.id} t={t} onSelect={setPickedId} />
            <TurnPane key={selected.id} turn={selected} t={t} stringWrapping={stringWrapping} onOpenTrajectory={openTrajectory} />
          </div>
        )}
    </div>
  )
}
