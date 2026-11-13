/** One model call of the Workflow view: a header with timing and tokens, then request → response → tools, with one item expanded below. */

import type { ReactNode } from 'react'
import { KIND_ICON } from './trajectory-kind.tsx'
import { trajectoryPreviewText } from './trajectory-preview.ts'
import type { TrajectoryCellProps } from './trajectory-record.ts'
import type { WorkflowCall, WorkflowStatus, WorkflowTool } from './workflow-model.ts'
import { recordStatus } from './workflow-model.ts'
import {
  formatDuration, recordSummary, RequestDetails, ResponseDetails, statusLabel, tokenCount, ToolDetails,
  type WorkflowStringWrapping,
} from './WorkflowDetails.tsx'
import type { TrajectoryTranslate } from './locales.ts'
import css from './FlowView.module.css'

/** Item key of the request card. */
export const REQUEST_ITEM = 'request'
/** Item key of the response card. */
export const RESPONSE_ITEM = 'response'

/**
 * Format epoch milliseconds as a local wall-clock time.
 * @param epochMs - Unix epoch milliseconds, or `null` when unknown.
 * @returns `HH:MM:SS`, or an empty string when unknown.
 */
export function clockTime(epochMs: number | null): string {
  if (epochMs === null || !Number.isFinite(epochMs)) return ''
  const date = new Date(epochMs)
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':')
}

function SendIcon(): ReactNode {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 1.5 7 9M14.5 1.5 10 14.5 7 9 1.5 6l13-4.5Z" />
    </svg>
  )
}

