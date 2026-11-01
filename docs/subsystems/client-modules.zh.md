# Client 模組

[English](client-modules.md) | 中文

Web 外掛表：[dsh-client-modules](../../packages/client/modules) 中 client 模組系統的 Node 半，以 `ctx.clientModules`（`ClientModuleRegistry`）形式提供。它掃描主機 Loader 的 entry，找出宣告瞭 `dsh.client` 的包，組合出 `window.__DSH_BOOT__` entry 圖，在 `/plugins` 下提供帶版本的單資源或多資源 combo 腳本，並以啟動協定行回應每次 index 注入收集——這是同一個服務的四個面。它是 Web GUI 棧的一項可選能力，不屬於 agent loop（智慧代理迴圈）主幹，並且是 [dsh-host-webserver](../../packages/host/webserver) 的消費方：[web-server.md](web-server.zh.md) 所述的載體提供本服務註冊的字首路由與其回應的 `webserver/index-inject` 事件。同一個包的瀏覽器半（`ctx.modules`，即拉取並物化這些 bundle 的 lazy CJS 模組表）屬於核心機件，記錄在[包 README](../../packages/client/modules/README.zh.md)中，不在本頁。

原始碼：[`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## wire

圖是 Node 半與瀏覽器半之間協定層的唯一真源。主機從掃描到的包組合出 `WebBootEntry` 行與 `WebBootBatch` 描述，隨後在 Vite entry 之前向結構化 index 注入表貢獻 registration facade、application preload、bootstrap 腳本與圖全域量。`global` 行渲染為 `globalThis["__DSH_BOOT__"]`，其中 `<` 已轉義，外掛可控的字串因此無法逃出 script 元素。沒有有效 manifest 的頁面無法啟動：瀏覽器解析器會拒絕畸形 row 或批次、未知成員，以及未恰好歸屬一個初始 combo 描述的 entry。

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch. `inject` names package rows whose
 * factories must arrive before this row materializes, while Cordis separately
 * uses the same package edges to compose entries. `external` carries exact
 * non-inject module requests (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /**
   * Revisioned single-resource combo reference used by HMR. It is relative to
   * the document, so the browser resolves it under whatever mount served the page.
   */
  url: string
  /** Opaque plugin-artifact revision used for HMR cache busting. */
  rev: string
  /** Package-name dependency edges used for factory arrival and plugin composition. */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** Initial scheduling phase for one revisioned combo script. */
type WebBootBatchPhase = 'bootstrap' | 'application'
```

```ts type-equiv
/** One initial combo script; a scheduling phase may span several descriptors. */
interface WebBootBatch {
  /** Parser-blocking bootstrap or preloaded application scheduling. */
  phase: WebBootBatchPhase
  /** Content-addressed combo script reference, document-relative like {@link WebBootEntry.url}. */
  url: string
  /** Revision derived from the ordered entry revisions. */
  rev: string
  /** Graph entry ids whose factories the script registers, in execution order. */
  entries: string[]
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the current entry and batch descriptors. */
  rev: string
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
  /** Initial combo descriptors; every entry belongs to exactly one descriptor. */
  batches: WebBootBatch[]
}
```

首次釋出與 HMR 都從入口的 mtime、ctime 和大小派生每個 row 的 `rev`，不對可執行位元組求雜湊。相同產物會跨 Host 重新啟動保持 revision。初始 descriptor 把 row 劃入 bootstrap 與 application 兩個排程階段，每個階段都可以包含多條 descriptor。URL 只含有序 package 資源列表和從這些 row revision 派生的 revision，階段名不會進入路由。圖組合保持 row 順序，並在 map 形式 URL 超過 3 KiB 前貪心切分，不拼接腳本，也不讀取 map。圖 revision 對 entry 與 batch descriptor 求雜湊。`immediately` 標記第一階段的 registration barrier；同一 combo 中的 row 共享腳本傳輸，不同 combo 則獨立載入。

## 掃描

包加入這張表的方式，是在自己的 package.json 中宣告 `dsh.client`（`platform: 'web'`、可選的 `inject` 邊、可選的 `immediately`），並在 `exports["./client"]` 匯出建置好的 bundle。每個 live row 都從自己的 Loader specifier 與所屬 tree `baseUrl` 解析；若 `loader.internal.resolveSync` 可用，則使用 Host face import 所用的同一個實作。最近歸屬的 package manifest 提供瀏覽器模組 id，因此相對 source 與 built overlay 仍保留包身份。若不同的 active Loader source 解析到同一包名，組合會失敗；一個來源解除安裝後，仍存活的來源無需重新啟動 fiber 即可提供該 row。

掃描是單包增量的；不存在全量重掃程式碼路徑。fiber 建構或 dispose（資源釋放）時的每次 cordis `internal/plugin` 發射都把該 fiber 的 entry 名標髒，一次微任務 flush 把每個髒名與即時 loader entry 對帳。啟用趟以全部目前 entry 灌入同一個髒集合並同步 flush，因此初掃與穩態共享一條實作——但失敗姿態相反。啟用時，已載入 entry 中的畸形宣告或缺失 bundle 會聚合為一個大聲的 `AggregateError`，列出每個損壞的包：該 fiber 進入 FAILED，由啟動的大聲失敗 sweep 上報。穩態下，損壞的包只記錄一條警告，且不得殃及其他包。

包中繼資料——包括「非 client 包」這一否定結論——按 Loader specifier 與所屬 tree base URL 快取至重新啟動。同一來源的 fiber 重新啟動會原樣複用其 row 與 rev；bundle 內容變更只經 `rebuilt()` 到達圖。

## bundle 路由與 index 注入

`GET`／`HEAD /plugins/??<package-a>/client.js,<package-b>/client.js&rev=<rev>` 定址一份生成的 combo 腳本；單資源請求採用同一形式，也是 HMR 路徑。腳本在首次 `GET` 時只拼接一次，並以 `sourceMappingURL` 結尾，該引用只攜帶 combo 查詢串——`??<package-a>/client.js.map,<package-b>/client.js.map&rev=<rev>`，按腳本自身目錄而非文件解析。啟動、index 渲染、腳本 `GET` 和 `HEAD` 都不會讀取 map 檔案；首次 map `GET` 才會讀取並驗證這些檔案、組合一份 Indexed Source Map v3，並快取該 body。元件有自帶 map 時直接用於對應 section；沒有時則獲得 identity section，其 `sourcesContent` 是捕捉的 bundle，source 名取打包後的 `sourceURL` 或外掛路由。每條啟動請求 URL 按 UTF-8 位元組計算都不超過 3 KiB；切分按更長的 map 形式計算。所有 application URL 都會預載入，所有 bootstrap URL 都會在圖全域量與 Vite entry 之前執行。已物化回應使用長期 immutable 快取。未知或被修改的資源列表、缺少 revision 及陳舊 revision 都返回 404，絕不提供其他位元組，也不會讓 SPA fallback 把 HTML 當作 JavaScript 返回；其他方法返回 405。注入行在每次 index 渲染時攜帶目前圖，因此重新載入總是基於即時組合啟動。

## 服務

```ts type-equiv
/** Filesystem baseline captured before a client artifact snapshot is read. */
interface ClientArtifactBaseline {
  /** Absolute path of the client bundle. */
  readonly path: string
  /** Bundle modification time in milliseconds. */
  readonly mtimeMs: number
  /** Bundle status-change time in milliseconds, including writes that preserve mtime. */
  readonly ctimeMs: number
  /** Bundle size in bytes. */
  readonly size: number
}
```

`ClientModuleRegistry`（`ctx.clientModules`，定義於 [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)）暴露讀取面與重建面；簽名見生成的[服務目錄](#ctxclientmodules--clientmoduleregistry)。`graph()` 返回目前組合出的圖（兩次變更之間是同一個穩定物件），`clientPath(id)` 返回 bundle 的絕對路徑，`artifactBaseline(id)` 返回讀取目前快照前捕捉的 bundle stat 值。`fetchBundle()` 解析 HTTP 路由所使用的同一份惰性回應。`rebuilt(id)` 是變化後的 bundle 內容到達圖的唯一入口：它從檔案系統中繼資料派生 revision，只有 revision 變化才會讀取新位元組、重新組合圖並行出通知。`onRebuilt` 按發生變化的 bundle 逐個觸發並攜帶新 revision；`onGraphChanged` 在任何一次重新組合了圖的 flush 之後觸發（行的增刪，或 rebuilt 帶來的 revision 變化），並採用拉取模型——監聽器自行重讀 `graph()`。兩條通知路徑都會兜住監聽器異常，因此一個拋錯的訂閱者既不能讓後續訂閱者被跳過，也不能殺死觸發這次 flush 的一方。

隨包提供的 Web 組合透過 [`dsh-client-hmr`](../../packages/client/hmr/README.zh.md) 交付動態圖快照。Host 立即轉發現有圖變化通知，重連會傳送目前完整圖。圖描述瀏覽器的目標條目，不宣告 Host 清理已經完成。產物輪詢另外報告重建 revision。僅 source map 變化不會觸發過載；新 combo-map URL 只會在 bundle revision 變化後出現，每份 map body 由其首次 `GET` 固定。Client Modules 驗證快照，並將對帳與重建序列協調；它持有啟動建立的條目對映，負責單資源到達、非同步移除、未使用模組與樣式清理，以及頁面本地重試狀態。靜態平臺模組與 bootstrap 保持頁面生命週期；Electron 安裝屬於獨立流程。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `dsh.client` scan + wire composition + bundle route + index injection rows. Construction runs the activation scan synchronously — a malformed declaration or missing bundle among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Serve an advertised revisioned bundle or source map without a Web server.
 * Unknown URLs return 404, unsupported methods return 405, and `HEAD`
 * returns the same immutable headers without materializing a body. Each body
 * is built once on its first `GET`; script construction never reads maps.
 * @param request - shell-carrier request for a `/plugins` resource.
 * @returns the exact response also exposed by the optional Web route.
 */
async fetchBundle(request: Request): Promise<Response>

/**
 * Filesystem baseline captured before an entry's current bytes were read.
 * HMR compares it with the live files when installing a watch, so a write
 * between startup composition and watch installation cannot disappear into
 * the watcher's initial state.
 * @param id - entry id (package name).
 * @returns the path and baseline, or undefined for an unknown id.
 */
artifactBaseline(id: string): ClientArtifactBaseline | undefined

/**
 * Publish one completed bundle generation (the HMR watch's registration
 * hook — the only entry point through which build changes reach the graph).
 * Unchanged mtime, ctime and size preserve the graph without reading the bundle.
 * @param id - entry id (package name).
 * @returns the current artifact rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when artifact metadata changes the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
