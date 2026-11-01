# Agent Note: 邏輯工作階段與儲存重建

Status: proposed

[English](2026-09-06-logical-session-storage-rebuild.md) | 中文

## 問題

工作階段消費方依賴具體事件日誌類、即時工作階段註冊表、投影註冊表與持久化控制代碼。這些依賴混合了邏輯工作階段行為、釋出、儲存與物理格式職責。因此，新的工作階段或儲存實作會要求修改消費方、agent loop、持久化、查詢、遙測與前端程式碼。

該重構必須先建立一條穩定存取路徑，才能安全替換實作。第一個階段必須讓消費方脫離具體 `Session` 類，同時不改變物件身份、事件值、釋出順序、持久化位元組或模型輸出。

## 提案

使用兩個應用協定與一個私有提供者協定。`LogicalSession` 表示一個邏輯工作階段：一個有身份的事件工作階段，獨立於其事件的儲存與釋出方式。`SessionService` 建立、開啟、釋出、查詢、fork 並 flush 邏輯工作階段，而且擁有投影埠註冊。`SessionStorage` 是服務背後的物理提供者介面；它擁有持久工作階段資料、修訂、格式遷移、崩潰修復、批處理與跨程序寫入器租約。

以堆疊階段建置該變更。每個階段要麼保持可觀察行為，要麼明確命名一個行為變化。相容名稱僅在後續階段仍有真實消費方且具備明確移除條件時保留。

[開發者遷移](2026-09-10-session-developer-transition.zh.md)給出操作虛擬碼與貢獻路徑；[能力協定](2026-09-10-session-capability-protocols.zh.md)說明 storage、projection 與 query，幷包含整體架構圖；[歷史資料相容](2026-09-10-session-data-compatibility.zh.md)說明使用者遷移；[FAQ](2026-09-10-session-refactor-faq.zh.md)解釋命名和進度。

## 階段 1：唯一公開邏輯工作階段介面

階段 1 是整個重構的入口。它的四個實作子階段完成後，每個生產消費方都持有 `LogicalSession`。具體 `Session` 類及其靜態建構器作為 deprecated 原始碼相容入口繼續服務外部開發者，現有記憶體實作仍是消費方持有的工作階段物件。該階段改變內部依賴方向，不改變執行時行為。

### 公開模型

`LogicalSession` 暴露生產消費方已經使用的邏輯工作階段操作。它擁有工作階段身份、不可變建立中繼資料、fork 譜系、事件位置、經驗證的追加、不可變事件讀取、有序 surface，以及派生請求與訊息檢視。

```text
abstract class LogicalSession {
  abstract readonly header: SessionHeader
  abstract readonly inheritedEventCount: SessionLogOffset
  abstract readonly firstLiveSeq: SessionLogOffset
  abstract get seq(): SessionLogOffset
  abstract get surface(): SessionSurface
  get id(): SessionId

  abstract append<T extends SessionEventType>(
    type: T,
    data: SessionEventMap[T],
    ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : []
  ): SessionEvent<T>

  abstract eventAt(seq: SessionSeq): SessionEvent | undefined
  abstract snapshotEvents(from?: SessionLogOffset, toExclusive?: SessionLogOffset): readonly SessionEvent[]
  ownEvents(): readonly SessionEvent[]
  isOwnSeq(seq: SessionSeq): boolean
  abstract requestHeader(): EpochHeader | undefined
  abstract requestContext(): RequestContext | undefined
  abstract deriveMessages(): Message[]
  deriveEventMessage(event: SessionEvent): Message | null
}
```

抽象成員允許另一種實作選擇不同的日誌表示。具體成員只依賴這些抽象成員，因此所有實作共享身份、所有權與派生檢視語義。

即時工作階段仍來自 `ctx.sessions`。無需釋出即可驗證、查詢或檢查日誌的程式碼使用 `createLogicalSession` 或 `restoreLogicalSession`。這些函式返回遊離工作階段，不會註冊它們或發出即時工作階段事件。

### 階段 1 的子階段

計劃是評審入口。實作子階段分離介面定義、建構、消費方遷移與相容性驗證，使每次評審只有一個主張。

| 階段 | 結果 |
| --- | --- |
| 1.1 | 定義所有權模型、不變數、完整階段 1 設計與後續階段方向。 |
| 1.2 | 增加 `LogicalSession` 與一個可切換的靜態門禁：記錄具體類繫結，在切換為拒絕之前以警告報告新增繫結。 |
| 1.3 | 增加遊離建構函式，並遷移生產靜態建構器呼叫方。 |
| 1.4 | 將儲存、事件、agent、投影與全部生產消費方改為 `LogicalSession`。 |
| 1.5 | 遷移測試，保留 deprecated `Session` 相容入口，並完成階段 1。 |

