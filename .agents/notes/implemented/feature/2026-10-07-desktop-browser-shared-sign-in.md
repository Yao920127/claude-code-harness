# Agent Note: Shared persistent Desktop browser sign-in

Status: implemented

English | [中文](2026-10-07-desktop-browser-shared-sign-in.zh.md)

## Problem

Desktop Browser guests used random, non-persistent partitions keyed by Workspace CWD. A user who signed in to a site in one Workspace had to sign in again in every other Workspace and after every application restart. The request was that the Sidebar Browser remember a sign-in.

## Decision

This note supersedes the storage-ownership part of the [retained Desktop browser webview decision](2026-09-20-desktop-browser-webview.md); its lease, presentation, and guest-policy decisions stay in force.

- Every Desktop Browser guest uses the one persistent partition `persist:dsh-sidebar-browser` (`SIDEBAR_BROWSER_PARTITION` in `apps/desktop/src/browser-guests.ts`). Cookies and Web storage are shared across every Workspace and Session and survive application restart. The bridge's `acquire()` takes no Workspace identity, and the Client no longer resolves one. So a site a tab signs in to — any site that permits an embedded-browser sign-in — stays signed in in every tab and after a restart, with no credential handling by the app.
- The partition keeps the existing guest policy: denied permissions, devices, display capture, downloads and native popups, and cancelled requests to the DSH Host.
- The Browser toolbar's **Sign-in data** menu, present only on Desktop, offers one destructive item, **Clear sign-in data**, which erases the partition's storage data and HTTP auth cache and reloads the tab. The single item sits behind the menu so one click cannot wipe every sign-in.

No Google-specific sign-in is built. Google refuses to sign in inside an embedded browser, and the three ways to work around that were each rejected, so Google-account sites are left to the user's own system browser.

## Alternatives considered

**Keep Workspace partitions and make them persistent.** A sign-in would land in only one Workspace, and the user would repeat it per directory. The request was one sign-in that every Browser tab uses.

**Add a Google sign-in window, presenting Electron as plain Chrome.** A dedicated sandboxed `BrowserWindow` over the shared partition, with the application and `Electron/` product tokens dropped from the user agent, was built and then removed. Google still detected the embedded browser and refused, so the window never reached the account page; dropping the Electron tokens only to defeat Google's embedded-browser check is detection evasion against a deliberate security control, so it was taken out rather than pushed further.

**Import cookies from the user's installed Chrome profile.** Chrome encrypts its cookie store with a key in the system keychain, and its on-disk format changes between releases. Reading it is credential-extraction tooling that works against any Chrome account, needs keychain consent, grants the app every site's session at once, and newer Chrome binds Google sessions to that device's Chrome, so an imported session may not work anyway. Declined.

**Open Google sign-in in the system browser.** Rejected by the user, who did not want the app to open Chrome or Safari. Google-account sites therefore cannot be used signed-in inside the Sidebar Browser; the user signs in to them in their own browser.

## Consequences

Sites that permit embedded sign-in stay signed in in every Workspace once signed in, and isolation between Workspaces is gone. Pages the Agent opens with its browser tool load with these sign-ins; the tool can only open an address and reads nothing back, but a page that performs an action on a plain GET would act as the signed-in user. **Clear sign-in data** is the only way to sign every site out. Google-account sites (and any other site that refuses embedded-browser sign-in) cannot be signed in to in the Sidebar Browser at all.

Main-process unit tests cover the shared persistent partition and clearing with Electron substituted; the client tests cover the clear menu's success and failure paths and its absence on Web.
