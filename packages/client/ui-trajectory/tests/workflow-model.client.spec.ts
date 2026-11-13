/**
 * Workflow fold: turns of model calls, request matching, tool nesting,
 * completion states, timing spans, and Session totals.
 */
import { describe, expect, it } from 'vitest'
import type { RequestView } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryTurnModel } from '../src/client/layout.ts'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'
import { deriveWorkflow, recordStatus, summarizeWorkflow, type WorkflowRequest } from '../src/client/workflow-model.ts'

let nextIndex = 0
function cell(kind: TrajectoryCellProps['kind'], extra: Partial<TrajectoryCellProps> = {}): TrajectoryCellProps {
  nextIndex += 1
  return { index: nextIndex, recordId: `${kind}-${nextIndex}`, kind, text: kind, timeSeconds: 1, ...extra }
}

function turn(number: number | null, ...groups: (readonly TrajectoryCellProps[])[]): TrajectoryTurnModel {
  return { turn: number, groups: groups.map((cells, index) => ({ title: `group ${index}`, cells })) }
}

function request(turnNumber: number, step: number, extra: Partial<WorkflowRequest> = {}): WorkflowRequest {
  return {
    purpose: 'assistant', turn: turnNumber, step, startSeq: 1_000 + step, startedAt: 0, completedAt: 1, status: 'complete',
    ...extra,
  }
}

describe('recordStatus', () => {
  it.each<[string, TrajectoryCellProps, string]>([
    ['a failed record', cell('tool', { isError: true }), 'error'],
    ['a tool without a result', cell('tool'), 'running'],
    ['a tool with a summary', cell('subtool', { result: 'ok' }), 'done'],
    ['a tool with full output', cell('tool', { outputDetail: 'ok' }), 'done'],
    ['a waiting request', cell('message', { requestOnly: true, timeSeconds: null }), 'running'],
    ['a finished request', cell('message', { requestOnly: true }), 'done'],
    ['a streaming reply', cell('message', { assistantMetrics: {
      timingRecorded: true, stepStartTime: 1, firstTokenTime: null, completedTime: null, usageProvided: false, outputTokens: null,
    } }), 'running'],
    ['a finished reply', cell('message'), 'done'],
    ['a running compaction', cell('compacted', { timeSeconds: null }), 'running'],
    ['a finished compaction', cell('compacted'), 'done'],
    ['a user message', cell('user'), 'done'],
    ['a context injection', cell('context'), 'done'],
    ['a system prompt', cell('system'), 'done'],
  ])('reports %s', (_name, record, status) => {
    expect(recordStatus(record)).toBe(status)
  })
})

