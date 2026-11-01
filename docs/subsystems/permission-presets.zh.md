# 權限預設

[English](permission-presets.md) | 中文

[dsh-permission-presets](../../packages/interaction/permission-presets) 的權限預設層（`ctx.permissionPresets`，`PermissionPresetService`）把兩個相互獨立的強制執行 knob，即[沙箱模式](sandbox.zh.md)（`sandbox/mode`）與[審批策略](approval.zh.md)（`approval/policy`），捆綁成具名預設，供用戶端作為單個 Permissions 選擇器提供。設定表擁有未來工作階段預設值，而固定的 `registerAuto(admit)` 掛鉤讓 [Auto review](../../packages/experimental/auto-review/README.zh.md) integration 在一個 effect 生命週期內釋出僅限目前工作階段的選項。該層是可選能力，且不擁有執行策略：提示詞敘述與回放仍讀取各自 knob 的摺疊結果，額外強制執行由 Auto review 擁有。[包 README](../../packages/interaction/permission-presets/README.zh.md)負責組合狀態與限制；[沙箱切換設計](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)負責原始旋鈕依據。

原始碼：[`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

## 預設表

預設把一個穩定 key 對映到一組沙箱／審批組合，外加可選的用戶端展示資訊。預設設定表自帶 `workspace-write`（`workspace-write` + `ask`）和 `danger-full-access`（`danger-full-access` + `never`）；`custom` 與 `auto` 是保留名稱，不能設定。

```ts type-equiv
/** One preset's sandbox/approval bundle and optional client presentation. */
interface PresetSpec {
  /** The `sandbox/mode` value the preset writes through. */
  sandbox: SandboxMode
  /** The `approval/policy` value the preset writes through. */
  approval: ApprovalPolicy
  /** The display label a client shows for this preset; the raw table key when omitted. */
  name?: string
  /** One user-facing sentence on what the preset means; omitted when not configured. */
  description?: string
}
```

```ts type-equiv
/** The {@link PermissionPresetService} config: preset table and composition default. */
interface Config {
  /**
   * The preset table: name → knob bundle. Defaults to `workspace-write`
   * (workspace-write + ask) and `danger-full-access` (danger-full-access +
   * never). The names `custom` and `auto` are reserved for derived state and
   * the Auto review integration respectively.
   */
  presets: Record<string, PresetSpec>
  /**
   * Default for new sessions. When omitted, the preset matching the composed
   * sandbox and approval defaults is used.
   */
  defaultPreset: Volatile<string | undefined>
}
```

該服務要求一個施加隔離的 `ctx.shell` 執行器和 `ctx.approval`，設定錯誤在外掛載入時即失敗：名為 `custom` 或 `auto` 的設定條目會丟擲異常；在不施加隔離的 bash 執行器（沒有 `sandboxMode` 能力事實）之上組合同樣丟擲異常，因為預設捆綁了一個沙箱模式。

## 固定的目前工作階段 Auto 註冊

Auto integration 會在自身 effect 生命週期內呼叫 `registerAuto(admit)`。本服務固定 `auto` 身份以及 `danger-full-access` 加 `ask` 的組合，已記錄的 Auto 選擇也匹配委派子工作階段固定的 `never` 策略；shipped 用戶端的 locale 字典擁有 Auto 的 label 與 description，而設定預設的展示資訊仍歸 Host 所有。呼叫方不能透過通用 contribution API 釋出其他預設。Auto 排列在設定預設之後，絕不會進入 `permission.defaultPreset` 設定 schema，並在 effect dispose 時消失。同步 `admit` 回呼會在 Auto 選擇修改 Session 前，以及儲存的 Auto Session 釋出前執行，因此 integration 缺失或正在關閉時不會改寫持久身份。

註冊或移除 Auto 會發出無 payload 的 `permission-presets/catalog-changed` 通知。程序級消費方先訂閱，再呼叫 `catalog()`；每次收到通知後重新讀取完整的可選目錄。`permissions` Session 投影只包含 `currentValue`，因此目錄變化不會追加 Session 事件、釋出 Session 投影幀或改變 Session 序列。

## 目前預設與派生的 `custom`

`current(session)` 從必需的 `permissions` 投影派生實際生效的預設。該單元摺疊工作階段的沙箱模式、審批策略和已記錄選擇；狀態內部的缺失值退回到執行器設定的模式與審批服務設定，最後退回到 `ask`。投影 key 缺失時會顯式失敗。服務優先取仍然匹配的選擇（包括 `never` 審批策略下已記錄的 Auto 選擇），其次取第一個匹配的設定條目，否則返回 `CUSTOM_PRESET`（`'custom'`）。`custom` 只是派生值：用戶端可以把它顯示為目前值，但它絕不是切換目標，也絕不出現在事件 payload 中。

`names` 先按宣告順序列出設定預設，再在 Auto integration 存活時列出 Auto。`catalog()` 把這些可選條目作為一份程序級快照返回。`optionOf(name)` 為可用條目（label 退回為該 key）或派生的 `custom` 展示建置選項，傳入其他任何名稱都會丟擲異常。用戶端把目錄與 Session 投影合併；`custom` 可以標記目前值，但絕不會成為目錄條目。

```ts type-equiv
/** Presentation for an available preset or the derived `custom` current value. */
interface PresetOption {
  /** Stable option value: a configured preset key, live `auto`, or derived `custom`. */
  value: string
  /** The display label. */
  name: string
  /** One user-facing sentence on what the value means; omitted when not configured. */
  description?: string
}
```

## 切換與 `permission/preset` 事件

`set(session, name)` 解析預設（未知名稱丟擲異常），在適用時執行 Auto 准入，在 `name` 尚不是生效預設時追加一條僅記日誌的 `permission/preset` 事件，然後透過各旋鈕自己的 setter（[dsh-sandbox-policy](../../packages/sandbox/sandbox-policy) 的 `setSandboxMode` 與 [dsh-user-approval](../../packages/interaction/user-approval) 的 `setApprovalPolicy`）寫入，且僅當該 knob 的生效值發生變化時才寫。同一輪次內，選擇事件先於旋鈕事件出現；重新選擇目前生效的預設則什麼都不追加。

`permission/preset` 是持久、僅記日誌的使用者意圖：它不進入模型 transcript（文字記錄），模型可見的後果由 knob 事件經各自消費方承擔；它存在是為了在兩個預設共享同一個旋鈕組合時，讓 `current()` 仍能保住使用者選擇的究竟是哪一個預設。`permissions` 投影把該選擇與兩個 knob 事件一同摺疊，並保留用於區分空恢復 seed 與新工作階段的 `session/end-seed` 邊界；回放不需要任何追趕狀態或原始日誌重掃。恢復的 `auto` 選擇在 agent 釋出前必須存在 live Auto 註冊。完整事件宣告見[持久化日誌事件目錄](../persistence-catalog.zh.md)；方法簽名見生成的[服務目錄](#ctxpermissionpresets--permissionpresetservice)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxpermissionpresets--permissionpresetservice"></a>

### `ctx.permissionPresets` — `PermissionPresetService`

Owns the deployment's configured permission presets, the fixed Auto integration hook, and their write path. Requires a confining `ctx.shell` executor and `ctx.approval`; unmatched knob values are reported as CUSTOM_PRESET, not an error.

```ts cordis-catalog
/**
 * Read the complete process-level catalog exposed to current-session UI.
 * @returns every currently selectable preset in contribution order.
 */
@Remote('catalog') catalog(): PermissionCatalog

/**
 * Publish the fixed current-session Auto preset for the calling
 * integration's effect lifetime.
 * @param admit - synchronous gate run before live Auto selection or restore.
 * @returns the async effect disposer that removes Auto.
 */
registerAuto(admit: () => void): () => Promise<void>

/**
 * Resolve the preset matching the effective knob values. A still-matching
 * last selection wins shared-bundle ties, and a still-selected Auto also
 * matches the `never` approval policy; otherwise the first configured
 * match wins. Returns
 * {@link CUSTOM_PRESET} when no available preset matches.
 * @param session - the session whose knob state is read.
 * @returns the effective preset name, or `custom` when nothing matches.
 */
current(session: Session): string

/**
 * Resolve an available preset's knob bundle.
 * @param name - the preset name to resolve.
 * @returns the configured bundle.
 * @throws when `name` is neither configured nor the currently live Auto preset.
 */
resolve(name: string): PresetSpec

/**
 * Build the client option for an available preset or {@link CUSTOM_PRESET}.
 * A missing label falls back to the preset key.
 * @param name - a configured preset key, live `auto`, or `custom`.
 * @returns the option a client renders.
 * @throws when `name` is neither a configured preset, live `auto`, nor `custom`.
 */
optionOf(name: string): PresetOption

/**
 * Record a changed preset, then update each changed knob through its own
 * setter. Selecting the effective preset again appends nothing.
 * @param session - the session the switch belongs to.
 * @param name - the preset to switch to; unknown names throw.
 */
set(session: Session, name: string): void
```

Types: [Session](session.zh.md)

Source: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

<a id="permission-presets-events"></a>

### `permission-presets/*` events

<a id="permission-presetscatalog-changed--emit"></a>

#### `permission-presets/catalog-changed` — emit

The selectable process catalog changed. Payload-free by design: consumers subscribe first, then re-read the complete catalog.

```ts cordis-catalog
/**
 * The selectable process catalog changed. Payload-free by design:
 * consumers subscribe first, then re-read the complete catalog.
 * @mode emit
 */
'permission-presets/catalog-changed'(): void
```

Source: [`packages/interaction/permission-presets/src/types.ts`](../../packages/interaction/permission-presets/src/types.ts)
<!-- END GENERATED cordis-surface -->
