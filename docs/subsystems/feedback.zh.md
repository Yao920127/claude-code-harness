# 訊息回饋

[English](feedback.md) | 中文

[`@deepseek-ai/dsh-message-feedback`](../../packages/feedback/message-feedback)擁有針對單條 assistant 訊息的可編輯回饋。權威 Session 日誌儲存 `feedback/message-put` 和 `feedback/message-delete`；不可變的 Session 級備註仍使用 `feedback/record`，由 [`@deepseek-ai/dsh-command-feedback`](../../packages/feedback/command-feedback) 連同兩種回饋共用的 `FeedbackCategory` 分類表一起擁有。三者都是僅寫日誌的事件，絕不進入模型上下文。

來源：[`packages/feedback/message-feedback/src/types.ts`](../../packages/feedback/message-feedback/src/types.ts)

## 公開型別

```ts type-equiv
/** Opaque compare-and-set token for one exact feedback item revision. */
type MessageFeedbackVersion = Branded<'MessageFeedbackVersion'>
```

```ts type-equiv
/** The human's overall judgment of one assistant message. */
type MessageFeedbackRating = 'positive' | 'negative'
```

```ts type-equiv
/** One current feedback value and its opaque mutation token. */
interface MessageFeedbackItem {
  /** Stable identity of the assistant message inside the owning Session. */
  readonly messageId: MessageId
  /** Overall positive or negative judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional explanation, preserved verbatim after validation. */
  readonly note?: string
  /** Category the human filed the judgment under. */
  readonly category?: FeedbackCategory
  /** Equality-only token replaced by every material create or update. */
  readonly version: MessageFeedbackVersion
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned time of the most recent material update. */
  readonly updatedAt: number
}
```

```ts type-equiv
/** A material creation or edit, retaining its complete current value. */
interface MessageFeedbackPut {
  /** Owning Session; inherited feedback in a fork belongs to its parent. */
  readonly sessionId: SessionId
  /** Value after this mutation, including the original creation time. */
  readonly item: MessageFeedbackItem
}
```

```ts type-equiv
/** A material deletion of one current feedback item. */
interface MessageFeedbackDelete {
  /** Session that owns the deleted feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback was removed. */
  readonly messageId: MessageId
}
```

```ts type-equiv
/** Read all message feedback belonging to one persisted Session lifecycle. */
interface MessageFeedbackListRequest {
  /** Session whose feedback events should be read. */
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Current feedback values for one Session, in first-creation order. */
interface MessageFeedbackListValue {
  /** Fresh immutable item snapshots. */
  readonly items: readonly MessageFeedbackItem[]
}
```

```ts type-equiv
/** Create or replace feedback for one assistant message. */
interface MessageFeedbackPutRequest {
  /** Persisted Session that owns the target message. */
  readonly sessionId: SessionId
  /** Target assistant-message identity. */
  readonly messageId: MessageId
  /** Desired overall judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional non-blank explanation. */
  readonly note?: string
  /** Optional category; absent keeps the item uncategorized. */
  readonly category?: FeedbackCategory
  /** Observed item version, or `null` to require that no item exists. */
  readonly ifVersion: MessageFeedbackVersion | null
}
```

```ts type-equiv
/** Delete feedback for one message after observing its current version. */
interface MessageFeedbackDeleteRequest {
  /** Session that owns the feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback should be absent after this operation. */
  readonly messageId: MessageId
  /** Observed item version; ignored when the item is already absent. */
  readonly ifVersion: MessageFeedbackVersion
}
```

```ts type-equiv
/** Idempotent deletion acknowledgement. */
interface MessageFeedbackDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}
```

```ts type-equiv
/** No persisted Session header exists for the requested id. */
interface MessageFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** The id does not name a derived, append-origin assistant message. */
interface MessageFeedbackTargetNotFound {
  readonly code: 'target-not-found'
  readonly sessionId: SessionId
  readonly messageId: MessageId
}
```

```ts type-equiv
/** A material mutation did not match the addressed item's current version. */
interface MessageFeedbackVersionConflict {
  readonly code: 'version-conflict'
  /** Authoritative current item, or `null` when it does not exist. */
  readonly current: MessageFeedbackItem | null
}
```

