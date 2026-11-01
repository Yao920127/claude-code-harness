/**
 * Effort levels of the models a CLI lists, read from the files where the CLI
 * itself declares them.
 *
 * Grok and OpenCode print bare model ids, but each declares the reasoning
 * levels a model accepts in its own configuration: Grok in its model cache and
 * `config.toml`, OpenCode as per-model `variants` in `opencode.json`.
 * Antigravity lists one model id per level, which the route groups into one
 * model with those levels.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/efforts
 */

import { join } from 'node:path'
import type { CodingCliModelEntry } from './models.ts'

/** Effort levels and default of one model id. */
export interface ModelEfforts {
  readonly efforts: string[]
  readonly defaultEffort?: string
}

/** Reads one text file; undefined when it does not exist or cannot be read. */
export type ReadTextFile = (path: string) => string | undefined

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseJson(source: string | undefined): unknown {
  if (source === undefined) return undefined
  try {
    // Raw tabs inside strings are invalid JSON; they carry no effort data, so spaces replace them.
    const value: unknown = JSON.parse(source.replaceAll('\t', ' '))
    return value
  } catch (_invalid) {
    // A file the CLI can no longer read offers no effort levels either.
    return undefined
  }
}

function withDefault(efforts: string[], defaultEffort: string | undefined): ModelEfforts {
  return defaultEffort !== undefined && efforts.includes(defaultEffort) ? { efforts, defaultEffort } : { efforts }
}

/**
 * Read the levels Grok declares: its model cache for the models of its sign-in, and the `[model."<id>"]` tables of
 * `config.toml` for configured models, whose default is `[models] default_reasoning_effort`.
 * @param home - the user's home directory.
 * @param read - reads one file.
 * @returns levels by Grok model id.
 */
export function readGrokEfforts(home: string, read: ReadTextFile): Map<string, ModelEfforts> {
  const found = new Map<string, ModelEfforts>()
  const cache = record(record(parseJson(read(join(home, '.grok', 'models_cache.json')))).models)
  for (const [id, model] of Object.entries(cache)) {
    const info = record(record(model).info)
    const listed = Array.isArray(info.reasoning_efforts) ? info.reasoning_efforts.map(record) : []
    const efforts = listed.map(level => text(level.value) ?? text(level.id)).filter(level => level !== undefined)
    const preferred = listed.find(level => level.default === true)
    if (info.supports_reasoning_effort === false || efforts.length === 0) continue
    found.set(id, withDefault(efforts, text(preferred?.value) ?? text(info.reasoning_effort)))
  }
  let section: string | undefined
  let fallback: string | undefined
  const configured = new Map<string, string[]>()
  for (const line of (read(join(home, '.grok', 'config.toml')) ?? '').split('\n')) {
    const header = /^\s*\[([^\]]+)\]\s*$/u.exec(line)?.[1]
    if (header !== undefined) {
      // A `[model."<id>"]` table names one model; other tables keep their bracketed name.
      section = /^model\."(.+)"$/u.exec(header)?.[1] ?? `[${header}]`
      continue
    }
    const effort = /^\s*default_reasoning_effort\s*=\s*"([^"]+)"/u.exec(line)
    if (section === '[models]' && effort?.[1] !== undefined) fallback = effort[1]
    const levels = /^\s*reasoning_efforts\s*=\s*\[(.*)\]/u.exec(line)
    if (section !== undefined && !section.startsWith('[') && levels?.[1] !== undefined) {
      configured.set(section, [...levels[1].matchAll(/"([^"]+)"/gu)].map(match => match[1] as string))
    }
  }
  for (const [id, efforts] of configured) if (efforts.length > 0) found.set(id, withDefault(efforts, fallback))
  return found
}

/** OpenCode configuration files in the user's configuration directory, in precedence order. */
const OPENCODE_CONFIG_FILES = ['opencode.json', 'opencode.jsonc']

/**
 * Read the levels OpenCode declares as per-model `variants` in its user configuration.
 * @param home - the user's home directory.
 * @param read - reads one file.
 * @returns levels by OpenCode model id (`<provider>/<model>`).
 */
export function readOpenCodeEfforts(home: string, read: ReadTextFile): Map<string, ModelEfforts> {
  const found = new Map<string, ModelEfforts>()
  for (const file of OPENCODE_CONFIG_FILES) {
    const source = read(join(home, '.config', 'opencode', file))
    // Comment lines are valid in OpenCode configuration but not in JSON.
    const config = record(parseJson(source?.split('\n').filter(line => !/^\s*\/\//u.test(line)).join('\n')))
    for (const [provider, settings] of Object.entries(record(config.provider))) {
      for (const [model, declaration] of Object.entries(record(record(settings).models))) {
        const efforts = Object.keys(record(record(declaration).variants))
        const id = `${provider}/${model}`
        if (efforts.length > 0 && !found.has(id)) found.set(id, { efforts })
      }
    }
  }
  return found
}

/**
 * Attach declared levels to listed models; a model the CLI declares no levels for is unchanged.
 * @param entries - listed models.
 * @param declared - levels by model id.
 * @returns the models with their levels.
 */
export function withEfforts(entries: readonly CodingCliModelEntry[], declared: ReadonlyMap<string, ModelEfforts>): CodingCliModelEntry[] {
  return entries.map((entry) => {
    const levels = declared.get(entry.id)
    return levels === undefined || entry.efforts !== undefined ? entry : { ...entry, ...levels }
  })
}

/** Effort suffixes a model id may end in, as `<base>-<level>`. */
const EFFORT_SUFFIX = /^(.+)-(minimal|low|medium|high|xhigh|max)$/u

/**
 * Group model ids that differ only in a trailing effort level into one model offering those levels, named without the
 * level, in the order the first id of each group was listed.
 * @param entries - listed models.
 * @returns grouped models; a grouped model's id is the shared base.
 */
export function groupEffortSuffixes(entries: readonly CodingCliModelEntry[]): CodingCliModelEntry[] {
  const groups = new Map<string, { entry: CodingCliModelEntry; efforts: string[] }>()
  for (const entry of entries) {
    const match = EFFORT_SUFFIX.exec(entry.id)
    const base = match?.[1] ?? entry.id
    const level = match?.[2]
    const group = groups.get(base)
    if (level === undefined) {
      if (group === undefined) groups.set(base, { entry, efforts: [] })
      continue
    }
    if (group === undefined) {
      groups.set(base, { entry: { ...entry, id: base, name: entry.name.replace(/\s*\([^()]*\)$/u, '') }, efforts: [level] })
    } else group.efforts.push(level)
  }
  return [...groups.values()].map(({ entry, efforts }) => efforts.length === 0 ? entry : { ...entry, efforts })
}
