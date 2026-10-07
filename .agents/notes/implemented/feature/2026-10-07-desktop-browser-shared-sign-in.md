# Agent Note: Shared persistent Desktop browser sign-in

Status: implemented

English | [中文](2026-10-07-desktop-browser-shared-sign-in.zh.md)

## Problem

Desktop Browser guests used random, non-persistent partitions keyed by Workspace CWD. A user who signed in to Google in one Workspace had to sign in again in every other Workspace and after every application restart. Google also refuses sign-in inside an embedded browser whose user agent names Electron, so signing in from a Browser tab could fail outright.

## Decision

This note supersedes the storage-ownership part of the [retained Desktop browser webview decision](2026-09-20-desktop-browser-webview.md); its lease, presentation, and guest-policy decisions stay in force.

- Every Desktop Browser guest uses the one persistent partition `persist:dsh-sidebar-browser` (`SIDEBAR_BROWSER_PARTITION` in `apps/desktop/src/browser-guests.ts`). Cookies and Web storage are shared across every Workspace and Session and survive application restart. The bridge's `acquire()` takes no Workspace identity, and the Client no longer resolves one.
- The partition keeps the existing guest policy: denied permissions, devices, display capture, downloads and native popups, and cancelled requests to the DSH Host. Its user agent drops the application and `Electron/` product tokens, so pages see the embedded Chrome.
- The Browser toolbar's **Site sign-in** menu, present only on Desktop, offers **Sign in with Google** and **Clear sign-in data**. Sign-in opens `DesktopBrowserSignIn` (`apps/desktop/src/browser-sign-in.ts`): one sandboxed `BrowserWindow` over the same partition, with no preload, Node integration, nested webviews or popups, that accepts only credential-free HTTPS navigation. The window finishes as `signed-in` when Google commits a document at `https://myaccount.google.com`, `cancelled` when the user closes it, and `failed` on a load failure, renderer crash, or non-HTTPS navigation. Clearing erases the partition's storage data and HTTP auth cache.
- After `signed-in` or a clear, the tab reloads so the page reads the new cookies.

## Alternatives considered

**Keep Workspace partitions and make them persistent.** A Google sign-in would land in only one Workspace, and the user would repeat it per directory. The user asked for one sign-in that every Browser tab uses.

**Import cookies from the user's installed Chrome profile.** Chrome encrypts its cookie store with a key in the system keychain, and its on-disk format changes between releases. Reading it needs keychain consent, grants the app every site's session at once, and breaks on Chrome updates.

**Sign in inside a Browser tab.** Google rejects the embedded webview, and a tab cannot reliably detect the end of the flow to report it.

## Consequences

Sites signed in once stay signed in in every Workspace, and isolation between Workspaces is gone. Pages the Agent opens with its browser tool load with these sign-ins; the tool can only open an address and reads nothing back, but a page that performs an action on a plain GET would act as the signed-in user. **Clear sign-in data** is the only way to sign every site out.

Google can still refuse a sign-in it judges unsafe; the window then never reaches the account page, and the user sees the sign-in reported as not finished after closing it. Main-process unit tests cover the partition, user agent, clearing, and every window outcome with Electron substituted; no test drives a real Google sign-in.
