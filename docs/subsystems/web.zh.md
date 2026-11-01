# Web 存取

[English](web.md) | 中文

Web 存取 seam 是一個[能力 seam](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)，在同一個 `ctx.web` 服務上橫跨**兩項操作**（search 與 fetch），並拆分到多個包：Service Definition（[dsh-web](../../packages/web/web)，`ctx.web` + 提供者註冊表）、Service Provider（[dsh-web-search-exa](../../packages/web/web-search-exa)、[dsh-web-search-perplexity](../../packages/web/web-search-perplexity)、[dsh-web-search-deepseek](../../packages/web/web-search-deepseek)、[dsh-web-fetch-http](../../packages/web/web-fetch-http)）與 Consumer（[dsh-tool-web](../../packages/web/tool-web)，即 `web_search`/`web_fetch` 工具 schema）。Web 是**一項可選能力**，不屬於 agent loop（智慧代理迴圈）主幹，因此其詞彙定義在此而非 [core.md](core.zh.md) 中。更換 search 提供者不會改變模型提交查詢的方式，更換 fetch 提供者也不會改變模型請求 URL 的方式。

原始碼：[`packages/web/web/src/types.ts`](../../packages/web/web/src/types.ts)

## 為什麼一項能力包含兩項操作

搜尋與抓取既不共享請求 schema，也不共享業務邏輯，但它們被有意設計為同一個 `ctx.web` 中間層：一個提供者選擇策略的所有者、一套中止與錯誤詞彙，以及一個面向產品的「此 harness 如何存取 Web」設定介面。代價是服務上並行的 `searchX`／`fetchX` 方法對；這種並行是有意為之，而不是遺漏了可抽取的共性。提供者註冊的是**能力**（`WebSearchProvider` 或 `WebFetchProvider`），而非工具；面向模型的名稱、schema、提示詞引導與展示全部集中在唯一的消費方 `dsh-tool-web` 中。

## 搜尋請求與結果

每個 seam 請求只攜帶一個 `query`。消費方 `dsh-tool-web` 接受必填的 `queries` 陣列，並把它扇出為多個獨立 seam 請求；單元素陣列執行一次搜尋。`maxResults` 是消費方自有的上限（`dsh-tool-web` 的 `searchMaxResults` 設定，預設 `8`），透過 seam 傳遞並在返回時強制執行——如果提供者返回超量，seam 截斷 `sources[]` 並設定 `truncated`。

```ts type-equiv
/**
 * What one search-capable backend is asked to search. Each request carries one
 * query; a consumer may issue several requests. `maxResults` is a
 * `dsh-tool-web`-layer bound passed through unchanged and enforced on the way
 * back by the seam (see {@link WebSearchResult}).
 */
interface WebSearchRequest {
  readonly query: string
  /**
   * Upper bound on returned sources; the seam truncates to it. Omitted = no
   * bound. `dsh-tool-web` always sets it. A provider whose API supports a
   * result-count control (Exa's `numResults`) should apply it at the request
   * layer as a cost/latency optimization; the seam enforces the bound
   * regardless.
   */
  readonly maxResults?: number
}
```

```ts type-equiv
/**
 * Normalized search outcome. `content` is optional provider-generated answer
 * text or summary (Exa and DeepSeek return none; Perplexity returns a
 * generated answer).
 * `sources[]` is the portable citation shape. `truncated` is set by the seam
 * when it cut `sources[]` down to `maxResults`.
 */
interface WebSearchResult {
  /** Optional provider-generated answer text, search context, or summary. */
  readonly content?: string
  /** Citeable sources, already truncated to the request's `maxResults`. */
  readonly sources: readonly WebSearchSource[]
  /** True when the seam dropped sources to honor `maxResults`. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * One citeable source. A source always has a URL; `title`, `snippet`, and
 * `publishedAt` are optional because not every provider returns them — forcing
 * adapters to invent them would make the seam lie (Perplexity citations may be
 * URL-only). `dsh-tool-web` renders `title ?? hostname(url)` for display.
 */
interface WebSearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  /** Publication/crawl timestamp as a provider-supplied ISO-8601 string. */
  readonly publishedAt?: string
}
```

## 抓取請求與結果

```ts type-equiv
/**
 * What one fetch-capable backend is asked to retrieve. The request deliberately
 * omits timeout, format, prompt, and extraction controls: cancellation is a
 * direct execution argument, while presentation and higher-level LLM concerns
 * belong outside safe retrieval.
 */
interface WebFetchRequest {
  readonly url: string
}
```

HTTP 狀態碼是被抓取資源狀態的一部分，不自動視為失敗：即使一次成功的網路抓取收到 `404` 或 `500` 回應，也仍會產出一個 `WebFetchResult`，其中包含狀態碼和長度受限的已解碼正文。`url` 是經過允許的重定向後的最終 URL。`WebError` 僅用於無法安全取得或表示資源的情況。

