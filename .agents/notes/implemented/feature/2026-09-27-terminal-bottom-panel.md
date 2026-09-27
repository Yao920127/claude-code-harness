# Agent Note: Terminal bottom panel

Status: implemented

English | [中文](2026-09-27-terminal-bottom-panel.zh.md)

## Problem

User terminals opened as right-sidebar tabs compete with Browser, Files and Document Preview for the same pane, and a terminal beside the transcript leaves both narrow. Users expect the editor convention: a terminal panel below the work area that keeps its tabs and height while hidden.

## Decision

Terminals live in a per-Session panel below the conversation content. `ui-conversation` declares the session-scoped `conversation.panel.bottom` seat under `main.conversation` and renders it only for a selected Session; the seat's occupant owns its height and renders nothing while hidden. `ui-terminal-panel` (renamed from `ui-sidebar-terminal`) occupies it, registers a pressed-state toggle in the composer's `conversation.input.right` seat, which renders before a Session's first message while the header utilities do not, and binds `terminal.toggle` to Control+\`. The right sidebar no longer registers a terminal page kind.

`TerminalPanels` owns each Session's panel state: shown or hidden, height, and tabs. A tab is a panel-local key plus a globally unique content identity. The [web terminal decision](2026-09-09-web-sidebar-terminal.md) still governs the terminal controller, which binds each content identity to its Host terminal, so reload reconnects the same process. One browser-storage entry holds every Session's panel and is validated on read; a structurally invalid entry discards all panels rather than adopting a partial one. At startup, all Sessions' saved tabs feed the controller's window holds, including Sessions not yet opened. The shortcut acts on the Session whose panel mounted last, because the panel seat exists only in the main conversation. Session removal drops that Session's panel.

## Alternatives considered

**Keep terminals as right-sidebar tabs and add a bottom dock to the sidebar.** The sidebar's dock layout is horizontal-only and Session-wide; a second axis would change its persisted layout format and validation for one page kind.

**Render the panel in the app frame below all columns.** Terminals are Session-owned, while the frame's main slot also hosts global panels without a Session. The conversation's session scope supplies the Session and disappears with it.

**Persist panel state per Session key, as the sidebar layout does.** Window holds need every Session's tabs at startup; one entry is read once instead of enumerating storage keys.

## Consequences

Each browser remembers its own panels; another browser, or cleared storage, starts every panel hidden and empty while Host terminals stay subject to idle reclamation. Hiding the panel keeps processes; closing the last tab hides it. Embedded conversations do not render the seat. A future second occupant of `conversation.panel.bottom` would replace the terminal panel, since the seat is single.
