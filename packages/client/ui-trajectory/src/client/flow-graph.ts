/**
 * Workflow graph fold: turn the Trajectory layout into positioned flowchart
 * nodes and edges. Stages run left to right in record order; the tool calls of
 * one step stack in one column, and PTC child calls share the column after
 * their parent.
 */

import type { TrajectoryTurnModel } from './layout.ts'
import type { TrajectoryCellProps } from './trajectory-record.ts'
import { trajectoryRecordId } from './trajectory-record.ts'

/** Node width in canvas pixels; `FlowView.module.css` sizes nodes to match. */
export const FLOW_NODE_WIDTH = 290
/** Node height in canvas pixels; `FlowView.module.css` sizes nodes to match. */
export const FLOW_NODE_HEIGHT = 72
/** Vertical space between records of one stage. */
const STACK_GAP = 20
/** Horizontal space between consecutive stages, which the arrows cross. */
const STAGE_GAP = 72
/** Extra horizontal space before each turn after the first. */
const TURN_GAP = 48
/** Turn-label height; the label sits this far plus {@link STACK_GAP} above the turn's tallest stage. */
const TURN_LABEL_HEIGHT = 24

/** Closed set of flowchart node roles. */
export type FlowNodeKind = 'input' | 'context' | 'model' | 'tool' | 'subtool' | 'compaction'

/** Completion state shown on a flowchart node. */
export type FlowNodeStatus = 'done' | 'error' | 'running'

/** One positioned record node. */
export interface FlowRecordNode {
  /** Stable identity derived from {@link trajectoryRecordId}. */
  readonly id: string
  readonly kind: FlowNodeKind
  readonly status: FlowNodeStatus
  /** Source record the details panel renders. */
  readonly cell: TrajectoryCellProps
  /** Owning turn, or `null` for a standalone compaction section. */
  readonly turn: number | null
  /** Message or step group title from the layout. */
  readonly group: string
  readonly x: number
  readonly y: number
}

/** One positioned turn label placed above the turn's first stage. */
export interface FlowTurnLabel {
  readonly id: string
  readonly turn: number | null
  readonly x: number
  readonly y: number
}

/** One directed connection between two record nodes. */
export interface FlowEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  /** Whether the target node is still running. */
  readonly animated: boolean
}

/** Complete positioned flowchart. */
export interface FlowGraph {
  readonly nodes: readonly FlowRecordNode[]
  readonly labels: readonly FlowTurnLabel[]
  readonly edges: readonly FlowEdge[]
}

/** Options selecting which records become nodes. */
export interface FlowGraphOptions {
  /** Include system-prompt and context-injection records. */
  readonly showContext: boolean
}

interface PendingNode {
  readonly id: string
  readonly kind: FlowNodeKind
  readonly status: FlowNodeStatus
  readonly cell: TrajectoryCellProps
  readonly turn: number | null
  readonly group: string
  /** Parent tool node id for a `subtool`. */
  readonly parent?: string
}

/**
 * Map one layout record to its node role.
 * @param cell - Layout record.
 * @returns The node role.
 */
function kindOf(cell: TrajectoryCellProps): FlowNodeKind {
  switch (cell.kind) {
    case 'user': return 'input'
    case 'system':
    case 'context': return 'context'
    case 'message': return 'model'
    case 'tool': return 'tool'
    case 'subtool': return 'subtool'
    case 'compacted': return 'compaction'
  }
}

function statusOf(cell: TrajectoryCellProps): FlowNodeStatus {
  if (cell.isError === true) return 'error'
  switch (cell.kind) {
    case 'tool':
    case 'subtool':
      return cell.outputDetail === undefined && cell.result === undefined ? 'running' : 'done'
    case 'message':
      if (cell.requestOnly === true) return cell.timeSeconds === null ? 'running' : 'done'
      return cell.assistantMetrics?.completedTime === null ? 'running' : 'done'
    case 'system':
    case 'user':
    case 'context':
    case 'compacted':
      return 'done'
  }
}

/**
 * Split one group's records into stages: inputs, model records, tool calls,
 * and PTC child calls each form their own stage.
 */
