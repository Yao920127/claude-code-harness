# Agent Note: 工作階段投影作為必需的讀取 seam

Status: implemented

[English](2026-08-19-session-projection-mandatory-seam.md) | 中文

## 問題

可選的投影註冊表會讓 host 行為讀取投影狀態的外掛在缺少該狀態時仍然啟用。除非讀取方拒絕缺失的註冊表或 key，否則 host 行為或 subagent 目錄欄位可能靜默消失。只有批次讀取也會在消費方只需要一個 host 值時物化每個用戶端 view。部分貢獻位置有意保留可選的 `ctx.inject` 註冊形式，因此其讀取方需要明確的缺失狀態規則。

## 決策

本決策建立在[工作階段投影的 host 狀態與用戶端檢視](../../archived/architecture/2026-08-19-session-projection-state-and-client-views.md)所定義的拆分之上。

每個 host 讀取方都把投影註冊表及其所需 key 視為必需狀態。外掛要麼把 `sessionProjections` 宣告為必需注入，要麼顯式解析註冊表與 key，並在第一次依賴它們的存取時拋錯。正式組合在這些外掛之前掛載註冊表。`ApiProxyService` 採用必需注入形式；較低層的 `createApiProxy` factory 對隔離測試和診斷保持容錯。

領域貢獻方可以透過 `ctx.inject(['sessionProjections'], ...)` 註冊單元。可選註冊只控制子功能生命週期；它並不允許讀取方在註冊表或 key 缺失時替換為預設值。

註冊表提供 `stateOf(session, key)` 來讀取一個型別化 host 狀態，併為批次 carrier 保留 `snapshot()`。用戶端 view 只包含消費方使用的欄位；host 讀取方透過 `stateOf` 取得更豐富的狀態。

`onChanged` 只發布用戶端可見值的變化。單元註冊和移除仍是繫結 effect 的註冊表生命週期；`register()` 返回 Cordis 的原始 disposer，使組合式領域 owner 可以先依據投影狀態完成清理，再移除自身單元。註冊變化不會建立第二條 Host 事件流或用戶端 tombstone 協定。後續權威 history 或 list 基線會反映活躍 key 集。

## 考慮過的替代方案

- **為缺失的投影狀態提供預設值。** 這會保留更多不完整組合，但缺失 host 狀態將無法與合法空值區分。正式 profile 已掛載註冊表，設定錯誤必須顯式失敗，因此否決。
- **要求每個貢獻方都在啟用時強依賴。** 這會統一 key 集，卻會讓貢獻生命週期與服務啟用產生不必要的耦合。首次存取時顯式失敗既能保留可選註冊形式，也不會允許靜默降級。
- **每次讀取都使用 `snapshot()`。** 這隻保留一個方法，但會計算無關 wire view，並鼓勵消費方讓 host 邏輯依賴批次傳輸資料。改用型別化單 key 狀態讀取。
- **向用戶端傳送完整 host 值。** 這避免單獨的 view 型別，但會暴露用戶端不消費的來源資訊和策略旋鈕。改用顯式裁剪的 view。
- **跨 Host 和 mux stream 廣播註冊表新增和移除。** 兩條 stream 沒有共享順序，用戶端因此需要 tombstone、緩衝幀和基線重試來協調。外掛 key 變化不值得引入第二套同步協定。

## 後果

- 缺少投影組合會在啟用期間或第一次依賴它的 host 存取時失敗，絕不會降級為預設值。
- host 消費方避免重複的全註冊表快照和日誌掃描。
- 協定負載排除 host 內部欄位和逐 key 水位包裝；普通基線會傳達活躍 key 集。
