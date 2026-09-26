# Agent Note: Permanent Session deletion

Status: implemented

English | [中文](2026-09-26-permanent-session-deletion.zh.md)

## Problem

Archiving hides a Session but keeps its log, its projection-cache row, and its Workspace account entry, so conversations a user no longer wants keep occupying disk and remain restorable. Users need to remove a conversation permanently from the sidebar, including the records of subagents it started.

## Decision

`SessionPersistence.delete(id)` is part of the persistence Service Definition. The [JSONL backend](../../../../packages/session/session-persistence-jsonl/README.md) removes the session-owned directory with every retained generation after claiming write ownership in process and through the cross-process lease, so a held writer or an unmaterialized created session is refused with `SessionAlreadyOwnedError`.

The [Session controller](../../../../packages/api/session-controller/README.md) exposes `session.delete`. It archives the Session with `stopActivity`, which stops the running turn, jobs, subagents, and reminders through the existing archive admission and gates every wake they induce. It then disposes the live Agent through the handle it retained when it created or resumed that Agent. It deletes subagent-origin descendants deepest first and the Session last; for each, it removes the stored log, the projection-cache row through `sessionProjectionCache.forget`, and the Workspace account, archive, and pin entries through `workspaceRegistry.forgetSession`, and finally emits `api-session/removed`. Subagent-owned Sessions cannot be deleted on their own.

The Web sidebar adds a destructive Delete session row, ordered after every plugin row, that opens a confirmation dialog naming the Session. Confirming leaves the Session first when it is the current selection.

## Alternatives considered

**Delete only the list entry and keep files.** The archive already hides a Session; a second hiding state would not free disk space or remove the records the user asked to delete.

**Delete forks with their source.** A fork's log holds a copied prefix and is an independent conversation; deleting it would remove history the user did not select.

**Delete spilled output and attachments.** Forks keep reading spill locators inherited from their source, and attachments are deduplicated by content across Sessions without reference counts, so per-Session removal could break other Sessions. Spill retention and out-of-band maintenance remain their cleanup paths.

**Delete without stopping work.** A running turn, job, or reminder could append to or wake the Session after its files were removed.

## Consequences

Deletion cannot be undone. Spilled output files and content-addressed attachments of a deleted Session remain until their own retention or maintenance removes them, and Claude Code's native transcript under the host's Claude configuration directory is not removed. A Session whose live Agent another owner created is refused rather than deleted. Backend tests cover directory removal, ownership refusal, and cancellation; controller tests cover ordering, descendants, cold Sessions, and error mapping; client tests cover the confirmation dialog, list removal, and leaving the current Session.
