/** Workflow view: the Trajectory layout drawn as a pannable flowchart with a record details panel. */

import { Fragment, memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconFullscreenOutlineRegular,
  JsonTree,
  MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonTreeProps } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  appendTrajectoryPartialLayout, deriveTrajectoryLayout, lastCellIndex,
} from './layout.ts'
import {
  deriveFlowGraph, FLOW_NODE_HEIGHT, FLOW_NODE_WIDTH,
  type FlowNodeStatus, type FlowRecordNode,
} from './flow-graph.ts'
import { jsonTreeLabels, KIND_ICON, KIND_LABEL_KEY, markdownLabels } from './trajectory-kind.tsx'
import { trajectoryPreviewText } from './trajectory-preview.ts'
import { formatElapsedSeconds } from './trajectory-record.ts'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import css from './FlowView.module.css'

/** Session-bound controls not already supplied by the conversation view slot. */
export interface FlowViewInjected {
  /** Shared wrapping preference read by JSON string expansion. */
  jsonStringWrapping?: Omit<NonNullable<JsonTreeProps['stringWrapping']>, 'label'>
  /** Page older Session history into the resident window. @returns Whether older records arrived. */
  loadOlder: () => Promise<boolean>
}

interface RecordNodeData extends Record<string, unknown> {
  readonly record: FlowRecordNode
  readonly title: string
  readonly summary: string
  readonly stats: string
}

interface TurnNodeData extends Record<string, unknown> {
  readonly label: string
}

type RecordFlowNode = Node<RecordNodeData, 'record'>
type TurnFlowNode = Node<TurnNodeData, 'turn'>
type FlowCanvasNode = RecordFlowNode | TurnFlowNode

const FIT_VIEW_OPTIONS = { padding: 0.15, maxZoom: 1 } as const

/** Roles in the color legend, each with the label its records carry. */
const LEGEND: readonly (readonly [FlowRecordNode['kind'], TrajectoryKey])[] = [
  ['input', 'kind.user'],
  ['model', 'kind.assistant'],
  ['tool', 'kind.tool'],
  ['subtool', 'kind.subtool'],
  ['context', 'kind.context'],
]

function formatDuration(seconds: number | null, t: TrajectoryTranslate): string {
  if (seconds === null || !Number.isFinite(seconds)) return ''
  if (seconds < 1) return formatElapsedSeconds(seconds, t)
  return t('unit.seconds', { value: seconds.toFixed(1) })
}

function statusLabel(status: FlowNodeStatus, t: TrajectoryTranslate): string {
  switch (status) {
    case 'done': return t('status.completed')
    case 'error': return t('status.failed')
    case 'running': return t('flow.running')
  }
}

function nodeTitle(record: FlowRecordNode, t: TrajectoryTranslate): string {
  const { cell } = record
  switch (record.kind) {
    case 'tool':
    case 'subtool':
      return cell.toolName ?? cell.text
    case 'model':
      return cell.requestOnly === true ? t('flow.modelRequest') : t('flow.model')
    case 'input':
    case 'context':
    case 'compaction':
      return cell.previewMarkdown === undefined
        ? cell.text
        : trajectoryPreviewText(cell.previewMarkdown)
  }
}

/** Inputs and context injections are instantaneous records; only work records carry a duration. */
function recordDuration(record: FlowRecordNode, t: TrajectoryTranslate): string {
  return record.kind === 'input' || record.kind === 'context'
    ? ''
    : formatDuration(record.cell.timeSeconds, t)
}

function tokenCount(value: number): string {
  return value.toLocaleString('en-US')
}

/** One-line account of what the record did: the reply or thinking, the call's arguments, or the input text. */
function nodeSummary(record: FlowRecordNode): string {
  const { cell } = record
  switch (record.kind) {
    case 'model':
      return cell.previewMarkdown === undefined ? cell.text : trajectoryPreviewText(cell.previewMarkdown)
    case 'tool':
    case 'subtool':
      return cell.text === cell.toolName ? cell.result ?? '' : cell.text
    case 'input':
    case 'context':
    case 'compaction':
      return ''
  }
}

