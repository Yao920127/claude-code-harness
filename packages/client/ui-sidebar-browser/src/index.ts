/** Host companion for the Sidebar Browser Client plugin: the search and home addresses it projects to the browser. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export { SIDEBAR_BROWSER_NAMESPACE, type SidebarBrowserSettings } from './browser-settings.ts'

/** Browser preferences projected to the client. */
export interface Config {
  /** HTTPS search address for address-bar keywords; `%s` receives the encoded query. */
  searchUrl: Volatile<string>
  /** HTTPS page a new Browser tab opens when it has no address of its own; empty opens none. */
  homeUrl: Volatile<string>
}

/** Live browser preferences; the search address must be HTTPS and carry one `%s`, and the home address must be HTTPS or empty. */
export const Config = z.object({
  searchUrl: z.string()
    .pattern(/^https:\/\/[^\s%]*%s[^\s%]*$/u)
    .default('https://www.google.com/search?q=%s')
    .description('HTTPS search address for address-bar keywords; %s receives the encoded query.')
    .volatile(),
  homeUrl: z.string()
    .pattern(/^(?:https:\/\/\S+)?$/u)
    .default('https://www.google.com')
    .description('HTTPS page a new Browser tab opens when it has no address of its own; empty opens none.')
    .volatile(),
})

/**
 * Serve the browser preferences through the configuration form projection without an automatic settings page.
 * @param ctx - plugin context used for optional settings presentation.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
