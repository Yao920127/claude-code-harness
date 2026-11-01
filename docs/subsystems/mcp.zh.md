# MCP

[English](mcp.md) | 中文

## 摘要

模型上下文協定（Model Context Protocol，MCP）讓模型使用外部伺服器提供的工具。每個已設定伺服器都會提供普通 Harness 工具，支援取消、權限檢查、結果記錄和受支援的影象輸出。呼叫方作用域中設定了伺服器時，共享工具負責發現和讀取資源，伺服器指令則加入已記錄的系統提示詞。官方 SDK 協商現代或受支援的舊版協定。本參考頁介紹 MCP 包組的職責、作用域和組合選擇；伺服器設定由[用戶端 README](../../packages/mcp/mcp-client/README.zh.md) 維護。

## 目錄

- [設定](#configuration)
- [職責與作用域](#responsibilities-and-scope)
- [協定與結果](#protocol-and-results)
- [資源與指令](#resources-and-instructions)
- [資源提供者型別](#resource-provider-types)
- [限制](#limits)
- [延伸閱讀](#further-reading)

-----

<a id="configuration"></a>
## 設定

MCP 伺服器需要主動設定。在目標 Cordis 作用域中，為每臺伺服器設定一個 `@deepseek-ai/dsh-mcp-client` 條目。每個隨附 profile 都提供[工具註冊表](tools.zh.md)，並統一掛載共享資源服務一次；使用者只需設定用戶端條目。呼叫方沒有可見的已設定伺服器時，在 native 或 PTC 模式下都不會獲得 MCP 提示詞文字或工具。

| 選擇 | 設定維護位置 |
|---|---|
| 伺服器身份、本地程序或 HTTP 端點、憑證和程序環境 | [用戶端設定](../../packages/mcp/mcp-client/README.zh.md#use-this-package) |
| 工具與資源請求超時、啟動失敗策略和重連 | [用戶端設定](../../packages/mcp/mcp-client/README.zh.md#use-this-package) |
| 資源發現與讀取 | 隨附 profile 已包含 [MCP 資源服務](../../packages/mcp/mcp-resources/README.zh.md#use-this-package)；該服務沒有設定欄位 |
| 伺服器指令大小限制 | 用戶端 `maxInstructionBytes`；組合提供[系統提示詞裝配](system-prompt.zh.md) |
| 權限決策和受支援的影象輸出 | [工具執行](tools.zh.md)和[附件](attachment.zh.md) |

協定協商遵循 SDK 支援的修訂版；產品沒有強制指定協定修訂版的設定。[設定目錄](../config-catalog.zh.md#deepseek-aidsh-mcp-client) 列出用戶端接受的欄位和預設值。

-----

<a id="responsibilities-and-scope"></a>
## 職責與作用域

用戶端是每伺服器一個的連線外掛，也是 Harness 工具註冊表的消費者。它不釋出共享的 `ctx.mcp` 服務。外部伺服器實作 MCP 操作；SDK 擁有協定交換；用戶端將發現的工具適應到 Harness 執行過程。

`mcp-resources` 擁有共享資源工具，並在呼叫方作用域中選擇提供者。每個 MCP 用戶端透過自己的連線提供資源操作。作用域中的首個提供者啟用本地共享工具，移除最後一個提供者時移除這些工具；繼承的提供者仍然可見。服務獨立於任何單一用戶端擁有這些工具註冊。只要可見的用戶端條目保持啟用，連線失敗就不會移除共享資源工具。

設定的 `serverName` 在註冊作用域內標識伺服器。同一作用域中的兩個條目不能佔用相同名稱；不同 Agent 作用域可以複用該名稱。公開工具名包含設定的伺服器名稱，因此不同伺服器的同名工具仍可區分。註冊副作用擁有名稱和已發現工具；外掛釋放時關閉連線並移除其貢獻。

[原生 Cua Driver 提供者](../../packages/experimental/computer-use-cua-driver-native/README.zh.md) 複用用戶端匯出的結果介面卡，無需開啟 MCP 連線。桌面提供者選擇屬於[計算機使用子系統](computer-use.zh.md)。

-----

<a id="protocol-and-results"></a>
## 協定與結果

stdio 和 Streamable HTTP 都使用官方 SDK 的協商、發現、協定總和檢查碼取消機制。工具列表變化透過舊版通知或現代訂閱觸發發現。重新整理失敗時保留上一代工具；連線恢復遵循[用戶端生命週期](../../packages/mcp/mcp-client/README.zh.md#use-this-package)。

結果介面卡為程式化呼叫方保留規範 MCP JSON，並準備普通工具內容。受支援的影象使用附件系統；不受支援的富內容產生明確的文字診斷。工具註冊表仍決定策略失敗和結果替換。[工具契約](tools.zh.md) 維護記錄和最終呈現規則；[用戶端結果參考](../../packages/mcp/mcp-client/README.zh.md#use-this-package) 維護 MCP 特有的投影細節。

-----

<a id="resources-and-instructions"></a>
## 資源與指令

資源呼叫必須顯式指定設定的伺服器名稱。系統提示片語裝服務可用時，資源服務從派發所用的同一註冊表列出呼叫方可見的名稱，包括沒有工具或指令的伺服器。共享註冊表在分發前，於呼叫 Agent 的作用域中解析該名稱；不可用的伺服器會在發出網路請求前失敗。發現和讀取均按需執行，也支援只提供資源而不提供工具的伺服器。[資源包](../../packages/mcp/mcp-resources/README.zh.md) 維護分頁和內容渲染規則；其生成的工具 schema 位於[工具目錄](../tool-catalog.zh.md#deepseek-aidsh-mcp-resources)。

資源提供者仍由連線擁有。作用域釋放時移除註冊；MCP 用戶端控制取消和恢復。規範結果為程式化呼叫方保留完整 JSON，文字投影則以描述替換二進位制 blob。返回的文字進入普通工具歷史；伺服器連線本身不會觸發內容讀取。

組合包含系統提示詞裝配時，用戶端將非空白的伺服器指令釋出為帶伺服器歸屬的作用域章節。指令保持字面文字，並在釋出前透過設定的大小限制。替換連線僅在發現成功後釋出指令；缺少指令時不新增章節。[系統提示詞子系統](system-prompt.zh.md) 維護裝配與記錄規則。

-----

<a id="resource-provider-types"></a>
## 資源提供者型別

連線提供者接收一個操作與原始工具執行物件，其中包含呼叫方和取消訊號。

```ts type-equiv
/** One supported resource operation, with server-owned cursors and URIs. */
type McpResourceRequest =
  | { method: 'resources/list' | 'resources/templates/list'; cursor?: string }
  | { method: 'resources/read'; uri: string }
```

```ts type-equiv
/** One configured server's resource access, owned by its MCP connection plugin. */
interface McpResourceProvider {
  /**
   * Run an operation against one live connection generation.
   * @param request - MCP resource method and parameters.
   * @param exec - caller identity and cancellation for this invocation.
   * @returns the protocol result as lossless JSON.
   */
  request(request: McpResourceRequest, exec: ToolExecution): Promise<JsonValue>
}
```

-----

<a id="limits"></a>
## 限制

不支援 MCP 提示詞範本、人工輸入徵詢、基於任務的執行和資源訂閱。資源工具需要呼叫方可見的已設定伺服器；二進位制資源保留為程式化資料，模型接收其文字描述。沒有工具能力的伺服器以空工具集連線。連線和發現超時遵循 SDK；用戶端沒有對應的獨立設定。

-----

<a id="further-reading"></a>
## 延伸閱讀

- [MCP 包組](../../packages/mcp/README.zh.md) — 包入口。
- [MCP 資源](../../packages/mcp/mcp-resources/README.zh.md) — 共享工具與資源提供者語義。
- [資源可見性決策](../../.agents/notes/implemented/feature/2026-09-13-mcp-resources-in-profiles.zh.md) — profile 統一掛載及由已設定伺服器決定的可見性。
- [第三方記憶伺服器](../user/guide/mcp-memory.zh.md) — 產品設定指南。
- [協定協商決策](../../.agents/notes/implemented/feature/2026-09-12-mcp-sdk-protocol-negotiation.zh.md) — SDK 職責與相容性決策。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmcpresources--mcpresourceruntime"></a>

### `ctx.mcpResources` — `McpResourceRuntime`

Scoped resource access plus three tools shared by configured MCP servers.

```ts cordis-catalog
/**
 * Register one server and expose resource tools while that scope has providers.
 * @param server - configured server name, unique in this scope.
 * @param provider - connection-owned resource operations.
 * @returns the effect disposer for this exact registration.
 */
register(server: string, provider: McpResourceProvider): () => void
```

Source: [`packages/mcp/mcp-resources/src/index.ts`](../../packages/mcp/mcp-resources/src/index.ts)
<!-- END GENERATED cordis-surface -->
