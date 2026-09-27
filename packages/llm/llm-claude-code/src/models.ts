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

/** Selector label of the native default entry, whose model the host's Claude Code settings choose. */
export const NATIVE_MODEL_NAME = 'Claude (Claude Code settings)'

/**
 * Project Claude Code's model list onto selector entries. The native default
 * entry sends no model, so the host's Claude Code settings (for example
 * `"model": "opus"`) choose it; its label therefore names no model, and its
 * description names the account's recommended model that applies only when
 * no setting selects one. Every alias stays listed so each model can be
 * selected explicitly.
 * @param models - the list Claude Code reported, in its preferred order.
 * @returns selector entries such as `Claude (Claude Code settings)`, `Claude Sonnet 5`, and `Claude Fable 5.1`.
 */
export function modelEntries(models: readonly ModelInfo[]): ClaudeCodeModelEntry[] {
  return models.map((model) => {
    const [label = model.displayName, ...notes] = model.description.split(DESCRIPTION_SEPARATOR)
    if (model.value === NATIVE_MODEL_ID) {
      return {
        id: model.value,
        name: NATIVE_MODEL_NAME,
        description: `The model your Claude Code settings select; ${label} without a setting`,
      }
    }
    return {
      id: model.value,
      name: `Claude ${label}`,
      ...notes.length === 0 ? {} : { description: notes.join(DESCRIPTION_SEPARATOR) },
    }
  })
}
