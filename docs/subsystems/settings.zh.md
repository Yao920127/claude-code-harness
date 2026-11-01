# 外掛設定表單

[English](settings.md) | 中文

[設定服務](../../packages/settings/settings/README.zh.md) 從活動 profile 條目投影 volatile Config 欄位。[設定編輯器](../../packages/boot/config-editor/README.zh.md) 透過 Cordis patch 持久化編輯。業務消費者對自己的 Config 引用呼叫 `.get()`。

## 標識與值

表單名稱空間是目前 profile 中可唯一定位條目的本地 id。多個外掛實例在條目 id 不同時擁有獨立表單。普通欄位被排除。描述符包含實際值、繼承值、顯式 profile 覆蓋值和樂觀修訂號。

## 編輯

`update` 合併提交的欄位。`replace` 先將即時欄位重置為繼承設定，再應用提交的欄位。`mutate` 操作獨立路徑，保留使用者端回應中未包含的秘密值。每次寫入都會驗證完整 Config，並在持久化前拒絕過期修訂號。

`settings/document-updated` 在 Loader 設定變化後使表單描述符失效。這是 UI 通知；消費者僅在需要重新整理註冊資訊時使用 `loader/volatile-update`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsettings--settingsforms"></a>

### `ctx.settings` — `SettingsForms`

Project Config schemas into forms and own optional instance-level UI policy.

```ts cordis-catalog
/** Register the calling plugin instance's page policy without changing its Config.
 * @param presentation Automatic-page policy for this instance; `auto` defaults to true.
 * @param owner Plugin instance the policy belongs to; defaults to the calling fiber.
 * @returns Disposer; register it with the calling plugin's effects.
 * @throws If this instance already has a registered policy.
 */
configure(presentation: { auto?: boolean }, owner: Fiber = this.ctx.fiber): () => void

/** Locate the profile patch for native editing.
 * @returns The existing profile patch path.
 */
prepareDocument(): Promise<string>

/** Read active plugin schemas and their live values.
 * @param options Redaction required for remote callers.
 * @returns Forms keyed by unique profile entry ids.
 */
describe(options?: SettingsDescribeOptions): SettingsDescriptor[]

/** Merge editable fields into an entry's config.
 * @param ns Profile entry id.
 * @param patch Fields to merge.
 * @param expectedRevision Revision returned by describe.
 */
async update(ns: string, patch: object, expectedRevision?: number): Promise<void>

/** Reset all live fields, then set the supplied fields; ordinary config is preserved.
 * @param ns Profile entry id.
 * @param section Complete form values.
 * @param expectedRevision Revision returned by describe.
 */
async replace(ns: string, section: object, expectedRevision?: number): Promise<void>

/** Apply field edits without restating redacted secrets; unsetting an array index removes its element.
 * @param ns Profile entry id.
 * @param ops Ordered form edits.
 * @param expectedRevision Revision returned by describe.
 */
async mutate(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>
```

Source: [`packages/settings/settings/src/index.ts`](../../packages/settings/settings/src/index.ts)

<a id="ctxsettingscontroller--settingscontroller"></a>

### `ctx.settingsController` — `SettingsController`

Host service backing the generated `ctx.remote.settings` namespace. Every remote read uses `redactSecrets: true`, so a `role('secret')` field cannot ride a response. Writes expose the settings service's merge, replacement, and path-addressed operations, and classify every provider refusal as `settings/conflict` or `settings/rejected` with the service's message.

```ts cordis-catalog
/**
 * Describe every registered namespace for a configuration page: redacted
 * layered values plus the serialized schema the page renders its form from.
 * @returns provider writability, local-document presence, and one view per namespace.
 * @throws RemoteError when no settings provider is mounted.
 */
@Remote describe(): SettingsDescribeValue

/**
 * Merge a patch into one namespace's stored user section.
 * @param ns - namespace key to write.
 * @param patch - fields to merge into the user section.
 * @param expectedRevision - revision the caller read; `undefined` writes unconditionally.
 * @returns the namespace's redacted view after the write.
 * @throws RemoteError when the request is invalid, no provider is mounted, or the provider refuses the write.
 */
@Remote update( ns: string, patch: Record<string, JsonValue>, expectedRevision: number | undefined, ): Promise<SettingsNamespaceView>

/**
 * Replace one namespace's stored user section wholesale.
 * @param ns - namespace key to write.
 * @param section - complete replacement user section.
 * @param expectedRevision - revision the caller read; `undefined` writes unconditionally.
 * @returns the namespace's redacted view after the write.
 * @throws RemoteError when the request is invalid, no provider is mounted, or the provider refuses the write.
 */
@Remote replace( ns: string, section: Record<string, JsonValue>, expectedRevision: number | undefined, ): Promise<SettingsNamespaceView>

/**
 * Apply path-addressed edits to one namespace's user section, resolved against
 * the section as stored rather than against whatever the caller last read,
 * then answer with that namespace's new redacted view.
 * @param ns - namespace key to write.
 * @param ops - the edits to apply, in order.
 * @param expectedRevision - revision the caller read; `undefined` writes unconditionally.
 * @returns the namespace's redacted view after the write.
 * @throws RemoteError when the request is invalid, no provider is mounted, or the provider refuses the write.
 */
@Remote async mutate( ns: string, ops: SettingsPathOpView[], expectedRevision: number | undefined, ): Promise<SettingsNamespaceView>

/**
 * Materialize the provider-owned settings document and open it in a native text editor.
 * @param signal - caller lifetime; abort terminates preparation or the native command.
 * @returns confirmation after the native opener accepts the document.
 * @throws RemoteError when no document exists, preparation fails, or opening fails.
 */
@Remote async openSettingsDocument(signal: AbortSignal): Promise<SettingsDocumentOpenValue>
```

Source: [`packages/api/settings-controller/src/index.ts`](../../packages/api/settings-controller/src/index.ts)

<a id="settings-events"></a>

### `settings/*` events

<a id="settingsdocument-updated--emit"></a>

#### `settings/document-updated` — emit

One profile entry's form values, availability, or page policy changed. Form clients re-read its schema, resolved values, and revision.

```ts cordis-catalog
/**
 * One profile entry's form values, availability, or page policy changed.
 * Form clients re-read its schema, resolved values, and revision.
 * @param ns Profile entry id.
 * @param revision The entry's new revision.
 * @mode emit
 */
'settings/document-updated'(ns: SettingsNamespace, revision: number): void
```

Source: [`packages/settings/settings/src/types.ts`](../../packages/settings/settings/src/types.ts)
<!-- END GENERATED cordis-surface -->