/**
 * The model request's token counts in the order Claude reports them, plus their sum (input, cache reads and writes, and output).
 * @param cell - one record; only model replies carry usage.
 * @returns label key and count pairs; empty when the record reports no usage.
 */
function recordUsage(cell: FlowRecordNode['cell']): readonly (readonly [TrajectoryKey, number])[] {
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

/** Status, duration, and the model request's input and output tokens, joined for the node's last line. */
function nodeStats(record: FlowRecordNode, t: TrajectoryTranslate): string {
  const { cell } = record
  const tokens = cell.input === undefined && cell.output === undefined
    ? ''
    : t('flow.nodeTokens', { input: tokenCount(cell.input ?? 0), output: tokenCount(cell.output ?? 0) })
  return [record.status === 'running' ? t('flow.running') : recordDuration(record, t), tokens]
    .filter(part => part !== '')
    .join(' · ')
}

const RecordNodeView = memo(function RecordNodeView({ data, selected }: NodeProps<RecordFlowNode>) {
  const { record } = data
  return (
    <div
      className={css.node}
      data-flow-node={record.kind}
      data-flow-status={record.status}
      data-selected={selected || undefined}
    >
      <Handle type="target" position={Position.Left} className={css.handle} isConnectable={false} />
      <span className={css.nodeIcon} aria-hidden="true">{KIND_ICON[record.cell.kind]}</span>
      <span className={css.nodeText}>
        <span className={css.nodeTitle}>{data.title}</span>
        {data.summary !== '' && <span className={css.nodeDetail}>{data.summary}</span>}
        {data.stats !== '' && <span className={css.nodeStats}>{data.stats}</span>}
      </span>
      <Handle type="source" position={Position.Right} className={css.handle} isConnectable={false} />
    </div>
  )
})

function TurnNodeView({ data }: NodeProps<TurnFlowNode>) {
  return <div className={css.turnLabel}>{data.label}</div>
}

const NODE_TYPES: NodeTypes = { record: RecordNodeView, turn: TurnNodeView }

function DetailText({ text, json, label, t, stringWrapping }: {
  text: string
  json: boolean
  label: string
  t: TrajectoryTranslate
  stringWrapping: JsonTreeProps['stringWrapping']
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
      return (
        <JsonTree
          data={parsed}
          label={label}
          labels={jsonTreeLabels(t)}
          stringWrapping={stringWrapping}
          collapsedStringLines={12}
          expandTopLevel
          className={css.json}
        />
      )
    }
    return <pre className={css.pre}>{text}</pre>
  }
  return <MarkdownText text={text} labels={markdownLabels(t)} variant="compact" />
}

