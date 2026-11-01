/**
 * Projection of `coding-cli/tool` events onto the Chat `tool-call` Node, so a
 * tool a coding CLI ran inside its own turn renders as the same tool card as
 * a harness tool call, including grouping and counting in the Turn process.
 */
import type { ChatNode, ToolChatData, ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ConversationLocation, ConversationMatch, ConversationNodeContext, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { CodingCliToolEventData } from '@deepseek-ai/dsh-llm-coding-cli/types'

/** Latest known state of one CLI tool call. */
export interface CliToolState {
  readonly data: CodingCliToolEventData
  /** The first event of the call. */
  readonly startSeq: number
  readonly startTime: number
  /** The latest event of the call. */
  readonly seq: number
  readonly time: number
}

function locationOf(match: ConversationMatch | undefined): ConversationLocation {
  return match?.location ?? { kind: 'unresolved' }
}

function coordinates(location: ConversationLocation): { readonly turn: number; readonly step: number } {
  if (location.kind === 'step') return { turn: location.turn.turn, step: location.step.step }
  return { turn: location.kind === 'turn' ? location.turn.turn : 0, step: 0 }
}

/**
 * Whether the Step or Turn holding a call has closed, which makes a still-running call interrupted.
 * @param location - the call's Location.
 * @returns the closing event, or undefined while the call can still settle.
 */
function closedAt(location: ConversationLocation): { readonly seq: number; readonly time: number } | undefined {
  if (location.kind === 'step' && location.step.status === 'closed') return location.step.end
  if ((location.kind === 'step' || location.kind === 'turn') && location.turn.status === 'closed') return location.turn.end
  return undefined
}

/**
 * Build the tool-card block of one call.
 * @param state - the call's latest state.
 * @param location - the call's Location.
 * @returns a started call while it runs, otherwise a settled result.
 */
export function toolBlock(state: CliToolState, location: ConversationLocation): ToolCallBlock {
  const { data } = state
  const call = { name: data.name, argsRaw: data.arguments }
  const interrupted = data.status === 'running' ? closedAt(location) : undefined
  if (data.status === 'running' && interrupted === undefined) {
    return { phase: 'start', callId: data.callId, name: data.name, argsRaw: data.arguments, ...coordinates(location), time: state.startTime, subCalls: [] }
  }
  const failed = data.status !== 'completed'
  return {
    kind: 'tool-result',
    seq: interrupted?.seq ?? state.seq,
    time: interrupted?.time ?? state.time,
    callId: data.callId,
    call,
    callTime: state.startTime,
    content: data.output === undefined ? [] : [{ type: 'text', text: data.output }],
    isError: failed,
    ...!failed ? {} : interrupted === undefined
      ? { error: { name: 'ToolFailed', code: 'failed' } }
      : { error: { name: 'Interrupted', code: 'interrupted' } },
    subCalls: [],
  }
}

function stateOf(match: ConversationMatch, previous?: CliToolState): CliToolState {
  const event = match.event
  const data = event.data as CodingCliToolEventData
  return {
    data: previous === undefined ? data : { ...data, name: data.name, arguments: data.arguments },
    startSeq: previous?.startSeq ?? event.seq,
    startTime: previous?.startTime ?? event.time,
    seq: event.seq,
    time: event.time,
  }
}

/** The `coding-cli/tool` Definition, one Chat `tool-call` Node per CLI tool call. */
export const codingCliToolDefinition: ConversationNodeDefinition<CliToolState> = {
  kind: 'coding-cli-tool',
  target: 'chat',
  match: event => event.type === 'coding-cli/tool'
    ? { id: event.data.callId, role: 'start' }
    : null,
  start: (_context, match) => stateOf(match),
  update: (context, match) => stateOf(match, context.state),
  buildViewNode: (context: ConversationNodeContext<CliToolState>) => {
    const state = context.state
    if (state === undefined) return null
    const location = locationOf(context.start ?? context.matches[0])
    const root = toolBlock(state, location)
    const current = context.current.get('chat') as ChatNode<'tool-call'> | null | undefined
    const data: ToolChatData = { root }
    const node: ChatNode<'tool-call'> = {
      key: context.key, kind: 'tool-call', id: context.id, target: 'chat',
      anchorSeq: state.startSeq, location, visibility: 'visible', data,
    }
    return current !== null && current !== undefined && sameRoot(current.data.root, root) && current.location === location ? current : node
  },
}

function sameRoot(left: ToolCallBlock, right: ToolCallBlock): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
