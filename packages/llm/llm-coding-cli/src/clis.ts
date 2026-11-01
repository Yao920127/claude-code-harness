/**
 * The coding CLIs a route can run, and the commands that list their models
 * and run one headless turn.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/clis
 */

import { dirname } from 'node:path'
import type { CodingCliAccess } from './access.ts'
import {
  ANTIGRAVITY_RECORD_EVENTS, AntigravityDecoder, CODEX_RECORD_TYPES, CodexDecoder, GROK_RECORD_TYPES, GrokDecoder,
  OPENCODE_RECORD_TYPES, OpenCodeDecoder, withFallback, type CliEventDecoder,
} from './events.ts'
import { groupEffortSuffixes, readGrokEfforts, readOpenCodeEfforts, type ModelEfforts, type ReadTextFile } from './efforts.ts'
import {
  parseAntigravityModels, parseCodexModels, parseGrokModels, parseOpenCodeModels, type CodingCliModelEntry,
} from './models.ts'

/** Coding CLIs a route can run. */
export const CODING_CLI_IDS = ['codex', 'antigravity', 'grok', 'opencode'] as const

/** One coding CLI a route can run. */
export type CodingCliId = typeof CODING_CLI_IDS[number]

/** One image attached to a turn, written to a file the CLI can read. */
export interface CliImage {
  /** Absolute path of the image file. */
  readonly path: string
  readonly mediaType: string
  /** The image bytes, base64-encoded, for CLIs that take inline images. */
  readonly base64: string
}

/** What one headless turn sends. */
export interface CliTurn {
  /** Prompt text. */
  readonly prompt: string
  /** Images attached to the prompt, in prompt order. */
  readonly images: readonly CliImage[]
  /** CLI model id; absent leaves the CLI's own settings in charge. */
  readonly model?: string
  /** Effort level the CLI accepts for the model; absent leaves the CLI's default. */
  readonly effort?: string
  readonly access: CodingCliAccess
  /** CLI conversation id to continue; absent starts a new conversation. */
  readonly resume?: string
}

/** Arguments and standard input of one CLI process. */
export interface CliInvocation {
  readonly args: readonly string[]
  /** Text written to standard input and then closed; absent leaves standard input empty. */
  readonly stdin?: string
}

/** How the route runs one coding CLI. */
export interface CodingCliDefinition {
  /** Default route label shown by model selectors. */
  readonly displayName: string
  /** Executable name searched on PATH and in the install directories. */
  readonly command: string
  /** Home-relative install directories searched after PATH. */
  readonly homeDirectories: readonly (readonly string[])[]
  /** Arguments that print the model list. */
  readonly modelArgs: readonly string[]
  /** Largest image the CLI receives, in encoded bytes; a larger image is sent as a smaller version. Absent sends originals. */
  readonly imageMaxBytes?: number
  /**
   * Read the effort levels the CLI declares for its models in its own files.
   * @param home - the user's home directory.
   * @param read - reads one file.
   * @returns levels by model id; absent when the CLI declares levels nowhere else or lists them itself.
   */
  modelEfforts?(home: string, read: ReadTextFile): Map<string, ModelEfforts>
  /**
   * Parse the model list.
   * @param stdout - complete standard output of {@link modelArgs}.
   * @returns the models in the CLI's order.
   */
  parseModels(stdout: string): CodingCliModelEntry[]
  /**
   * Build the headless invocation of one turn.
   * @param turn - prompt, model, effort, access level, and conversation to continue.
   * @returns the arguments and standard input.
   */
  turn(turn: CliTurn): CliInvocation
  /** @returns a decoder for one turn's JSON lines. */
  decoder(): CliEventDecoder
}

function optional(flag: string, value: string | undefined): string[] {
  return value === undefined ? [] : [flag, value]
}

function repeated(flag: string, values: readonly string[]): string[] {
  return values.flatMap(value => [flag, value])
}

/**
 * Add the directories holding a turn's images to a CLI's workspace.
 * @param images - attached images.
 * @returns one `--add-dir` pair per distinct directory.
 */
function imageDirectories(images: readonly CliImage[]): string[] {
  return repeated('--add-dir', [...new Set(images.map(image => dirname(image.path)))])
}

/** Largest base64 image payload Grok receives inline; larger images are named by path so argv stays within OS limits. */
export const GROK_INLINE_IMAGE_MAX_CHARS = 512 * 1024

/** Largest encoded image Grok receives, so its base64 form fits {@link GROK_INLINE_IMAGE_MAX_CHARS}. */
export const GROK_IMAGE_MAX_BYTES = 360 * 1024

/**
 * Name images in prompt text as file links, for CLIs that read a linked file with their own tools.
 * @param prompt - prompt text.
 * @param images - images to link.
 * @returns the prompt preceded by one `[image-N](file://…)` link per image.
 */
export function linkedImages(prompt: string, images: readonly CliImage[]): string {
  if (images.length === 0) return prompt
  const links = images.map((image, index) => `[image-${index + 1}](file://${image.path})`).join('\n')
  return `Attached images (read them before answering):\n${links}\n\n${prompt}`
}

/**
 * Build Grok's prompt arguments: inline image blocks when they fit, otherwise linked image files.
 * @param prompt - prompt text.
 * @param images - attached images.
 * @returns `--single=` for text, or `--prompt-json=` with text and image blocks.
 */