### 各階段進度

| 階段 | 狀態 |
| --- | --- |
| 1 | 草稿完整。 |
| 2 | 草稿完整。 |
| 3 | 基於階段 2；實作與遠端 CI 完成，保持草稿。 |
| 4–5 | 尚未完成。 |
| 記憶體 provider 抽取 | 後續把現有實作封裝為可替換 provider。 |

### 不變數

階段 1 保持以下行為。後續階段也必須保持這些事實，除非其提案明確命名並測試某項變化。

- `append` 保持同步。它先驗證再變更，分配連續序號，凍結已接受事件，並在提交後隔離觀察者失敗。
- `session/created` 保持同步釋出否決語義。`session/event`、`session/disposed` 與 `session/flush` 保持現有順序和參與語義。
- 儲存返回的工作階段物件必須與其註冊並提供給監聽器的物件完全相同。任何包裝層都不得替換該身份。
- 對相同輸入日誌，工作階段 header、fork 譜系、`firstLiveSeq`、派生請求狀態、訊息歷史與序列化事件值保持不變。
- 遊離建構絕不進入即時註冊表或釋出即時事件。
- JSONL 位元組、格式版本、遷移、崩潰修復、批處理與寫入器租約行為保持不變。

### 執行門禁與完成條件

`verify-logical-session-access` 報告所屬包之外的生產程式碼對具體 `Session` 類的繫結。其執行強度可切換：簽入預設為 `warn`，此時門禁把每項發現列印為警告、為每項發現寫入一條 GitHub Actions `::warning` 註解並以 0 退出，使仍繫結該類的分支在其消費方遷移期間可以合併；`DSH_LOGICAL_SESSION_ACCESS=enforce` 使門禁在單次執行中對任何發現失敗，而在沒有進行中的分支再繫結該類之後把簽入預設改為 `enforce`，門禁即拒絕每一處剩餘繫結。該包僅為外部原始碼相容保留公開類與靜態建構器。儲存庫生產程式碼沒有允許列表並統一使用 `LogicalSession`；相容測試持續驗證舊匯入與建構器，直至後續獨立移除決策給出生態證據與釋出邊界。

當生產程式碼僅使用公開邏輯工作階段介面與遊離建構函式、deprecated `Session` 入口只有專門相容測試而無生產消費方、存取門禁沒有遷移允許列表、生成的 API 文件已更新，並且快照與 SDK 輸出保持不變時，階段 1 完成。

## 目標架構

階段 1 建立邏輯存取介面。後續階段把建構與釋出移入 `SessionService`，把持久化拆分為 `SessionStorage` 下的讀取器與寫入器角色，在邏輯工作階段背後掛接儲存與投影，並刪除橋接名稱。

```text
consumers ──► LogicalSession
                  │
                  ├── logical events and projections
                  ├── fork, flush, and close
                  └── attached storage reader or writer

composition ──► SessionService ──► LogicalSession implementation
                       │
                       └──────────► SessionStorage implementation
```

該依賴方向是刻意設計。應用元件依賴 `LogicalSession` 與 `SessionService`，而非 `SessionStorage`、內建記憶體實作、JSONL、投影註冊表、遷移、搜尋索引或前端狀態。`SessionService` 選擇並協調物理提供者；每個物理實作向內依賴它實作的私有協定。

### 所有權規則

| 問題 | 所有者 |
| --- | --- |
| 該操作是否讀取或變更一個邏輯工作階段、其日誌、header、投影或生命週期？ | `LogicalSession` |
| 該操作是否建構、釋出、列舉、fork、flush 或 dispose 即時工作階段？ | `SessionService` |
| 該操作是否擁有位元組、修訂、物理佈局、遷移、修復、批處理或寫入器租約？ | 僅在 `SessionService` 背後使用的 `SessionStorage` 提供者。 |
| 該操作是否精確讀取、跨工作階段過濾、全文檢索、trace 或讀取統計？ | `SessionQuery`，由 projection/provider 提供可重建讀模型。 |

### 後續階段

