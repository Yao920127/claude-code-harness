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

import type { EffortLevel, ModelInfo } from '@anthropic-ai/claude-agent-sdk'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmModelReasoningInfo, LlmReasoningEffortInfo } from '@deepseek-ai/dsh-llm'

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
  /** Claude Code effort levels the model accepts; absent or empty offers no effort choice. */
  readonly efforts?: EffortLevel[]
}

/** Effort levels in Claude Code's ascending order, each with its selector entry. */
const EFFORT_LEVELS: readonly { readonly level: EffortLevel; readonly info: LlmReasoningEffortInfo }[] = [
  { level: 'low', info: { id: ReasoningEffortId('low'), name: 'Low' } },
  { level: 'medium', info: { id: ReasoningEffortId('medium'), name: 'Medium' } },
  { level: 'high', info: { id: ReasoningEffortId('high'), name: 'High' } },
  { level: 'xhigh', info: { id: ReasoningEffortId('xhigh'), name: 'Extra high' } },
  { level: 'max', info: { id: ReasoningEffortId('max'), name: 'Max' } },
]

/** Claude Code's own default effort, selected whenever the model accepts it. */
const DEFAULT_EFFORT: EffortLevel = 'high'

/**
 * Describe the effort choices of one model in Claude Code's ascending order.
 * @param efforts - levels the model accepts.
 * @returns selector efforts with `high` as the default when accepted; undefined when no level is accepted.
 */
export function modelReasoning(efforts: readonly EffortLevel[] | undefined): LlmModelReasoningInfo | undefined {
  if (efforts === undefined) return undefined
  const offered = EFFORT_LEVELS.filter(entry => efforts.includes(entry.level))
  if (offered.length === 0) return undefined
  return {
    efforts: offered.map(entry => entry.info),
    ...efforts.includes(DEFAULT_EFFORT) ? { defaultEffort: ReasoningEffortId(DEFAULT_EFFORT) } : {},
  }
}

/**
 * Map a requested selector effort back to the Claude Code level.
 * @param effort - effort id from a request.
 * @returns the matching level; undefined for an id this route never advertises.
 */
export function effortLevel(effort: string): EffortLevel | undefined {
  return EFFORT_LEVELS.find(entry => entry.level === effort)?.level
}

/**
 * Read the effort levels Claude Code reports for one model.
 * @param model - one reported model.
 * @returns the accepted levels, or none when the model takes no effort setting.
 */
function reportedEfforts(model: ModelInfo): Pick<ClaudeCodeModelEntry, 'efforts'> {
  const levels = model.supportsEffort === false ? undefined : model.supportedEffortLevels
  return levels === undefined || levels.length === 0 ? {} : { efforts: levels }
}

/** Separator between the model name and its notes in a Claude Code model description. */
const DESCRIPTION_SEPARATOR = ' · '

/** Selector label of the native default entry, whose model the host's Claude Code settings choose. */
export const NATIVE_MODEL_NAME = 'Claude (Claude Code settings)'

/**
 * Split one reported model into its name and notes. Claude Code reports the
 * name either as the head of `description` (`Opus 5.5 · Best for everyday
 * tasks`) or, when the description holds no separator, as `displayName` with
 * the whole description as notes.
 * @param model - one reported model.
 * @returns the model name and its notes.
 */
function labelAndNotes(model: ModelInfo): { readonly label: string; readonly notes: readonly string[] } {
  const parts = model.description.split(DESCRIPTION_SEPARATOR)
  if (parts.length > 1) return { label: parts[0] as string, notes: parts.slice(1) }
  return { label: model.displayName, notes: model.description === '' ? [] : [model.description] }
}

/**
 * Project Claude Code's model list onto selector entries. The native default
 * entry sends no model, so the host's Claude Code settings (for example
 * `"model": "opus"`) choose it; its label therefore names no model, and its
 * description names the account's recommended model that applies only when
 * no setting selects one. Every alias stays listed so each model can be
 * selected explicitly. Each entry keeps the effort levels Claude Code
 * reports for its model.
 * @param models - the list Claude Code reported, in its preferred order.
 * @returns selector entries such as `Claude (Claude Code settings)`, `Claude Sonnet 5.5`, and `Claude Fable 5.1`.
 */
export function modelEntries(models: readonly ModelInfo[]): ClaudeCodeModelEntry[] {
  return models.map((model) => {
    const { label, notes } = labelAndNotes(model)
    if (model.value === NATIVE_MODEL_ID) {
      return {
        id: model.value,
        name: NATIVE_MODEL_NAME,
        description: `The model your Claude Code settings select; ${label} without a setting`,
        ...reportedEfforts(model),
      }
    }
    return {
      id: model.value,
      name: `Claude ${label}`,
      ...notes.length === 0 ? {} : { description: notes.join(DESCRIPTION_SEPARATOR) },
      ...reportedEfforts(model),
    }
  })
}