/** Status glyph shared by call headers, turn rows, and tool results. */
export function StatusMark({ status, t, withLabel = false }: {
  status: WorkflowStatus
  t: TrajectoryTranslate
  withLabel?: boolean
}) {
  return (
    <span className={css.status} data-flow-status={status}>
      <span className={css.statusDot} aria-hidden="true" />
      {withLabel ? statusLabel(status, t) : <span className={css.visuallyHidden}>{statusLabel(status, t)}</span>}
    </span>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return <span className={css.tag}>{children}</span>
}

function ItemButton({ item, kind, status, expanded, label, icon, onToggle, children }: {
  item: string
  kind: 'request' | 'response' | 'tool'
  status: WorkflowStatus
  expanded: boolean
  label: string
  icon: ReactNode
  onToggle: (item: string) => void
  children: ReactNode
}) {
  return (
    <li className={css.item}>
      <button
        type="button"
        className={css.itemButton}
        data-flow-item={kind}
        data-flow-status={status}
        aria-expanded={expanded}
        onClick={() => { onToggle(item) }}
      >
        <span className={css.itemHeader}>
          <span className={css.itemIcon} aria-hidden="true">{icon}</span>
          <span className={css.itemLabel}>{label}</span>
        </span>
        <span className={css.itemBody}>{children}</span>
      </button>
    </li>
  )
}

/**
 * Collapse text to one line for a card preview; JSON is re-serialized compactly.
 * @param text - Arguments, result, or reply text.
 * @returns Whitespace-collapsed text.
 */
function oneLine(text: string): string {
  let compact = text
  try {
    compact = JSON.stringify(JSON.parse(text))
  } catch {
    // Not JSON: collapse the raw text instead.
    compact = text
  }
  return compact.replace(/\s+/g, ' ').trim()
}

/**
 * One-line preview of a tool result: the rendered Markdown preview, else the summary or the full output.
 * @param cell - Tool or subtool record.
 * @returns The preview; empty while no result arrived.
 */
function toolResultText(cell: TrajectoryCellProps): string {
  if (cell.resultPreviewMarkdown !== undefined) return oneLine(trajectoryPreviewText(cell.resultPreviewMarkdown))
  if (cell.result !== undefined && cell.result !== '') return oneLine(cell.result)
  return oneLine(cell.outputDetail ?? '')
}

/** Token figures for the call header: total input, uncached input, cache hits, and output. */
function usageLine(call: WorkflowCall, t: TrajectoryTranslate): string[] {
  const reply = call.reply
  if (reply === undefined || (reply.input === undefined && reply.output === undefined)) return []
  const cached = reply.cacheRead ?? 0
  const uncached = (reply.input ?? 0) + (reply.cacheWrite ?? 0)
  return [
    `${t('usage.input')} ${tokenCount(uncached + cached)}`,
    `${t('flow.uncached')} ${tokenCount(uncached)}`,
    `${t('usage.cached')} ${tokenCount(cached)}`,
    `${t('usage.output')} ${tokenCount(reply.output ?? 0)}`,
  ]
}

function ToolItem({ tool, expanded, t, onToggle }: {
  tool: WorkflowTool
  expanded: boolean
  t: TrajectoryTranslate
  onToggle: (item: string) => void
}) {
  const { cell } = tool
  const name = cell.toolName ?? cell.text
  const args = oneLine(cell.inputDetail ?? (cell.text === name ? '' : cell.text))
  const result = toolResultText(cell) || (tool.status === 'running' ? t('flow.running') : '')
  const duration = formatDuration(cell.timeSeconds, t)
  return (
    <ItemButton item={tool.id} kind="tool" status={tool.status} expanded={expanded} label={name}
      icon={KIND_ICON[cell.kind]} onToggle={onToggle}>
      {args !== '' && <span className={css.itemText}>{args}</span>}
      <span className={css.result} data-flow-status={tool.status}>
        <StatusMark status={tool.status} t={t} />
        <span className={css.resultText}>{result}</span>
        {duration !== '' && <span className={css.resultTime}>{duration}</span>}
      </span>
      {tool.children.length > 0 && <Tag>{t('flow.childCalls', { count: tool.children.length })}</Tag>}
    </ItemButton>
  )
}

/**
 * Render one model call as a card whose items expand their details below the row.
 * @returns The call card.
 */
export function WorkflowCallCard({ call, expanded, t, stringWrapping, onToggle, onOpenTrajectory }: {
  call: WorkflowCall
  /** Key of the expanded item, if any. */
  expanded: string | undefined
  t: TrajectoryTranslate
  stringWrapping: WorkflowStringWrapping
  onToggle: (item: string) => void
  onOpenTrajectory: (callId: string) => void
}) {
  const { reply, request } = call
  const title = call.kind === 'compaction' ? t('flow.compaction') : t('flow.callTitle', { index: call.index })
  const meta = [clockTime(call.startedAt), formatDuration(call.durationSeconds, t), ...usageLine(call, t)]
    .filter(part => part !== '')
  const model = request?.requestConfig?.model ?? request?.prompt?.config.model ?? request?.providerMetadata?.model
  const toolCount = request?.prompt?.tools.length
  const replyText = reply === undefined || reply.requestOnly === true ? '' : recordSummary(reply)
  const replyStatus: WorkflowStatus = reply === undefined ? 'running' : recordStatus(reply)
  const expandedTool = call.tools.find(tool => tool.id === expanded)
  return (
    <article className={css.call} data-flow-status={call.status} aria-label={title}>
      <header className={css.callHeader}>
        <h3 className={css.callTitle}>{title}</h3>
        <span className={css.callMeta}>{meta.join(' · ')}</span>
        <StatusMark status={call.status} t={t} withLabel />
      </header>
      <ol className={css.row} aria-label={t('flow.callItems', { index: call.index })}>
        {call.kind === 'model' && (
          <ItemButton item={REQUEST_ITEM} kind="request" status={request?.status === 'error' ? 'error' : 'done'}
            expanded={expanded === REQUEST_ITEM} label={t('flow.request')} icon={<SendIcon />} onToggle={onToggle}>
            <span className={css.itemText}>{model ?? t('flow.modelRequest')}</span>
            <span className={css.tags}>
              {request?.prompt !== undefined && request.prompt.system !== '' && <Tag>{t('kind.system')}</Tag>}
              {call.inputs.length > 0 && <Tag>{t('flow.tagInputs', { count: call.inputs.length })}</Tag>}
              {toolCount !== undefined && <Tag>{t('flow.tagTools', { count: toolCount })}</Tag>}
            </span>
          </ItemButton>
        )}
        {reply !== undefined && (
          <ItemButton item={RESPONSE_ITEM} kind="response" status={replyStatus}
            expanded={expanded === RESPONSE_ITEM}
            label={call.kind === 'compaction' ? t('flow.compaction') : t('flow.response')}
            icon={KIND_ICON[reply.kind]} onToggle={onToggle}>
            <span className={css.itemText}>{replyText === '' ? statusLabel(replyStatus, t) : replyText}</span>
            <span className={css.tags}>
              {reply.thinkingDetail !== undefined && reply.thinkingDetail !== '' && <Tag>{t('usage.reasoning')}</Tag>}
              {reply.outputDetail !== undefined && reply.outputDetail !== '' && <Tag>{t('usage.content')}</Tag>}
              {call.tools.length > 0 && <Tag>{t('flow.tagToolCalls', { count: call.tools.length })}</Tag>}
            </span>
          </ItemButton>
        )}
        {call.tools.map(tool => (
          <ToolItem key={tool.id} tool={tool} expanded={expanded === tool.id} t={t} onToggle={onToggle} />
        ))}
      </ol>
      {expanded !== undefined && (
        <section className={css.panel} aria-label={t('flow.callDetails')}>
          <header className={css.panelHeader}>
            <span>{expanded === REQUEST_ITEM ? t('flow.request') : expanded === RESPONSE_ITEM ? t('flow.response') : expandedTool?.cell.toolName}</span>
            <button type="button" className={css.close} aria-label={t('details.close')} onClick={() => { onToggle(expanded) }}>
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div className={css.panelBody}>
            {expanded === REQUEST_ITEM && <RequestDetails call={call} t={t} stringWrapping={stringWrapping} />}
            {expanded === RESPONSE_ITEM && reply !== undefined && <ResponseDetails cell={reply} t={t} stringWrapping={stringWrapping} />}
            {expandedTool !== undefined && (
              <ToolDetails tool={expandedTool} t={t} stringWrapping={stringWrapping} onOpenTrajectory={onOpenTrajectory} />
            )}
          </div>
        </section>
      )}
    </article>
  )
}
