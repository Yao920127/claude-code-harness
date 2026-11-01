/**
 * Recording of the tool calls a CLI reports as `coding-cli/tool` Session
 * events, which app windows render as tool cards.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/tool-events
 */

import { randomUUID } from 'node:crypto'
import type { CliToolEvent } from './events.ts'
import { harnessToolCall } from './tools.ts'
import type { CodingCliToolEventData } from './types.ts'

/** Records one turn's tool calls; later states of a call reuse its first name and input. */
export class ToolEventRecorder {
  private readonly turn = randomUUID()
  private readonly calls = new Map<string, { readonly name: string; readonly input: unknown }>()

  /**
   * @param provider - the route running the turn.
   * @param append - appends one event to the Session log.
   */
  constructor(
    private readonly provider: string,
    private readonly append: (data: CodingCliToolEventData) => void,
  ) {}

  /**
   * Record one reported tool state.
   * @param event - the decoded tool event.
   */
  record(event: CliToolEvent): void {
    const known = this.calls.get(event.id)
    const name = known === undefined || event.name !== 'tool' ? event.name : known.name
    const input = event.input ?? known?.input
    this.calls.set(event.id, { name, input })
    const call = harnessToolCall(name, input)
    this.append({
      provider: this.provider,
      callId: `${this.turn}:${event.id}`,
      name: call.name,
      arguments: JSON.stringify(call.arguments),
      status: event.status,
      ...event.output === undefined ? {} : { output: event.output },
    })
  }
}
