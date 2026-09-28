# Agent Note: Permanent default Workspace

Status: implemented

English | [中文](2026-09-26-permanent-default-workspace.zh.md)

## Problem

The [first-use default Workspace](2026-09-20-default-workspace.md) is created only when no Workspace and no Session history exist, and deleting its registration disables it permanently. An installation that already holds Sessions, including ungrouped Sessions without a working directory, therefore never receives a default, and its composer asks the user to choose a folder before every first message. Users need one working directory that is always available and cannot be removed by accident.

## Decision

The [Workspace registry](../../../../packages/workspace/workspace/README.md#first-use-workspace) keeps one permanent default Workspace. `initializeDefault` no longer checks Session history or other registrations: it returns the registered default and recreates its directory when it is missing from disk, or resolves the directory, creates it, and registers it. A Workspace already registered at that directory is adopted as the default. A marker whose registration an earlier build deleted is replaced. `delete` refuses the default with `WorkspaceDefaultUndeletableError`, which the [Host controller](../../../../packages/api/workspace-controller/README.md#first-use-workspace) maps to `workspace/default-undeletable`.

The Host controller ensures the default when it starts, and every `follow` baseline waits for that attempt to settle, so a browser's first view already lists the default and startup restoration selects it through the ordinary Workspace recency rule. The Remote `initializeDefault` remains the retry path a browser takes when both baselines are empty, which now means the Host could not prepare the default. `WorkspaceView.isDefault` marks the row, and the sidebar omits Delete from its menu.

`defaultWorkspace: false` turns the default off for a Host that must not create directories under its account; that Host ensures nothing, and `initializeDefault` returns `undefined`. The default directory is `<home>/default-workspace` for every account: `baseDirectory` defaults to `home` and `productDirectory` to empty, so no system lookup runs. Every ensure resolves the configured directory; when it differs from the registered default's directory, the default moves there and the previous default stays an ordinary Workspace, keeping its Sessions and files. A failed lookup keeps the registered default. Directory contents remain subject to the [metadata-only deletion policy](2026-07-27-workspace-registration-deletion.md), and the language-neutral name and title follow [default Workspace naming](2026-09-23-language-neutral-default-workspace-naming.md).

## Alternatives considered

**Keep first-use eligibility and let users add a folder.** Installations with history would still start without a working directory, which is the reported problem.

**Hide Delete in the browser only.** Any other Remote client could still remove the registration; the registry owns the invariant so every caller observes it.

**Let the browser create the default on every startup.** Every browser would race the Host and repeat a Documents lookup, and a failed Host lookup would be retried by each client. A Host-side ensure runs once per start and gives all browsers the same baseline.

**Remove the Remote `initializeDefault`.** Browsers would lose the recovery notice that directs the user to Choose workspace when the Host cannot prepare the directory.

## Consequences

Every Host start resolves the configured directory and performs at most one `mkdir`; only the `documents` base performs a system lookup, and a slow lookup delays the first Workspace baseline up to `documentsLookupTimeoutMs`. Installations whose default was registered under Documents move it to `<home>/default-workspace` on their next start. Existing installations gain the default Workspace on their next start; earlier Sessions keep their recorded working directories and stay where they were. Users can rename the default Workspace but cannot delete it; they can still delete its files outside the product, and the next start recreates the directory. Registry tests cover history-independent creation, adoption, deletion refusal, directory recreation, and stale markers; registry tests also cover moving the default and keeping it when a lookup fails; controller tests cover startup ordering, the configured product directory, moving to a newly configured directory, and error mapping.
