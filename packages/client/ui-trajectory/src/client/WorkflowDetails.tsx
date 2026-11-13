/** Inline detail panels of the Workflow view: the request, the reply, and one tool call of a model call. */

import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { JsonTree, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonTreeProps } from '@deepseek-ai/dsh-client-ui-primitives'
import { jsonTreeLabels, KIND_LABEL_KEY, markdownLabels } from './trajectory-kind.tsx'
import { trajectoryPreviewText } from './trajectory-preview.ts'
import { formatElapsedSeconds } from './trajectory-record.ts'
import type { TrajectoryCellProps } from './trajectory-record.ts'
import type { WorkflowCall, WorkflowStatus, WorkflowTool } from './workflow-model.ts'
import { recordStatus } from './workflow-model.ts'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import css from './FlowView.module.css'

/** Shared JSON string wrapping preference, already labeled. */
export type WorkflowStringWrapping = JsonTreeProps['stringWrapping']

/**
 * Format a duration: milliseconds below one second, seconds below one minute, then minutes and seconds.
 * @param seconds - Elapsed seconds, or `null` when unknown.
 * @param t - Trajectory locale translator.
 * @returns The label; empty when unknown.
 */
export function formatDuration(seconds: number | null, t: TrajectoryTranslate): string {
  if (seconds === null || !Number.isFinite(seconds)) return ''
  if (seconds < 1) return formatElapsedSeconds(seconds, t)
  if (seconds < 60) return t('unit.seconds', { value: seconds.toFixed(1) })
  const whole = Math.round(seconds)
  return t('flow.minutesSeconds', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
}

/**
 * Localized label of a completion state.
 * @param status - Completion state.
 * @param t - Trajectory locale translator.
 * @returns The status label.
 */
export function statusLabel(status: WorkflowStatus, t: TrajectoryTranslate): string {
  switch (status) {
    case 'done': return t('status.completed')
    case 'error': return t('status.failed')
    case 'running': return t('flow.running')
  }
}

/**
 * Format a token count with thousands separators.
 * @param value - Token count.
 * @returns The grouped count.
 */
export function tokenCount(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * One-line account of what a record did: the reply text, the call's arguments, or the input text.
 * @param cell - Layout record.
 * @returns The summary; empty when the record has none.
 */
export function recordSummary(cell: TrajectoryCellProps): string {
  switch (cell.kind) {
    case 'tool':
    case 'subtool':
      return cell.text === cell.toolName ? cell.result ?? '' : cell.text
    case 'message':
    case 'compacted':
    case 'user':
    case 'context':
    case 'system':
      return cell.previewMarkdown === undefined ? cell.text : trajectoryPreviewText(cell.previewMarkdown)
  }
}

/**
 * Token counts in the order Claude reports them, plus their sum.
 * @param cell - One record; only model replies carry usage.
 * @returns Label key and count pairs; empty when the record reports no usage.
 */
function recordUsage(cell: TrajectoryCellProps): readonly (readonly [TrajectoryKey, number])[] {
  const rows: (readonly [TrajectoryKey, number])[] = []
  if (cell.input !== undefined) rows.push(['usage.input', cell.input])
  if (cell.cacheRead !== undefined) rows.push(['usage.cached', cell.cacheRead])
  if (cell.cacheWrite !== undefined) rows.push(['usage.cacheCreated', cell.cacheWrite])
  if (cell.output !== undefined) rows.push(['usage.output', cell.output])
  if (cell.think !== undefined) rows.push(['usage.reasoning', cell.think])
  if (cell.input !== undefined || cell.output !== undefined) {
    rows.push(['flow.totalTokens', (cell.input ?? 0) + (cell.cacheRead ?? 0) + (cell.cacheWrite ?? 0) + (cell.output ?? 0)])
  }
  return rows
}

function DetailText({ text, json, label, t, stringWrapping }: {
  text: string
  json: boolean
  label: string
  t: TrajectoryTranslate
  stringWrapping: WorkflowStringWrapping
}): ReactNode {
  if (json) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // Not JSON: the raw text below is the faithful rendering.
      parsed = undefined
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return <JsonValue value={parsed} label={label} t={t} stringWrapping={stringWrapping} />
    }
    return <pre className={css.pre}>{text}</pre>
  }
  return <MarkdownText text={text} labels={markdownLabels(t)} variant="compact" />
}

function JsonValue({ value, label, t, stringWrapping }: {
  value: object
  label: string
  t: TrajectoryTranslate
  stringWrapping: WorkflowStringWrapping
}): ReactNode {
  return (
    <JsonTree
      data={value}
      label={label}
      labels={jsonTreeLabels(t)}
      stringWrapping={stringWrapping}
      collapsedStringLines={12}
      expandTopLevel
      className={css.json}
    />
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={css.section}>
      <h4 className={css.sectionTitle}>{title}</h4>
      {children}
    </section>
  )
}

