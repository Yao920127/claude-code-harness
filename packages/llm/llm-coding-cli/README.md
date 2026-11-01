---
description: "The coding-CLI model routes for users who want to talk to Codex, Antigravity, Grok Build, or OpenCode inside the harness with each CLI's own sign-in and no API key, and for maintainers of those routes."
kind: "package-bundle"
---

# @deepseek-ai/dsh-llm-coding-cli

English | [中文](README.zh.md)

## Summary

Install this Profile Bundle to talk to an installed coding CLI from a harness Session without an API key. It registers one model route per CLI — `codex-cli`, `antigravity-cli`, `grok-cli`, and `opencode-cli` — listing the models that CLI's own model picker shows, including gateway models. Each model call runs one complete headless turn of that CLI in the Session workspace, signed in with the CLI's own login and with the prompt's images attached; the harness shows the answer, the thinking, and each tool call the CLI ran as a tool card. Choose [`dsh-llm-claude-code`](../llm-claude-code/README.md) for Claude Code.

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

Install each CLI you want to use and sign in once with its own login on the machine that runs the harness: `codex login`, `agy` (Antigravity signs in on first start), `grok login`, or `opencode auth login`. The CCH Desktop welcome and the Use with sign-in list at the foot of Settings → Models run the same logins and show each CLI's state. These routes are separate from the API-key providers of the Models settings, such as pi-ai's `openai-codex` and `opencode`, which need their own keys. The routes never read, copy, or change stored credentials, and the harness removes credential-shaped variables such as `OPENAI_API_KEY` from the inherited environment. A turn without a usable login fails with the CLI's own error message.

### Installing the Bundle

Install the package into the target Profile, then restart that Profile. CCH profiles, including the Desktop app, compose it by default.

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-coding-cli
dsh --profile <name>
```

The Bundle patch inserts four route rows, `llm-codex`, `llm-antigravity`, `llm-grok`, and `llm-opencode`, and the [`ui-coding-cli-tools`](../../client/ui-coding-cli-tools/README.md) row that renders the tool cards. In the Web application, pick a model under Codex, Antigravity, Grok Build, or OpenCode in the composer's model selector. Each route lists `<CLI> (CLI settings)`, which sends no model so the CLI's own configuration chooses it, followed by the models the CLI reports:

| Route | CLI | Model list | Effort row |
|---|---|---|---|
| `codex-cli` | `codex` | `codex debug models`, entries Codex shows in `/model` | The reasoning levels Codex reports per model, starting at `defaultEffort` when offered, otherwise at Codex's default |
| `antigravity-cli` | `agy` | `agy models` | None; the model ids carry their effort |
| `grok-cli` | `grok` | `grok models` | None |
| `opencode-cli` | `opencode` | `opencode models` | None |

A route reads its list from a short-lived CLI process the first time a selector asks and reuses it for `modelsFreshMs`. A CLI that is not installed lists only its CLI-settings entry, and a turn on it fails with `CODING_CLI_NOT_INSTALLED`.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `cli` | required | `codex`, `antigravity`, `grok`, or `opencode` |
| `provider` | the `cli` value plus `-cli` | Route name registered on `ctx.llm`; each mounted instance needs a unique value. The suffix keeps the sign-in routes apart from API-key routes of the same vendor, such as pi-ai's `opencode` |
| `displayName` | the CLI's name | Route label shown by model selectors |
| `models` | discovered | Selectable models; absent or empty lists the CLI's models. The id `default` sends no model; an entry's optional `efforts` and `defaultEffort` set its Effort row |
| `executable` | searched | Absolute path of the CLI; absent searches PATH, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.bun/bin`, `~/.npm-global/bin`, and the CLI's own install directory. A path that does not exist fails at load |
| `defaultEffort` | `medium` | Effort level a model starts at when it offers that level and the Session names none; otherwise the CLI's own default applies |
| `access` | `session` | `session` follows each Session's permission preset; `read-only`, `workspace-write`, or `full-access` pins every turn |
| `env` | `{}` | Explicit environment layered over the credential-scrubbed parent environment |
| `disposeGraceMs` | `3000` | Grace between the CLI process's termination tiers |
| `discoveryTimeoutMs` | `60000` | Milliseconds the model-listing command may run |
| `discoveryMaxBytes` | `16777216` | Largest model-listing output accepted, in bytes |
| `modelsFreshMs` | `300000` | Milliseconds one model list answers selectors before the CLI is asked again |
| `retryPolicy` | `{ mode: normal, maxRetries: 0 }` | Model-request retry policy; the default never retries, because a failed turn may already have changed files |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-llm-coding-cli) is the exhaustive source for every accepted field.

### Permissions

A headless CLI cannot ask the harness for approval, so every turn runs under one access level that the CLI enforces itself. Under the default `session` setting, full access (`danger-full-access` with the `never` policy) runs `full-access`; any other full-access combination and `workspace-write` run `workspace-write`; `read-only`, and a composition without sandbox or approval services, run `read-only`. Session titles and other auxiliary calls always run `read-only`.

