/**
 * Claude Code slash commands as user-invocable skills: the `/` menu of a
 * harness UI lists every command a Claude Code turn in the Session's
 * workspace accepts — built-in commands, the user's and project's skills and
 * custom commands, and plugin commands — so a picked or typed `/name` reaches
 * Claude Code as literal prompt text, which Claude Code expands itself. A
 * plugin command `plugin:name` is listed by its unqualified `name`, which
 * Claude Code also accepts, because the skill-name grammar has no `:`; the
 * unqualified name is left out when a command already has that name or
 * another plugin command shares it, so `/name` never reaches the wrong one.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/commands
 */

import type { SlashCommand } from '@anthropic-ai/claude-agent-sdk'
import {
  isSkillName,
  type SkillCandidate,
  type SkillDefinition,
  type SkillLookupOptions,
  type SkillProvider,
  type SkillProviderControl,
  type SkillProviderObservation,
} from '@deepseek-ai/dsh-skill'

/** Provider name and skill source of every listed Claude Code command. */
export const CLAUDE_CODE_COMMAND_PROVIDER = 'claude-code'

/** Precedence after local and bundled skills: a harness skill of the same name keeps its own body. */
export const CLAUDE_CODE_COMMAND_RANK = 700

/** Lists Claude Code's commands for a workspace; Claude Code, not the harness, runs them. */
export class ClaudeCodeCommandProvider implements SkillProvider {
  readonly name = CLAUDE_CODE_COMMAND_PROVIDER
  private refresh: ReturnType<typeof setTimeout> | undefined

  /**
   * @param commands - reads the commands a Claude Code turn in one directory accepts.
   * @param control - registration lifetime and catalog invalidation.
   * @param refreshMs - milliseconds after a listing until the catalog is read again, so newly installed commands appear.
   * @param onError - reports a failed listing; the menu then omits Claude Code commands until the next lookup.
   */
  constructor(
    private readonly commands: (cwd: string) => Promise<readonly SlashCommand[]>,
    private readonly control: SkillProviderControl,
    private readonly refreshMs: number,
    private readonly onError: (error: unknown) => void,
  ) {
    control.signal.addEventListener('abort', () => { clearTimeout(this.refresh) }, { once: true })
  }

  /**
   * List the workspace's Claude Code commands whose names the skill grammar accepts.
   * @param options - lookup options; without a `cwd` there is no workspace to ask.
   * @returns user-invocable candidates, or an incomplete empty observation when Claude Code could not answer.
   */
  async list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation> {
    if (options.cwd === undefined) return []
    let commands: readonly SlashCommand[]
    try {
      commands = await this.commands(options.cwd)
    } catch (error) {
      this.onError(error)
      return { candidates: [], complete: false }
    }
    options.signal?.throwIfAborted()
    this.scheduleRefresh()
    return menuCommands(commands).map(({ name, plugin, command }) => ({
      name,
      description: commandDescription(command, plugin),
      invocation: { modelInvocable: false, userInvocable: true },
      source: CLAUDE_CODE_COMMAND_PROVIDER,
      provider: CLAUDE_CODE_COMMAND_PROVIDER,
      rank: CLAUDE_CODE_COMMAND_RANK,
      locator: name,
    }))
  }

  /**
   * Claude Code expands its own commands from the literal prompt, so the harness injects no body.
   * @returns undefined for every candidate.
   */
  get(): Promise<SkillDefinition | undefined> {
    return Promise.resolve(undefined)
  }

  private scheduleRefresh(): void {
    if (this.refresh !== undefined || this.control.signal.aborted) return
    this.refresh = setTimeout(() => {
      this.refresh = undefined
      this.control.invalidate()
    }, this.refreshMs)
  }
}

/** One command as the `/` menu lists it. */
interface MenuCommand {
  /** Name typed after `/`: the command's own name, or a plugin command's unqualified name. */
  readonly name: string
  /** Plugin that contributes the command, for a `plugin:name` command. */
  readonly plugin?: string
  readonly command: SlashCommand
}

/**
 * Select the commands the `/` menu can list, naming plugin commands by their unqualified name.
 * @param commands - every command Claude Code reported, in its order.
 * @returns commands whose menu name fits the skill grammar; a plugin command only when its unqualified name is unique.
 */
function menuCommands(commands: readonly SlashCommand[]): MenuCommand[] {
  const entries = commands.map((command): MenuCommand => {
    const separator = command.name.lastIndexOf(':')
    return separator < 0
      ? { name: command.name, command }
      : { name: command.name.slice(separator + 1), plugin: command.name.slice(0, separator), command }
  })
  const owners = new Map<string, number>()
  for (const entry of entries) owners.set(entry.name, (owners.get(entry.name) ?? 0) + 1)
  const unqualified = new Set(entries.filter(entry => entry.plugin === undefined).map(entry => entry.name))
  return entries.filter(entry => isSkillName(entry.name)
    && (entry.plugin === undefined || (!unqualified.has(entry.name) && owners.get(entry.name) === 1)))
}

/**
 * Describe one command for the `/` menu.
 * @param command - Claude Code's command entry.
 * @param plugin - contributing plugin of a `plugin:name` command.
 * @returns its description, argument hint, and plugin, or the literal command when it has none of them.
 */
function commandDescription(command: SlashCommand, plugin: string | undefined): string {
  const parts = [command.description.trim(), command.argumentHint.trim()].filter(part => part.length > 0)
  if (plugin !== undefined) parts.push(`(${plugin} plugin)`)
  return parts.length === 0 ? `/${command.name}` : parts.join(' ')
}
