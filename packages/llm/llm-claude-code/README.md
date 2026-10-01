---
description: "The Claude Code model route for users who want to talk to Claude Code inside the harness with their existing Claude Code sign-in and no API key, and for maintainers of that route."
kind: "package-bundle"
---

# @deepseek-ai/dsh-llm-claude-code

English | [中文](README.zh.md)

## Summary

Install this Profile Bundle to talk to Claude Code from a harness Session without an API key. It registers a `claude-code` model route whose model list comes from your Claude account. Each model call runs one complete Claude Code turn through the official Agent SDK in the Session workspace, signed in with the host's own Claude Code login; the harness shows the answer, the thinking, and one line per tool Claude Code ran. Choose it to make Claude Code the conversation partner; choose [`dsh-subagent-claude-code`](../../subagent/subagent-claude-code/README.md) to delegate one task to Claude Code instead.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Before you start

Sign in to Claude Code once on the machine that runs the harness (run `claude`, then `/login`). The route reuses that login through the platform CLI pinned by the Agent SDK; it never reads, copies, or changes the stored credentials, and it removes credential-shaped variables such as `ANTHROPIC_API_KEY` from the inherited environment. A turn without a usable login fails with code `INVALID_CREDENTIAL` and a message that says how to sign in.

### Installing the Bundle

Install the package into the target Profile, then restart that Profile. The Bundle brings the pinned Agent SDK, its platform CLI payload, and [`dsh-subagent-claude-code`](../../subagent/subagent-claude-code/README.md), whose managed-process adapter it reuses.

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-claude-code
dsh --profile <name>
```

The Bundle patch inserts one row, `llm-claude-code`. In the Web application, pick a Claude model in the composer's model selector under any agent preset; making it the default model selection starts every new Session with Claude Code. The selector lists the models Claude Code reports for your account — for example `Claude (Claude Code settings)`, which sends no model so your Claude Code settings (such as `"model": "opus"`) choose it, `Claude Sonnet 5`, and `Claude Fable 5.1` — and reads that list from a short-lived Claude Code process the first time a selector asks. The settings entry's description names the account's recommended model, which applies only when no setting selects one.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `provider` | `claude-code` | Route name registered on `ctx.llm`; each mounted instance needs a unique value |
| `displayName` | `Claude Code` | Route label shown by model selectors |
| `models` | discovered | Selectable models; absent or empty lists the account's models. The id `default` sends no model, so your Claude settings choose it, and any other id passes to Claude Code unchanged |
| `permissionMode` | `session` | `session` follows each Session's permission preset; a native mode (`default`, `acceptEdits`, `auto`, `plan`, or `bypassPermissions`) pins every turn |
| `env` | `{}` | Explicit environment layered over the credential-scrubbed parent environment |
| `disposeGraceMs` | `3000` | Grace between the managed process's termination tiers |
| `retryPolicy` | `{ mode: normal, maxRetries: 0 }` | Model-request retry policy; the default never retries, because a failed turn may already have changed files |
| `commandRefreshMs` | `300000` | Milliseconds after the `/` menu lists Claude Code's commands until they are read again |
| `usageFreshMs` | `60000` | Milliseconds one plan-usage read answers app windows before Claude Code is asked again |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-llm-claude-code) is the exhaustive source for every accepted field.

### Permissions

Under the default `session` setting, each turn's native permission mode follows the Session's sandbox mode and approval policy. Full access (`danger-full-access` with the `never` policy) runs Claude Code with `bypassPermissions`, because the `never` policy would reject every prompt; `workspace-write` uses `acceptEdits`, so file edits proceed without asking; every other combination, and a composition without sandbox or approval services, uses `default`. Claude Code applies your user, project, and local Claude permission rules first. For an operation they leave undecided, the route asks `ctx.approval` on behalf of the Agent whose model call started the turn: the Web approval card shows the native prompt title, or the tool name and its command, file, or URL. `allowed-once` allows that one operation; every other outcome denies it, and the denial reason reaches Claude Code. `bypassPermissions` skips every check and never asks.

### Your Claude Code commands and skills

Claude Code turns load your user, project, and local Claude settings, so the skills, custom commands, and plugin commands you installed for Claude Code work here too. When the composition mounts `ctx.skills`, the route lists every command a Claude Code turn in the Session's workspace accepts as a user-invocable skill, so the `/` menu offers it. Picking `/hello`, or typing it, sends the literal text to Claude Code, which runs the command itself; the harness injects no skill body. A plugin command `plugin:name` appears as `/name`, which Claude Code also accepts, with its plugin named in the description; it stays out of the menu when another command already uses that name or another plugin command shares it, and can still be typed in full. Other names outside the lowercase kebab-case skill grammar stay out of the menu. A harness command or skill with the same name keeps precedence. A failed listing, such as a signed-out installation, leaves the commands out until the next lookup; the list is read again `commandRefreshMs` after each listing.

<a id="plan-usage"></a>
### Plan usage

The `claudeCodeUsage` Remote reports the signed-in account's plan windows (five-hour, weekly, and per-model weekly) with their use and reset times. One read answers every app window for `usageFreshMs`; a refresh asks Claude Code again. API-key and third-party sign-ins report no plan windows. The Remote reads Claude Code's experimental usage request, whose fields may change between Claude Code releases.

### What you see

The assistant message holds Claude Code's thinking as reasoning, its text as text, and one reasoning line of the form `Claude Code ran <tool>: <subject>` for each top-level tool call. The line appears with the tool name as soon as Claude Code starts the call, so a long tool input such as a whole-file write shows which tool is in progress, and gains its subject when the input is complete. A failed tool result, including a permission denial, adds a line of the form `Claude Code's <tool> failed: <first line of the error>`. Nested Claude Code subagent traffic, successful tool results, hooks, and status messages stay inside Claude Code.

