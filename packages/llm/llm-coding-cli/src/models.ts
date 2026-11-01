/**
 * Model lists read from each coding CLI's own listing command.
 *
 * Each CLI lists the models its sign-in and its own configuration offer,
 * including models a local gateway adds through that configuration, so the
 * selector shows the same models the CLI's own model picker shows.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/models
 */

import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmModelReasoningInfo } from '@deepseek-ai/dsh-llm'

/** Model id that sends no model, so the CLI's own settings choose one. */
export const NATIVE_MODEL_ID = 'default'

/** One selectable model advertised by a route. */
export interface CodingCliModelEntry {
  /** Model id passed to the CLI unchanged; {@link NATIVE_MODEL_ID} passes none. */
  readonly id: string
  /** Selector label. */
  readonly name: string
  /** Optional selector distinction. */
  readonly description?: string
  /** Effort levels the CLI accepts for the model; absent or empty offers no effort choice. */
  readonly efforts?: string[]
  /** Effort the CLI applies when none is chosen; one of {@link efforts}. */
  readonly defaultEffort?: string
}

/** Selector names of the effort levels the CLIs report. */
const EFFORT_NAMES: Readonly<Record<string, string>> = {
  minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max',
}

/**
 * Describe the effort choices of one model.
 * @param entry - the advertised model, when known.
 * @param preferred - the route's default level, selected when the model accepts it.
 * @returns selector efforts in the CLI's order, defaulting to `preferred` when accepted and otherwise to the CLI's own
 *   default; undefined when the model offers none.
 */
export function modelReasoning(entry: CodingCliModelEntry | undefined, preferred: string): LlmModelReasoningInfo | undefined {
  const efforts = entry?.efforts
  if (efforts === undefined || efforts.length === 0) return undefined
  const fallback = efforts.includes(preferred) ? preferred : entry?.defaultEffort
  return {
    efforts: efforts.map(level => ({ id: ReasoningEffortId(level), name: EFFORT_NAMES[level] ?? level })),
    ...fallback === undefined ? {} : { defaultEffort: ReasoningEffortId(fallback) },
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/**
 * Parse `codex debug models`: a JSON object whose `models` array holds the
 * catalog; entries whose `visibility` is not `list` stay hidden, as in Codex's
 * own `/model` picker.
 * @param stdout - complete standard output.
 * @returns the listed models with their reasoning levels.
 * @throws {Error} when the output is not the catalog object.
 */
export function parseCodexModels(stdout: string): CodingCliModelEntry[] {
  const catalog: unknown = JSON.parse(stdout)
  const models = typeof catalog === 'object' && catalog !== null ? (catalog as { models?: unknown }).models : undefined
  if (!Array.isArray(models)) throw new Error('codex debug models printed no models array')
  const entries: CodingCliModelEntry[] = []
  for (const model of models as readonly Record<string, unknown>[]) {
    const id = nonEmpty(model.slug)
    if (id === undefined || model.visibility !== 'list') continue
    const reported = model.supported_reasoning_levels
    const levels = Array.isArray(reported) ? reported as readonly Record<string, unknown>[] : []
    const efforts = levels.map(level => nonEmpty(level.effort)).filter(level => level !== undefined)
    const defaultEffort = nonEmpty(model.default_reasoning_level)
    const description = nonEmpty(model.description)
    entries.push({
      id,
      name: nonEmpty(model.display_name) ?? id,
      ...description === undefined ? {} : { description },
      ...efforts.length === 0 ? {} : { efforts },
      ...defaultEffort !== undefined && efforts.includes(defaultEffort) ? { defaultEffort } : {},
    })
  }
  return entries
}

/**
 * Parse `grok models`: one `- <id>` or `* <id> (default)` line per model below
 * an `Available models:` heading.
 * @param stdout - complete standard output.
 * @returns the listed models.
 */
export function parseGrokModels(stdout: string): CodingCliModelEntry[] {
  const entries: CodingCliModelEntry[] = []
  for (const line of stdout.split('\n')) {
    const match = /^\s*[-*]\s+(\S+)(\s+\(default\))?\s*$/u.exec(line)
    const id = match?.[1]
    if (id === undefined) continue
    entries.push({ id, name: id, ...match?.[2] === undefined ? {} : { description: 'Grok default' } })
  }
  return entries
}

/**
 * Parse `agy models`: one `<id><TAB><name>` line per model.
 * @param stdout - complete standard output.
 * @returns the listed models.
 */
export function parseAntigravityModels(stdout: string): CodingCliModelEntry[] {
  const entries: CodingCliModelEntry[] = []
  for (const line of stdout.split('\n')) {
    const [id, name] = line.split('\t').map(part => part.trim())
    if (id === undefined || id.length === 0 || name === undefined || name.length === 0) continue
    entries.push({ id, name })
  }
  return entries
}

/**
 * Parse `opencode models`: one `<provider>/<model>` id per line.
 * @param stdout - complete standard output.
 * @returns the listed models.
 */
export function parseOpenCodeModels(stdout: string): CodingCliModelEntry[] {
  return stdout.split('\n')
    .map(line => line.trim())
    .filter(line => /^[^\s/]+\/\S+$/u.test(line))
    .map(id => ({ id, name: id }))
}