| Level | Codex | Antigravity | Grok Build | OpenCode |
|---|---|---|---|---|
| `read-only` | `--sandbox read-only` | default review mode | `--permission-mode default` | default permissions |
| `workspace-write` | `--sandbox workspace-write` | `--mode accept-edits` | `--permission-mode acceptEdits` | default permissions |
| `full-access` | `--dangerously-bypass-approvals-and-sandbox` | `--dangerously-skip-permissions` | `--permission-mode bypassPermissions` | `--auto` |

Each CLI's own permission rules apply first; an operation that would need an interactive prompt is refused by the CLI.

### Images

Images attached to the prompt reach the CLI. The route copies each one from the attachment store into a temporary directory that is removed when the turn ends, and attaches it the way the CLI accepts images:

| CLI | Attachment |
|---|---|
| Codex | `--image <file>` |
| OpenCode | `--file <file>` |
| Grok Build | An inline image block in `--prompt-json`; an image over 360 KiB is sent as the attachment store's smaller version |
| Antigravity | A `file://` link in the prompt that Antigravity reads with its own file tool; the image directory is added to its workspace with `--add-dir` |

Images in earlier messages that the CLI transcript lacks appear in the quoted history as `[image]`. Whether the model can see an image depends on the selected model.

### What you see

The assistant message holds the CLI's thinking as reasoning and its answer as text. Each tool call the CLI reports appears as a tool card in the Web chat, recorded as a `coding-cli/tool` Session event: the route maps the CLI's tool names onto the harness tools (`bash`, `read`, `write`, `edit`, `grep`, `glob`, `web_search`, `web_fetch`), so a CLI command shows the same terminal card as a harness command, with its output. A tool with no harness counterpart keeps its own name and arguments. When a turn completes without any answer text, the message states why, for example a permission the CLI refused in headless mode.

### Failure and recovery

| Failure | Code | Recovery |
|---|---|---|
| The CLI is not installed | `CODING_CLI_NOT_INSTALLED` | Install the CLI, sign in, then send again |
| The CLI reports a failed turn, or exits without completing one | `CODING_CLI_FAILED` | Read the CLI's message in the error, for example sign in again, then send again |
| The request has no Session workspace | `NO_WORKSPACE` | Send from a Session that has a working directory |
| Temperature or stop sequences | `UNSUPPORTED_OPTION` | Remove the option |
| An image without a mounted attachment store | `UNSUPPORTED_CONTENT` | Mount an attachment store, or send text only |

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

- **One model call is one CLI turn.** The route is an ordinary `LlmAdapter`; the CLI runs its own tools, so the route offers it none of the preset's, and the loop sees one assistant message with no tool calls and closes the step.
- **The CLI's transcript holds its context.** The harness log keeps the rendered conversation; the assistant message's replay state keeps the CLI and its conversation id. The next request on the same CLI continues that conversation, so retries, forks, and resumed Sessions continue from the durable harness message.
- **The CLI's own configuration stays authoritative.** The route runs the installed CLI with the user's configuration, so its sign-in, providers, gateways, hooks, and instructions apply unchanged.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema and route registration |
| [`src/clis.ts`](src/clis.ts) | Per-CLI model-listing and turn arguments |
| [`src/adapter.ts`](src/adapter.ts) | Model discovery, turn process lifecycle, and output reading |
| [`src/request.ts`](src/request.ts) | Request validation, conversation selection, and prompt rendering |
| [`src/events.ts`](src/events.ts) | Per-CLI JSON-line decoders and the field-name fallback decoder onto one event vocabulary |
| [`src/images.ts`](src/images.ts) | Turn-owned temporary image files |
| [`src/tools.ts`](src/tools.ts) | CLI tool names and arguments in harness terms |
| [`src/tool-events.ts`](src/tool-events.ts) | `coding-cli/tool` Session events for reported tool calls |
| [`src/types.ts`](src/types.ts) | The `coding-cli/tool` event payload |
| [`src/stream.ts`](src/stream.ts) | Event to stream-chunk translation, usage, and terminal mapping |
| [`src/models.ts`](src/models.ts) | Model-list parsers and effort choices |
| [`src/access.ts`](src/access.ts) | Turn access level from the route setting and the Session's permission knobs |
| [`src/locate.ts`](src/locate.ts) | CLI executable search and the CLI process PATH |
| [`src/replay.ts`](src/replay.ts) | Versioned replay state holding the CLI conversation id |
| [`cordis.patch.yml`](cordis.patch.yml) | The Profile patch layer inserting the four routes and the tool-card plugin |

### Request flow

`planTurn()` refuses temperature and stop sequences, and collects the images of the prompt messages. It finds the newest assistant message whose replay state names the same CLI and sends the person-authored text of the trailing user messages after it as the prompt; plugin-inserted user messages such as runtime-context snapshots are dropped unless the trailing messages hold nothing else. Messages between that point and the trailing user messages — all of them when no such replay state exists — are quoted once in a `<conversation_history>` block ahead of the prompt. An auxiliary call (`purpose` set) never continues a conversation and sends its system prompt in a leading `<instructions>` block.