When the composition mounts the app Browser (`ctx.sidebarBrowser`), each conversation turn gives Claude Code an `open_browser_tab` tool. Claude Code calls it to show a web page, such as a local development server, and the page opens in a new Browser tab in the right Sidebar of the Session instead of an external browser. The tool runs without a permission prompt, accepts only http and https URLs, and reports failure when no app window is open.

### Failure and recovery

| Failure | Code | Recovery |
|---|---|---|
| No usable Claude Code login (HTTP 401 or 403) | `INVALID_CREDENTIAL` | Sign in with `claude` and `/login`, then send again |
| Claude Code rate limit | `RATE_LIMIT` | Wait, then send again |
| Turn stopped by a Claude Code limit | `CLAUDE_CODE_LIMIT` | Send a narrower request |
| Claude Code execution error or other API error | `CLAUDE_CODE_EXECUTION`, `CLAUDE_CODE_ERROR` | Read the message, then send again |
| Process failure or missing platform payload | `CLAUDE_CODE_PROCESS` | Reinstall the Bundle with optional dependencies |
| Sampling options or images in the request | `UNSUPPORTED_OPTION`, `UNSUPPORTED_CONTENT` | Send text without sampling overrides |

Cancelling the harness turn aborts the Claude Code turn and waits for its process tree to exit.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