function groupStages(
  cells: readonly TrajectoryCellProps[],
  turn: number | null,
  group: string,
  options: FlowGraphOptions,
): PendingNode[][] {
  const stages: PendingNode[][] = []
  let current: PendingNode[] = []
  let currentKind: FlowNodeKind | null = null
  let subStage: PendingNode[] = []
  let parentTool: string | undefined
  const flush = () => {
    if (current.length > 0) stages.push(current)
    if (subStage.length > 0) stages.push(subStage)
    current = []
    subStage = []
    currentKind = null
  }
  for (const cell of cells) {
    const kind = kindOf(cell)
    if (kind === 'context' && !options.showContext) continue
    const node: PendingNode = {
      id: trajectoryRecordId(cell),
      kind,
      status: statusOf(cell),
      cell,
      turn,
      group,
      ...(kind === 'subtool' && parentTool !== undefined ? { parent: parentTool } : {}),
    }
    if (kind === 'subtool') {
      subStage.push(node)
      continue
    }
    // Inputs and context injections share one stage; every other role starts
    // a stage when the role changes.
    const stageKind: FlowNodeKind = kind === 'context' ? 'input' : kind
    if (currentKind !== stageKind) flush()
    currentKind = stageKind
    current.push(node)
    if (kind === 'tool') parentTool = node.id
  }
  flush()
  return stages
}

/** Outlets of a stage: the nodes the next stage connects from. */
function outlets(row: readonly PendingNode[]): readonly PendingNode[] {
  return row.filter(node => node.kind !== 'subtool')
}

/**
 * Fold the Trajectory layout into a positioned flowchart.
 * @param turns - Layout turns from `deriveTrajectoryLayout`, with any in-flight partial appended.
 * @param options - Record selection.
 * @returns Nodes, turn labels, and edges in canvas coordinates, stages centered on y = 0.
 */
export function deriveFlowGraph(
  turns: readonly TrajectoryTurnModel[],
  options: FlowGraphOptions,
): FlowGraph {
  const nodes: FlowRecordNode[] = []
  const labels: FlowTurnLabel[] = []
  const edges: FlowEdge[] = []
  const connect = (source: PendingNode, target: PendingNode) => {
    edges.push({
      id: `${source.id}\u0000${target.id}`,
      source: source.id,
      target: target.id,
      animated: target.status === 'running',
    })
  }
  let previous: readonly PendingNode[] = []
  let x = 0
  for (const [turnIndex, turn] of turns.entries()) {
    const stages = turn.groups.flatMap(group => groupStages(group.cells, turn.turn, group.title, options))
    if (stages.length === 0) continue
    if (turnIndex > 0 && nodes.length > 0) x += TURN_GAP
    let turnTop = 0
    const turnLeft = x
    for (const stage of stages) {
      const height = stage.length * FLOW_NODE_HEIGHT + (stage.length - 1) * STACK_GAP
      const top = -height / 2
      turnTop = Math.min(turnTop, top)
      for (const [index, node] of stage.entries()) {
        nodes.push({
          id: node.id,
          kind: node.kind,
          status: node.status,
          cell: node.cell,
          turn: node.turn,
          group: node.group,
          x,
          y: top + index * (FLOW_NODE_HEIGHT + STACK_GAP),
        })
      }
      const children = stage.filter(node => node.parent !== undefined)
      if (children.length > 0) {
        for (const child of children) {
          const parent = previous.find(node => node.id === child.parent)
          if (parent !== undefined) connect(parent, child)
        }
      } else if (previous.length > 0) {
        // Fan out from one source or fan in to one target; between two tall
        // stages every source joins the first target so arrows stay readable.
        if (previous.length === 1 || stage.length === 1) {
          for (const source of previous) for (const target of stage) connect(source, target)
        } else {
          const first = stage[0] as PendingNode
          for (const source of previous) connect(source, first)
        }
      }
      // A child-call stage passes its parents' stage through to the next stage.
      const stageOutlets = outlets(stage)
      if (stageOutlets.length > 0) previous = stageOutlets
      x += FLOW_NODE_WIDTH + STAGE_GAP
    }
    labels.push({
      id: `turn\u0000${turnIndex}`,
      turn: turn.turn,
      x: turnLeft,
      y: turnTop - TURN_LABEL_HEIGHT - STACK_GAP,
    })
  }
  return { nodes, labels, edges }
}
