/**
 * Workflow fold: regroup the Trajectory layout into user turns, each holding
 * its model calls in order, and each model call holding the request that
 * issued it, the reply, and the tool calls the reply made.
 */

import type { RequestView } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryTurnModel } from './layout.ts'
import type { TrajectoryCellProps } from './trajectory-record.ts'
import { trajectoryRecordId } from './trajectory-record.ts'

/** Ordinary model request assembled from durable request events. */
export type WorkflowRequest = Extract<RequestView, { purpose: 'assistant' }>

/** Completion state of one workflow item. */
export type WorkflowStatus = 'done' | 'error' | 'running'

/** One tool call and the `run_code` child calls it made. */
export interface WorkflowTool {
  /** Stable identity derived from {@link trajectoryRecordId}. */
  readonly id: string
  readonly cell: TrajectoryCellProps
  readonly status: WorkflowStatus
  readonly children: readonly WorkflowTool[]
}

/** One model call: the request, its reply, and the tools the reply called. */
export interface WorkflowCall {
  /** Stable identity of the reply record, or of the group when it has none. */
  readonly id: string
  /** 1-based position among the turn's calls. */
  readonly index: number
  /** `model` for an ordinary request, `compaction` for a context compaction. */
  readonly kind: 'model' | 'compaction'
  /** Reply record; a request still waiting for its reply carries `requestOnly`. */
  readonly reply: TrajectoryCellProps | undefined
  /** The request that produced the reply, when the history window holds it. */
  readonly request: WorkflowRequest | undefined
  /** System, context, and steering records the request carried. */
  readonly inputs: readonly TrajectoryCellProps[]
  readonly tools: readonly WorkflowTool[]
  readonly status: WorkflowStatus
  /** Unix epoch milliseconds the call started, when known. */
  readonly startedAt: number | null
  /** Seconds from the request start to the last record's end, when known. */
  readonly durationSeconds: number | null
}

/** One user turn and the model calls that answered it. */
export interface WorkflowTurn {
  readonly id: string
  /** Turn number, or `null` for a compaction between turns. */
  readonly turn: number | null
  /** The user message that opened the turn, when the window holds it. */
  readonly input: TrajectoryCellProps | undefined
  readonly calls: readonly WorkflowCall[]
  readonly toolCount: number
  readonly status: WorkflowStatus
  readonly startedAt: number | null
  readonly durationSeconds: number | null
}

/** Totals over every resident turn. */
export interface WorkflowSummary {
  readonly turns: number
  readonly modelCalls: number
  readonly toolCalls: number
  readonly durationSeconds: number | null
}

/**
 * Completion state of one record.
 * @param cell - Layout record.
 * @returns `error` for a failed record, `running` while its result or reply is pending, else `done`.
 */
export function recordStatus(cell: TrajectoryCellProps): WorkflowStatus {
  if (cell.isError === true) return 'error'
  switch (cell.kind) {
    case 'tool':
    case 'subtool':
      return cell.outputDetail === undefined && cell.result === undefined ? 'running' : 'done'
    case 'message':
      if (cell.requestOnly === true) return cell.timeSeconds === null ? 'running' : 'done'
      return cell.assistantMetrics?.completedTime === null ? 'running' : 'done'
    case 'compacted':
      return cell.timeSeconds === null ? 'running' : 'done'
    case 'system':
    case 'user':
    case 'context':
      return 'done'
  }
}

/**
 * Combine child states: any failure wins, then any running item.
 * @param states - Child states.
 * @returns The combined state; `done` for none.
 */
function combinedStatus(states: readonly WorkflowStatus[]): WorkflowStatus {
  if (states.includes('error')) return 'error'
  return states.includes('running') ? 'running' : 'done'
}

/**
 * Earliest start and latest end over a set of records.
 * @param cells - Records with optional start times and durations.
 * @returns Start epoch milliseconds and elapsed seconds; `null` when no record has a start time.
 */
function span(cells: readonly TrajectoryCellProps[]): { startedAt: number | null; durationSeconds: number | null } {
  let start: number | null = null
  let end: number | null = null
  for (const cell of cells) {
    if (cell.startedAt === undefined || cell.startedAt === null) continue
    start = start === null ? cell.startedAt : Math.min(start, cell.startedAt)
    const finish = cell.startedAt + (cell.timeSeconds ?? 0) * 1000
    end = end === null ? finish : Math.max(end, finish)
  }
  return { startedAt: start, durationSeconds: start === null || end === null ? null : (end - start) / 1000 }
}

/**
 * Pair each tool call with the `run_code` child calls listed after it.
 * @param cells - The group's tool and subtool records in order.
 * @returns Tool calls with their children; a child before any tool stands alone.
 */