```ts type-equiv
/**
 * Normalized fetch outcome. A successful network fetch of a non-2xx response is
 * a result, not an error: the status code is part of the fetched resource
 * state. {@link WebError} is reserved for failures to safely retrieve or
 * represent the resource.
 */
interface WebFetchResult {
  /** The final URL after allowed redirects (the request URL is in the request). */
  readonly url: string
  /** HTTP status code of the fetched response. */
  readonly statusCode: number
  /** Decoded body, classified by content kind. */
  readonly body: WebFetchBody
  /** True when the provider capped the decoded body. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * The decoded body of a fetched resource. A CLOSED discriminated union owned by
 * `dsh-web`: the provider decodes the kind and `dsh-tool-web` renders it, so a
 * new kind is a coordinated change across known packages, not a plugin
 * extension. Consumers `switch` on `kind` ending in `default: assertNever(...)`
 * so adding a kind breaks compilation at every consumer until handled. Each arm
 * stays its own object literal even where fields coincide, so an arm can gain
 * fields the others lack.
 */
type WebFetchBody =
  | { readonly kind: 'html'; readonly content: string }
  | { readonly kind: 'text'; readonly content: string }
```

## 提供者可用性

提供者的 `available(): boolean` 是一個廉價的本地檢查（憑證是否存在、設定是否可解析），**禁止發起網路呼叫**。它是執行時選擇提供者的輸入，而不是健康檢查系統：`search()`／`fetch()` 會讀取它來選擇可用的提供者。選擇失敗時，呼叫方會收到可據以分支處理的結構化 `WebError`；其錯誤程式碼和訊息會說明缺失的 id 或存在歧義的候選集。

選擇從不依賴註冊順序、設定順序或 HMR（熱模組替換）順序：一項能力要麼有顯式的提供者 id（設定 `searchProvider`／`fetchProvider`，或填充同一欄位的對應環境變數），要麼在恰好只有一個可用提供者註冊時自動選擇；如果存在多個可用提供者卻未設定 id，則丟擲 `WEB_PROVIDER_AMBIGUOUS`，而不會選用最先註冊的提供者。

## 抓取網路策略

已交付的 Cordis、Code 與 Standard preset 會在所有 sandbox 和審批模式下暴露 `web_fetch`，無需逐次確認。檔案 sandbox preset 不管轄 Web 網路存取。需要確認步驟的部署必須新增 `tools/pre-execute` 策略或停用抓取。

HTTP 提供者會解析每個實際請求，拒絕包括透過目前 DNS64 字首抵達私有 IPv4 在內的非公開結果，固定已驗證的地址集合，並在每次同源重定向時重複強制執行。跨源重定向需要新的工具呼叫和新的公開地址驗證。這些檢查會阻止透過 SSRF 存取非公開目的地址，但不會阻止模型把資料傳送到公開 URL。

## 錯誤

`WebError extends HarnessError`（[core.md](core.zh.md) 錯誤分類體系），帶有 `code: string`（開放式，與其他 seam 的錯誤一致——`LlmError`、`SubagentError`），而非封閉聯合型別：提供者可以在不修改 `dsh-web` 的情況下丟擲自己的錯誤程式碼，消費方必須容忍未知錯誤程式碼。錯誤程式碼按所有者劃分。共享的 `WebRuntime` 約定會丟擲與 seam 無關的錯誤程式碼：`WEB_PROVIDER_UNAVAILABLE`、`WEB_PROVIDER_CONFIGURED_MISSING`、`WEB_PROVIDER_CONFIGURED_UNAVAILABLE`、`WEB_PROVIDER_AMBIGUOUS`、`WEB_DUPLICATE_PROVIDER`（註冊時的程式設計錯誤，類似 `LlmRuntime` 的 `DUPLICATE_ADAPTER`）、`WEB_ABORTED`，以及 `WEB_PROVIDER_ERROR`（提供者自身故障經 seam 暴露時使用的後備程式碼，包括 DNS、連線被拒絕、TLS 等網路或傳輸故障）。抓取傳輸層錯誤程式碼由 `dsh-web-fetch-http` 實作擁有，不同的抓取後端無需丟擲它們：`WEB_INVALID_URL`、`WEB_BLOCKED_URL`、`WEB_REDIRECT_BLOCKED`、`WEB_FETCH_TOO_LARGE`、`WEB_FETCH_TIMEOUT`、`WEB_UNSUPPORTED_CONTENT_TYPE`。

## 服務

`WebRuntime` 註冊搜尋與抓取提供者，以 `WEB_DUPLICATE_PROVIDER` 拒絕重複 id，並在執行時以結構化的選擇錯誤解析提供者。本地抓取後端僅接受 HTTP(S)、拒絕憑證、對每個 hostname 只解析一次、拒絕包含任一非公開 IPv4／IPv6 目的地址或經目前字首轉換到非公開 IPv4 的 NAT64 地址的解析結果、把請求連線固定到已驗證地址、對每一次同源重定向跳轉重複這些驗證、限制重定向次數、位元組數、字元數和時間，並解碼正文；展示由工具負責。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxweb--webruntime"></a>

### `ctx.web` — `WebRuntime`

The web access service. Registered as `ctx.web` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for search. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerSearchProvider(provider: WebSearchProvider): () => void

/**
 * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for fetch. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerFetchProvider(provider: WebFetchProvider): () => void

/**
 * Run one search through the selected provider. Resolves the provider at call
 * time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. The seam enforces `request.maxResults` on the result:
 * if the provider over-returns, `sources[]` is truncated and `truncated` set.
 * @param request - the query and optional result limit.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's results, capped to `request.maxResults`.
 */
async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>

/**
 * Retrieve one URL through the selected provider. Resolves the provider at
 * call time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. A non-2xx response is a result, not a throw.
 * @param request - the URL plus retrieval options.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the retrieval outcome; non-2xx responses resolve descriptively.
 */
async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
```

Source: [`packages/web/web/src/index.ts`](../../packages/web/web/src/index.ts)
<!-- END GENERATED cordis-surface -->
