/**
 * Model discovery from the signed-in Claude Code installation.
 *
 * The models a Claude account may use, and the one its settings select by
 * default, differ per account and plan. Discovery asks Claude Code itself
 * through the SDK's `supportedModels()` control request, which needs no
 * prompt and makes no model call.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/models
 */

import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'

/** Model id that leaves native Claude settings in charge of model selection. */
export const NATIVE_MODEL_ID = 'default'

/** One selectable model advertised by the route. */
export interface ClaudeCodeModelEntry {
  /** Native model name or alias passed to Claude Code; {@link NATIVE_MODEL_ID} passes none. */
  readonly id: string
  /** Selector label. */
  readonly name: string
  /** Optional selector distinction. */
  readonly description?: string
}

/** Separator between the model name and its notes in a Claude Code model description. */
const DESCRIPTION_SEPARATOR = ' · '

/**
 * Project Claude Code's model list onto selector entries. The native default
 * entry names the model it resolves to, and an alias resolving to that same
 * model is dropped so the selector lists each model once.
 * @param models - the list Claude Code reported, in its preferred order.
 * @returns selector entries such as `Claude Sonnet 5 (default)` and `Claude Fable 5.1`.
 */
export function modelEntries(models: readonly ModelInfo[]): ClaudeCodeModelEntry[] {
  const nativeDefault = models.find(model => model.value === NATIVE_MODEL_ID)
  const entries: ClaudeCodeModelEntry[] = []
  for (const model of models) {
    if (model !== nativeDefault && nativeDefault?.resolvedModel !== undefined && model.resolvedModel === nativeDefault.resolvedModel) {
      continue
    }
    const [label = model.displayName, ...notes] = model.description.split(DESCRIPTION_SEPARATOR)
    entries.push({
      id: model.value,
      name: model === nativeDefault ? `Claude ${label} (default)` : `Claude ${label}`,
      ...notes.length === 0 ? {} : { description: notes.join(DESCRIPTION_SEPARATOR) },
    })
  }
  return entries
}
