/**
 * Projection of a CLI's own tool calls onto the harness tool vocabulary.
 *
 * The CLIs name the same operations differently (`run_terminal_command`,
 * `run_command`, `command_execution`). Mapping them onto the harness names
 * (`bash`, `read`, `write`, `edit`, `grep`, `glob`, `web_search`, `web_fetch`)
 * with the argument keys those names use lets the app render a CLI tool call
 * with the same card as the matching harness tool. A tool with no harness
 * counterpart keeps its own name and arguments.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/tools
 */

/** A CLI tool call in harness terms. */
export interface HarnessToolCall {
  readonly name: string
  readonly arguments: Readonly<Record<string, unknown>>
}

/** Harness tool names by the CLI tool names that mean the same operation, lowercase. */
const HARNESS_NAMES: Readonly<Record<string, string>> = {
  bash: 'bash', shell: 'bash', command: 'bash', command_execution: 'bash', run_terminal_command: 'bash', run_command: 'bash',
  exec_command: 'bash',
  read: 'read', read_file: 'read', view_file: 'read',
  write: 'write', write_file: 'write', write_to_file: 'write', create_file: 'write',
  edit: 'edit', multiedit: 'edit', search_replace: 'edit', str_replace: 'edit', apply_patch: 'edit',
  replace_file_content: 'edit', multi_replace_file_content: 'edit',
  grep: 'grep', grep_search: 'grep', search: 'grep',
  glob: 'glob', find_by_name: 'glob',
  web_search: 'web_search', websearch: 'web_search', search_web: 'web_search',
  web_fetch: 'web_fetch', webfetch: 'web_fetch', fetch: 'web_fetch', read_url_content: 'web_fetch',
}

/** Input keys, in priority order, that hold the value each harness argument names. */
const ARGUMENT_KEYS: Readonly<Record<string, readonly [string, readonly string[]]>> = {
  bash: ['command', ['command', 'cmd', 'CommandLine', 'commandLine']],
  read: ['path', ['path', 'file_path', 'filePath', 'target_file', 'TargetFile', 'AbsolutePath', 'Path']],
  write: ['path', ['path', 'file_path', 'filePath', 'target_file', 'TargetFile', 'AbsolutePath', 'Path']],
  edit: ['path', ['path', 'file_path', 'filePath', 'target_file', 'TargetFile', 'AbsolutePath', 'Path']],
  grep: ['pattern', ['pattern', 'Query', 'query', 'regex']],
  glob: ['pattern', ['pattern', 'Pattern', 'glob']],
  web_search: ['query', ['query', 'Query', 'q']],
  web_fetch: ['url', ['url', 'Url', 'URL', 'uri']],
}

function inputRecord(input: unknown): Readonly<Record<string, unknown>> {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {}
}

/**
 * Map one CLI tool call to harness terms.
 * @param name - the CLI's tool name.
 * @param input - the CLI's tool input.
 * @returns the harness name and arguments: the CLI's input plus the harness argument key, or the CLI's own name and input.
 */
export function harnessToolCall(name: string, input: unknown): HarnessToolCall {
  const record = inputRecord(input)
  const harness = HARNESS_NAMES[name.toLowerCase()]
  if (harness === undefined) return { name, arguments: record }
  const [key, sources] = ARGUMENT_KEYS[harness] as readonly [string, readonly string[]]
  const value = sources.map(source => record[source]).find(candidate => typeof candidate === 'string' && candidate.length > 0)
  return { name: harness, arguments: value === undefined ? record : { ...record, [key]: value } }
}
