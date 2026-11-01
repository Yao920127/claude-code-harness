# 儲存

[English](storage.md) | 中文

儲存子系統持久儲存一切不屬於工作階段事件日誌的資料（工作階段日誌有自己的 seam——見 [persistence.md](persistence.zh.md)）。它是一項可選能力，不屬於 agent loop（智慧代理迴圈）主幹，並按[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md) 拆分：樞紐（hub）與 Service Definition（[dsh-storage](../../packages/storage/storage)，`ctx.storage`）、Service Provider（註冊為 `json` 的 [dsh-storage-json](../../packages/storage/storage-json) 與註冊為 `sqlite` 的 [dsh-storage-sqlite](../../packages/storage/storage-sqlite)），以及 Consumer 資料形式（[dsh-storage-domain](../../packages/storage/storage-domain)，`ctx.storageDomain`，也可經 `ctx.storage.domain` 存取）——它是後端約定的唯一 Consumer，也是其他一切所使用的型別化 API。樞紐自身不做任何 IO：後端擁有介質，資料形式擁有語義，產品包絕不直接觸碰後端。設計記錄：[領域 KV 儲存 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)。

原始碼：[`packages/storage/storage/src/backend.ts`](../../packages/storage/storage/src/backend.ts) · [`packages/storage/storage-domain/src/spec.ts`](../../packages/storage/storage-domain/src/spec.ts) · [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)

## 樞紐：`ctx.storage`

