# 瀏覽器操作

[English](browser-use.md) | 中文

瀏覽器操作讓模型透過設定的後端檢查與操作網頁。DSH 擁有任務迴圈；提供者提供瀏覽器操作，並在一個即時 Session 的多個輪次之間保留瀏覽器狀態。

## 選擇提供者

在同一組閤中掛載 [`dsh-browser-use`](../../packages/browser-use/browser-use/README.zh.md) 和一個提供者。這些提供者是實驗性公共 npm 包，需要顯式啟用。它們最初支援的瀏覽器引擎是 Chromium。

| 提供者 | 整合方式 |
|---|---|
| [Playwright MCP](../../packages/experimental/browser-use-playwright-mcp/README.zh.md) | Playwright 的瀏覽器控制 MCP 工具 |
| [Chrome DevTools MCP](../../packages/experimental/browser-use-chrome-devtools-mcp/README.zh.md) | 透過 MCP 進行 Chrome DevTools 檢查與控制 |
| [Stagehand](../../packages/experimental/browser-use-stagehand-native/README.zh.md) | 原生瀏覽器操作，支援 AI（人工智慧）輔助的動作、觀測與提取 |

共享服務只註冊名稱，並拒絕任何第二次提供者註冊，包括同名實例。它不包含通用瀏覽器操作方法、瀏覽器資源或模型控制的選擇器。Profile 或 preset 中的提供者設定為此次啟用選擇啟動或附加模式。

## Session 所有權

啟動的瀏覽器屬於使用它的確切即時 Agent 與 Session。跨輪次的呼叫複用該瀏覽器。Session 執行時釋放時關閉其啟動的資源；重新載入或 fork Session 時建立全新瀏覽器狀態。瀏覽器 profile 和登入狀態不會從 Session 日誌恢復。

附加的瀏覽器仍歸外部所有。提供者在該提供者實例內將瀏覽器保留給一個 Session，保留現有瀏覽器狀態，並拒絕另一個 Session 同時附加。清理會斷開連線並保持外部瀏覽器執行。獨立 DSH 程序與其他用戶端不受此保留約束。

提供者關閉時先停止接收工具呼叫，並等待自有工作與資源清理完成，再釋放共享提供者註冊。取消無法撤銷已交付的瀏覽器操作。

## MCP 初始化

MCP 提供者為其載入後建立的每個活動 Agent 初始化一個用戶端。現有的序列 `agent/created` 事件等待連線和發現結束後，建立或恢復才完成，排隊輸入才開始執行。用戶端跨輪次歸 Session 所有。啟動失敗或取消會拒絕建立或恢復，並觸發用戶端清理。

如果附加連線已被佔用，本次啟用不使用瀏覽器，但繼續執行，後續輪次不會重試。連線釋放後，新建立或恢復的啟用可以取得它。載入或重新載入提供者不會接管已經活動的 Session；[共享執行時](../../packages/experimental/browser-use-runtime/README.zh.md)擁有這些初始化規則。

## 工具與記錄結果

提供者工具使用常規 DSH 執行管線與 Session 日誌。提供者擁有自己的工具 schema、結果渲染、影象支援、設定和上游限制；共享服務不新增模型可見內容。Stagehand 的 AI 輔助操作使用其顯式設定的原生模型，DSH 保留任務迴圈。DSH 模型路由、憑證複用、底層推理請求/回應捕捉，以及與 Session 用量計量的整合均屬暫緩工作；返回的 SDK 資料和中繼資料仍作為普通工具結果記錄。

瀏覽器 MCP 連線還提供[資源和伺服器指令](mcp.zh.md)。發往瀏覽器伺服器的資源呼叫使用其 Session 佇列，並拒絕其他 Session 的請求；伺服器指令只會組裝到所屬 Session 的提示詞中。

[決策記錄](../../.agents/notes/implemented/architecture/2026-09-12-browser-use-provider-registration.zh.md)解釋只註冊名稱的服務與按 Session 管理的所有權。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowseruse--browseruseregistry"></a>

### `ctx.browserUse` — `BrowserUseRegistry`

Owns one optional provider registration in the shared browser-use service.

```ts cordis-catalog
/**
 * Reserve the sole provider slot until the contribution is disposed.
 * A second registration fails even when it repeats the current name. Providers
 * must stop their tools and await owned work before releasing this registration.
 * @param name - provider-owned name used in registration diagnostics.
 * @returns the effect disposer for this exact registration.
 */
register(name: BrowserUseProviderName): () => Promise<void>
```

Source: [`packages/browser-use/browser-use/src/index.ts`](../../packages/browser-use/browser-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