describe('deriveWorkflow', () => {
  it('groups a turn into model calls with their requests, inputs, and nested tools', () => {
    const user = cell('user', { recordId: 'user', opensTurn: true, text: 'list files', startedAt: 1_000, timeSeconds: 0 })
    const system = cell('system', { recordId: 'system', startedAt: 1_000 })
    const first = cell('message', { recordId: 'first', sourceSeq: 2, startedAt: 2_000, timeSeconds: 1 })
    const run = cell('tool', { recordId: 'run', result: 'ok', startedAt: 3_000, timeSeconds: 2 })
    const child = cell('subtool', { recordId: 'child', isError: true, startedAt: 3_500, timeSeconds: 0.5 })
    const answer = cell('message', { recordId: 'answer', sourceSeq: 9, startedAt: 6_000, timeSeconds: 1 })
    const matched = request(1, 1, { resultSeq: 2 })
    const byStep = request(1, 2)
    const requests: RequestView[] = [matched, byStep, { ...request(1, 3), purpose: 'compaction', turn: 1, step: 0 }]

    const [only] = deriveWorkflow([turn(1, [user, system], [first, run, child], [answer])], requests)

    expect(only!.input).toBe(user)
    expect(only!.calls.map(call => [call.id, call.index, call.kind, call.status])).toEqual([
      ['first', 1, 'model', 'error'],
      ['answer', 2, 'model', 'done'],
    ])
    expect(only!.calls[0]!.request).toBe(matched)
    expect(only!.calls[1]!.request).toBe(byStep)
    expect(only!.calls[0]!.tools.map(tool => [tool.id, tool.status, tool.children.map(entry => entry.id)]))
      .toEqual([['run', 'error', ['child']]])
    expect(only!.calls[0]!.startedAt).toBe(2_000)
    expect(only!.calls[0]!.durationSeconds).toBe(3)
    expect(only!.toolCount).toBe(1)
    expect(only!.status).toBe('error')
    expect(only!.startedAt).toBe(1_000)
    expect(only!.durationSeconds).toBe(6)
  })

  it('keeps step inputs on the call and opens a call for tools without a reply', () => {
    const context = cell('context', { recordId: 'context' })
    const orphan = cell('subtool', { recordId: 'orphan', result: 'ok' })
    const tool = cell('tool', { recordId: 'tool' })
    const [only] = deriveWorkflow([turn(2, [context, orphan, tool])], [])
    const [call] = only!.calls
    expect(call!.id).toBe('call\u0000orphan')
    expect(call!.reply).toBeUndefined()
    expect(call!.request).toBeUndefined()
    expect(call!.inputs).toEqual([context])
    expect(call!.tools.map(entry => entry.id)).toEqual(['orphan', 'tool'])
    expect(call!.status).toBe('running')
    expect(call!.startedAt).toBeNull()
    expect(call!.durationSeconds).toBeNull()
  })

  it('folds compactions between turns, matches waiting requests by their opening sequence, and drops empty turns', () => {
    const compaction = cell('compacted', { recordId: 'compaction' })
    const waiting = cell('message', { recordId: 'waiting', requestOnly: true, sourceSeq: 1_001, timeSeconds: null })
    const waitingRequest = request(3, 1, { completedAt: null, status: 'running' })
    const workflow = deriveWorkflow([
      turn(null, [compaction]),
      turn(4, [cell('context')]),
      turn(3, [waiting]),
    ], [waitingRequest])
    expect(workflow.map(entry => entry.id)).toEqual(['turn\u0000between-0', 'turn\u00003'])
    expect(workflow[0]!.calls[0]!.kind).toBe('compaction')
    expect(workflow[0]!.calls[0]!.request).toBeUndefined()
    expect(workflow[1]!.calls[0]!.request).toBe(waitingRequest)
    expect(workflow[1]!.status).toBe('running')
  })

  it('finds no request for an unmatched reply between turns', () => {
    const reply = cell('message', { recordId: 'reply' })
    const [only] = deriveWorkflow([turn(null, [reply])], [request(1, 1)])
    expect(only!.calls[0]!.request).toBeUndefined()
  })
})

describe('summarizeWorkflow', () => {
  it('counts turns, model calls, and tools and spans the first start to the last end', () => {
    const workflow = deriveWorkflow([
      turn(1, [cell('user', { opensTurn: true, startedAt: 1_000, timeSeconds: 0 })],
        [cell('message', { startedAt: 1_000, timeSeconds: 2 }), cell('tool', { result: 'ok', startedAt: 2_000, timeSeconds: 1 })]),
      turn(null, [cell('compacted')]),
      turn(2, [cell('message', { startedAt: 10_000, timeSeconds: 5 })]),
    ], [])
    expect(summarizeWorkflow(workflow)).toEqual({ turns: 2, modelCalls: 2, toolCalls: 1, durationSeconds: 14 })
  })

  it('reports no duration without start times', () => {
    expect(summarizeWorkflow(deriveWorkflow([turn(1, [cell('message')])], [])).durationSeconds).toBeNull()
    expect(summarizeWorkflow([])).toEqual({ turns: 0, modelCalls: 0, toolCalls: 0, durationSeconds: null })
  })
})
