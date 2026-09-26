# Agent Note: Claude Code as a model route

Status: implemented

English | [中文](2026-09-25-claude-code-model-route.zh.md)

## Problem

A user with a signed-in Claude Code installation and no model API key could not hold a harness Session with Claude Code. The [one-shot Claude Code subagent](2026-08-04-claude-code-and-codex-subagent-backends.md) runs Claude Code only as a delegated child of a harness agent, and that parent still needs a model route, which for such a user does not exist. The harness needs a way to make Claude Code itself the conversation partner of a Session while keeping the agent loop, Session log, model selection, and presets unchanged.

## Decision

[`@deepseek-ai/dsh-llm-claude-code`](../../../../packages/llm/llm-claude-code/README.md) registers a `claude-code` provider route on `ctx.llm`. One model call runs one complete Claude Code turn through the official Agent SDK in the Session workspace, with the host's native Claude settings and sign-in; credential-shaped variables are scrubbed from the inherited environment. The loop receives one assistant message: Claude Code's text as text, its thinking as reasoning, and one reasoning line per top-level native tool call. The message has no tool calls, so the loop closes the step.

The assistant message's replay state stores a versioned cursor: the native conversation id and the turn's last top-level chain entry. The next request resumes with `resume` and `resumeSessionAt` from the newest assistant message whose cursor this build reads, and sends only the trailing user messages. Messages the native transcript lacks — all of them before the first Claude Code turn, or turns another route produced afterwards — are quoted once in a `<conversation_history>` block. Resuming at the durable message's own cursor makes retries, forks, and resumed Sessions continue from the harness log rather than from the newest native entry.

The route works under any agent preset. Claude Code cannot return tool calls for the harness to execute, so the route ignores the preset's tool schemas, and a conversation turn keeps Claude Code's own system prompt and sends only person-authored user text: the harness system prompt and plugin-inserted runtime-context messages describe harness tools and a sandbox that Claude Code does not use. The model selector lists the models Claude Code reports for the signed-in account through `supportedModels()`, which starts no model turn. Operations the host's Claude permission rules leave undecided go through `ctx.approval` on behalf of the initiating Agent. The route defaults to no retries, because a failed turn may already have changed files. Auxiliary calls (`purpose` set) send every message with their system prompt, never resume, and run with no tools, one turn, and no persisted transcript.

The route reuses `ManagedClaudeCodeProcess` and `claudeSpawnSpec` from `dsh-subagent-claude-code`, so the pinned platform CLI runs under `ctx.subprocess` with the same process-tree ownership as the subagent.

## Alternatives considered

**A second agent driver selected per preset.** `AgentRegistry` holds one factory, so routing by preset needs a core change. A blank Session changes preset on the same live Agent through `recompose`, which one Agent cannot do across drivers. Every loop-coupled plugin would also need a second implementation or would silently do nothing.

**Replacing the agent loop in a dedicated Profile.** Claude Code Sessions could not coexist with other routes, and Web surfaces that read loop projections such as `turnBoundary` and the inbox would need a parallel producer.

**Exposing harness tools to Claude Code through an in-process MCP server.** Claude Code would execute those tools inside the model call, bypassing the harness tool pipeline, its approvals, and the `tool/*` log events that make tool effects model-visible and logged.

**Using Claude Code's stored OAuth token against the Messages API directly.** It would bypass the product whose sign-in it borrows and its terms; the route runs the official product instead.

## Consequences

- A Session on a Claude Code model needs no API key; a missing login fails with `INVALID_CREDENTIAL` and sign-in instructions.
- Claude Code's own transcript, under the host's Claude configuration directory, holds the context its model saw; the harness log holds the rendered conversation and the cursor needed to resume it. Deleting a Session does not delete the native transcript.
- Native tool activity is display text, not `tool/*` events, and tool results stay inside Claude Code.
- The route accepts text only, disables `AskUserQuestion`, and treats an auxiliary call's `maxTokens` as advisory.
- Offering the host user's Claude Code login to other users of a hosted deployment requires Anthropic's approval.
- Unit tests cover request planning, replay parsing, stream translation, approval outcomes, SDK option mapping, cancellation, and process release; a Loader composition test boots the public Bundle patch over the headless profile without starting Claude Code.
