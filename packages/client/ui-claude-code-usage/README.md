---
description: "Show the Claude Code sign-in's five-hour and weekly plan usage at the foot of the Web sidebar."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-claude-code-usage

English | [中文](README.zh.md)

## Summary

See how much of your Claude plan remains without leaving the app. The sidebar foot shows one bar per plan window — five hours, weekly, and any per-model weekly window — with the share still available and, on hover, the used share and reset time. The figures come from the Claude Code sign-in the Host's turns use; without a Claude plan the meter stays hidden.

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

The meter sits above Settings. Each row names a window, draws its used share as a bar, and prints the remaining share; a bar at 80% or more turns red. Hover a row for the used share and reset time. The refresh button asks Claude Code again. The meter reads usage when the page loads and whenever the window becomes visible again. On the collapsed sidebar rail it shows the first window's remaining share, with every window in its hover text. Nothing shows until a read reports plan windows: a sign-in without a Claude plan, such as an API key, a Claude Code installation that is missing or signed out, and a pending or failed read all leave the sidebar foot unchanged.

The CCH bundle inserts this plugin. It needs the `claudeCodeUsage` Remote of [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.md#plan-usage), which also sets how long one read answers every window.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin occupies the `sidebar.footer.action` seat of [ui-sidebar](../ui-sidebar/README.md). `UsageSource` owns the meter state: one Remote read at a time is current, a newer read supersedes an older one still in flight, and a shown answer stays on screen while a refresh runs. The plugin waits for the mounted `remote.claudeCodeUsage` namespace before its first read.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Claude Code model route](../../llm/llm-claude-code/README.md)
- [Sidebar](../ui-sidebar/README.md)

<a id="model-experience"></a>
## Model Experience

None, as this package only displays account usage and adds no model input.

#### KV Cache effect

None; usage reads never reach a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Claude Code marks its usage request experimental; a Claude Code release that changes it can stop the meter until the route follows.
- The meter does not refresh on a timer; it reads on load, when the window becomes visible, and on request.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No runtime invariant companion is published. The meter shows one Remote answer; there is no second observation to compare it with.

</details>