function FlowDetails({ record, t, onClose, onOpenTrajectory, stringWrapping }: {
  record: FlowRecordNode
  t: TrajectoryTranslate
  onClose: () => void
  onOpenTrajectory: ((callId: string) => void) | undefined
  stringWrapping: JsonTreeProps['stringWrapping']
}) {
  const { cell } = record
  const isTool = record.kind === 'tool' || record.kind === 'subtool'
  const location = record.turn === null
    ? t('section.betweenTurns')
    : `${t('turn.label', { turn: record.turn })} · ${record.group}`
  const duration = recordDuration(record, t)
  const output = cell.outputDetail ?? cell.result
  const summary = nodeSummary(record)
  const usage = recordUsage(cell)
  return (
    <aside className={css.details} aria-label={t('details.event')}>
      <div className={css.detailsHeader}>
        <span className={css.kindTag} data-flow-node={record.kind}>
          {t(KIND_LABEL_KEY[cell.kind])}
        </span>
        <span className={css.detailsLocation}>{location}</span>
        <button type="button" className={css.close} aria-label={t('details.close')} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className={css.detailsBody}>
        <dl className={css.meta}>
          {isTool && cell.toolName !== undefined && (
            <>
              <dt>{t('details.toolCall')}</dt>
              <dd>{cell.toolName}</dd>
            </>
          )}
          <dt>{t('details.status')}</dt>
          <dd data-flow-status={record.status}>{statusLabel(record.status, t)}</dd>
          {duration !== '' && (
            <>
              <dt>{t('timing.duration')}</dt>
              <dd>{duration}</dd>
            </>
          )}
        </dl>
        {summary !== '' && (
          <section className={css.section}>
            <h3 className={css.sectionTitle}>{t('flow.what')}</h3>
            <p className={css.what}>{isTool && cell.toolName !== undefined ? `${cell.toolName} · ${summary}` : summary}</p>
          </section>
        )}
        <section className={css.section}>
          <h3 className={css.sectionTitle}>{t('usage.tokens')}</h3>
          {usage.length === 0
            ? <p className={css.note}>{t(isTool ? 'flow.toolTokens' : 'usage.notReported')}</p>
            : (
              <dl className={css.meta}>
                {usage.map(([label, value]) => (
                  <Fragment key={label}>
                    <dt>{t(label)}</dt>
                    <dd>{t('unit.tokens', { value: tokenCount(value) })}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
        </section>
        {cell.inputDetail !== undefined && cell.inputDetail !== '' && (
          <section className={css.section}>
            <h3 className={css.sectionTitle}>{t('column.input')}</h3>
            <DetailText
              text={cell.inputDetail}
              json={isTool}
              label={t('record.parametersJson')}
              t={t}
              stringWrapping={stringWrapping}
            />
          </section>
        )}
        {cell.thinkingDetail !== undefined && (
          <section className={css.section}>
            <h3 className={css.sectionTitle}>{t('record.thinking')}</h3>
            <DetailText text={cell.thinkingDetail} json={false} label="" t={t} stringWrapping={stringWrapping} />
          </section>
        )}
        {output !== undefined && output !== '' && (
          <section className={css.section}>
            <h3 className={css.sectionTitle}>{t('column.output')}</h3>
            <DetailText
              text={output}
              json={isTool}
              label={t('record.resultJson')}
              t={t}
              stringWrapping={stringWrapping}
            />
          </section>
        )}
        {isTool && cell.callId !== undefined && onOpenTrajectory !== undefined && (
          <button
            type="button"
            className={css.openTrajectory}
            onClick={() => { onOpenTrajectory(cell.callId as string) }}
          >
            {t('flow.openInTrajectory')}
          </button>
        )}
      </div>
    </aside>
  )
}

function FlowCanvas({ nodes, edges, t, onSelect, onClear }: {
  nodes: readonly FlowCanvasNode[]
  edges: readonly Edge[]
  t: TrajectoryTranslate
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const flow = useReactFlow()
  const nodeCount = nodes.length
  // Refit when records arrive or the filter changes; panning between updates is kept otherwise.
  useEffect(() => {
    void flow.fitView(FIT_VIEW_OPTIONS)
  }, [flow, nodeCount])
  const handleNodeClick = useCallback<NodeMouseHandler<FlowCanvasNode>>((_event, node) => {
    if (node.type === 'record') onSelect(node.id)
  }, [onSelect])
  const handleNodesChange = useCallback((changes: NodeChange<FlowCanvasNode>[]) => {
    // Keyboard selection (Enter on a focused node) arrives as a select change.
    for (const change of changes) {
      if (change.type === 'select' && change.selected) onSelect(change.id)
    }
  }, [onSelect])
  return (
    <>
      <div className={css.canvasActions}>
        <button
          type="button"
          className={css.toggle}
          onClick={() => { void flow.fitView({ ...FIT_VIEW_OPTIONS, duration: 200 }) }}
        >
          <IconFullscreenOutlineRegular size={12} />
          <span>{t('flow.fit')}</span>
        </button>
      </div>
      <ReactFlow<FlowCanvasNode>
        className={css.canvas}
        aria-label={t('flow.canvas')}
        nodes={nodes as FlowCanvasNode[]}
        edges={edges as Edge[]}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        minZoom={0.1}
        maxZoom={2}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick}
        onNodesChange={handleNodesChange}
        onPaneClick={onClear}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap
          position="top-right"
          pannable
          zoomable
          ariaLabel={t('flow.minimap')}
          nodeClassName={node => node.type === 'record'
            ? `${css.minimapNode} ${css[`minimap-${(node.data as RecordNodeData).record.kind}`] ?? ''}`
            : css.minimapHidden ?? ''}
        />
      </ReactFlow>
    </>
  )
}

/**
 * Render the Session's records as a flowchart: turns run top to bottom, the
 * tool calls of one step fan out side by side, and selecting a record opens
 * its details beside the chart.
 * @param props - Conversation view standard props plus the injected history pager.
 * @returns The workflow toolbar, chart, and optional details panel.
 */
export function FlowView({
  useSession, useTrajectory, loadOlder, openView, t, jsonStringWrapping,
}: ConvViewProps & InjectFace<FlowViewInjected> & PropsLocale<'trajectory'>) {
  const inspection = useTrajectory(snapshot => snapshot)
  const historyLoading = useSession(snapshot => snapshot.openState === 'loading')
  const olderHistoryLoading = useSession(snapshot => snapshot.loadingOlder)
  const hasOlderHistory = useSession(snapshot => snapshot.hasMore)
  const [showContext, setShowContext] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
    return appendTrajectoryPartialLayout(finalized, partial, lastCellIndex(finalized), t)
  }, [inspection, t])
  const graph = useMemo(() => deriveFlowGraph(turns, { showContext }), [turns, showContext])
  const selected = selectedId === null
    ? undefined
    : graph.nodes.find(node => node.id === selectedId)
  const canvasNodes = useMemo<readonly FlowCanvasNode[]>(() => [
    ...graph.labels.map((label): TurnFlowNode => ({
      id: label.id,
      type: 'turn',
      position: { x: label.x, y: label.y },
      data: { label: label.turn === null ? t('section.betweenTurns') : t('turn.label', { turn: label.turn }) },
      selectable: false,
      focusable: false,
    })),
    ...graph.nodes.map((record): RecordFlowNode => {
      const title = nodeTitle(record, t)
      const kindLabel = t(KIND_LABEL_KEY[record.cell.kind])
      return {
        id: record.id,
        type: 'record',
        position: { x: record.x, y: record.y },
        width: FLOW_NODE_WIDTH,
        height: FLOW_NODE_HEIGHT,
        selected: record.id === selectedId,
        ariaLabel: t('flow.node', { kind: kindLabel, label: title, status: statusLabel(record.status, t) }),
        data: { record, title, summary: nodeSummary(record), stats: nodeStats(record, t) },
      }
    }),
  ], [graph, selectedId, t])
  const canvasEdges = useMemo<readonly Edge[]>(() => graph.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: edge.animated,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--dsw-alias-label-tertiary)' },
  })), [graph])
  const clear = useCallback(() => { setSelectedId(null) }, [])
  const stringWrapping = jsonStringWrapping === undefined
    ? undefined
    : { ...jsonStringWrapping, label: t('record.wrapLines') }
  const empty = graph.nodes.length === 0

  return (
    <div className={css.root} data-conversation-composer-overlay="" data-flow-view="">
      <ReactFlowProvider>
        <div className={css.toolbar} role="toolbar" aria-label={t('flow.toolbar')}>
          <button
            type="button"
            className={css.toggle}
            aria-pressed={showContext}
            onClick={() => { setShowContext(value => !value) }}
          >
            {t('flow.showContext')}
          </button>
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
          <ul className={css.legend} aria-label={t('flow.legend')}>
            {LEGEND.map(([kind, label]) => (
              <li key={kind} className={css.legendItem}>
                <span className={css.legendDot} data-flow-node={kind} aria-hidden="true" />
                {t(label)}
              </li>
            ))}
          </ul>
        </div>
        <div className={css.body}>
          {empty
            ? (
              <div className={css.empty} role="status">
                {historyLoading ? t('flow.loading') : t('flow.empty')}
              </div>
            )
            : (
              <div className={css.canvasHost}>
                <FlowCanvas
                  nodes={canvasNodes}
                  edges={canvasEdges}
                  t={t}
                  onSelect={setSelectedId}
                  onClear={clear}
                />
              </div>
            )}
          {selected !== undefined && (
            <FlowDetails
              record={selected}
              t={t}
              onClose={clear}
              onOpenTrajectory={(callId) => { openView('trajectory', callId) }}
              stringWrapping={stringWrapping}
            />
          )}
        </div>
      </ReactFlowProvider>
    </div>
  )
}
