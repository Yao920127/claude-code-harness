---
description: "Open, switch and control interactive shell tabs in a resizable panel below the Web conversation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-terminal-panel

English | [中文](README.zh.md)

## Summary

Open a terminal panel below the conversation to run commands in the Session workspace. Each Session keeps its own terminal tabs, panel height and open state across reloads. Hide the panel to keep commands running; close a terminal tab to request process termination. Tab completion follows the shell configuration. Commands use the execution environment’s system-user permissions independently of Agent permissions; see [user-terminal execution](../../api/terminal-controller/README.md#use-this-package).

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

The **Terminal** card on the right Sidebar's Start page opens the panel of its Session, including before the Session's first message: a hidden panel shows, opening a terminal in the remembered available shell when it has none, and a shown panel gets another terminal. The Start page stays in place. The `terminal.toggle` command shows and hides the panel of the Session on screen; Desktop and Windows and macOS Web bind it to Control+\`, Linux Web leaves it unbound by default, and the card displays the effective binding.

The panel's **+** button opens another terminal tab in the remembered shell. The arrow beside it opens the installed-shell menu; selecting an item remembers it and opens that shell. Discovery runs when the menu opens and does not allocate a terminal. A failed lookup offers Retry in the menu. Click a tab, or focus it and press Enter or Space, to switch terminals. The arrow at the far right hides the panel. Drag the panel's top edge, or focus it and press the Up and Down arrow keys, to change its height.

Double-click a terminal's tab to rename it. **Take control** makes the current attachment writable when another page owns input. A temporary disconnect preserves the screen and offers **Reconnect**, without exposing transport diagnostics. An exited shell remains visible with its exit code and offers **New terminal**, which replaces that tab in place; it never restarts automatically. Exited terminals count toward the Session limit; close unused tabs when the limit is reached.

Closing a terminal tab removes it immediately and ends its process in the background; closing the last tab hides the panel. Cleanup failures have no notification or manual retry action; saved unfinished close requests are retried when the Client plugin starts. Hiding the panel and switching tabs or Sessions preserve the processes. Deleting a Session drops its panel.

After reload, each Session's panel returns with its tabs, and each terminal reconnects to its saved Host identity. Host terminals absent from the saved panel do not reopen automatically and have no UI recovery entry; they remain subject to the controller's unattended idle reclamation and Session/Host disposal. A missing saved process shows a localized unavailable notice with **New terminal**; recovery never creates that replacement automatically.

The terminal background, default text, cursor, and selection follow the DSH theme, including system preference and theme-token overrides. Theme changes preserve the running shell, output, and application OSC color overrides. Reset commands restore colors to the current DSH defaults. xterm adjusts text toward 4.5:1 contrast; the cursor keeps at least 3:1 contrast against its cell background, including Vim colorschemes.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This plugin occupies the conversation's session-scoped `conversation.panel.bottom` seat, below the conversation content, and registers a `terminal` page type with the right Sidebar whose Start-page card it renders into `sidebar.right.tab.guide.entry`. A `terminal` Sidebar page, such as one a saved layout restores, opens the panel and closes itself once. `TerminalPanels` owns every Session's panel: whether it shows, its height, and its tabs, each a panel-local key plus a globally unique content identity. One browser-storage entry holds all Sessions' panels and is validated on read; an invalid entry starts every panel empty. The mounted panel records its Session, and the toggle command acts on the Session whose panel mounted last.

The React-free terminal model belongs to `api-terminal-controller`; keyed framework hooks expose its state. `ui-primitives` Menu and Button provide the shell picker and panel controls. Every tab's screen stays mounted while the panel shows, and inactive screens are hidden, so switching tabs keeps each emulator's output. The body loads its package-local `client.terminal.js` chunk when a terminal screen mounts, keeping xterm.js and FitAddon out of the startup `client.js`; they then render the screen and measure the viewport. Input, including Tab and control characters, travels unchanged to the PTY.

The terminal controller saves each content identity's Host association independently and owns content recovery; this plugin owns the panel state. A recovered view cannot allocate a replacement process. Closing or replacing a tab schedules cleanup through the [terminal controller](../../api/terminal-controller/README.md#understand-the-implementation) and returns synchronously. Browser component cleanup only detaches browser work.

At plugin startup, every Session's saved tabs retain their matching Host identities, including Sessions not yet opened. This window hold remains independent of React mounts and screen subscriptions. Removing the last matching tab releases it; hiding the panel does not. The [terminal controller](../../api/terminal-controller/README.md#use-this-package) owns unattended idle reclamation and long-command protection.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Subprocess](../../subprocess/subprocess/README.md)
- [Conversation](../../client/ui-conversation/README.md)
- [Web terminal decision](../../../.agents/notes/implemented/feature/2026-09-09-web-sidebar-terminal.md)

<a id="model-experience"></a>
## Model Experience

None, as this package handles user terminal interaction without adding model input.

#### KV Cache effect

None; terminal output travels only between the browser and Host.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Shell discovery or native PTY startup can fail. The tab reports the failure without launching a different shell.
- Completion menus and inline suggestions depend on shell configuration. The Web UI adds no independent completion engine.
- Application OSC color overrides are retained by the mounted renderer; a newly opened renderer cannot recover them from the Host screen snapshot.
- Terminal history is bounded. The feature does not send terminal output to the Agent, split terminals side by side, or restore processes after Host restart.
- Panel state lives in one browser's storage; another browser or a cleared storage starts with every panel hidden and empty.
- A failed terminal chunk load requires a page reload because React caches a rejected lazy import for the page lifetime.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No runtime invariant companion is published. One owner orders terminal metadata and screen updates; the provider exposes no independently observed dimensions to compare.

</details>
