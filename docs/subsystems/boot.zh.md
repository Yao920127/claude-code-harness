# Profile 管理

[English](boot.md) | 中文

[boot 包組](../../packages/boot/README.zh.md)負責 launcher 提供的 profile 存取與外掛管理器。[外掛管理器](../../packages/boot/plugin-manager/README.zh.md)文件說明持久化、過載與包操作行為。

## 管理記錄

`PluginEntryId` 標識一個 Loader 條目；呼叫方從 `listPlugins` 取得，不自行拼接 patch id。

`PluginInfo` 包含模組標識、實際啟停狀態、fiber 階段和可選的展示 `meta`，以及唯一的 `patchId` 或 `readOnlyReason`。

`BundleInfo` 包含包名、可選的安裝版本、組合層選擇狀態、刪除可用性及可選的解析錯誤。它的可選 `meta` 與各行的 `BundleRowInfo.meta` 包含展示文字或元資訊診斷；Client 在渲染時選擇語言。

`InstallBundleOptions.enabled` 預設為 true，false 表示安裝但不選擇組合包層。`approvedBuilds` 在安裝前向指定的待審批包名授予持久腳本權限。`registry` 指定首先詢問的註冊表；預設為設定的那個。

`PluginRegistries` 攜帶設定的第一個註冊表（`null` 即 pnpm 自身設定指定的那個）、隨後依次詢問的備選註冊表，以及 `resolved`——pnpm 自身設定指向的 URL，未讀到時為 `null`。`InspectOptions.registry` 指定一次查詢首先詢問的註冊表。

`ChangeResult.changed` 報告磁碟修改，獨立於 `application`：`applied`、`restart-required`、`overridden` 或 `failed`。可選的 `error` 包含可在地化的錯誤碼和外部診斷。`packageResult` 記錄 pnpm 結束代碼、有界輸出、截斷標誌及完整診斷日誌路徑；當管理器終止了一個停止列印的執行，還記錄 `timedOut`。被終止的執行不論訊號留下什麼退出狀態都歸類為 `timeout`，因此安裝與刪除都報告失敗而非成功，也不會再詢問下一個註冊表。`pendingBuilds` 列出整個 profile 尚未決定的包；`approvedBuilds` 記錄本次操作授予權限的包名；`registries` 按順序列出一次安裝問過的註冊表；`failedAt` 說明最後一次失敗的執行連不上的是所問的註冊表，還是 git 或 tarball spec 自身拉取的主機。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxconfigeditor--configeditor"></a>

### `ctx.configEditor` — `ConfigEditor`

Persist complete raw configs and apply them through the normal Loader path.

```ts cordis-catalog
/** Addressable profile rows; nested Includes have independent configuration ownership.
 * @returns Active entries with unique profile patch ids.
 */
entries(): Entry[]

/** Read inherited and explicit profile values for the active entries.
 * @returns Detached layer values alongside their Loader entries.
 */
configuration(): Array<{ entry: Entry; inherited: Record<string, unknown>; override: Record<string, unknown> }>

/** Validate, persist, and reconcile a plugin's next config; ordinary fields keep normal lifecycle rules.
 * @param entry Current Loader entry, also used to detect replacement during the write.
 * @param change Derive a raw config from the current entry and its inherited layer.
 * @returns Fulfillment after Loader reconciliation completes.
 */
async edit( entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>, ): Promise<void>
```

Source: [`packages/boot/config-editor/src/index.ts`](../../packages/boot/config-editor/src/index.ts)

<a id="ctxhmr--hmr"></a>

### `ctx.hmr` — `Hmr`

Hot reload service with Cordis-compatible module configuration and events.

```ts cordis-catalog
/** Serialize a caller-owned mutation with all automatic reload paths.
 * @param operation Work that must not overlap module or configuration replacement.
 * @returns The operation result after its asynchronous work completes.
 */
runExclusive<T>(operation: () => Promise<T>): Promise<T>

/** Watch a configuration path through the same queue as module replacement.
 * @param filename Absolute path, which may not exist yet.
 * @param refresh Rebuilds configuration from its current files and awaits Loader completion.
 * @returns Disposer closing this registration and waiting for its pending refresh.
 */
async watchConfig(filename: string, refresh: () => Promise<void>): Promise<() => Promise<void>>

/** Read direct module dependency URLs from the active Node loader.
 * @param url Module URL.
 * @returns Linked module URLs, or an empty list for an uncached module.
 */
async getLinked(url: string): Promise<string[]>
```

Source: [`packages/boot/hmr/src/index.ts`](../../packages/boot/hmr/src/index.ts)

