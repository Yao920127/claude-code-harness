# 主機級 Schedule

[English](schedule.md) | 中文

Schedule 獨立於 Session 的載入狀態儲存提醒，並將其投遞到原 Session。本頁記錄 [`types.ts`](../../packages/schedule/schedule/src/types.ts) 中的持久與模型可見型別；[包 README](../../packages/schedule/schedule/README.zh.md) 負責組合方式與提醒文字格式。

## 持久記錄

`ScheduleId` 是全域唯一的[品牌化 ID](core.zh.md#branded-ids)。版本 1 的 `schedule` storage domain 的 `tasks` 表將每條 `ScheduleRecord` 與原始 `sessionId` 繫結，並儲存 `status: 'active' | 'inactive'` 和可選的 `lastDelivery`。缺少狀態的記錄規範化為 `active`，不掃描或重建歷史 Session。建立時將目標規範化為 RFC 3339 UTC `scheduledAt`；`after` 保留提交的延遲，`every` 保留固定間隔，`daily` 與 `weekly` 保留規範化後的本地 `time` 及顯式 `timeZone`，`cron` 保留規範化後的五欄位 `expression` 及顯式 `timeZone`。每日、每週與 cron 記錄解碼保留已提交時點及已儲存的時區拼寫。已儲存的任務記錄宣告必填的 `title`，即任務介面顯示的短名稱；建立時必須提供該欄位，且絕不從指令派生。任何已儲存記錄都不得缺少標題：`title` 缺失、去除首尾空白後為空、帶首尾空白或超過 120 個字元的已儲存記錄都會以 `ScheduleLogError` 拒絕持久化解碼；schedule domain 未宣告備份並跳過的策略，因此一條這樣的已儲存任務會拒絕整個 domain 的開啟，而不是被丟棄。僅顯式刪除會移除任務；此前已物理刪除的任務不會被恢復或虛構。

```ts type-equiv
/** Durable one-shot reminder created from a positive delay. */
interface AfterScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a delayed one-shot reminder. */
  readonly kind: 'after'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Positive safe-integer delay accepted at creation. */
  readonly afterSeconds: number
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable one-shot reminder created from an absolute instant. */
interface AtScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for an absolute one-shot reminder. */
  readonly kind: 'at'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable fixed-rate reminder aligned to creation or its most recent interval edit. */
interface EveryScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a fixed-rate recurring reminder. */
  readonly kind: 'every'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Fixed safe-integer interval, never below one minute. */
  readonly everySeconds: number
  /** Next anchor-aligned occurrence while active, or final occurrence when inactive. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable daily wall-clock reminder; gaps skip a date and overlaps use the earlier instant. */
interface DailyScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a daily wall-clock reminder. */
  readonly kind: 'daily'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Local time normalized to HH:mm:ss.SSS. */
  readonly time: string
  /** Explicit IANA zone; equivalent timing edits retain the stored spelling. */
  readonly timeZone: string
  /** Committed next UTC instant while active, or final occurrence when inactive. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** One-shot task variants. */
type OneShotScheduleRecord = AfterScheduleRecord | AtScheduleRecord
```

```ts type-equiv
/** Recurring Host task variants. */
type RecurringScheduleRecord = EveryScheduleRecord | DailyScheduleRecord | WeeklyScheduleRecord | CronScheduleRecord
```

```ts type-equiv
/** Reminder rule and target, stored with its original Session binding. */
type ScheduleRecord = OneShotScheduleRecord | RecurringScheduleRecord
```

## 絕對時間輸入

`at` 選擇器可以是嚴格且帶偏移量的 RFC 3339 字串，也可以是精確的本地日曆物件。本地形式讓這種解釋在工具邊界保持顯式：

```ts type-equiv
/** Structured local-calendar input accepted by creation and timing edits. */
interface LocalAtInput {
  /** Four-digit ISO calendar date. */
  readonly date: string
  /** Local wall-clock time with optional one-to-three digit milliseconds. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

```ts type-equiv
/** Absolute selector accepted by creation and timing edits. */
type AtInput = string | LocalAtInput
```

釋出的 Web bundle 會掛載 time-context，它為每條提示詞采樣瀏覽器的 IANA 時區。當 open turn 只有一個無歧義的瀏覽器時區時，Time-context 會告訴模型按該請求本地時區解釋未明確限定時區的自然語言日期和時間；瀏覽器時區記錄混合或缺失時，則告訴模型詢問使用者。該指引不是持久 Session 預設值：模型仍必須在字串形式中傳入偏移量，或在本地形式中傳入 `time_zone`；Schedule 絕不會讀取瀏覽器、Session、程序或模型上下文。

Schedule 會拒絕無效偏移量與時區、不帶偏移量的字串、非未來目標，以及落在夏令時缺口內的本地時間。遇到夏令時重疊時，會選擇第一次出現的較早時點。建立成功後只儲存規範化後的 UTC `scheduledAt`，因此回放絕不依賴環境時區狀態。

<a id="daily-wall-clock-input"></a>
## 每日本地鐘錶時間輸入

`daily` 是與 `after_seconds`、`at`、`every_seconds`、`weekly` 和 `cron` 互斥的建立選擇器之一。例如，`daily: { time: '23:00:00', time_zone: 'Asia/Shanghai' }` 選擇該時區每個符合條件的本地日期的 23:00。物件必須精確包含以下欄位，不包含日期、偏移量或間隔：

```ts type-equiv
/** Daily local-time selector accepted by creation and timing edits. */
interface DailyInput {
  /** Local HH:mm:ss time with optional one-to-three fractional digits. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

建立時要求 `HH:mm:ss` 及可選的一至三位小數秒，拒絕閏秒和 `24:00`，將顯式 IANA 時區規範化，並以 `HH:mm:ss.SSS` 儲存 `time`。首個 `scheduledAt` 嚴格晚於建立時刻。不存在的本地時間或整個日期被跳過；重疊時間選擇較早時點，每個本地日期一次。若較早時點已過去，較晚的重複時點不符合條件。僅 UTC 目標年份受 0001–9999 範圍約束；UTC 範圍邊緣的本地日期可以落在第 0 年或第 10000 年。

已儲存的下一目標是已提交的 UTC 時點。主機解碼器與重新啟動保留該時點，不依據時區規則重新解析；規範名稱變化後，有效的已儲存時區別名仍可讀取。後續目標使用主機目前的 IANA 資料。下一目標必須晚於投遞判斷時刻，並且其本地日期晚於所選發生時點的日期。沒有可表示的未來 UTC 目標時，建立以 `time_out_of_range` 失敗。

## 固定速率輸入與補償

`every_seconds` 是至少 60 秒的安全整數間隔，與建立時間對齊。它衡量經過的時間，而不是每日本地鐘錶時間：發生偏移量變化時，`every_seconds: 86400` 不能替代 `daily`。協定不提供共享冷卻時間或跨記錄准入規則；下文描述的 cron 選擇器是鐘錶時間語義，不是固定速率間隔。

主機啟動時若 Every、Daily、Weekly 或 Cron 記錄已逾期，只傳送最新一次到期發生時點。Every 推進到投遞判斷時刻之後第一個與目前間隔起算點對齊的目標；Daily、Weekly 和 Cron 遵循上文與下文的本地日期規則。錯過的發生時點不會累積。若沒有可表示的下一 UTC 目標，投遞後保留未執行記錄及最近一次回執。

一次性提醒各自產生一條 follow-up。同一次掃描中屬於同一 Session 的到期重複記錄共用由 `renderRecurringReminderBatchFraming` 渲染的一條 follow-up，每條記錄各包含最新一次觸發。一分鐘下限僅適用於固定速率間隔；投遞不等待目標 Agent 空閒。

<a id="cron-wall-clock-input"></a>
## Cron 鐘錶時間輸入

`cron` 是互斥的建立選擇器之一。它的物件只攜帶嚴格的標準五欄位 Vixie 表示式 `minute hour day-of-month month day-of-week` 和顯式 IANA 時區，例如 `cron: { expression: '*/15 9-17 * * 1-5', time_zone: 'Asia/Shanghai' }`。欄位取值範圍如下：

| 欄位 | 取值範圍 | 說明 |
|---|---|---|
| minute | 0-59 | |
| hour | 0-23 | |
| day-of-month | 1-31 | |
| month | 1-12 | |
| day-of-week | 0-7 | `0` 和 `7` 都表示週日。 |

每個欄位接受 `*`、單個值、`a-b` 範圍、`n >= 1` 的 `*/n` 與 `a-b/n` 步長，以及由這些形式組成的逗號分隔列表。其他寫法一律以 `invalid_rule` 拒絕，且錯誤資訊會指出違規欄位：`L`、`W`、`#` 運算子，`JAN`/`MON` 名稱，`@daily` 風格宏，帶秒欄位的六欄位表示式，超出範圍的值、反向範圍、零步長和空欄位。由於該方言只有五個欄位，最小間隔為一分鐘；亞分鐘級排程仍然不受支援。

建立時會先規範化表示式再儲存。規範化會把每個欄位展開為匹配值集合，再確定性地重新編碼該集合：重複值合併，相鄰的值與範圍合併，均勻步長寫為 `a-b/n`，而以 `*` 開頭的欄位寫為星號步長（匹配全部取值時寫 `*`，否則寫最寬的星號步長並追加其餘取值），步長 `1` 被移除，週日統一寫為 `0`。不以 `*` 開頭的欄位絕不會變成星號步長。保留每個欄位的星號標誌，正是下文 day-of-month/day-of-week 規則在儲存的表示式上仍與 Vixie 一致的原因。持久化解碼器會拒絕非規範化的已儲存表示式。

首個目標是該時區內本地日期與時間匹配的第一個嚴格未來時點。它複用 Daily 與 Weekly 的本地時間解析：不存在的本地時間被跳過，重疊時間每個日期只取較早一次。已提交的 UTC `scheduledAt` 在重新啟動時絕不重新計算。

day-of-month 與 day-of-week 遵循 Vixie 語義。欄位文字以 `*` 開頭即為星號欄位，與它匹配的取值集合無關，因此 `*/1` 與 `*/2` 都是星號欄位，而 `1-31` 與 `0-7` 受限。任一欄位為星號欄位時，本地日期只有在兩個欄位都匹配時才算匹配；兩個欄位都不是星號欄位時，匹配任一欄位即算匹配。

cron 解碼保留已提交時點及已儲存的時區拼寫，並拒絕非規範化的已儲存表示式。cron 僅屬於目前主機的 `ScheduleRecord`；凍結的歷史 Session 解碼器不接受它。

## 歷史 Session 變更

版本 1 的 `schedule/change` 事件仍可作為歷史 Session 資料解碼。其 create、fold 和 invariant 型別使用 `LegacyScheduleRecord`，僅接受 After、At 和 Every；Daily、Weekly 與 Cron 僅屬於目前主機的 `ScheduleRecord`。主機記錄解碼器獨立於凍結的歷史解碼器。在 title 出現之前寫入的 create 記錄不含 `title`，因此歷史解碼器接受該缺失成員，而主機解碼器仍要求它。歷史事件不會填充 storage domain 或觸發投遞。這些事件中的已有提醒需要顯式透過 `schedule_create` 重新建立；不會隱式遷移 Session 或轉換舊 `at` 記錄。

```ts type-equiv
/**
 * Frozen Session event and fold vocabulary; daily rules belong only to Host storage.
 *
 * A version-1 event written before titles existed persists no `title` member, so
 * `after`, `at`, and `every` decode without one and stay readable. The Host task
 * record requires the member and never persists a record without it.
 */
type LegacyScheduleRecord =
  | LegacyAfterScheduleRecord
  | LegacyAtScheduleRecord
  | LegacyEveryScheduleRecord
```

```ts type-equiv
/** Creates one durable reminder record. */
interface ScheduleCreateChange {
  readonly version: 1
  readonly operation: 'create'
  readonly schedule: LegacyScheduleRecord
}
```

```ts type-equiv
/** Deletes one currently active reminder. */
interface ScheduleDeleteChange {
  readonly version: 1
  readonly operation: 'delete'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records that one active one-shot reminder entered the durable dispatch history. */
interface OneShotScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records one fixed-rate decision and advances directly past missed occurrences. */
interface EveryScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
  /** Wall-clock decision time used to select the latest due occurrence. */
  readonly acceptedAt: string
}
```

```ts type-equiv
/** Durable dispatch shapes supported by the current rule set. */
type ScheduleDispatchChange = OneShotScheduleDispatchChange | EveryScheduleDispatchChange
```

```ts type-equiv
/** Strict version-1 durable Schedule mutation union. */
type ScheduleChange = ScheduleCreateChange | ScheduleDeleteChange | ScheduleDispatchChange
```

歷史 decoder 與 fold 拒絕未知版本、額外欄位、複用 ID 和無效轉換。該事件仍編入[持久化目錄](../persistence-catalog.zh.md#schedulechange--log-only)。Session 歷史不負責決定目前活動任務。

## 活動檢視與管理

工具值將儲存記錄與目前牆鍾派生的時間狀態組合。主機在投遞需要時恢復原 Session；列出和刪除任務不會啟用該 Session。

```ts type-equiv
/** Current delivery timing derived from the durable record and wall clock. */
type ScheduleState = 'scheduled' | 'overdue'
```

```ts type-equiv
/** Host-driven delivery resumes the original Session when needed. */
type ScheduleDeliveryMode = 'host'
```

```ts type-equiv
/** Complete model-facing view of one active reminder. */
type ScheduleView = ScheduleRecord & {
  /** Whether the target remains in the future. */
  readonly state: ScheduleState
  /** Reminder delivery never leaves the owning session. */
  readonly deliveryMode: ScheduleDeliveryMode
}
```

[工具目錄](../tool-catalog.zh.md#deepseek-aidsh-schedule) 負責 `schedule_create`、`schedule_list`、`schedule_delete` 和 `schedule_update` 的 schema。建立、刪除和更新在 storage domain 寫入確認後返回成功。主機級佇列將這些變更與到期投遞序列化；刪除任務不會移除已入隊訊息。模型工具操作目前 Session，共享主機的 create、list、update 和 delete 方法接受顯式 Session 繫結。建立必須提供 `title`，其去除首尾空白後必須非空且不超過 120 個字元；缺失、空白或過長的標題以 `invalid_prompt` 拒絕，且建立過程絕不從指令派生標題。create 和 list 檢視在指令之外同時攜帶已儲存的 `title`，且 `title` 缺失或非法的已儲存記錄在解碼時被拒絕。

```ts type-equiv
/** Reminder creation selector, shared by the model consumer and Host service. */
interface ScheduleCreateRequest {
  /** Non-empty reminder text. */
  prompt: string
  /** Required task name of at most 120 characters, non-empty after trimming; names the card, detail heading, and task lists. */
  title: string
  /** Relative one-shot delay in seconds. */
  after_seconds?: number
  /** Absolute one-shot target. */
  at?: AtInput
  /** Fixed recurrence interval in seconds. */
  every_seconds?: number
  /** Daily wall-clock time in an explicit IANA zone. */
  daily?: DailyInput
  /** Weekly wall-clock time and explicit ISO weekday set in an IANA zone. */
  weekly?: WeeklyInput
  /** Five-field cron expression evaluated in an explicit IANA zone. */
  cron?: CronInput
}
```

```ts type-equiv
/** Session-scoped task list, without Agent activation. */
interface ScheduleListRequest {
  /** Original Session binding. */
  sessionId: SessionId
}
```

```ts type-equiv
/** Delete request identifying a task within its original Session binding. */
interface ScheduleDeleteRequest extends ScheduleListRequest {
  /** Task to remove. */
  id: ScheduleId
}
```

```ts type-equiv
/** Successful `schedule_delete` value, including the non-mutating not-found result. */
type ScheduleDeleteResult =
  | { readonly id: ScheduleId; readonly deleted: true }
  | { readonly id: ScheduleId; readonly deleted: false; readonly code: 'schedule_not_found' }
```

## Web 目錄

Remote 方法 `schedule.catalog()` 返回活動和未執行的主機任務及其原始 Session 繫結，先按 `scheduledAt` 升序排列，再按 `id` 字典序排列。它只讀取 Schedule domain，不啟用 Session 或讀取其歷史。瀏覽器消費方接收以下可安全用於瀏覽器的型別：

```ts type-equiv
/** Durable Session inbox delivery acknowledgment, not model execution completion. */
interface ScheduleDeliveryReceipt {
  /** Canonical UTC target of the delivered occurrence. */
  readonly scheduledAt: string
  /** Canonical UTC time sampled after Session persistence acknowledged delivery. */
  readonly deliveredAt: string
  /** Identity of the delivered message, shared by tasks in one recurring batch. */
  readonly messageId: MessageId
}
```

```ts type-equiv
/** Browser-safe retained reminder with its original Session binding. */
type ScheduleCatalogEntry = ScheduleRecord & {
  /** Session receiving this reminder when it becomes due. */
  readonly sessionId: SessionId
  /** Inactive reminders remain visible but never schedule another delivery. */
  readonly status: 'active' | 'inactive'
  /** Most recent durably acknowledged inbox delivery, when available. */
  readonly lastDelivery?: ScheduleDeliveryReceipt
}
```

Remote 方法 `schedule.list({ sessionId })`、模型 `schedule_list` 和 Session 頁頭目錄僅返回活動任務。模型檢視派生的時間 `state` 與儲存的生命週期 `status` 仍是不同概念。刪除透過 `schedule.delete({ sessionId, id })` 使用條目的原始繫結；繫結不匹配時返回未找到。模型工具傳入目前 Agent 的 Session，全域使用者介面則傳入所選任務的繫結。僅驗證繫結並不構成呼叫者授權驗證。無 payload 的 `schedule/changed` 事件通知用戶端重新整理列表；重新連線後，用戶端再次取得目前狀態。

Web bundle 將 `ui-schedule` 與主機能力一起掛載。[用戶端包](../../packages/client/ui-schedule/README.zh.md) 負責目錄、空狀態與刪除控制元件。頁面單獨篩選全部、活動和未執行任務，保留未執行任務詳情及詳情頁籤條內的原 Session 入口，並要求顯式確認刪除。“規則”和“傳送記錄”將任務設定與按需分頁載入的已儲存回執分開。回執與未執行狀態均不確認模型執行。

## 修改時間

`schedule.update({ sessionId, id, expected, change })` 修改活動任務，不啟用其 Session。`expected` 是完整的已觀察 `ScheduleRecord`，不是附帶額外中繼資料的目錄條目。Host 在投遞和刪除共用的 FIFO 內將它與目前記錄比較。正常投遞可能在編輯期間推進目標；此時舊快照返回 `schedule_conflict`，不會覆蓋目前規則。任務不存在或繫結不匹配時返回 `schedule_not_found`，未執行任務返回 `schedule_ended`。

```ts type-equiv
/** Timing-only edit; it may select a different recurrence kind than the stored record, and one-shot targets use an absolute `at`. */
type ScheduleTimingChange =
  | { readonly kind: 'at'; readonly at: AtInput }
  | { readonly kind: 'every'; readonly every_seconds: number }
  | { readonly kind: 'daily'; readonly daily: DailyInput }
  | { readonly kind: 'weekly'; readonly weekly: WeeklyInput }
  | { readonly kind: 'cron'; readonly cron: CronInput }
```

```ts type-equiv
/** Compare-and-update request within the original Session binding. */
interface ScheduleUpdateRequest extends ScheduleDeleteRequest, ScheduleUpdateContent {
  /** Complete record observed when editing began, including the committed target. */
  readonly expected: ScheduleRecord
  /** New timing; its kind may differ from the stored record's kind, and an omitted value keeps the committed target. */
  readonly change?: ScheduleTimingChange
}
```

```ts type-equiv
/** Successful current record, non-mutating lookup/conflict failure, or invalid name/instruction/timing. */
type ScheduleUpdateResult =
  | { readonly id: ScheduleId; readonly updated: boolean; readonly record: ScheduleRecord }
  | ScheduleUpdateMiss
  | ScheduleToolError
```

Daily 規則改變後，沿用本地時間和時區語義計算嚴格晚於目前時間的首個目標。Cron 規則改變後，先規範化表示式，再按相同的本地日期、缺口與較早重疊規則計算首個嚴格未來目標。Every 間隔改變後，以接納儲存時刻加該間隔建立新的起點。After 或 At 任務可以在保留 id 的同時，透過 At 記錄接收新的絕對目標。這些操作保留已儲存的 `title`、指令、原始 Session 繫結、生命週期狀態和全部已儲存回執。變更也可以選擇不同的重複型別，此時按新規則重算目標，並保留同一 id、標題、指令、Session 繫結、狀態與全部已儲存回執。歸一化後等價的規則返回 `updated: false` 及未改變的記錄，不重寫儲存、不重設目標，也不發出變更事件。寫法不同但等價的 Cron 表示式就是這樣的無變更，因為比較使用規範化表示式與規範化時區。

輸入驗證複用現有時間錯誤。改變後的絕對目標在 FIFO 槽位開始執行時仍須位於未來。任務 put 成功後才發出變更通知並重算 timer。儲存和生命週期失敗會 reject；取消檢查發生在排隊和初始化等待之後，但不能復原已經開始的寫入。一次性記錄保留 UTC 時點，而非編輯表單中的 IANA 時區。時間編輯不追加歷史 Session 事件：模型透過 `schedule_update` 做同樣的原地修改，它與讀取到的記錄做比對，而不是刪除後重建任務。

## 已儲存的傳送記錄

`schedule.history({ sessionId, id, limit })` 讀取已儲存的回執，不啟用 Session。顯式 limit 必須是 1–100 的安全整數。分頁按追加順序逆序排列，不按牆鍾排序；可選的訊息 id 遊標排除上一頁最早的記錄。新記錄追加不會改變該遊標的定位。任務不存在或 Session 繫結錯誤時返回 `schedule_not_found`；遊標未知時返回 `delivery_cursor_not_found`，不會視為查詢成功的空頁。

```ts type-equiv
/** Saved inbox delivery with its immutable sent prompt when recorded by this Host. */
interface ScheduleDeliveryRecord extends ScheduleDeliveryReceipt {
  /** Prompt sent for this occurrence; unavailable for legacy receipts. */
  readonly prompt?: string
}
```

```ts type-equiv
/** Explicitly bounded saved-delivery query within one Session binding. */
interface ScheduleDeliveryHistoryRequest extends ScheduleDeleteRequest {
  /** Required safe-integer page size from 1 through 100. */
  limit: number
  /** Message identity of the oldest entry in the previous page; excluded from this page. */
  before?: MessageId
}
```

```ts type-equiv
/** Configured limits applied when appending one task's delivery receipt. */
interface DeliveryRetentionBounds {
  /** Retained window in days, measured back from the acknowledgment being appended. */
  readonly days: number
  /** Maximum retained records per task; the newest survive. */
  readonly records: number
}
```

```ts type-equiv
/** Newest-first saved deliveries, or a non-mutating task/cursor lookup failure. */
type ScheduleDeliveryHistoryResult =
  | {
    readonly id: ScheduleId
    readonly records: ScheduleDeliveryRecord[]
    /** Whether earlier delivery records may be unavailable; missing receipts are never reconstructed. */
    readonly earlierRecordsUnavailable: boolean
    /** True only after an append removed saved records; absent legacy evidence is false. */
    readonly earlierRecordsPruned: boolean
    /** Current Host retention configuration, also used by the delivery writer. */
    readonly retention: DeliveryRetentionBounds
    /** Oldest returned message identity, present only when older saved records remain. */
    readonly nextBefore?: MessageId
  }
  | { readonly id: ScheduleId; readonly code: 'schedule_not_found' | 'delivery_cursor_not_found' }
```

新任務初始化空歷史。缺少歷史欄位的舊任務僅展示已有的最近一次回執，標明更早記錄不可用，且讀取不會重寫任務行。後續確認會保留該回執，並追加帶有指令快照的真實新回執。已丟失的歷史與缺失的舊指令快照不會被重建。歷史、最近回執、狀態和下一目標由同一次任務行寫入提交；顯式刪除任務會停止後續投遞、把任務行連同其已儲存的回執一併移除，並使其離開 `list` 與 `catalog`；對話訊息不受影響。已儲存的傳送記錄在追加確認時按設定的 `deliveryHistoryDays` 視窗（以每條回執的 `deliveredAt` 向前計算）與 `deliveryHistoryRecords` 條數上限裁剪；新追加的最近一次回執始終保留，發生裁剪時標記更早記錄不可用。分頁限制返回的記錄數量，不限制儲存大小或指令位元組數。

## 主機投遞

主機啟動時讀取持久任務，並將定時器設為最早的活動目標。未執行任務仍可查詢，但不會再次安排投遞。投遞時透過 Session controller 取得原 Session，包括尚未載入的 Session。恢復後重新取樣實際時間，並排除時鐘回呼後尚未到期的成員；這些任務仍保留定時義務。投遞不涉及 Goal 或獨立的 Run 完成記錄。

外掛來源的 `followup()` 同步將訊息追加到 Session 收件箱。Session flush 成功後，一次任務記錄 put 追加帶有指令快照的傳送記錄，並同時儲存最新的 `ScheduleDeliveryReceipt`，以及一次性任務的 `inactive` 狀態或重複任務的下一目標和狀態。同一批次的重複任務共享回執的 `messageId`；每條回執保留該任務已投遞的發生時點。投遞不會中途引導或取消目前輪次，也不等待模型完成。

Session 取得、訊息入隊或持久化確認失敗時，任務繼續儲存在儲存中，並報告主機警告。後續管理變更或主機重新啟動會重試。Session 持久化與任務 put 不具有跨儲存原子性。收件箱已持久化、任務尚未 put 時發生崩潰，可能重複投遞；回執並未消除這一間隔。Schedule 不提供模型結果回執、執行取消或外部通知渠道。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxschedule--scheduleservice"></a>

### `ctx.schedule` — `ScheduleService`

Shared management service; reads, deletion, and timing edits never activate a Session.

`sessionPersistence` is a load-order requirement rather than a directly called service: a delivery commits only when `ctx.sessions.flush()` reports that a `session/flush` listener participated, and the persistence backend providing this service is the plugin that registers that listener.

```ts cordis-catalog
/**
 * Create a reminder bound to the caller-selected Session without activating it.
 *
 * The request must supply a title; a missing, blank-after-trim, or over-long
 * title rejects with `invalid_prompt` instead of deriving one from the prompt.
 * The record is built from the clock reading taken before the request joins the
 * serialized queue, so a create that waits behind a longer operation keeps its
 * request-time anchor and may already be due when the queue reaches it.
 * @param sessionId - Original Session receiving the reminder.
 * @param request - Validated tool selector, required title, and reminder content.
 * @param signal - Optional cancellation checked before persistence begins, including after FIFO waits.
 * @returns The durably stored schedule. Cancellation does not roll back an in-flight write.
 */
async create(sessionId: SessionId, request: ScheduleCreateRequest, signal?: AbortSignal): Promise<ScheduleRecord>

/**
 * Read the selected Session's active tasks without resuming its Agent.
 * @param request - Session whose task list is requested.
 * @returns Persisted reminders in storage order.
 */
@Remote('list') async list(request: ScheduleListRequest): Promise<ScheduleRecord[]>

/**
 * Read all active and inactive Host reminders with their original Session bindings.
 * A deleted reminder has no row, so it is absent here.
 * Does not activate Sessions or read Session history.
 * @returns Reminders ordered by scheduledAt ascending, then lexicographically by id.
 */
@Remote('catalog') async catalog(): Promise<ScheduleCatalogEntry[]>

/**
 * Read saved inbox deliveries without activating or reading the original Session.
 * The task's own row supplies its binding, so its records stay readable through this lookup.
 * @param request - Session binding, task identity, explicit limit, and optional exclusive message cursor.
 * @returns Newest-first deliveries in append order, or a task/cursor lookup failure.
 * @throws ScheduleInputError when limit is not a safe integer from 1 through 100.
 */
@Remote('history') async history(request: ScheduleDeliveryHistoryRequest): Promise<ScheduleDeliveryHistoryResult>

/**
 * Delete one task belonging to the selected Session, leaving queued messages intact.
 *
 * The row is removed: the task no longer schedules, leaves `list` and `catalog`, and its
 * saved delivery records go with it.
 * @param request - Session and exact task identity.
 * @param signal - Optional cancellation checked before persistence begins, including after FIFO waits.
 * @returns Whether that Session owned a deleted task. Cancellation does not roll back an in-flight write.
 */
@Remote('delete') async delete(request: ScheduleDeleteRequest, signal?: AbortSignal): Promise<ScheduleDeleteResult>

/**
 * Update the name, instruction, and timing of an active task within the original Session
 * binding without activating the Session or changing saved deliveries.
 *
 * Each supplied field replaces its stored value; an omitted field keeps it. A name or
 * instruction change alone does not reset the committed target.
 * @param request - Task binding, complete observed record, and any combination of timing, name, and instruction.
 * @param signal - Cancellation checked after domain readiness and FIFO waits, before persistence begins.
 * @returns The committed record, unchanged record for a no-op, or a non-mutating input/lookup/conflict result.
 * Storage and lifecycle failures reject; cancellation after a write starts does not roll it back.
 */
@Remote('update') async update(request: ScheduleUpdateRequest, signal?: AbortSignal): Promise<ScheduleUpdateResult>
```

Types: [SessionId](core.zh.md)

Source: [`packages/schedule/schedule/src/index.ts`](../../packages/schedule/schedule/src/index.ts)

<a id="schedule-events"></a>

### `schedule/*` events

<a id="schedulechanged--emit"></a>

#### `schedule/changed` — emit

Durable task set changed; clients refetch global task and Session-active catalogs.

```ts cordis-catalog
/** Durable task set changed; clients refetch global task and Session-active catalogs.
 * @mode emit
 */
'schedule/changed'(): void
```

Source: [`packages/schedule/schedule/src/types.ts`](../../packages/schedule/schedule/src/types.ts)
<!-- END GENERATED cordis-surface -->