- **One model call is one Claude Code turn.** The route is an ordinary `LlmAdapter`, so the agent loop, Session log, model selection, and presets work unchanged; Claude Code runs its own tools, so the route offers it none of the preset's, and the loop sees one assistant message with no tool calls and closes the step.
- **Claude Code's transcript holds its context.** The harness log keeps the rendered conversation; the assistant message's replay state keeps the native conversation id and last chain entry. The next request resumes exactly there with `resume` and `resumeSessionAt`, which makes retries, forks, and resumed Sessions continue from the durable harness message rather than from the newest native entry.
- **Native settings stay authoritative.** The route omits `settingSources`, so Claude Code loads the host's user, project, and local settings, hooks, and `CLAUDE.md`, and a conversation turn keeps Claude Code's own `claude_code` system prompt: the harness system prompt describes harness tools the route never offers.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema and route registration |
| [`src/adapter.ts`](src/adapter.ts) | The SDK query options, turn lifecycle, and process release |
| [`src/request.ts`](src/request.ts) | Request validation, resume-cursor selection, and prompt rendering |
| [`src/stream.ts`](src/stream.ts) | SDK message to stream-chunk translation, usage, and terminal mapping |
| [`src/approval.ts`](src/approval.ts) | Native permission callback over `ctx.approval` |
| [`src/permissions.ts`](src/permissions.ts) | Native permission mode from the route setting and the Session's permission knobs |
| [`src/browser-tool.ts`](src/browser-tool.ts) | In-process MCP tool that opens pages in the app Browser |
| [`src/commands.ts`](src/commands.ts) | Skill provider listing Claude Code's slash commands for the `/` menu |
| [`src/usage.ts`](src/usage.ts) | The `claudeCodeUsage` Remote over Claude Code's usage request |
| [`src/types.ts`](src/types.ts) | Wire types of the usage Remote |
| [`src/replay.ts`](src/replay.ts) | Versioned replay state holding the native resume cursor |
| [`cordis.patch.yml`](cordis.patch.yml) | The Profile patch layer inserting the route |

### Request flow

`planTurn()` refuses temperature, stop sequences, reasoning effort, images, and a conversation-request `maxTokens`, and ignores harness tool schemas. It finds the newest assistant message whose replay state this build reads and sends the person-authored text of the trailing user messages after it as the prompt; plugin-inserted user messages such as runtime-context snapshots are dropped, unless the trailing messages hold nothing else. Messages between that point and the trailing user messages — all of them when no replay state exists — are quoted once in a `<conversation_history>` block ahead of the prompt. An auxiliary call (`purpose` set, such as a Session title) sends every message, appends its system prompt, never resumes, and runs with no tools, one turn, and no persisted native transcript. [`src/models.ts`](src/models.ts) names the discovered models: the native default is labeled by the Claude Code settings that choose it, and every alias stays listed.

The adapter resolves the workspace from the request's Session, or from the initiating Agent when the request names none, and fails with `NO_WORKSPACE` before starting Claude Code when neither has one. The SDK's custom spawn hook places the platform CLI under `ctx.subprocess`; the stream's `finally` closes the query, terminates the managed range, and waits for whole-tree exit.

### Stream translation

Partial-message events stream top-level text and thinking deltas. A top-level tool call opens a reasoning block with its name at `content_block_start`, accumulates its input JSON deltas, and appends the subject at `content_block_stop`; the assembled assistant message renders only tool calls that did not stream. An `is_error` tool result in a top-level user message becomes one reasoning block with the result's first text line, bounded to 200 characters. The last top-level assistant or user chain entry becomes the resume cursor. Usage comes from the turn's last native model call: input tokens include cache reads and writes, which measures the context Claude Code currently carries. The SDK result becomes the one terminal `finish` chunk; success without a resumable entry is a failure.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [LLM streaming subsystem](../../../docs/subsystems/llm-streaming.md) — the adapter contract, stream chunks, and replay state this route implements.
- [Approval subsystem](../../../docs/subsystems/approval.md) — the request, outcome, and audit semantics the permission callback uses.
- [Claude Code subagent provider](../../subagent/subagent-claude-code/README.md) — the one-shot delegation sibling whose managed-process adapter this route reuses.
- [Adding an LLM adapter](../../../docs/cookbook/adding-an-llm-adapter.md) — the protocol obligations every adapter meets.

<a id="model-experience"></a>
## Model Experience

### Claude Code prompt

#### What the model sees

