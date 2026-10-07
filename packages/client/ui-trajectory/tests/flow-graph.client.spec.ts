/**
 * Workflow graph fold: record roles and states, left-to-right stage placement,
 * fan-out and fan-in edges, PTC child-call stages, context filtering, and turn labels.
 */
import { describe, expect, it } from 'vitest'
import { deriveFlowGraph, FLOW_NODE_HEIGHT, FLOW_NODE_WIDTH, type FlowGraph } from '../src/client/flow-graph.ts'
import type { TrajectoryTurnModel } from '../src/client/layout.ts'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'

let nextIndex = 0
function cell(kind: TrajectoryCellProps['kind'], extra: Partial<TrajectoryCellProps> = {}): TrajectoryCellProps {
  nextIndex += 1
  return { index: nextIndex, recordId: `${kind}-${nextIndex}`, kind, text: kind, timeSeconds: 1, ...extra }
}

function turn(number: number | null, ...groups: (readonly TrajectoryCellProps[])[]): TrajectoryTurnModel {
  return { turn: number, groups: groups.map((cells, index) => ({ title: `group ${index}`, cells })) }
}

function edgePairs(graph: FlowGraph): string[] {
  return graph.edges.map(edge => `${edge.source} -> ${edge.target}`)
}

/** Node ids grouped into stages by x, left to right, each stage top to bottom. */
function stages(graph: FlowGraph): string[][] {
  const byX = new Map<number, string[]>()
  for (const node of graph.nodes) {
    const stage = byX.get(node.x) ?? []
    stage.push(node.id)
    byX.set(node.x, stage)
  }
  return [...byX.entries()].sort(([left], [right]) => left - right).map(([, ids]) => ids)
}