function nestTools(cells: readonly TrajectoryCellProps[]): WorkflowTool[] {
  const tools: { cell: TrajectoryCellProps; children: WorkflowTool[] }[] = []
  for (const cell of cells) {
    const tool = { id: trajectoryRecordId(cell), cell, status: recordStatus(cell), children: [] as WorkflowTool[] }
    const parent = tools.at(-1)
    if (cell.kind === 'subtool' && parent !== undefined) parent.children.push(tool)
    else tools.push(tool)
  }
  return tools.map(tool => ({
    id: trajectoryRecordId(tool.cell),
    cell: tool.cell,
    status: combinedStatus([recordStatus(tool.cell), ...tool.children.map(child => child.status)]),
    children: tool.children,
  }))
}

/**
 * Find the request behind one reply: the request whose reply sequence or
 * opening sequence names the record, else the turn's request for this step.
 */
function requestFor(
  reply: TrajectoryCellProps | undefined,
  turn: number | null,
  step: number,
  requests: readonly WorkflowRequest[],
): WorkflowRequest | undefined {
  const seq = reply?.sourceSeq
  if (seq !== undefined) {
    const matched = requests.find(request => request.resultSeq === seq || request.startSeq === seq)
    if (matched !== undefined) return matched
  }
  return turn === null ? undefined : requests.find(request => request.turn === turn && request.step === step)
}

/**
 * Fold one layout group into a model call, or nothing when it holds no request, reply, or tool.
 * @returns The call, or undefined for an input-only group.
 */
function groupCall(
  cells: readonly TrajectoryCellProps[],
  turn: number | null,
  index: number,
  step: number,
  requests: readonly WorkflowRequest[],
): WorkflowCall | undefined {
  const reply = cells.find(cell => cell.kind === 'message' || cell.kind === 'compacted')
  const toolCells = cells.filter(cell => cell.kind === 'tool' || cell.kind === 'subtool')
  if (reply === undefined && toolCells.length === 0) return undefined
  const kind = reply?.kind === 'compacted' ? 'compaction' : 'model'
  const tools = nestTools(toolCells)
  const timing = span(cells.filter(cell => cell.kind !== 'user' && cell.kind !== 'context' && cell.kind !== 'system'))
  return {
    id: reply === undefined ? `call\u0000${trajectoryRecordId(toolCells[0] as TrajectoryCellProps)}` : trajectoryRecordId(reply),
    index,
    kind,
    reply,
    request: kind === 'model' ? requestFor(reply, turn, step, requests) : undefined,
    inputs: cells.filter(cell => cell.kind === 'user' || cell.kind === 'context' || cell.kind === 'system'),
    tools,
    status: combinedStatus([...(reply === undefined ? [] : [recordStatus(reply)]), ...tools.map(tool => tool.status)]),
    ...timing,
  }
}

/**
 * Fold the Trajectory layout into user turns of model calls.
 * @param turns - Layout turns from `deriveTrajectoryLayout`, with any in-flight partial appended.
 * @param requests - Request views from the Trajectory snapshot; only ordinary requests are used.
 * @returns Turns in layout order; a turn without a user message or model call is omitted.
 */
export function deriveWorkflow(
  turns: readonly TrajectoryTurnModel[],
  requests: readonly RequestView[],
): readonly WorkflowTurn[] {
  const ordinary = requests.filter((request): request is WorkflowRequest => request.purpose === 'assistant')
  const result: WorkflowTurn[] = []
  for (const [turnIndex, turn] of turns.entries()) {
    const cells = turn.groups.flatMap(group => group.cells)
    const input = cells.find(cell => cell.kind === 'user' && cell.opensTurn === true)
    const calls: WorkflowCall[] = []
    let step = 0
    for (const group of turn.groups) {
      const isModel = group.cells.some(cell => cell.kind === 'message')
      if (isModel) step += 1
      const call = groupCall(group.cells, turn.turn, calls.length + 1, step, ordinary)
      if (call !== undefined) calls.push(call)
    }
    if (input === undefined && calls.length === 0) continue
    result.push({
      id: `turn\u0000${turn.turn ?? `between-${turnIndex}`}`,
      turn: turn.turn,
      input,
      calls,
      toolCount: calls.reduce((total, call) => total + call.tools.length, 0),
      status: combinedStatus(calls.map(call => call.status)),
      ...span(cells),
    })
  }
  return result
}

/**
 * Totals over every resident turn.
 * @param turns - Folded workflow turns.
 * @returns Turn, model-call, and tool-call counts plus the elapsed time from the first start to the last end.
 */
export function summarizeWorkflow(turns: readonly WorkflowTurn[]): WorkflowSummary {
  let start: number | null = null
  let end: number | null = null
  for (const turn of turns) {
    if (turn.startedAt === null) continue
    start = start === null ? turn.startedAt : Math.min(start, turn.startedAt)
    const finish = turn.startedAt + (turn.durationSeconds ?? 0) * 1000
    end = end === null ? finish : Math.max(end, finish)
  }
  return {
    turns: turns.filter(turn => turn.turn !== null).length,
    modelCalls: turns.reduce((total, turn) => total + turn.calls.filter(call => call.kind === 'model').length, 0),
    toolCalls: turns.reduce((total, turn) => total + turn.toolCount, 0),
    durationSeconds: start === null || end === null ? null : (end - start) / 1000,
  }
}
