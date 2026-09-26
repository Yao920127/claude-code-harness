/**
 * Claude Code permission prompts answered through the harness approval seam.
 *
 * Claude Code consults its own permission rules first and calls back only for
 * operations those rules leave undecided. Each callback becomes one
 * `ctx.approval` request on behalf of the Agent whose model call started the
 * turn, so the prompt reaches the same answerers — the Web approval card, an
 * ACP client, or the fail-closed default — as a harness tool approval.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/approval
 */

import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalOutcome, ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { assertNever } from '@deepseek-ai/dsh-util-values'

/** Input keys whose values name what a native tool acts on, in display preference order. */
const SUBJECT_KEYS = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'url', 'query', 'description'] as const

/**
 * Name the subject of one native tool invocation for display.
 * @param toolName - Claude Code tool name.
 * @param input - native tool input.
 * @returns the tool name, followed by its first recognized string subject.
 */
export function toolActivityText(toolName: string, input: Readonly<Record<string, unknown>>): string {
  for (const key of SUBJECT_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return `${toolName}: ${value}`
  }
  return toolName
}

function denied(outcome: Exclude<ApprovalOutcome, 'allowed-once'>): PermissionResult {
  switch (outcome) {
    case 'rejected':
      return { behavior: 'deny', message: 'The user rejected this operation.' }
    case 'cancelled':
      return { behavior: 'deny', message: 'The approval request was withdrawn before the user answered.' }
    case 'unavailable':
      return { behavior: 'deny', message: 'No one is available to approve this operation.' }
    /* v8 ignore next 2 -- the approval service normalizes every answer into the closed outcome set. */
    default:
      return assertNever(outcome, 'approval outcome')
  }
}

/**
 * Build the native permission callback for one Claude Code turn.
 * @param approval - the harness approval service, when the composition mounts one.
 * @param agent - the Agent whose model call started the turn, when one initiated it.
 * @returns a callback that allows exactly what one approval grants and denies everything else.
 */
export function approvalCallback(approval: ApprovalService | undefined, agent: Agent | undefined): CanUseTool {
  return async (toolName, input, options) => {
    if (approval === undefined || agent === undefined) return denied('unavailable')
    const outcome = await approval.request({
      agent,
      toolName,
      reason: options.title ?? toolActivityText(toolName, input),
      signal: options.signal,
    })
    return outcome === 'allowed-once' ? { behavior: 'allow', updatedInput: input } : denied(outcome)
  }
}