```ts type-equiv
/** A supplied note contains no non-whitespace character. */
interface MessageFeedbackNoteBlank {
  readonly code: 'note-blank'
}
```

```ts type-equiv
/** A supplied note exceeds the configured UTF-8 byte limit. */
interface MessageFeedbackNoteTooLarge {
  readonly code: 'note-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** Failures shared by the public message-feedback operations. */
type MessageFeedbackFailure =
  | MessageFeedbackSessionNotFound
  | MessageFeedbackTargetNotFound
  | MessageFeedbackVersionConflict
  | MessageFeedbackNoteBlank
  | MessageFeedbackNoteTooLarge
```

```ts type-equiv
/** Successful public operation result. */
interface MessageFeedbackSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected public operation result with a stable business failure. */
interface MessageFeedbackRejected<E extends MessageFeedbackFailure> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Result returned by the message-feedback `list` operation. */
type MessageFeedbackListResult =
  | MessageFeedbackSuccess<MessageFeedbackListValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound>
```

```ts type-equiv
/** Result returned by the message-feedback `put` operation. */
type MessageFeedbackPutResult =
  | MessageFeedbackSuccess<MessageFeedbackItem>
  | MessageFeedbackRejected<
    | MessageFeedbackSessionNotFound
    | MessageFeedbackTargetNotFound
    | MessageFeedbackVersionConflict
    | MessageFeedbackNoteBlank
    | MessageFeedbackNoteTooLarge
  >
```

```ts type-equiv
/** Result returned by the message-feedback `delete` operation. */
type MessageFeedbackDeleteResult =
  | MessageFeedbackSuccess<MessageFeedbackDeleteValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackVersionConflict>
```

## Session 回饋型別

來源：[`packages/feedback/command-feedback/src/types.ts`](../../packages/feedback/command-feedback/src/types.ts)

```ts type-equiv
/** One of the fixed feedback categories; the ids are durable log vocabulary. */
type FeedbackCategory =
  | 'task-result'
  | 'instruction-following'
  | 'product-interaction'
  | 'service-stability'
  | 'resource-cost'
  | 'security-privacy-permission'
  | 'other'
```

```ts type-equiv
/**
 * One recorded human remark about a Session. Both members are optional: a
 * submission with neither still records that the human asked for the
 * Session to be reviewed, which is what authorizes log delivery.
 */
interface FeedbackRecord {
  /** Free-text remark with surrounding whitespace removed; never empty when present. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Record one Session-level remark through the Host Remote. */
interface SessionFeedbackRecordRequest {
  /** Live Session the remark describes. */
  readonly sessionId: SessionId
  /** Free-text remark; blank text is recorded as absent. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Stable postcondition of a recorded remark. */
interface SessionFeedbackRecordValue {
  /** The remark is appended to the Session log; flushing follows the Session's own schedule. */
  readonly recorded: true
}
```

```ts type-equiv
/** No live Session carries the requested id. */
interface SessionFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Result returned by the `sessionFeedback.record` operation. */
type SessionFeedbackRecordResult =
  | { readonly ok: true; readonly value: SessionFeedbackRecordValue }
  | { readonly ok: false; readonly error: SessionFeedbackSessionNotFound }
```

## 資料與並行

目前條目由 payload 中 `sessionId` 與所屬 Session 匹配的權威回饋事件歸約得到。每個條目攜帶好評或差評、可選備註、可選分類、Host 分配的 `createdAt`/`updatedAt` 時間戳及自己的 opaque version。version 只能用於相等比較，且只與目標訊息比較；呼叫方不能排序或自行合成它。

`put` 採用嚴格樂觀並行：已有條目的每次請求都必須匹配目前 `ifVersion`，即使請求不會改變目標值（重複已存評分、備註與分類的 put）。衝突會返回權威目前條目（不存在時為 `null`），因此呼叫方無需額外讀取，即可協調丟失回應或並行編輯。刪除已經不存在的條目同樣成功。按 Session 劃分的佇列序列執行讀取與變更；cold 變更在讀取、比較、追加和 flush 期間持有持久化寫控制代碼。匹配版本的無變更操作不追加事件。

## 目標與生命週期權威

