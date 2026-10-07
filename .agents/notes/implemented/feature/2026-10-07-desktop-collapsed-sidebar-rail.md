# Agent Note: Collapsed sidebar rail on every desktop platform

Status: implemented

English | [中文](2026-10-07-desktop-collapsed-sidebar-rail.zh.md)

## Problem

On macOS and Windows desktop, collapsing the left sidebar left a zero-width column. The Plugins, Tasks, Workspace, usage, and Settings entries disappeared with it, so a user could not tell those features existed until the sidebar was opened again; only the plain Web build kept the 56px icon rail. macOS also needed a separate window-chrome seat to hold the reopen and New Session controls, which made the darwin collapse a third layout to maintain.

## Decision

Every platform keeps the 56px rail while the sidebar is collapsed. `computeColumns` (ui-layout `columns.ts`) always reserves `SIDEBAR_COLLAPSED` for a closed sidebar and takes no collapsed-width argument.

- **macOS.** The hiddenInset traffic lights span x 12–68, wider than the rail, so the rail's controls start below them. ui-sidebar's darwin rule pads the collapsed root by `--dsh-sidebar-rail-chrome` (44px; 18px in window fullscreen, where the lights are hidden), stretches the top strip back over that band as the rail's `data-window-drag` row carrying the expand toggle, and folds the empty logo row away. The conversation header starts 20px into the centre column, past the lights, with no extra inline clearance.
- **Windows.** The toggle and New Session stay fixed in the caption row; the collapsed rail below the caption keeps the panel, browsing, and foot controls.
- **The frame window-chrome seat is removed.** The `shell.leading` root slot, its `HeaderLeadingControls` occupant, the `--dsh-frame-leading-clearance` variable, and the conversation header's padding by it are deleted (pre-stable API: every consumer updated, no shim). The rail's own toggle and New Session button serve every main panel.

### What this replaces

The [macOS hidden-titlebar decision](2026-09-13-macos-hidden-titlebar-vibrancy.md) hid the darwin column entirely and rejected keeping the rail, because the rail under floating traffic lights doubled the corner chrome and spent width the collapse exists to reclaim. A follow-up architecture decision then added the frame-owned `shell.leading` seat. Its motivation: the reopen controls had first lived in a Conversation-only header seat, so any other main panel (the plugin manager, future global panels) left a collapsed window with no reopen control at all, and each panel would have repeated the seat markup, the drag-region subtraction, and the traffic-light geometry. One frame seat, mounted only on darwin while the column was hidden, made the guarantee structural. It published `--dsh-frame-leading-clearance` (160px, 84px in fullscreen) for the conversation title row, so content cleared the lights and the seat's two controls. That design also rejected gating visibility in CSS (dead DOM and a no-drag subtraction on every platform) and having each consumer hardcode the clearance (it would drift from the seat's real band).

The rail now gives every main panel the same reopen and New Session controls, so neither the per-panel problem nor the seat that solved it remains.

## Alternatives considered

**Keep the full hide and add a hover-revealed rail.** The entries would still be invisible at rest, which is the discoverability problem this change addresses.

**Keep `shell.leading` beside the rail.** The seat would duplicate the rail's toggle and New Session button in the window corner.

**Keep the zero-width Windows collapse.** Windows would remain the one desktop platform where collapsing hides every sidebar entry.

## Consequences

The collapsed window spends 56px on the rail on every platform; the full-width macOS collapse is gone. On macOS the traffic lights overlap the rail's top 44px band, which is a window-drag row, not a control. A platform that later needs to hide its column entirely must bring back a frame-owned reopen seat for every main panel, for the reasons above.

`shell.leading` is absent from ui-layout's slot declarations, ui-sidebar's registrations, and the generated client slot catalog. The ui-layout app-frame spec pins the 56px rail on darwin and on the Windows titlebar with no leading seat rendered, and its apply spec pins that `shell.leading` is undeclared. The Web e2e window-drag spec pins the darwin rail toggle inside the 56px column below the traffic lights, the rail strip above it as draggable, and the toggle as clickable; the sessionless-header spec reopens from the rail on every platform. Real macOS and Windows window chrome is not exercised by these specs.