The adapter resolves the workspace from the request's Session, or from the initiating Agent, and fails with `NO_WORKSPACE` before starting the CLI when neither has one. The CLI process runs under `ctx.subprocess` with the Session workspace as its working directory and `PWD`; Codex receives the prompt on standard input, the other CLIs as one `--flag=value` or post-`--` argument, so prompt text is never parsed as an option. OpenCode runs `--standalone`, because its shared background service keeps its own directory. The stream's `finally` terminates the process tree and waits for it to exit.

### Stream translation

Each standard-output line that parses as JSON goes through the CLI's decoder; other lines are kept, bounded to 64 KiB, as a plain-text answer. A record type the CLI decoder does not know goes to a field-name decoder that reads the names coding CLIs commonly use for text, thinking, tool calls, conversation ids, errors, and final answers, so a CLI release that renames or adds record types keeps streaming. Text and thinking deltas extend the open block of their type; a tool call closes the open block and is recorded as a `coding-cli/tool` event, with its first name and input kept for later states that omit them. When no answer text streamed, the CLI's complete answer, else the plain-text output of a clean exit, else the reason the turn produced none becomes the answer. Usage comes from the CLI's turn or last-step counters, with cache reads included in input tokens. The turn finishes `stop`, with the CLI conversation id as replay state, when the CLI reported completion or exited with code 0 and no failure; otherwise it finishes `error` with the CLI's failure, a CLI warning, or the last lines of standard error.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [LLM streaming subsystem](../../../docs/subsystems/llm-streaming.md) — the adapter contract, stream chunks, and replay state these routes implement.
- [Claude Code model route](../llm-claude-code/README.md) — the sibling route that runs Claude Code through its Agent SDK.
- [Adding an LLM adapter](../../../docs/cookbook/adding-an-llm-adapter.md) — the protocol obligations every adapter meets.

<a id="model-experience"></a>
## Model Experience

### CLI prompt

#### What the model sees

The CLI's model sees the CLI's own system prompt, the CLI transcript of the continued conversation, the prompt messages' images, and one prompt: the trailing person-authored user messages' text joined by blank lines. When the CLI transcript lacks earlier messages, the prompt starts with a `<conversation_history>` block holding one `<user>`, `<assistant>`, or `<tool result>` element per earlier message with text; assistant tool calls render as `[tool call <name>: <arguments>]`, reasoning is omitted, and plugin-inserted user messages are dropped. Earlier images render as `[image]`. For Antigravity the prompt starts with `Attached images (read them before answering):` and one `[image-N](file://…)` link per image. An auxiliary call's prompt starts with an `<instructions>` block holding its system prompt.

#### Token effect

Each request adds the trailing user text and its images. The quoted history block is sent only on a request whose history the CLI transcript lacks, and its size equals the quoted messages' text. Harness tool schemas and the harness system prompt add nothing. The CLI's own tool use, compaction, and system prompt add tokens that the CLI owns.

#### KV Cache effect

Continued turns append to the CLI transcript, so reuse follows the CLI's own caching of its prefix. A request that quotes history starts a new CLI conversation and can invalidate reuse of the earlier prefix.

### Harness history

#### What the model sees

A later request on another route receives these assistant messages' text and reasoning blocks as ordinary agent-loop history. The `coding-cli/tool` events are log-only and never reach a model request.

#### Token effect

The retained assistant message holds the CLI's text and thinking; tool calls add nothing to it.

#### KV Cache effect

Append-only: each turn adds one assistant message after the reusable prefix and rewrites none of the earlier history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No approval prompts** — headless CLIs cannot ask the harness, so a turn runs under one access level and the CLI refuses operations that would need a prompt.
- **Harness tools stay unused** — the routes ignore the preset's tool schemas; each CLI's own tools, MCP servers, and skills replace them.
- **Antigravity reads images with its own tool** — it accepts no inline images, so it must call its file tool on the linked file; a model that skips the call answers without the image.
- **Tool cards precede the step's answer** — the answer is recorded when the CLI turn ends, after the tool events, so text the CLI wrote between tool calls appears after the cards.
- **The fallback decoder reads common field names** — a CLI release that renames records to unusual names, or reports tool calls without a name field, still loses that activity until a CLI decoder follows.
- **CLI transcripts live outside the Session** — deleting a harness Session leaves the CLI's own conversation in the CLI's data directory.
- **No plan usage** — the sidebar plan-usage meter covers Claude Code only.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior and limits live in the sections above and in the package code.

- **Approval bridging** — Codex's app server, Grok's `agent stdio`, and OpenCode's server expose approval requests over a protocol; bridging them to `ctx.approval` would let `session` access ask instead of pinning a level.

</details>

**Runtime invariant:** No companion is published. The routes own no relationship that an independent observation can contradict; replay validation and process-tree quiescence are enforced inside the operation that uses them.