| 階段 | 結果 | 必須保持的相容邊界 |
| --- | --- | --- |
| 2 | `SessionService` 擁有工作階段建構、釋出、查詢、fork 協調、flush 與儲存掛接。 | 現有事件順序、種子持久化與關閉時序保持不變。 |
| 3 | `SessionStorageReader` 與 `SessionStorageWriter` 取代聯合型別持久化控制代碼；JSONL 實作該協定。 | 儲存位元組、修訂、遷移預備、批處理與租約保持不變。 |
| 4 | 邏輯工作階段擁有即時寫入器入隊與投影讀取；後端停止訂閱即時工作階段事件。 | 寫入器與監聽器失敗會被一同等待，並使用已記錄的優先順序。 |
| 5 | 移除內部橋接別名與派生檢視快捷方式；agent loop 只接納一次未釋出的 fork 工作階段。 | fork 身份、釋出交錯、清理、快照與 SDK 輸出保持驗證。 |

持久化策略、遷移編排、遙測、工作階段載入與前端展示仍是消費方。精確讀取、搜尋與統計統一透過 `SessionQuery`；title、summary、統計與搜尋文件由 `SessionProjectionPort` 生成。

## 相容性與非目標

該堆疊不改變已釋出的 Session JSONL 格式、協定值、TypeScript 或 Python SDK 輸出，也不改變模型可見歷史。它不增加第二個儲存後端或第二種邏輯工作階段實作。它只建立未來增加任一實作時無需修改消費方的依賴方向。

該提案保留已交付的[基於控制代碼的持久化決定](../../implemented/architecture/2026-08-27-handle-based-session-persistence.zh.md)、[僅 JSONL 持久化決定](../../implemented/simplification/2026-08-30-jsonl-only-session-persistence.zh.md)、[寫入器租約決定](../../implemented/feature/2026-08-31-cross-process-session-write-lease.zh.md)與[只讀遷移預備](../../implemented/architecture/2026-09-05-read-only-session-migration-preparation.zh.md)。新協定只重新分配這些職責，不會削弱它們。

## 參考資料

- [工作階段子系統](../../../../docs/subsystems/session.zh.md)定義已交付的工作階段 API 與事件語義。
- [工作階段持久化子系統](../../../../docs/subsystems/persistence.zh.md)定義已交付的持久格式與生命週期。
- [`@deepseek-ai/dsh-session`](../../../../packages/core/session/README.zh.md)擁有工作階段包約定。
- [`@deepseek-ai/dsh-session-persistence`](../../../../packages/session/session-persistence/README.zh.md)擁有目前持久化服務約定。

## 考慮過的替代方案

**在介面階段中替換實作。** 拒絕，因為型別遷移與生命週期遷移需要不同證據。階段 1 在改變依賴方向時保持完全相同的工作階段物件與行為。

**立即暴露寬泛的服務或儲存 facade。** 拒絕，因為基線尚未把每項生命週期與持久化職責分配給唯一所有者。後續階段只增加具備生產消費方和特徵化證據的成員。

**遷移儲存庫呼叫方後立即刪除 `Session`。** 拒絕，因為這會破壞外部開發者相容性，卻不會進一步改善儲存庫依賴方向。階段 1 保留 deprecated 相容入口，同時由存取檢查禁止儲存庫生產程式碼使用；移除需要後續獨立相容決策。

**從清單而非已開啟工作階段恢復繼承中繼資料。** 拒絕，因為清單無法提供恢復工作階段所需的精確繼承事件切點。

## 驗收條件

- 階段 1 以 `LogicalSession` 作為推薦工作階段型別，保留 deprecated `Session` 原始碼相容性與工作階段物件身份，並使可觀察行為與序列化輸出不變。
- 每個後續階段都具備一個所有權結果、明確的相容限制、針對性特徵化測試與可獨立退回的提交邊界。
- 所有生產應用元件只使用 `LogicalSession` 與 `SessionService`；只有服務實作與物理提供者包使用 `SessionStorage` 及其讀取器或寫入器角色。
- 內建記憶體工作階段實作與 JSONL 儲存可以成為可替換實作，而無需修改搜尋、統計、持久化策略、遷移編排、工作階段載入或前端消費方。
- 每個階段都在同一 PR 中更新其所屬 Agent Note、子系統參考、包文件、生成目錄與所需雙語對側檔案。

## 風險

薄抽象可以在保持型別安全的同時隱藏生命週期缺口。尤其在 `SessionService` 擁有釋出與掛接之前，替代邏輯工作階段實作無法參與；同步 disposer 也不得啟動無人等待的非同步關閉。

如果實作把讀取器當作陳舊快照、丟失繼承中繼資料、改變批處理，或在永續性完成之前釋放寫入器租約，儲存分離會丟失保證。約定測試必須覆蓋新鮮度、關閉永續性、遷移預備與跨程序所有權。

fork 接納可能建立重複註冊表項，或重排 `session` 與 `agent` 的釋出。後續 fork 階段必須向 agent loop 轉移一個未釋出工作階段，保持物件身份，並在設定失敗時關閉它。