function grokPrompt(prompt: string, images: readonly CliImage[]): string {
  const inline = images.reduce((total, image) => total + image.base64.length, 0) <= GROK_INLINE_IMAGE_MAX_CHARS
  if (images.length === 0 || !inline) return `--single=${linkedImages(prompt, images)}`
  const blocks = [{ type: 'text', text: prompt }, ...images.map(image => ({ type: 'image', data: image.base64, mimeType: image.mediaType }))]
  return `--prompt-json=${JSON.stringify(blocks)}`
}

const CODEX_ACCESS: Readonly<Record<CodingCliAccess, readonly string[]>> = {
  'read-only': ['--sandbox', 'read-only'],
  'workspace-write': ['--sandbox', 'workspace-write'],
  'full-access': ['--dangerously-bypass-approvals-and-sandbox'],
}

const GROK_ACCESS: Readonly<Record<CodingCliAccess, readonly string[]>> = {
  'read-only': ['--permission-mode', 'default'],
  'workspace-write': ['--permission-mode', 'acceptEdits'],
  'full-access': ['--permission-mode', 'bypassPermissions'],
}

const ANTIGRAVITY_ACCESS: Readonly<Record<CodingCliAccess, readonly string[]>> = {
  'read-only': [],
  'workspace-write': ['--mode', 'accept-edits'],
  'full-access': ['--dangerously-skip-permissions'],
}

const OPENCODE_ACCESS: Readonly<Record<CodingCliAccess, readonly string[]>> = {
  'read-only': [],
  'workspace-write': [],
  'full-access': ['--auto'],
}

/** Every coding CLI's commands. */
export const CODING_CLIS: { readonly [Id in CodingCliId]: CodingCliDefinition } = {
  codex: {
    displayName: 'Codex',
    command: 'codex',
    homeDirectories: [],
    modelArgs: ['debug', 'models'],
    parseModels: parseCodexModels,
    // The prompt travels on standard input (`-`), so no prompt text is parsed as an option.
    turn: turn => ({
      args: [
        'exec', '--json', '--skip-git-repo-check', ...CODEX_ACCESS[turn.access],
        ...optional('--model', turn.model),
        ...turn.effort === undefined ? [] : ['--config', `model_reasoning_effort="${turn.effort}"`],
        ...repeated('--image', turn.images.map(image => image.path)),
        ...turn.resume === undefined ? [] : ['resume', turn.resume],
        '-',
      ],
      stdin: turn.prompt,
    }),
    decoder: () => withFallback(record => CODEX_RECORD_TYPES.has(String(record.type)), new CodexDecoder()),
  },
  antigravity: {
    displayName: 'Antigravity',
    command: 'agy',
    homeDirectories: [],
    modelArgs: ['models'],
    // Antigravity lists one id per effort level (`<model>-<level>`); the route offers them as one model with levels.
    parseModels: stdout => groupEffortSuffixes(parseAntigravityModels(stdout)),
    turn: turn => ({
      args: [
        '--output-format', 'stream-json', ...ANTIGRAVITY_ACCESS[turn.access],
        ...optional('--model', turn.model === undefined || turn.effort === undefined ? turn.model : `${turn.model}-${turn.effort}`),
        ...optional('--conversation', turn.resume),
        // Antigravity takes no inline images; it reads linked files with its own tools, which only read inside its workspace.
        ...imageDirectories(turn.images),
        `--print=${linkedImages(turn.prompt, turn.images)}`,
      ],
    }),
    decoder: () => withFallback(record => ANTIGRAVITY_RECORD_EVENTS.has(String(record.event)), new AntigravityDecoder()),
  },
  grok: {
    displayName: 'Grok Build',
    command: 'grok',
    // Grok takes images only inline in its arguments, whose total size the OS limits.
    imageMaxBytes: GROK_IMAGE_MAX_BYTES,
    homeDirectories: [['.grok', 'bin']],
    modelArgs: ['models'],
    parseModels: parseGrokModels,
    modelEfforts: readGrokEfforts,
    turn: turn => ({
      args: [
        '--output-format', 'streaming-json', ...GROK_ACCESS[turn.access],
        ...optional('--model', turn.model), ...optional('--reasoning-effort', turn.effort), ...optional('--resume', turn.resume),
        grokPrompt(turn.prompt, turn.images),
      ],
    }),
    decoder: () => withFallback(record => GROK_RECORD_TYPES.has(String(record.type)), new GrokDecoder()),
  },
  opencode: {
    displayName: 'OpenCode',
    command: 'opencode',
    homeDirectories: [['.opencode', 'bin']],
    modelArgs: ['models'],
    parseModels: parseOpenCodeModels,
    modelEfforts: readOpenCodeEfforts,
    // A standalone server runs in the Session workspace; the shared background service keeps its own directory.
    turn: turn => ({
      args: [
        'run', '--standalone', '--format', 'json', '--thinking', ...OPENCODE_ACCESS[turn.access],
        // OpenCode selects a declared effort variant as `<model>#<variant>`.
        ...optional('--model', turn.model === undefined || turn.effort === undefined ? turn.model : `${turn.model}#${turn.effort}`),
        ...optional('--session', turn.resume),
        ...repeated('--file', turn.images.map(image => image.path)),
        '--', turn.prompt,
      ],
    }),
    decoder: () => withFallback(record => OPENCODE_RECORD_TYPES.has(String(record.type)), new OpenCodeDecoder()),
  },
}
