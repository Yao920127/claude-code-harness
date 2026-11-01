# Agent Note: Session 開發者遷移規則

Status: proposed

[English](2026-09-10-session-developer-transition.md) | 中文

## Problem

重構跨多個階段。舊系統必須持續可用，但不推薦新外掛繼續依賴具體 `Session`、JSONL handle 或生命週期事件。開發者需要按 branch 狀態判斷規範入口。

## Proposal

固定一個心智模型：**透過 `SessionService` 獲得 `LogicalSession`，透過其成員使用邏輯工作階段；只有 provider 和組合根知道物理實作。**

| 階段 | 開發規範 |
|---|---|
| 目前 master | 仍按現有公開 API 開發，不假設未合併 stack 已釋出。 |
| 階段 1 後 | 新參數、欄位、回呼和 test double 使用 `LogicalSession`。現有外部程式碼可暫時保留 deprecated `Session` 匯入與建構器。 |
| 階段 2 後 | `ctx.sessions` 擁有 live registry 與 storage attachment；Agent loop 和外掛不儲存 persistence handle。 |
| 階段 3 後 | 新儲存實作 `SessionStorageReader`／`Writer`；普通功能仍不把 storage 當作 session API。 |
| 階段 4–5 後 | 邏輯工作階段擁有即時寫入與投影；儲存庫內程式碼不再使用相容別名。 |
| 長期 | 組合根選 session/service/storage/query provider；功能包不因 provider 更換而改變。 |

### 維護規則

- 建立、恢復、fork、列舉或查詢 live session 只呼叫 `SessionService`；不要維護第二份 registry。
- 得到 `LogicalSession` 後只用 `header`、`id`、`seq`、`surface`、`append()`、`eventAt()`、`snapshotEvents()` 等公開成員；不要猜測事件陣列或記憶體 Map。
- 持久化 provider 擁有格式、遷移、租約、revision 和物理 I/O；搜尋、統計、標題、前端與 telemetry 使用邏輯協定或自己的 Service Definition。
- 新 provider 透過共享合約測試並由組合根顯式註冊。核心程式碼不得按 provider 名稱分支或掃描包。
- 新程式碼不得使用 `SessionPersistence`、`ctx.sessionPersistence` 與舊 handle/access/snapshot/revision 名稱；階段 5 在舊消費方歸零後刪除它們。
- 文件和測試明確標註 current、completed stage、target 或 compatibility，不把草稿 PR 當作已釋出行為。

普通外掛只宣告對 `ctx.sessions` 的 Cordis 依賴，接受並傳遞 `LogicalSession`，並使用其公開成員。現有外掛可在遷移期間保留 `Session`、`Session.create` 與 `Session.fromRestore`，但新程式碼使用邏輯工作階段型別與遊離 factory。只有實作新後端的外掛才接觸 storage/query 協定；它無需知道預設實作使用哪種記憶體、持久化或查詢索引。

### 常見操作遷移

以下是目標虛擬碼；具體可用方法以所在階段的型別宣告為準。

```ts ignore-check
// Types: Session -> LogicalSession
function render(session: LogicalSession) {}

// Create/open: new Session(...) or storage.open(...) -> SessionService
const created = await ctx.sessions.create(options)
const opened = await ctx.sessions.open(id, options)

// Live lookup/list: private Map or file scan -> SessionService
const one = ctx.sessions.get(id)
const live = ctx.sessions.list()

// Identity/header: concrete fields or storage metadata -> logical session
const id = session.id
const header = session.header

// Events: session.events[index] or handle.read(...) -> logical session
const event = session.eventAt(seq)
const events = session.snapshotEvents(from, to)

// Model-visible history: local event folding -> canonical surface
const surface = session.surface

// Write: push(events) or direct JSONL write -> logical session
session.append(type, data, surfaceIntent)

// Projection: concrete lifecycle subscription -> projection port
ctx.sessions.registerProjectionPort(projectionPort)

// Titles, statistics, filters, full-text retrieval, and cold reads -> SessionQuery
const page = await ctx.sessionQuery.query(request)

// Fork: copy arrays or files -> SessionService
const child = await ctx.sessions.fork(session, boundary, childId)

// Durability: flush a handle directly -> SessionService
const durable = await ctx.sessions.flush(session)
```

### 新貢獻者怎樣上手

1. 先讀[總覽](2026-09-06-logical-session-storage-rebuild.zh.md)，理解唯一目標：邏輯 Session 與所有物理實作完全解耦。
2. 再讀[能力協定](2026-09-10-session-capability-protocols.zh.md)和目前 `docs/subsystems/session.zh.md`；前者是目標，後者是所在 branch 的目前事實。
3. 按階段順序閱讀進度：1.1→1.2→1.3→1.4→1.5→2→3。不要只讀最後階段的 diff 後修改較早階段。
4. 從一個擁有明確呼叫方的遷移開始：改型別、改入口、補合約測試，並證明舊路徑沒有新增使用。生命週期、格式或失敗順序變化必須獨立成階段。
5. 提交前執行目標測試、型別檢查、文件檢查和依賴檢查；在 handoff 寫明 current、target、gap、下一刪除條件與準確 branch/commit。

## Alternatives considered

**等全部階段合併後再遷移外掛。** 拒絕，因為期間新增的具體依賴會擴大最終清理面。

**永久保留舊名。** 拒絕，因為雙入口會讓文件與型別永久分叉。臨時入口具有相容測試，只有在獲得外部遷移證據後才能透過獨立決策移除。

## Acceptance criteria

- 階段 1 以上的新程式碼以 `LogicalSession` 作為推薦工作階段物件並從 `SessionService` 獲得它；deprecated `Session` 入口繼續相容現有外部程式碼。
- 普通外掛不匯入具體 provider；依賴門檢查該規則。
- 階段 5 前的相容入口有覆蓋、已命名舊消費方和刪除條件。
- 新貢獻者能從總覽、協定、目前子系統文件和階段順序定位一個安全遷移任務。

## Risks

不同 stack 層暴露不同 API。開發者必須以目標 branch 為準，不把階段 3 的 API 回寫到較低階段。`LogicalSession` 也不能吸收沒有自然歸屬的搜尋、統計或 I/O，避免變成新的大物件。
