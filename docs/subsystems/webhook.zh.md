# Webhook runtime

[English](webhook.md) | 中文

Webhook 子系統會把已透過身份驗證的外部交付轉換為可選的普通根 Session。提供者介面卡擁有身份驗證與通用 JSON 接收；受信任的程式化規則擁有條件與外部呼叫；`ctx.webhookRuntime` 擁有回呼生命週期以及基於 Workspace 的 Session 建立。[已實作決策](../../.agents/notes/implemented/feature/2026-08-22-fire-and-forget-webhook-sessions.zh.md)記錄了 runtime 為何不保留交付或完成狀態。

## 共享值

`WebhookRuleId`、`WebhookSourceId` 與 `WebhookDeliveryId` 是不透明字串。交付 id 僅用於來源資訊：runtime 既不儲存也不對它去重。

`WebhookEventMap` 可按提供者種類合併擴充功能。`WebhookEventOf<K>` 會選擇已知提供者事件，否則接納通用無損 JSON，從而讓樹外介面卡無需修改 runtime 包。

`VerifiedWebhookDelivery<K>` 包含 `kind`、已設定 `source`、提供者 `deliveryId`、規範化 `event` 與非負安全整數 `receivedAt`。runtime 會先驗證、分離並凍結完整值，再把它分發給多個規則。

`WebhookRule<K>` 包含唯一 id、提供者種類與 `run(delivery, signal)`。回呼可以執行任意受信任程式碼。它返回 `null` 或一個 `WebhookSessionRequest`，並且非同步工作若應在註冊解除安裝時停止，就必須觀察 signal。

`WebhookSessionRequest` 要求絕對 `workspacePath`、標題、文字提示詞、agent preset 與 permission preset。可選 `model` 會指定明確的提供者／模型路由與可選輸出 token 上限，並使用該介面卡的預設推理強度。省略時會快照包含推理強度的完整目前部署選擇，直到首個請求記錄持久 header。

## Fire-and-forget 分發

`dispatch()` 會快照匹配規則，彼此獨立地排程每個規則，並在任何回呼結算前返回。丟擲與拒絕按規則分別被包含。註冊 disposer 會先移除規則，再中止並排空活動呼叫，因此後續交付無法進入正在解除安裝的程式碼。

runtime 沒有佇列、重試、去重、執行狀態、崩潰重放、Agent 狀態監聽器或完成結果。重複交付可能建立重複 Session。唯一的活動操作表是私有 teardown 記帳，並隨程序消失。

## Session 建立

非 `null` 結果會在非同步預檢前生成快照。runtime 會驗證 permission 與 agent preset，解析或建立規範 Workspace，建立 Session cwd 等於 Workspace 路徑的 Agent，在釋出前掛載所選 agent preset，並在應用權限、標題與初始 follow-up 前持久附加 Session。

follow-up 是普通持久 user-role 訊息，使用 `source.kind: "webhook"`，並攜帶提供者／來源／交付／規則來源資訊。其 inbox 插入被接受時提交 webhook 操作。runtime 不執行特殊 flush，也不等待輪次；之後應用普通 Session persistence 與 Agent 生命週期。

附加失敗會在提示詞出現前釋放新 Agent。附加之後、提示詞接納之前的失敗會嘗試脫離 Workspace 並釋放 Agent，且不會取代原始錯誤。預檢期間自動建立的 Workspace 會保留，因為另一個並行呼叫者可能已經使用它。

## GitHub 介面卡

`@deepseek-ai/dsh-webhook-github` 在注入的 WebServer 上註冊精確路由，為每次請求解析憑證引用，在解析前驗證未改動的 `application/json` body，並在記憶體分發後立即返回 `202`。它的規範化事件保證為已簽名的無損 JSON 物件；規則負責驗證自己消費的事件特定欄位。

[GitHub 評審指南](../user/guide/github-review.zh.md)把該路由掛載在隔離的第二個 WebServer 上，因此暴露 webhook 入口不會暴露瀏覽器 API。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebhookruntime--webhookruntime"></a>

### `ctx.webhookRuntime` — `WebhookRuntime`

Fire-and-forget rule runtime. Session creation is the only built-in action.

```ts cordis-catalog
/**
 * Register one trusted programmatic rule.
 * @param rule - unique id, provider kind, and arbitrary callback.
 * @returns awaitable effect disposer that aborts and drains this rule's active callbacks.
 */
register<K extends string>(rule: WebhookRule<K>): () => Promise<void>

/**
 * Start every currently matching rule and return before any callback settles.
 * @param delivery - authenticated provider data; snapshotted before dispatch.
 * @throws synchronously when the runtime is closing or the delivery is malformed.
 */
dispatch<K extends string>(delivery: VerifiedWebhookDelivery<K>): void
```

Source: [`packages/webhook/webhook/src/index.ts`](../../packages/webhook/webhook/src/index.ts)
<!-- END GENERATED cordis-surface -->