<a id="ctxpluginmanager--pluginmanager"></a>

### `ctx.pluginManager` — `PluginManager`

Manage profile files and apply their declared reload lifecycle.

```ts cordis-catalog
/** Read exact plugin-version exemptions saved in this profile.
 * @returns Accepted package-name@version keys with the runtime versions they may run on, and any
 * record or file problem the reader rejected, which the caller reports instead of failing.
 */
@Remote listVersionExemptions(): { exemptions: Record<string, string[]>; warnings: string[] }

/** Grant or revoke one exact plugin/runtime exemption and reevaluate live plugins.
 * @param packageVersion Exact manifest package name followed by @ and its version; never an installation spec or alias.
 * @param runtimeVersion Exact current DSH version for grants; revocation may name a previous runtime.
 * @param enabled Whether to grant rather than revoke the exemption.
 * @param acceptRisk Required true for grants after the user accepts possible crashes and data loss.
 * @returns Saved and runtime outcomes. Startup-only profiles require restart.
 */
@Remote setVersionExemption(packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk?: boolean): Promise<ChangeResult>

/** Read current plugins, including why a row cannot be changed through the profile patch.
 * @returns Current runtime entries with persistent patch targets.
 */
@Remote async listPlugins(): Promise<PluginInfo[]>

/** Read the profile's installed bundles, the bundles this dsh installation supplies, and the selected names that are not bundles.
 * A dependency without a bundle patch is listed, as a `not-bundle` problem, only while it is selected.
 * @returns Package versions, manifest descriptions, rows, optional display metadata, activation selections,
 * whether the installation offers the bundle, and removal availability.
 */
@Remote listBundles(): Promise<BundleInfo[]>

/** Read the registries this manager asks: the configured first one, its fallbacks in order, and what pnpm's own configuration names.
 * @returns The registries in pnpm's comparison form; null is the one pnpm's own configuration names, `resolved` as pnpm reads it now.
 */
@Remote async registries(): Promise<PluginRegistries>

/** Read what a spec names before installing it.
 * @param spec One package spec: a registry name, an absolute path, a git address, or a tarball.
 * @param options The registry asked first.
 * @param signal Ends a registry lookup early.
 * @returns The package the spec names, or why it is refused.
 */
@Remote async inspect(spec: string, options?: InspectOptions, signal?: AbortSignal): Promise<PluginSpecInspection>

/** Persist a plugin entry's desired enablement and apply it on live profiles.
 * @param id Loader entry identity returned by listPlugins.
 * @param enabled Whether the plugin should run.
 * @returns Saved and runtime outcomes, including higher-priority overrides.
 */
@Remote setPluginEnabled(id: PluginEntryId, enabled: boolean): Promise<ChangeResult>

/** Select or remove a bundle layer while retaining installed dependencies.
 * @param name Bundle package name.
 * @param enabled Whether the bundle contributes its patch layer.
 * @returns Persisted and runtime outcomes.
 */
@Remote setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>

/**
 * Install a package using the same pnpm implementation as dsh plugin. GitHub
 * repositories get a connection check bounded by githubConnectionTimeoutMs before pnpm starts;
 * only network failures or timeouts stop installation, while pnpm owns authentication and transport fallback. A run
 * that fails, is cancelled, or adds a package without a bundle patch restores
 * `package.json` and `pnpm-lock.yaml` as they were; downloaded files can stay.
 * @param spec One package spec, including local paths relative to the invocation directory.
 * @param options Whether to activate the installed bundle (defaults to true), the request id a cancellation names,
 * the pending build scripts to allow for this profile before pnpm runs, and the registry asked first.
 * @returns Package-manager diagnostics, the registries asked, and the observed activation outcome.
 */
@Remote installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>

/** Recover the result of an active installation without cancelling it.
 * @param requestId The id supplied when installation started.
 * @returns The installation's outcome after it settles, or null if no active request has that id.
 * Completed results are not retained; null establishes neither success nor cancellation.
 */
@Remote async waitForInstall(requestId: PluginInstallRequestId): Promise<ChangeResult | null>

/** Stop an installation this manager owns and wait until its files are back.
 * @param requestId The id the installation was started with.
 * @returns `cancelled` once the Git check or pnpm exited and the files are restored, `too-late` once the bundle is being
 * applied, `not-running` for any other id.
 */
@Remote async cancelInstall(requestId: PluginInstallRequestId): Promise<PluginInstallCancellation>

/** Unload and remove a profile-owned bundle dependency through dsh plugin's pnpm path.
 * @param name Installed dependency name.
 * @returns Removal diagnostics and the remaining profile state.
 */
@Remote removeBundle(name: string): Promise<ChangeResult>
```

