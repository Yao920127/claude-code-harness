/**
 * Traditional Chinese (Taiwan) language for the Web client. The language owns
 * no dictionaries: every text it lacks comes from the Simplified Chinese copy
 * and is converted to Traditional characters and Taiwan phrasing with OpenCC,
 * so each package's `zh` dictionary serves both scripts without a second copy.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { Converter } from 'opencc-js/cn2t'
import { LANGUAGE_LABEL } from './locales.ts'

/** Stable language id stored as the locale preference and matched against browser tags. */
export const LANGUAGE_ID = 'zh-TW'

/** Required service: the client locale registry. */
export const inject = ['locale']

/**
 * Build the Simplified-to-Traditional rewrite. Conversions are memoized
 * because the locale service rewrites fallback text on every lookup.
 * @returns a pure text rewrite.
 */
export function createTraditionalRewrite(): (text: string) => string {
  const convert = Converter({ from: 'cn', to: 'twp' })
  const converted = new Map<string, string>()
  return (text) => {
    let result = converted.get(text)
    if (result === undefined) {
      result = convert(text)
      converted.set(text, result)
    }
    return result
  }
}

/**
 * Register the language; unloading the plugin removes it from the selector.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const derive = createTraditionalRewrite()
  ctx.effect(
    () => ctx.locale.addLanguage({ id: LANGUAGE_ID, label: LANGUAGE_LABEL, fallback: 'zh', derive }),
    'locale-zh-hant: language',
  )
}
