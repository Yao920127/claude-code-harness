/** Projection of `coding-cli/tool` events onto Chat tool-call Nodes. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type {
  ConversationLocation, ConversationMatch, ConversationNodeContext, ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { CodingCliToolEventData } from '@deepseek-ai/dsh-llm-coding-cli/types'
import { apply, codingCliToolDefinition, inject, toolBlock, type CliToolState } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

const running: CodingCliToolEventData = {
  provider: 'codex', callId: 't:item_1', name: 'bash', arguments: '{"command":"ls"}', status: 'running',
}

function step(status: 'open' | 'closed', end?: { seq: number; time: number }): ConversationLocation {
  const turn = { turn: 2, start: undefined, end: undefined, status: 'open', steps: [], data: {} }
  return { kind: 'step', turn, step: { turn: 2, step: 3, start: undefined, end, status, data: {} } } as never
}

function match(data: CodingCliToolEventData, seq: number, location: ConversationLocation): ConversationMatch {
  return { event: { type: 'coding-cli/tool', seq, time: seq * 10, data }, role: 'start', location } as never
}

function context(
  state: CliToolState | undefined, matches: ConversationMatch[], current?: ConversationViewNode | null,
): ConversationNodeContext<CliToolState> {
  return {
    key: 'k', kind: 'coding-cli-tool', id: running.callId, matches, start: matches[0] as never, state,
    current: new Map(current === undefined ? [] : [['chat', current]]),
  }
}

function build(nodeContext: ConversationNodeContext<CliToolState>): ConversationViewNode | null {
  if (codingCliToolDefinition.buildViewNode === undefined) throw new Error('the Definition builds no view Node')
  return codingCliToolDefinition.buildViewNode(nodeContext)
}

describe('toolBlock', () => {
  const state = { data: running, startSeq: 4, startTime: 40, seq: 4, time: 40 }

  it('shows a running call as started with its Turn and Step', () => {
    expect(toolBlock(state, step('open'))).toEqual({
      phase: 'start', callId: 't:item_1', name: 'bash', argsRaw: '{"command":"ls"}', turn: 2, step: 3, time: 40, subCalls: [],
    })
    expect(toolBlock(state, { kind: 'turn', turn: { turn: 5, status: 'open' } } as never)).toMatchObject({ turn: 5, step: 0 })
    expect(toolBlock(state, { kind: 'unresolved' })).toMatchObject({ turn: 0, step: 0 })
  })

  it('settles completed, failed, and interrupted calls', () => {
    const done = { ...state, data: { ...running, status: 'completed' as const, output: 'a.txt' }, seq: 6, time: 60 }
    expect(toolBlock(done, step('closed'))).toEqual({
      kind: 'tool-result', seq: 6, time: 60, callId: 't:item_1', call: { name: 'bash', argsRaw: '{"command":"ls"}' }, callTime: 40,
      content: [{ type: 'text', text: 'a.txt' }], isError: false, subCalls: [],
    })
    const failed = { ...state, data: { ...running, status: 'failed' as const } }
    expect(toolBlock(failed, step('open'))).toMatchObject({ isError: true, content: [], error: { code: 'failed' } })
    expect(toolBlock(state, step('closed', { seq: 9, time: 90 }))).toMatchObject({ seq: 9, time: 90, isError: true, error: { code: 'interrupted' } })
    const closedTurn = { kind: 'turn', turn: { turn: 1, status: 'closed', end: { seq: 8, time: 80 } } } as never
    expect(toolBlock(state, closedTurn)).toMatchObject({ error: { code: 'interrupted' } })
  })
})

describe('codingCliToolDefinition', () => {
  it('matches coding-cli/tool events by call id and keeps the first event as the call start', () => {
    const location = step('open')
    expect(codingCliToolDefinition.match({ type: 'coding-cli/tool', data: running } as never)).toEqual({ id: 't:item_1', role: 'start' })
    expect(codingCliToolDefinition.match({ type: 'tool/call', data: {} } as never)).toBeNull()
    const first = codingCliToolDefinition.start(context(undefined, []), match(running, 4, location) as never, {} as never)
    const settled = codingCliToolDefinition.update(context(first, []) as never, match({ ...running, status: 'completed' }, 7, location))
    expect(settled).toMatchObject({ startSeq: 4, startTime: 40, seq: 7, time: 70, data: { status: 'completed' } })
  })

  it('builds one Chat tool-call Node and reuses an unchanged Node', () => {
    const location = step('open')
    const matches = [match(running, 4, location)]
    expect(build(context(undefined, matches))).toBeNull()
    const state = { data: running, startSeq: 4, startTime: 40, seq: 4, time: 40 }
    const node = build(context(state, matches))
    expect(node).toMatchObject({ key: 'k', kind: 'tool-call', target: 'chat', anchorSeq: 4, visibility: 'visible', location, data: { root: { phase: 'start' } } })
    expect(build(context(state, matches, node))).toBe(node)
    const changed = build(context({ ...state, data: { ...running, status: 'completed' } }, matches, node))
    expect(changed).not.toBe(node)
    expect(build({ ...context(state, []), start: undefined })).toMatchObject({ location: { kind: 'unresolved' } })
  })
})

describe('coding-cli tool cards plugin', () => {
  it('registers the Definition with the Conversation engine and no sign-in list outside the Desktop app', async () => {
    expect(hostApply).not.toThrow()
    const ctx = new Context()
    const register = vi.fn()
    const slots = { inject: vi.fn(), register: vi.fn() }
    ctx.provide('uiConversation', { events: { register } } as never)
    ctx.provide('slots', slots as never)
    ctx.provide('locale', { register: vi.fn(() => () => {}) } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(register).toHaveBeenCalledWith(codingCliToolDefinition)
    expect(slots.inject).not.toHaveBeenCalled()
    await fiber.dispose()
  })
})
