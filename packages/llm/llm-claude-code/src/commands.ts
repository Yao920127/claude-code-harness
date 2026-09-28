/**
 * Claude Code slash commands as user-invocable skills: the `/` menu of a
 * harness UI lists every command a Claude Code turn in the Session's
 * workspace accepts — built-in commands, the user's and project's skills and
 * custom commands, and plugin commands — so a picked or typed `/name` reaches
 * Claude Code as literal prompt text, which Claude Code expands itself.
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
    return commands.filter(command => isSkillName(command.name)).map(command => ({
      name: command.name,
      description: commandDescription(command),
      invocation: { modelInvocable: false, userInvocable: true },
      source: CLAUDE_CODE_COMMAND_PROVIDER,
      provider: CLAUDE_CODE_COMMAND_PROVIDER,
      rank: CLAUDE_CODE_COMMAND_RANK,
      locator: command.name,
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

/**
 * Describe one command for the `/` menu.
 * @param command - Claude Code's command entry.
 * @returns its description followed by its argument hint, or the literal command when it has neither.
 */
function commandDescription(command: SlashCommand): string {
  const parts = [command.description.trim(), command.argumentHint.trim()].filter(part => part.length > 0)
  return parts.length === 0 ? `/${command.name}` : parts.join(' ')
}