Source: [`packages/boot/plugin-manager/src/index.ts`](../../packages/boot/plugin-manager/src/index.ts)

<a id="ctxpluginregistryprobe--pluginregistryprobe"></a>

### `ctx.pluginRegistryProbe` — `PluginRegistryProbe`

Compares public registry responses on the Host; the Client owns the initial selection.

```ts cordis-catalog
/**
 * Race npm and npmmirror HTTPS ping responses through the Host's fetch proxy.
 * Concurrent readers share a probe; a winner cancels and awaits the other request.
 * @returns the first registry with a successful response, or null when disabled or neither responds successfully; results are cached.
 * @throws rejects when the service has been unloaded.
 */
@Remote async fastest(): Promise<string | null>
```

Source: [`packages/client/ui-plugin-manager/src/index.ts`](../../packages/client/ui-plugin-manager/src/index.ts)

<a id="ctxprofilecontext--profilecontext"></a>

### `ctx.profileContext` — `ProfileContext`

Current profile facts; scheduling and mutation belong to their callers.

Source: [`packages/boot/app-boot/src/profile-context.ts`](../../packages/boot/app-boot/src/profile-context.ts)

<a id="app-boot-events"></a>

### `app-boot/*` events

<a id="app-bootconfig-reload--emit"></a>

#### `app-boot/config-reload` — emit

Profile patches were reconciled into the running Loader tree: every entry update settled and no new inactive entry was introduced. Carries no diff; listeners re-read Loader entries.

```ts cordis-catalog
/**
 * Profile patches were reconciled into the running Loader tree: every entry update settled and no new
 * inactive entry was introduced. Carries no diff; listeners re-read Loader entries.
 * @mode emit
 */
'app-boot/config-reload'(): void
```

Source: [`packages/boot/app-boot/src/index.ts`](../../packages/boot/app-boot/src/index.ts)

<a id="hmr-events"></a>

### `hmr/*` events

<a id="hmrchange--emit"></a>

#### `hmr/change` — emit

A watched file has no module or configuration handler.

```ts cordis-catalog
/** A watched file has no module or configuration handler.
 * @mode emit
 * @param url Canonical file URL.
 */
'hmr/change'(url: string): void
```

Source: [`packages/boot/hmr/src/index.ts`](../../packages/boot/hmr/src/index.ts)

<a id="hmrreload--emit"></a>

#### `hmr/reload` — emit

Module replacements have finished loading.

```ts cordis-catalog
/** Module replacements have finished loading.
 * @mode emit
 * @param reloads Replaced plugins and their module locations.
 */
'hmr/reload'(reloads: Map<Plugin, Reload>): void
```

Source: [`packages/boot/hmr/src/index.ts`](../../packages/boot/hmr/src/index.ts)

<a id="plugin-manager-events"></a>

### `plugin-manager/*` events

<a id="plugin-managerchanged--emit"></a>

#### `plugin-manager/changed` — emit

The profile's plugins, bundles, or composition changed: a manager operation completed. A patch generation applied outside the manager, by HMR's watcher after a CLI or hand edit, announces nothing here.

```ts cordis-catalog
/**
 * The profile's plugins, bundles, or composition changed: a manager
 * operation completed. A patch generation applied outside the manager,
 * by HMR's watcher after a CLI or hand edit, announces nothing here.
 * @mode emit
 * @param change - what changed.
 */
'plugin-manager/changed'(change: PluginChange): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)

<a id="plugin-managerinstall-log--emit"></a>

#### `plugin-manager/install-log` — emit

One chunk of a pnpm run's output, streamed as the run produces it.

```ts cordis-catalog
/**
 * One chunk of a pnpm run's output, streamed as the run produces it.
 * @mode emit
 * @param chunk - the chunk and the run it belongs to.
 */
'plugin-manager/install-log'(chunk: PluginInstallLogChunk): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)

<a id="plugin-managerinstall-state--emit"></a>

#### `plugin-manager/install-state` — emit

An installation moved between its Host phases. `installing` is announced once per registry the installation asks, with the attempt's registry and position; `cancelling` and `applying` once.

```ts cordis-catalog
/**
 * An installation moved between its Host phases. `installing` is announced once per registry the
 * installation asks, with the attempt's registry and position; `cancelling` and `applying` once.
 * @mode emit
 * @param progress - the installation's request id and phase, with the attempt while installing.
 */
'plugin-manager/install-state'(progress: PluginInstallProgress): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)
<!-- END GENERATED cordis-surface -->
