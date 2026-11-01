---
description: "Show the tool calls Codex, Antigravity, Grok Build, and OpenCode run inside their own turns as tool cards in the Web chat, and list the sign-in of the CLIs the model routes use in the Desktop Models settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-coding-cli-tools

English | [中文](README.zh.md)

## Summary

See what a coding CLI did while it answered. When a Session talks to Codex, Antigravity, Grok Build, or OpenCode through [`dsh-llm-coding-cli`](../../llm/llm-coding-cli/README.md), every tool call the CLI runs appears in the chat as the same tool card a harness tool gets: a shell command shows as a terminal card with its output, a file read, write, or edit shows the file, and a search or web call shows its query. In the Desktop app, Settings → Models also lists the CLIs whose own sign-in the model routes use, with their state and a sign-in button.

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

The `dsh-llm-coding-cli` Bundle inserts this plugin, so CCH profiles show the cards without setup. A card appears as soon as the CLI starts the call and settles when the CLI reports its result; a call the CLI reports as failed, or one still running when its step ends, settles as an error. Cards group and count with the Turn's other process rows. A CLI tool with no harness counterpart, such as an MCP tool, shows the generic card with its own name and arguments.

### Sign-in list

In the Desktop app, the foot of Settings → Models shows **Use with sign-in (no API key)**: Claude Code, Codex, Antigravity, Grok Build, and OpenCode, each with its sign-in state — signed in (with the account email when the CLI reports one), signed out, or not installed — and a **Sign in** or **Sign in again** button that runs the CLI's own login. Claude Code's login asks for the authorization code its browser page shows; Codex and Grok Build finish in the browser; Antigravity and OpenCode open a Terminal window, after which **Check again** reads the new state. A Claude Code sign-out therefore takes one button to repair. The `cch web` app has no Desktop bridge and shows no list.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The route records each reported tool state as a `coding-cli/tool` Session event whose name and arguments are already in harness terms. This plugin registers one Conversation Definition that matches those events by `callId` and builds one Chat `tool-call` Node per call: a started call while it runs, a settled result with the output text once it completes or fails, and an interrupted result when its Step or Turn closed first. Rendering, grouping, and counting are the ones [ui-chat](../ui-chat/README.md) and [ui-tool](../ui-tool/README.md) apply to harness tool calls.

The sign-in list occupies the `settings.models.footer` seat of [ui-settings-models](../ui-settings-models/README.md) only when the Desktop preload exposes `dshDesktop.cli`; the Desktop main process runs the status probes and logins it shares with the welcome window.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Coding-CLI model routes](../../llm/llm-coding-cli/README.md)
- [Chat](../ui-chat/README.md)

<a id="model-experience"></a>
## Model Experience

None, as this package only displays log-only `coding-cli/tool` events and adds no model input.

#### KV Cache effect

None; the events never reach a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Cards appear in the order the CLI reported the calls, ahead of the answer text of the same step, because the step's answer is recorded when the CLI turn ends.
- A card's output is bounded to 20,000 characters.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No runtime invariant companion is published. The cards project one event stream; there is no second observation to compare it with.

</details>
