---
description: "Commit, pull, and push from the Web right Sidebar without Git commands, and sign in to GitHub to clone and publish repositories."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git

English | [中文](README.zh.md)

## Summary

Save and share your work without remembering Git commands. The **Source Control** page in the right Sidebar shows the changed files of the Session's folder, stages and commits them with a message, and pulls, pushes, or syncs with GitHub. Sign in to GitHub from the same page to publish a new repository or clone one of your repositories as a workspace. Commands run as your system user through the `git` and GitHub CLI (`gh`) installed on the Host.

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

Open **Source Control** from the right Sidebar's Start page. The page reads the repository that contains the Session's folder when it opens, when the window regains focus, and on Refresh. A folder outside any repository offers **Initialize repository**.

The branch row shows the current branch, or a detached HEAD, and the commits ahead of and behind its upstream. Type a commit message and choose **Commit**, or press Command+Enter (Control+Enter on Windows and Linux). When no file is staged, a commit includes every change; otherwise it commits the staged files only. **Commit & push** pushes afterwards. **Pull** fast-forwards to the upstream, **Push** pushes the branch and sets `origin` as its upstream the first time, and **Sync** pulls, then pushes. The changes list separates staged from unstaged files; `+` and `−` stage or unstage one file, and the list headers stage or unstage all. One command runs at a time per repository; a failure shows Git's own message, and the page rereads the repository because a failed push can follow a successful commit.

The GitHub section uses the Host's GitHub CLI. **Sign in to GitHub** starts the CLI's device sign-in, opens GitHub's code page, and shows the one-time code, which the CLI also copies to the clipboard; the page checks every few seconds until you authorize. A completed sign-in also configures Git to push to GitHub with the same credentials. A signed-in repository without an `origin` remote offers **Publish to GitHub** as a private or public repository named after its folder. **My GitHub projects** lists your repositories; **Clone** clones one into the clone directory and adds it as a workspace, and a repository already cloned there shows as on this computer. When `gh` is not installed the page says how to install it.

| Configuration | Default | Purpose |
| --- | --- | --- |
| `git` | `git` | `git` executable name or absolute path |
| `gh` | `gh` | GitHub CLI executable name or absolute path |
| `searchPath` | `['/opt/homebrew/bin', '/usr/local/bin']` | Directories searched after `PATH`; a Desktop app started from the Dock inherits a short `PATH` |
| `cloneDirectory` | `~/github` | Directory repositories clone into, one subdirectory per repository name |
| `repositoryLimit` | `100` | Most repositories one listing returns |
| `commandTimeoutMs` | `300000` | Milliseconds one command may run before it is terminated |
| `loginTimeoutMs` | `900000` | Milliseconds a GitHub sign-in waits for its code |
| `graceMs` | `3000` | Grace between termination tiers of a stopped command |
| `maxOutputBytes` | `4194304` | Most bytes of one command output stream kept in memory |

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half, `GitController`, serves the `git` Remote namespace. It resolves each Session's folder from its live or stored header and runs `git` and `gh` through `ctx.subprocess` with explicit argument vectors, so no user text is shell-interpreted; credential prompts are disabled because nobody can answer them. `git status --porcelain=v2 --branch -z` supplies the branch and change list. Clones register through the optional `ctx.workspaceRegistry`. One device sign-in runs at a time; its prompt is parsed from the CLI's output and it completes in the background.

The browser half registers the `source-control` page type and its Start-page entry with [ui-sidebar-right](../ui-sidebar-right/README.md). `SourceControl` owns each Session's repository state and draft message, and one GitHub state all Sessions share.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Right Sidebar](../ui-sidebar-right/README.md)
- [Workspace registry](../../workspace/workspace/README.md)
- [Subprocess](../../subprocess/subprocess/README.md)

<a id="model-experience"></a>
## Model Experience

None, as this package runs user-initiated Git and GitHub commands and adds no model input.

#### KV Cache effect

None; command output reaches only the browser.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The page has no diff view, branch switching, merge-conflict resolution, or discard action; use the terminal for those.
- Pull is fast-forward only; diverged branches report Git's error.
- GitHub features need the GitHub CLI on the Host; Git over SSH relies on the Host's SSH agent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No runtime invariant companion is published. Every answer is read from Git or the GitHub CLI; the plugin keeps no second observation to compare.

</details>