describe('deriveFlowGraph', () => {
  it('chains input, model, parallel tools, and the answering model, fanning out and back in', () => {
    const user = cell('user', { recordId: 'user' })
    const model = cell('message', { recordId: 'model', assistantMetrics: {
      timingRecorded: true, stepStartTime: 1, firstTokenTime: 2, completedTime: 3,
      usageProvided: true, outputTokens: 4,
    } })
    const read = cell('tool', { recordId: 'read', outputDetail: 'ok' })
    const edit = cell('tool', { recordId: 'edit', result: 'done' })
    const answer = cell('message', { recordId: 'answer' })
    const graph = deriveFlowGraph([turn(1, [user], [model, read, edit], [answer])], { showContext: false })

    expect(stages(graph)).toEqual([['user'], ['model'], ['read', 'edit'], ['answer']])
    expect(edgePairs(graph)).toEqual([
      'user -> model', 'model -> read', 'model -> edit', 'read -> answer', 'edit -> answer',
    ])
    expect(graph.nodes.map(node => [node.id, node.kind, node.status])).toEqual([
      ['user', 'input', 'done'],
      ['model', 'model', 'done'],
      ['read', 'tool', 'done'],
      ['edit', 'tool', 'done'],
      ['answer', 'model', 'done'],
    ])
    const [upper, lower] = graph.nodes.filter(node => node.kind === 'tool')
    expect(upper!.y).toBeLessThan(0)
    // Node y is the top edge; the two centers sit symmetrically about y = 0.
    expect(upper!.y + lower!.y + FLOW_NODE_HEIGHT).toBe(0)
    expect(upper!.x).toBeGreaterThan(graph.nodes[1]!.x + FLOW_NODE_WIDTH)
    expect(graph.labels.map(label => [label.id, label.turn, label.x])).toEqual([['turn\u00000', 1, 0]])
    expect(graph.labels[0]!.y).toBeLessThan(upper!.y)
  })

  it('places PTC child calls in their own stage after their parent and passes the parent stage through', () => {
    const model = cell('message', { recordId: 'model' })
    const runCode = cell('tool', { recordId: 'run', outputDetail: 'ok' })
    const first = cell('subtool', { recordId: 'sub-a', outputDetail: 'ok' })
    const second = cell('subtool', { recordId: 'sub-b', isError: true })
    const answer = cell('message', { recordId: 'answer' })
    const graph = deriveFlowGraph([turn(1, [model, runCode, first, second], [answer])], { showContext: false })

    expect(stages(graph)).toEqual([['model'], ['run'], ['sub-a', 'sub-b'], ['answer']])
    expect(edgePairs(graph)).toEqual([
      'model -> run', 'run -> sub-a', 'run -> sub-b', 'run -> answer',
    ])
    expect(graph.nodes.find(node => node.id === 'sub-b')?.status).toBe('error')
  })

  it('connects child calls with no parent tool from the previous row', () => {
    const model = cell('message', { recordId: 'model' })
    const orphan = cell('subtool', { recordId: 'orphan', outputDetail: 'ok' })
    const answer = cell('message', { recordId: 'answer' })
    const graph = deriveFlowGraph([turn(1, [model, orphan], [answer])], { showContext: false })

    expect(edgePairs(graph)).toEqual(['model -> orphan', 'model -> answer'])
  })

  it('hides system and context records unless requested, and then shares the input stage', () => {
    const system = cell('system', { recordId: 'system' })
    const context = cell('context', { recordId: 'context' })
    const user = cell('user', { recordId: 'user' })
    const model = cell('message', { recordId: 'model' })
    const turns = [turn(1, [system, context, user], [model])]

    expect(stages(deriveFlowGraph(turns, { showContext: false }))).toEqual([['user'], ['model']])
    const shown = deriveFlowGraph(turns, { showContext: true })
    expect(stages(shown)).toEqual([['system', 'context', 'user'], ['model']])
    expect(shown.nodes.filter(node => node.kind === 'context').map(node => node.id)).toEqual(['system', 'context'])
  })

  it('joins two tall stages through the first target only', () => {
    const model = cell('message', { recordId: 'model' })
    const a = cell('tool', { recordId: 'a', outputDetail: 'ok' })
    const b = cell('tool', { recordId: 'b', outputDetail: 'ok' })
    const context = cell('context', { recordId: 'context' })
    const user = cell('user', { recordId: 'user' })
    const graph = deriveFlowGraph(
      [turn(1, [model, a, b]), turn(2, [context, user])],
      { showContext: true },
    )

    expect(edgePairs(graph)).toEqual(['model -> a', 'model -> b', 'a -> context', 'b -> context'])
  })

  it('reports running tools and model requests and animates the edges into them', () => {
    const user = cell('user', { recordId: 'user' })
    const pendingRequest = cell('message', { recordId: 'request', requestOnly: true, timeSeconds: null })
    const graph = deriveFlowGraph([turn(1, [user], [pendingRequest])], { showContext: false })
    expect(graph.nodes.find(node => node.id === 'request')?.status).toBe('running')
    expect(graph.edges).toEqual([expect.objectContaining({ source: 'user', target: 'request', animated: true })])

    const streaming = cell('message', { recordId: 'streaming', assistantMetrics: {
      timingRecorded: true, stepStartTime: 1, firstTokenTime: null, completedTime: null,
      usageProvided: false, outputTokens: null,
    } })
    const runningTool = cell('tool', { recordId: 'tool' })
    const settledRequest = cell('message', { recordId: 'settled', requestOnly: true, timeSeconds: 2 })
    const failedRequest = cell('message', { recordId: 'failed', requestOnly: true, isError: true })
    const live = deriveFlowGraph(
      [turn(1, [streaming, runningTool], [settledRequest], [failedRequest])],
      { showContext: false },
    )
    expect(live.nodes.map(node => [node.id, node.status])).toEqual([
      ['streaming', 'running'], ['tool', 'running'], ['settled', 'done'], ['failed', 'error'],
    ])
  })

  it('labels a standalone compaction section and spaces turns apart', () => {
    const model = cell('message', { recordId: 'model' })
    const compacted = cell('compacted', { recordId: 'compacted' })
    const graph = deriveFlowGraph([turn(1, [model]), turn(null, [compacted])], { showContext: false })

    expect(graph.nodes.map(node => [node.id, node.kind, node.status, node.turn])).toEqual([
      ['model', 'model', 'done', 1], ['compacted', 'compaction', 'done', null],
    ])
    expect(graph.labels.map(label => label.turn)).toEqual([1, null])
    expect(graph.nodes[1]!.x).toBeGreaterThan(graph.nodes[0]!.x + FLOW_NODE_WIDTH)
    expect(graph.edges.map(edge => edge.target)).toEqual(['compacted'])
  })

  it('skips turns with no visible records', () => {
    const context = cell('context', { recordId: 'context' })
    const model = cell('message', { recordId: 'model' })
    const graph = deriveFlowGraph([turn(1, [context]), turn(2, [model])], { showContext: false })

    expect(graph.labels.map(label => label.turn)).toEqual([2])
    expect(graph.nodes[0]!.x).toBe(0)
    expect(graph.edges).toEqual([])
    expect(deriveFlowGraph([], { showContext: true })).toEqual({ nodes: [], labels: [], edges: [] })
  })
})