Claude Code's model sees Claude Code's own `claude_code` system prompt, the native transcript restored by `resume`, and one prompt: the trailing person-authored user messages' text joined by blank lines. When the native transcript lacks earlier messages, the prompt starts with a `<conversation_history>` block holding one `<user>`, `<assistant>`, or `<tool result>` element per earlier message with text; assistant tool calls render as `[tool call <name>: <arguments>]`, reasoning is omitted, and plugin-inserted user messages are dropped.

#### Token effect

Each request adds the trailing user text. The quoted history block is sent only on a request whose history the native transcript lacks, and its size equals the quoted messages' text. Harness tool schemas and the harness system prompt add nothing. Claude Code's own tool use, compaction, and system prompt add tokens that Claude Code owns.

#### KV Cache effect

Resumed turns append to the native transcript, so reuse follows Claude Code's own caching of its prefix. A request that quotes history starts a new native conversation and can invalidate reuse of the earlier native prefix.

### App browser tool

#### What the model sees

When the composition mounts the app Browser, a conversation turn adds one MCP server, `app_browser`, with one always-loaded tool, `open_browser_tab(url)`, described as "Open an http or https URL in a new tab of the browser the user sees in the app.", and these server instructions: "The user works in an app that has its own browser. To show the user a web page, including a local development server, call open_browser_tab with its http or https URL. Do not open an external browser, for example with the open, xdg-open, or start commands." Auxiliary calls receive neither.

#### Token effect

Each conversation turn adds the tool schema and the instructions, a fixed size independent of the conversation; each call adds its URL and a one-line result.

#### KV Cache effect

The tool definition and instructions are identical on every turn, so they stay inside Claude Code's reusable prefix; composing or removing the app Browser changes that prefix once.

### Harness history

#### What the model sees

A later request on another route receives these assistant messages' text and reasoning blocks, including the `Claude Code ran <tool>: <subject>` lines, as ordinary agent-loop history.

#### Token effect

The retained assistant message grows by one short line per top-level tool call plus Claude Code's text and thinking.

#### KV Cache effect

Append-only: each turn adds one assistant message after the reusable prefix and rewrites none of the earlier history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Harness tools stay unused** — the route ignores the preset's tool schemas; Claude Code's own tools, MCP servers, and skills from its settings replace them.
- **Text-only input** — image attachments fail with `UNSUPPORTED_CONTENT`; the route declares text-only input to model selectors.
- **The app browser tool steers, it does not block** — its instructions ask Claude Code not to start an external browser, but a shell `open` command is still permitted by the Session's permissions.
- **Tool activity is a text line** — top-level tool calls and failed results render as reasoning lines, not as tool cards, and successful tool results stay inside Claude Code.
- **No question channel** — `AskUserQuestion` is disabled because no harness question bridge exists; Claude Code asks in its answer text instead.
- **Auxiliary output caps are advisory** — a Session-title or compaction call's `maxTokens` is accepted, but Claude Code enforces its own output cap.
- **Harness compaction measures a different context** — a preset's compaction summarizes the harness history through a one-turn Claude Code call; the next turn then starts a new native conversation from the summary, while Claude Code also compacts its own transcript.
- **Native transcripts live outside the Session** — deleting a harness Session leaves Claude Code's transcript under the host's Claude configuration directory, and a request whose native transcript was removed fails.
- **Distribution terms** — the route signs in with the host user's own Claude Code login; offering that login to other users of a hosted deployment requires Anthropic's approval.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior and limits live in the sections above and in the package code.

- **Shared process adapter** — the route imports `ManagedClaudeCodeProcess` and `claudeSpawnSpec` from `dsh-subagent-claude-code`; a separate Claude Code process library would let the route drop that peer dependency.
- **Richer activity** — a plugin-owned content block plus a Web Chat node renderer could show Claude Code tool calls and results as cards.

</details>

**Runtime invariant:** No companion is published. The route owns no relationship that an independent observation can contradict; replay validation and process-tree quiescence are enforced inside the operation that uses them.
