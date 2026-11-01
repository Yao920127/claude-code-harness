/**
 * Coding-CLI presentation: tool cards for the tool calls a coding CLI runs inside its own model turn, read from
 * `coding-cli/tool` events, and, in the Desktop app, the Models settings list of the CLIs whose own sign-in the model
 * routes use.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import { CliSignInList, type CliSignInListInjected } from './CliSignInList.tsx'
import { en, zh } from './locales.ts'
import { signInBridge } from './sign-in-bridge.ts'
import { codingCliToolDefinition } from './tool-node.ts'

export { codingCliToolDefinition, toolBlock } from './tool-node.ts'
export type { CliToolState } from './tool-node.ts'
export { CliSignInList, statusText } from './CliSignInList.tsx'
export type { CliSignInListInjected, CliSignInListProps } from './CliSignInList.tsx'
export { signInBridge, SIGN_IN_CLI_INFO, SIGN_IN_CLIS } from './sign-in-bridge.ts'
export type { CliSignInBridge, CliSignInResult, CliSignInStatus, SignInCli } from './sign-in-bridge.ts'

/** Locale namespace of the sign-in list copy. */
const NS = 'codingCliSignIn'

/** Required services: the Conversation engine, slots, and copy. */
export const inject = ['uiConversation', 'slots', 'locale']

/**
 * Register the `coding-cli/tool` Definition and, when the Desktop sign-in bridge exists, the sign-in list at the foot of
 * the Models settings section; unloading the plugin removes both.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(codingCliToolDefinition)
  const bridge = signInBridge()
  if (bridge === undefined) return
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-coding-cli-tools: sign-in copy')
  ctx.effect(() => ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: '@deepseek-ai/dsh-client-ui-coding-cli-tools/sign-in', locale: NS, order: 0,
    inject: (): CliSignInListInjected => ({ bridge }),
  }, CliSignInList)), 'ui-coding-cli-tools: sign-in list')
}