live 持有者的記憶體日誌直接提供目標 Session 的觀測；cold 讀取使用 `SessionPersistence.open(id, 'read')` 控制代碼，變更則使用寫控制代碼。兩條路徑都不建構 Session 或 Agent。先由 `stat(id)` 預檢明確不存在；`stat` 已確認存在的 Session 若讀取失敗，會按基礎設施故障原樣傳播。`put` 只接受具有指定 `MessageId` 的非空、append-origin `assistant/message`；replacement-origin、僅承載 usage 的空記錄和非 assistant 記錄都不是回饋目標。

fork 種子可以包含父 Session 的回饋事件，但 payload 保留父級 `sessionId`，因此不會成為子 Session 的目前回饋。刪除條目會追加刪除標記；早先的評分與備註仍保留在日誌中。

## 持久化與 Remote 約定

成功的訊息回饋變更會等待權威持久化完成：live 操作透過所屬 Session 追加，並要求有 `ctx.sessions.flush` 監聽器參與；cold 操作透過寫控制代碼追加並 flush。持久化故障會原樣傳播，不會報告成功。`maxNoteBytes` 為必填項，按 UTF-8 位元組限制備註文字；Web Host 組合將其設為 `8192`。該包透過 `TypertRemoteService` 與 `@Remote` 釋出 Host `messageFeedback.list`、`messageFeedback.put` 和 `messageFeedback.delete` 一元 Remote 約定；`command-feedback` 以同樣方式釋出面向 live Session 的 Session 級備註 `sessionFeedback.record`。下方生成的 Cordis API 是方法級權威。

外掛釋放會關閉操作接納，並排空已進入各 Session 佇列的工作。

預設情況下，[`session-log-deepseek`](../../packages/session/session-log-deepseek/README.zh.md) 會在後續符合條件的 DeepSeek 請求中，把回饋作為普通 `dsh_session_log` 字尾的一部分傳送；組合可用 `enabled: false` 停用它。記錄回饋不會觸發 LLM 請求，也不會單獨上傳 `dsh_feedback`。對於非 DeepSeek 路由，[OTel 後端](../../packages/session/session-telemetry-otel/README.zh.md)可以將權威日誌字首釋放至已記錄的回饋。命令確認文字確認記錄並標識 Session 與匿名使用者，不報告遙測策略或投遞結果。

## Web 介面

[`@deepseek-ai/dsh-client-ui-message-feedback`](../../packages/client/ui-message-feedback) 是瀏覽器側消費方。`@deepseek-ai/dsh-api-remotes` 掛載生成的 `messageFeedback` 與 `sessionFeedback` 貢獻，因此該外掛呼叫 `ctx.remote.messageFeedback` 與 `ctx.remote.sessionFeedback`，不接觸傳輸層。

控制元件是 `conversation.chat.assistant-actions` list slot 的 `feedback` 條目（order 10），該 slot 由 `ui-conversation` 宣告，並渲染在已定稿助手訊息的 IconActions 行內。`AssistantMessageNode` 攜帶來自 `assistant/message` 事件的可選 `messageId`。被中斷凍結的部分輸出沒有該欄位，渲染點在欄位缺失時跳過該 slot。該操作欄每個 Turn 渲染一次，位於收尾的助手訊息上：Host 接受每條 append-origin 步驟訊息作為目標，但多步驟 Turn 中較早的步驟渲染的是工具行而非可評分正文，因此 UI 暴露的範圍比 Host 約定允許的更窄。

每個 Session 一個 `MessageFeedbackController`，支撐該 Session 內所有訊息的控制元件：一次 `list` 讀取即填充整段對話，且延遲到首次 hover 或 focus 才發起，而非掛載時觸發。每次變更把該 controller 最後觀察到的版本作為 `ifVersion` 傳送；`version-conflict` 回應攜帶權威條目，controller 據此對帳而不重新拉取。變更按 Session 序列，排隊操作與已提交版本比較。注入的 `retract` 操作會在該佇列內重新檢查已提交評分，並在並行變更後變為無操作，因此陳舊 UI 無法繞過彈出視窗記錄裸評分。`connection/reset` 只重新整理已讀取過的 Session。

