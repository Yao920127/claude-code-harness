# HTTP 伺服器

[English](web-server.md) | 中文

[dsh-host-webserver](../../packages/host/webserver) 是 GUI Host 的瀏覽器 HTTP 載體：它是一個提供 `ctx.webServer` 的 `node:http` 外掛，包含具名路由註冊表、可選的 gzip 回應壓縮、index.html 轉換回呼，以及一個可由外掛認領的退回處理器。它不屬於 agent loop（智慧代理迴圈），也不是能力 seam；它不瞭解任何 harness 概念。其他外掛負責註冊所有功能路由，包括 `/api` 橋接、外掛 bundle 和 HMR（熱模組替換）事件流（[分層說明](../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)）。該伺服器只服務瀏覽器：Electron 透過 `file://` 載入已建置檔案，並經 IPC 橋接傳送 fetch 請求，不使用本伺服器。

原始碼：[`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

## 路由

```ts type-equiv
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
type WebRouteKind = 'exact' | 'prefix'
```

```ts type-equiv
/** One named route registration. */
interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
```

匹配順序固定：先查 exact 表，再取最長匹配字首，最後落到已註冊的退回。註冊順序不攜帶任何面向請求的語義：具名路由在組合上互不相交，任何未被具名路由認領的請求都由退回席位應答；席位只有一個所有者，第二次註冊會丟擲異常。釋出的 Web 組合用 [`dsh-host-frontend-static`](../../packages/host/frontend-static/src/index.ts) 認領席位，即遵循固定語義的 SPA dist 伺服器：Connection 在讀取 dist 根目錄和設定 index 的 HTML 前完成認證；非 index 資產保持公開；非 GET/HEAD 返回 405，越出 dist 根目錄的遍歷返回 403，現有檔案直接提供，缺失或不是檔案的目標返回空的 404，未知副檔名按 octet-stream 傳送。

## 設定

```ts type-equiv
/** Web server listen and response-compression config. */
interface Config {
  /** Listen host; the two supported values are loopback and all-interfaces. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero requests an OS-assigned port. */
  port: number
  /** Response compression for socket-backed HTTP requests. @default 'none' */
  compression?: 'none' | 'gzip'
  /** Gzip DEFLATE level from 0 through 9. @default 1 */
  compressionLevel?: number
  /** Minimum known response length eligible for gzip; unknown-length streams are eligible. @default 1024 */
  compressionThresholdBytes?: number
}
```

`host` 只接受 `127.0.0.1`（預設姿態）和 `0.0.0.0`（刻意的網路暴露）。載體本身不擁有 TLS、認證或 Origin 策略，因此繫結到非迴環地址會暴露伺服器，除非組合層提供這些控制。`compression` 預設為 `none`；隨附的 Web 組合選擇 gzip level 1 和 1024 位元組閾值。隨附的 `dsh web` 命令選擇 loopback 並拒絕 `--host 0.0.0.0`；其 Connection 外掛為每個 Host API route 與 stream 提供 Host/Origin 總和檢查碼瀏覽器工作階段認證。其他組合自行擁有繫結與路由認證策略。dist 位置是認領席位的前端外掛的組裝事實。

## 服務

`WebServer`（`ctx.webServer`）在啟用時立即監聽；監聽失敗（EADDRINUSE 等）會使初始化被拒絕，啟動程序會報告失敗的 fiber。`register(route)` 新增一條具名路由並返回其 disposer；重複的 `(kind, path)` 丟擲異常，因為路由模式是組合層約定，衝突即設定錯誤。Gzip 在伺服器內部包裝符合條件且基於 socket 的回應，因此 route handler 繼續直接持有 `ServerResponse`，服務也不新增回應寫出 API。已有內容編碼、`Cache-Control: no-transform`、範圍回應、SSE、ZIP 與打包後的 `.gz` Worker 映像均保持 identity 回應。`collectIndexInjections()` 經一次 `webserver/index-inject` emit 收集結構化 `IndexInjection` 行，`renderIndex(html)` 把它們渲染進成功的根路徑和設定 index 回應，隨後再按註冊順序應用原始的 `tapIndex(transform)` 逃生口轉換；[dsh-client-modules](../../packages/client/modules) 以啟動 manifest（中繼資料清單）行回應該事件。`port` 讀取監聽埠，包括 `config.port` 為 0 時作業系統分配的埠。

處理過程中丟擲異常的請求（畸形的 % 轉義撞上 `decodeURIComponent`、用戶端在請求體中途斷開）會記錄為警告並應答 400（回應頭已發出時則銷燬 socket），絕不導致程序退出。dispose（資源釋放）把 `close()` 與 `closeAllConnections()` 配對使用，因為處理器可能像 SSE（Server-Sent Events）那樣保持回應開啟，而這類連線永遠不會自行結束；沒有強制關閉，拆卸就會掛起。該包從不列印輸出：URL 行歸 shell 所有。逐包運維細節（含開發模式的 bundle 監視流水線）留在 [README](../../packages/host/webserver/README.zh.md) 中。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxconnection--hostconnectionhandle"></a>

### `ctx.connection` — `HostConnectionHandle`

Host `ctx.connection` members consumed by transport-independent adapters.

```ts cordis-catalog
/**
 * Compose exact Fetch routes and the shared-channel RPC interceptor.
 * @param channel - shared channel mounted by Connection.
 * @returns Fetch handler for trusted, authenticated requests.
 */
createSharedFetchHandler(channel: '/api'): ConnectionFetchHandler

/**
 * Apply Connection's Host/Origin checks and browser authentication to
 * another Web route.
 * @param request - request headers from the HTTP or upgrade request.
 * @returns rejection status, or undefined when the route may accept the request.
 */
requestRejection(request: ConnectionTrustRequest): ConnectionRequestRejection

/**
 * Admit one request: it passes {@link requestRejection} and speaks for the
 * operator, or it is refused with that status.
 * @param request - request headers from the HTTP or upgrade request.
 * @returns the operator Peer, or the rejection status.
 */
admit(request: ConnectionTrustRequest): PeerAdmission

/**
 * Authenticate one frontend index request, owning a token redirect or 401.
 * @param request - root or configured-index HTTP request.
 * @param response - response owned when the result is false.
 * @returns true only when the frontend may serve index.html.
 */
authorizeIndex(request: ConnectionIndexRequest, response: ConnectionIndexResponse): boolean

/**
 * Add the fresh process token to an ordinary Web application URL.
 * @param baseUrl - clean application URL whose authority and mount are preserved.
 * @returns tokenized URL for initial login; a mount proxy strips its prefix before {@link authorizeIndex}.
 */
authenticatedUrl(baseUrl: string): string
```

Source: [`packages/client/connection/src/rpc.ts`](../../packages/client/connection/src/rpc.ts)

<a id="ctxwebserver--webserver"></a>

### `ctx.webServer` — `WebServer`

The browser HTTP carrier service. Activation listens immediately. Route registration order does not affect requests because configured named routes must be distinct, and the fallback handler answers anything not yet claimed during startup with 404 until its owner registers. A listen failure rejects initialization, and the boot process reports the failed fiber.

```ts cordis-catalog
/**
 * Register a named route. Duplicate (kind, path) throws — route patterns are
 * a composition-level contract, so a collision is a misconfiguration.
 * @param route - kind, path, and the owning handler.
 * @returns the disposer removing the route.
 */
register(route: WebRoute): () => void

/**
 * Register an exact-path HTTP upgrade route. Duplicate paths throw because
 * one socket can have only one protocol owner.
 * @param route - pathname and handler owning negotiation plus socket use.
 * @returns the disposer removing the route.
 */
registerUpgrade(route: WebUpgradeRoute): () => void

/**
 * Claim the fallback seat: the handler answering every request no named
 * route matches (the SPA dist server in the shipped Web composition). One
 * owner only — a second registration throws, because two fallbacks cannot
 * compose.
 * @param handler - owns the full response lifecycle of unmatched requests.
 * @returns the disposer releasing the seat.
 */
registerFallback(handler: WebRoute['handler']): () => void

/**
 * Register a raw-HTML index transform, the escape hatch for markup no
 * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
 * registration order after rendering the structured rows.
 * @param transform - pure html-to-html function.
 * @returns the disposer removing the transform.
 */
tapIndex(transform: (html: string) => string): () => void

/**
 * Run an index.html body through the registered taps in registration order
 * — called by the fallback owner on every index response it renders.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
applyIndexTaps(html: string): string

/**
 * Gather the structured injection table: one `webserver/index-inject` emit,
 * every subscriber pushes its current rows. Fresh per call, so subscribers
 * read live state (module graph, theme preference) at emit time.
 * @returns rows in subscriber activation order.
 */
collectIndexInjections(): IndexInjection[]

/**
 * Render one index.html body: the structured injection table first, then
 * the raw `tapIndex` transforms over the result.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
renderIndex(html: string): string
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

<a id="connection-events"></a>

### `connection/*` events

<a id="connectionrequest--waterfall"></a>

#### `connection/request` — waterfall

Admit or wrap an authenticated shared API request, including body transfer. Existing requests continue when a listener refuses subsequent requests.

```ts cordis-catalog
/**
 * Admit or wrap an authenticated shared API request, including body transfer.
 * Existing requests continue when a listener refuses subsequent requests.
 * @param request - Authenticated incoming HTTP request.
 * @param response - Response owned until the delegated bridge settles.
 * @param next - Delegate to the next listener or the shared API bridge.
 * @mode waterfall
 */
'connection/request'(request: IncomingMessage, response: ServerResponse, next: () => Promise<void>): Promise<void>
```

Source: [`packages/client/connection/src/index.ts`](../../packages/client/connection/src/index.ts)

<a id="webserver-events"></a>

### `webserver/*` events

<a id="webserverindex-inject--emit"></a>

#### `webserver/index-inject` — emit

Collect the structured index injection table. Emitted on every index render and every worker boot-payload request; listeners push their current rows, so a row's data is read fresh at emit time.

```ts cordis-catalog
/**
 * Collect the structured index injection table. Emitted on every index
 * render and every worker boot-payload request; listeners push their
 * current rows, so a row's data is read fresh at emit time.
 * @param table - Mutable row table; listeners append in activation order.
 * @mode emit
 */
'webserver/index-inject'(table: IndexInjection[]): void
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)
<!-- END GENERATED cordis-surface -->