`Storage`（[簽名](#ctxstorage--storage)）是匯合點，不是儲存本體。`ctx.storage.backend` 是一張名稱 → 後端的表：多個後端並排保持掛載，哪個後端服務哪個消費方由該消費方自己的設定決定（即領域層的路由表），絕不是樞紐全域的選擇。`register(name, backend)` 返回 disposer；重複名稱與查詢未知名稱都丟擲 `StorageError`。dispose（資源釋放）只登出名稱——由擁有它的外掛在登出之後自行關閉後端。每個後端外掛還會釋出一個僅用於生命週期的服務鍵（`storageBackendServiceKey(name)`），資料形式提供者注入它，使自身啟用不會與後端註冊發生競態。

資料形式以一張可合併擴充功能的鍵 map 掛載到樞紐上：

```ts type-equiv
/**
 * Data forms mountable on the hub, keyed by form name. Form owners extend
 * this map via declaration merging (the domain layer merges
 * `domain: DomainFacility`) and mount the facility in their `apply`.
 */
interface StorageForms {}
```

`mount(form, facility)` 是一個 effect，其 disposer 負責解除安裝；對同一鍵的第二次掛載丟擲 `duplicate-mount`。`form(form)` 解析已掛載的 facility，在擁有外掛載入之前丟擲 `form-not-mounted`——組合方應據此安排外掛順序，而不是靜默推遲。領域層合併 `domain: DomainFacility`，因此 `ctx.storage.domain` 與 `ctx.storageDomain` 是同一個物件。

## 後端約定

```ts type-equiv
/**
 * One registered backend. A backend owns exactly one medium and shares its
 * lifecycle across all facets; facets are optional members — a backend that
 * cannot serve a data kind simply omits it, and resolution fails loud instead.
 */
interface StorageBackend {
  /** Key-value operations; absent when this backend cannot serve them. */
  readonly kv?: KvFacet

  /**
   * Drain in-flight writes across all open units and release the medium.
   * Idempotent; concurrent and repeated calls resolve once teardown finishes.
   * @returns resolution after the medium is released.
   */
  close(): Promise<void>
}
```

一個後端擁有一個介質（一棵檔案樹的根目錄、一個資料庫檔案），並提供可選的操作組；`kv` 是唯一已交付的操作組。`KvFacet.open(descriptor)` 開啟一個具名 unit——`KvUnitDescriptor` 攜帶名稱、目前格式版本、可選的相容記錄版本、表名清單，以及是否存在全域單例 slot——並返回提供 `loadAll`、`putRecord`、`deleteRecord`、`setGlobal` 和 `close` 的 `KvUnit`。unit 名與表名必須匹配 `UNIT_NAME_RE`（既可安全用作檔名，也可安全用作 SQL 識別符號片段）；記錄鍵是任意字串，絕不進入檔案路徑。unit 不對並行寫入做序列化——順序由呼叫方負責——但每次單獨呼叫在介質上都是原子的，且 resolve 後即已持久。`single` 介質上記錄的版本不同時拒絕 `version-mismatch`；`per-record` 文件的版本在接受集合之外時讀作不存在。無法按該 unit 解析的介質拒絕 `malformed-medium`。[`backend.ts`](../../packages/storage/storage/src/backend.ts) 是逐條款的規範性約定，[`tests/contract.ts`](../../packages/storage/storage/tests/contract.ts) 中的共享一致性套件會針對每個後端檢查每項條款。[json 後端](../../packages/storage/storage-json/README.zh.md)以原子方式為每個 unit 整檔案重新發布一份人類可讀檔案；[sqlite 後端](../../packages/storage/storage-sqlite/README.zh.md)在單個資料庫中每行儲存一份文件，用於頻繁更新的資料。

## 宣告領域

領域由其擁有包宣告一次，形式是一個 spec 物件——它是該領域的身份、佈局和記錄 schema 的單一來源（schema 用 zod 編寫，因此 `z.infer` 讓消費方型別無需重複宣告）：

```ts type-equiv
/** Static declaration of one domain: identity, version, and record layout. */
interface DomainSpec {
  /** Domain name; must match `UNIT_NAME_RE` (doubles as the backend unit name). */
  readonly name: string
  /** Current domain format version; reads enforce it according to the selected layout. */
  readonly version: number
  /**
   * Medium layout for the backend unit: `single` (the default) stores the
   * whole unit as one document; `per-record` stores each record as its own
   * document, for units whose records are large, sparse, or individually
   * disposable — the projection cache — and scopes version checks per record
   * (an unaccepted record document is discarded, never migrated).
   */
  readonly layout?: 'single' | 'per-record'
  /**
   * Older domain versions whose stored records the current record schemas
   * also accept (the declaring owner vouches for that, typically by
   * declaring the fields older records lack as optional). `per-record` backends
   * read documents stamped with a listed version instead of discarding them,
   * and accept a legacy whole-unit file so stamped for the one-time
   * bootstrap; writes always stamp {@link version}.
   */
  readonly compatibleVersions?: readonly number[]
  /**
   * What `open` does with a stored table record that fails its zod schema.
   * Absent (the default), the whole open rejects with `invalid-record` —
   * right for authoritative data. `'backup-and-skip'` is for domains whose
   * records are disposable derived data: the backend moves the record's
   * document aside (`KvUnit.backupRecord`), the failure is logged with
   * its cause, and the open continues with the record absent. A backend
   * without `backupRecord` (no per-record document to move) falls back
   * to the rejecting default. The global slot always rejects.
   */
  readonly invalidRecords?: 'backup-and-skip'
  /** Optional global singleton slot. */
  readonly global?: DomainGlobalSpec<unknown>
  /** Table declarations keyed by table name; each name must match `UNIT_NAME_RE`. */
  readonly tables: Record<string, DomainTableSpec>
}
```

`defineDomain(spec)` 固定 spec 的字面量型別，並在擁有方的模組載入時、任何介質被觸碰之前就明確報錯：領域名或表名不匹配 `UNIT_NAME_RE`、版本不是非負整數、global schema 接受 `null`，這些都會丟擲（`null` 是介質的「從未寫入」哨兵值，可空的 global 一旦儲存就無法往返還原）。`domainTable<K, V>(schema)` 宣告一張表，其鍵型別是僅存在於編譯期的 phantom 型別（通常是[品牌化 id](core.zh.md#branded-ids)）；`descriptorOf(spec)` 投影出面向後端的 unit 描述符。

## 開啟的領域

```ts type-equiv
/** One open domain, typed by its spec. */
interface Domain<S extends DomainSpec> {
  /** Domain name from the spec. */
  readonly name: string
  /** Global singleton handle; a spec without `global` has no usable handle (`never`). */
  readonly global: DomainGlobalHandleOf<S>
  /**
   * Resolve one declared table handle. Handles are stable — repeated calls
   * return the same instance.
   * @param name - Declared table name.
   * @returns the typed table handle.
   */
  table<N extends keyof S['tables'] & string>(name: N): KvTable<TableKeyOf<S, N>, TableValueOf<S, N>>

  /**
   * Close this domain: reject new writes immediately, drain already-queued
   * writes (their events still emit), release the backend unit, then free
   * the domain name for a later open. Idempotent — repeated calls share one
   * teardown. The consumer owns this call (typically as its own `ctx.effect`
   * disposer); the facility closes any domain left open when it unmounts.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void>
}
```

讀取是同步的，來自權威的記憶體態：`KvTable` 暴露 `get`/`entries`/`keys`/`size`（快照迭代器，在排隊寫入落實期間保持穩定），global 控制代碼的 `get()` 在第一次 `set` 將 slot 物化到介質之前一直返回 spec 的 `initial`。每次寫入——`put`、`delete`、`update`、`global.set`——都在同一條逐領域寫鏈上排隊，先在後端完成持久化，再更新記憶體，最後發出 `domain/changed`；後端寫入被拒時記憶體原樣不動，因此讀取絕不會偏離介質。`update(key, fn)` 在其寫鏈 slot 上是一次原子的讀-改-寫（鍵缺失時拒絕 `missing-key`）；`delete` 一個不存在的鍵 resolve 為 `false`，不產生寫入也不產生事件。返回的記錄就是儲存的物件本身，不是副本——請經 `put`/`update` 整體替換，絕不要就地修改。

## 領域 facility：`ctx.storageDomain`

`DomainFacility`（[簽名](#ctxstoragedomain--domainfacility)）在經過路由的後端之上開啟已宣告的領域。路由是領域外掛的設定，絕不屬於樞紐：`backend` 指定必填的預設路由，`routes` 按領域名逐個覆蓋。`open(spec)` 按嚴格順序執行，每一步失敗都使整個呼叫失敗：拒絕已開啟或仍在關閉中的名稱（`already-open`），解析路由（`backend-not-found`），要求後端具備 `kv` facet（`facet-unsupported`），開啟 unit（後端的 `version-mismatch`/`malformed-medium` 原樣直接傳遞），並按 spec 的 zod schema 驗證每條已儲存記錄和 global（`invalid-record`，附帶出錯的表與鍵）。呼叫方擁有返回的控制代碼，並用 `Domain.close()` 釋放它；外掛解除安裝時仍處於開啟狀態的領域由 facility 負責關閉，已關閉領域的名稱只有在拆除完全結束後才釋放出來供重新開啟。`get(name)` 是無型別的診斷查詢，命中的是每個型別化控制代碼背後包內私有的 `DomainImpl` 執行時；`closeAll()` 是解除安裝路徑。

## 變更事件：`domain/changed`

每次持久寫入都發出一個事件，嚴格發生在後端確認永續性之後，順序遵循該領域的寫鏈（[事件條目](#domainchanged--emit)）：

```ts type-equiv
/** Shared location fields of one durable domain change. */
interface DomainChangedBase {
  /** Owning domain name. */
  readonly domain: string
  /** Table name; `''` for a global-singleton write. */
  readonly table: string
  /** Record key; `''` for a global-singleton write. */
  readonly key: string
}
```

```ts type-equiv
/** One durable domain change; a closed union — switch on `operation`. */
type DomainChanged = DomainChangedPut | DomainChangedDeleted
```

`put`（插入、覆寫和 global 寫入）在 `value` 中攜帶新快照——絕不攜帶舊值；需要做差異比較的消費方自行保留上一份快照。`deleted` 是不攜帶值的墓碑。該事件是通知，不是事務參與者：發出時提交點已經過去，因此同步丟擲的監聽器會被兜住並記錄一條警告，而不會讓已經持久的寫入被拒絕；發出的值等於發出時刻的記憶體態。該事件僅限程序內；跨程序的變更推送是一項已記錄的限制（[包 README](../../packages/storage/storage-domain/README.zh.md)）。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxstorage--storage"></a>

### `ctx.storage` — `Storage`

The storage hub service. Backends register under `backend`; data forms mount under their `StorageForms` key and are reached as `ctx.storage.<form>`.

```ts cordis-catalog
/**
 * Mount a data-form facility on the hub. Mounting is an effect: the
 * returned disposer unmounts the form.
 * @param form - Form key declared in {@link StorageForms}.
 * @param facility - The facility instance to expose.
 * @returns the disposer that unmounts the form.
 */
mount<K extends keyof StorageForms>(form: K, facility: StorageForms[K]): () => void

/**
 * Resolve a mounted data form.
 * @param form - Form key declared in {@link StorageForms}.
 * @returns the mounted facility.
 */
form<K extends keyof StorageForms>(form: K): StorageForms[K]
```

Source: [`packages/storage/storage/src/index.ts`](../../packages/storage/storage/src/index.ts)

<a id="ctxstoragedomain--domainfacility"></a>

### `ctx.storageDomain` — `DomainFacility`

The mounted domain facility. Opens declared domains over routed backends; one facility instance owns the open-domain table and enforces single-open per domain name.

```ts cordis-catalog
/**
 * Open one declared domain. Steps, each failing the whole call: reject a
 * name that is already open (`already-open`); resolve the backend route
 * (`backend-not-found` passes through from the hub); require its `kv` facet
 * (`facet-unsupported`); open the unit projected from the spec (backend
 * `version-mismatch`/`malformed-medium` pass through); load and validate
 * every stored record against the spec's zod schemas (`invalid-record`
 * with the offending table and key — unless the spec declares
 * `invalidRecords: 'backup-and-skip'` and the unit can move documents aside, in
 * which case the failing record is backed up, logged, and skipped);
 * construct the domain.
 *
 * Lifecycle: the CALLER owns the returned handle and closes it via
 * `Domain.close()` (typically as its own `ctx.effect` disposer) — the
 * facility does not tie the domain to any consumer fiber. Domains still
 * open when the facility unmounts are closed by the plugin disposer.
 * @param spec - The domain declaration, typically from `defineDomain`.
 * @returns the opened domain handle, typed by the spec.
 */
async open<S extends DomainSpec>(spec: S): Promise<Domain<S>>

/**
 * Look up an open domain by name, untyped. Diagnostic surface (the package
 * invariant cross-checks change events against live domain state); typed
 * consumers hold the handle returned by {@link open}.
 * @param name - Domain name.
 * @returns the open domain runtime, or `undefined` when not open.
 */
get(name: string): DomainImpl | undefined

/**
 * Close every domain still open on this facility. The unmount path for
 * consumers that never called `Domain.close()` themselves; closing is
 * idempotent, so double-closing an already-closed domain is harmless.
 * @returns resolution after every unit is released.
 */
async closeAll(): Promise<void>
```

Source: [`packages/storage/storage-domain/src/index.ts`](../../packages/storage/storage-domain/src/index.ts)

<a id="domain-events"></a>

### `domain/*` events

<a id="domainchanged--emit"></a>

#### `domain/changed` — emit

A domain record or the global singleton changed, emitted once per write strictly after the backend acknowledged durability. Events of one domain arrive in its write-chain order.

```ts cordis-catalog
/**
 * A domain record or the global singleton changed, emitted once per write
 * strictly after the backend acknowledged durability. Events of one
 * domain arrive in its write-chain order.
 * @param change - domain, table (`''` for global), key (`''` for global),
 * operation discriminant, and on `put` the new snapshot.
 * @mode emit
 */
'domain/changed'(change: DomainChanged): void
```

Source: [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)
<!-- END GENERATED cordis-surface -->
