/** Tool cards for the tool calls a coding CLI runs inside its own model turn, read from `coding-cli/tool` events. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { codingCliToolDefinition } from './tool-node.ts'

export { codingCliToolDefinition, toolBlock } from './tool-node.ts'
export type { CliToolState } from './tool-node.ts'

/** Required service: the Conversation engine that projects session events onto Chat Nodes. */
export const inject = ['uiConversation']

/**
 * Register the `coding-cli/tool` Definition; unloading the plugin removes it.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(codingCliToolDefinition)
}