任一未記錄的評分都會開啟該 Session 的回饋彈出視窗，即 `conversation.input.overlay` 的 `feedback-dialog` 條目：共用的 Modal 卡片，裡面是七個分類標籤和一個詳情框。提交會 put 所選評分，帶上所選分類與去除首尾空白的描述，兩者也可都不帶；成功會關閉彈出視窗並顯示確認 toast，失敗則保留彈出視窗與草稿並顯示警告 toast。不帶文字的 `/feedback`（`ui-commands` 以 `action` 路由的一個裝飾）為 Session 開啟同一個彈出視窗，隨後透過 `sessionFeedback.record` 記錄；`/feedback <text>` 仍走主機命令路徑。再次點選已記錄的評分會直接撤回，不開啟彈出視窗。

## 邊界與限制

- 操作佇列僅在程序內生效；cold 寫入排他性依賴所選持久化提供者。
- 刪除只移除目前條目，不會抹除 append-only 日誌或已投遞字尾中的早先備註。
- 請求若恰好落在 live detach 之後、persistence catalog 物化 header 之前的極短視窗，可能收到 `session-not-found`；呼叫方應在 retirement materialization 後重試。
- cold 請求讀取完整日誌；服務沒有條目數或聚合位元組上限。`maxNoteBytes` 只限制每條備註。
- Host 約定不記錄已認證的 actor 或審計身份，因此假設呼叫方邊界可信。
- Web 控制元件只出現在對話檢視。trajectory 與 waterfall 檢視不渲染回饋條目，儘管它們的助手節點攜帶相同的 `messageId`。
- Web 控制器不消費回饋日誌事件，因此另一個標籤頁的評分要等到重連或下一次衝突回應才可見，不會立即出現。
- 彈出視窗不預先驗證 `maxNoteBytes`；針對訊息的超長描述在提交時以 `note-too-large` 失敗，而不是在輸入過程中。Session 級備註沒有大小上限，`/feedback` 命令從來也沒有。
- `sessionFeedback.record` 只服務 live Session，否則回答 `session-not-found`；彈出視窗開啟期間 Session 退役時，彈出視窗會報告該失敗。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmessagefeedback--messagefeedbackservice"></a>

### `ctx.messageFeedback` — `MessageFeedbackService`

Session-log service; cold operations never construct a Session or Agent.

```ts cordis-catalog
/**
 * Read current feedback from the canonical log.
 * @param request - Session to inspect.
 * @returns immutable items or a definite persistence miss.
 */
@Remote('list') list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>

/**
 * Create or replace feedback after checking its current version.
 * Matching no-ops retain the version and append no event.
 * @param request - Target, desired value, and observed item version.
 * @returns the durable item or an explicit business failure.
 */
@Remote('put') put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>

/**
 * Delete one item after checking its version; absence succeeds without an event.
 * @param request - Session, message, and observed item version.
 * @returns the stable absent postcondition or an explicit failure.
 */
@Remote('delete') delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>
```

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)

<a id="ctxsessionfeedback--sessionfeedbackservice"></a>

### `ctx.sessionFeedback` — `SessionFeedbackService`

Host Remote through which a product surface records a Session-level remark.

```ts cordis-catalog
/**
 * Record one remark on a live Session.
 * @param request - target Session plus the optional text and category.
 * @returns the recorded postcondition, or `session-not-found` when no live
 * Session carries the id.
 */
@Remote('record') record(request: SessionFeedbackRecordRequest): Promise<SessionFeedbackRecordResult>
```

Source: [`packages/feedback/command-feedback/src/index.ts`](../../packages/feedback/command-feedback/src/index.ts)

<a id="feedback-events"></a>

### `feedback/*` events

<a id="feedbackcommitted--parallel"></a>

#### `feedback/committed` — parallel

Observe a durable cold feedback mutation without publishing a live Session. Observers run before write ownership is released and must not await another message-feedback operation for this Session. The payload is borrowed read-only; deep-clone it before transferring ownership (for example, to Session.fromRestore).

```ts cordis-catalog
/**
 * Observe a durable cold feedback mutation without publishing a live Session.
 * Observers run before write ownership is released and must not await
 * another message-feedback operation for this Session. The payload is borrowed
 * read-only; deep-clone it before transferring ownership (for example, to Session.fromRestore).
 * @param inspection - committed canonical prefix, including the feedback as its last event.
 * @mode parallel
 */
'feedback/committed'(inspection: SessionInspection): void
```

Types: [SessionInspection](persistence.zh.md)

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)
<!-- END GENERATED cordis-surface -->