function Meta({ rows }: { rows: readonly (readonly [string, string, WorkflowStatus?])[] }) {
  return (
    <dl className={css.meta}>
      {rows.map(([label, value, status]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd data-flow-status={status}>{value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

/**
 * The request panel: system prompt, request config, and tool definitions side by side.
 * @returns Three columns, or a note when the history window holds no request.
 */
export function RequestDetails({ call, t, stringWrapping }: {
  call: WorkflowCall
  t: TrajectoryTranslate
  stringWrapping: WorkflowStringWrapping
}) {
  const { request } = call
  const prompt = request?.prompt
  const config = request?.requestConfig ?? prompt?.config
  return (
    <>
      {request === undefined && <p className={css.note}>{t('flow.notRecorded')}</p>}
      {request !== undefined && (
        <div className={css.columns}>
          <Section title={t('flow.systemPrompt')}>
            {prompt === undefined || prompt.system === ''
              ? <p className={css.note}>{t('flow.noSystemPrompt')}</p>
              : <pre className={css.pre}>{prompt.system}</pre>}
          </Section>
          <Section title={t('flow.requestConfig')}>
            {config === undefined
              ? <p className={css.note}>{t('flow.notRecorded')}</p>
              : <JsonValue value={config} label={t('flow.requestConfig')} t={t} stringWrapping={stringWrapping} />}
          </Section>
          <Section title={`${t('flow.toolDefinitions')} · ${prompt?.tools.length ?? 0}`}>
            {prompt === undefined
              ? <p className={css.note}>{t('flow.notRecorded')}</p>
              : <JsonValue value={{ tools: prompt.tools }} label={t('flow.toolDefinitions')} t={t} stringWrapping={stringWrapping} />}
          </Section>
        </div>
      )}
      {call.inputs.length > 0 && (
        <Section title={t('flow.requestInputs')}>
          <ul className={css.inputs}>
            {call.inputs.map(input => (
              <li key={input.index}>
                <span className={css.inputKind}>{t(KIND_LABEL_KEY[input.kind])}</span>
                <span className={css.inputText}>{recordSummary(input)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

/**
 * The reply panel: status, duration, token usage, reasoning, and the full reply.
 * @returns The panel body for a reply or compaction record.
 */
export function ResponseDetails({ cell, t, stringWrapping }: {
  cell: TrajectoryCellProps
  t: TrajectoryTranslate
  stringWrapping: WorkflowStringWrapping
}) {
  const status = recordStatus(cell)
  const usage = recordUsage(cell)
  const duration = formatDuration(cell.timeSeconds, t)
  const output = cell.outputDetail
  return (
    <>
      <Meta rows={[
        [t('details.status'), statusLabel(status, t), status],
        ...duration === '' ? [] : [[t('timing.duration'), duration] as const],
      ]}
      />
      <Section title={t('usage.tokens')}>
        {usage.length === 0
          ? <p className={css.note}>{t('usage.notReported')}</p>
          : <Meta rows={usage.map(([label, value]) => [t(label), t('unit.tokens', { value: tokenCount(value) })] as const)} />}
      </Section>
      {cell.thinkingDetail !== undefined && cell.thinkingDetail !== '' && (
        <Section title={t('record.thinking')}>
          <DetailText text={cell.thinkingDetail} json={false} label="" t={t} stringWrapping={stringWrapping} />
        </Section>
      )}
      {output !== undefined && output !== '' && (
        <Section title={t('column.output')}>
          <DetailText text={output} json={false} label="" t={t} stringWrapping={stringWrapping} />
        </Section>
      )}
    </>
  )
}

/**
 * The tool panel: status, duration, arguments, result, and child calls.
 * @returns The panel body for one tool call.
 */
export function ToolDetails({ tool, t, stringWrapping, onOpenTrajectory }: {
  tool: WorkflowTool
  t: TrajectoryTranslate
  stringWrapping: WorkflowStringWrapping
  onOpenTrajectory: (callId: string) => void
}) {
  const { cell } = tool
  const duration = formatDuration(cell.timeSeconds, t)
  const output = cell.outputDetail ?? cell.result
  const callId = cell.callId
  return (
    <>
      <Meta rows={[
        [t('details.toolCall'), cell.toolName ?? cell.text],
        [t('details.status'), statusLabel(tool.status, t), tool.status],
        ...duration === '' ? [] : [[t('timing.duration'), duration] as const],
      ]}
      />
      <p className={css.note}>{t('flow.toolTokens')}</p>
      {cell.inputDetail !== undefined && cell.inputDetail !== '' && (
        <Section title={t('column.input')}>
          <DetailText text={cell.inputDetail} json label={t('record.parametersJson')} t={t} stringWrapping={stringWrapping} />
        </Section>
      )}
      {output !== undefined && output !== '' && (
        <Section title={t('column.output')}>
          <DetailText text={output} json label={t('record.resultJson')} t={t} stringWrapping={stringWrapping} />
        </Section>
      )}
      {tool.children.length > 0 && (
        <Section title={t('details.subtoolCalls')}>
          <ul className={css.inputs}>
            {tool.children.map(child => (
              <li key={child.id} data-flow-status={child.status}>
                <span className={css.inputKind}>{child.cell.toolName ?? child.cell.text}</span>
                <span className={css.inputText}>{recordSummary(child.cell)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {callId !== undefined && (
        <button type="button" className={css.openTrajectory} onClick={() => { onOpenTrajectory(callId) }}>
          {t('flow.openInTrajectory')}
        </button>
      )}
    </>
  )
}
