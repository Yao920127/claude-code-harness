# Agent Note: 基於控制代碼的工作階段持久化

Status: implemented

[English](2026-08-27-handle-based-session-persistence.md) | 中文

## 問題

先前的持久化 seam 承擔的遠不止儲存。一個共享協調器訂閱 `session/created`/`session/event`/`session/flush`/`session/disposed`，並接管任何已釋出的工作階段（無主認領、HMR 重新播種、已儲存字首接管）；一個帶獨佔預留的有界已準備 Session LRU 用同一個快取服務恢復與只讀觀察；提交式崩潰修復內嵌在 `load`/`prepare` 中；樂觀的 revision 讀取/複核/再讀取迴圈充當所有權的替身，因此持續的外部寫入方可能使讀取活鎖，而且沒有任何機制排除第二個寫入方。服務表面（十二個方法）把儲存與 Session 建構和生命週期混在一起。跨程序寫所有權——下一步——在那種形態裡沒有誠實的歸宿：所有權屬於一條有明確持有者的逐工作階段通道，而不屬於一個全域監聽器。

## 決策

**該 seam 是五個返回或供給逐工作階段控制代碼的服務方法。**`create(header)` 儲存一個新工作階段並返回其持有的寫控制代碼；`open(id, 'read' | 'write')` 開啟一個已有工作階段；`stat(id)`/`list()` 觀察快照（`header`、不透明 `revision`、可選的 `eventCount`/`sizeBytes` 提示——JSONL 後端提供 `sizeBytes`），而不讀取日誌；服務級 `flush()` 是一道後端範圍的永續性屏障，排空並 flush 每一個活躍寫控制代碼，逐工作階段聚合失敗而不中途放棄清掃。該 seam 不承載原始工件匯出：WebUI 的 ZIP 下載在 dsh-session-log-export 中從讀控制代碼序列化邏輯日誌（header 行 + 事件），因此每個後端的匯出完全一致，僅 JSONL 可用的 501 路徑也隨之消失。`SessionHandle` 承載 `read(offset?, length?)`（經過驗證的連續字首切片，絕不返回撕裂尾部，逐控制代碼單調）、`append`（連續；完成時的持久化是盡力而為的，交付的 JSONL 後端恰好會立即持久化每個批次）、`flush`（永續性屏障，同時把空工作階段實體化）以及冪等且不可取消的 `close`。一種控制代碼型別同時服務兩種存取——在讀控制代碼上執行修改是執行時的 `SessionReadOnlyError`，這是本程式碼庫其他 seam 的既定慣例，而非型別層面的拆分。單寫者所有權由註冊表在程序內強制（`SessionAlreadyOwnedError`）；持久的跨程序租約是計劃在同一形態上疊加的下一層。

**agent 生命週期負責取得控制代碼；後端負責事件驅動的流程。**agent-loop——工作階段在生產環境中唯一的釋出點——在釋出之前取得控制代碼（新建工作階段用 `create`，並透過它追加建構 seed；恢復用 `open(id, 'write')`），並在與排空迴圈相同的記憶化 teardown 中關閉它。由於持久化已保證每個工作階段 id 只有一個活躍寫控制代碼，後端一次性安裝工作階段監聽器並按 id 路由：`session/event` 進入持有控制代碼的有界 write-behind 視窗（內部排程策略，而非設定），`session/flush` 作為永續性與錯誤觀察屏障，`session/disposed` 作為最終排空並關閉。寫路徑沒有任何部分跨越包邊界——沒有寫入器元件，沒有批處理設定，沒有排空註冊表。根 fiber 的 dispose 會並行執行每個 fiber 的 disposer，因此 `close()` 本身會經由仍然開啟的儲存排空已路由的緩衝；後端 teardown 的關閉清掃使應用關閉無論哪個 fiber 先解退都不丟資料。該排空只保證已發出並緩衝的事件；turn 中途的根 dispose 仍會按設計丟失該 turn 尚未發出的剩餘部分——下一次恢復的 `interruptedTurnClosers` 會持久地修復這段尾部。在生命週期之外發布的工作階段不再隱式持久化；生產環境中沒有任何地方那樣做。

**語義崩潰修復移出了持久化。**恢復透過其寫控制代碼讀取物理上有效的日誌，計算 `interruptedTurnClosers`，並把它們（連同建構器的 `session/end-seed` 標記）作為普通批次透過同一控制代碼追加——修復不是特殊的儲存入口。只讀觀察方（session-query）僅在記憶體中配平被中斷的冷日誌，並擁有以 `stat().revision` 為鍵的冷 Session 快取；持久化側的已準備快取與 revision 收斂迴圈被刪除。

**可見性與新鮮度是顯式的。**已建立的工作階段自 `create` 起即可在程序內被觀察到；物理實體化（純粹的最佳化）可以推遲到第一次 append 或 flush，其他程序只能看到已實體化的工作階段，實體化之前崩潰意味著該工作階段從未存在。一旦某次 append 或 flush 完成，其後在同一後端實例上開始的讀取至少能觀察到該字首——這正是 `message-feedback` 持久目標檢查所依賴的保證。

**revision 簡化為逐實例變更權杖。**權杖相等可視為日誌未變；所有權變動絕不會改變權杖。JSONL 透過一次 `fs.stat` 派生盡力而為的權杖與 `sizeBytes`；儲存介質能夠廉價統計事件數的後端可以改為提供 `eventCount` 提示。Session listing 保持零正文讀取的 metadata/cache 操作：它信任快取的非空 projection，只在目前 cache identity 匹配時保留快取的空值，否則用 `blank: false` 表示可見的未知退回。冷空白探測及其探測限制設定均不再存在。

## 考慮過的替代方案

**型別化的讀/寫控制代碼類（或過載）。**不作為該 seam 的風格採納：本程式碼庫的 seam 偏好帶存取標記的單一型別加執行時拒絕，而拆分會為一個編譯期檢查讓每個面向消費方的型別翻倍。

**在控制代碼旁保留協調器的接管/HMR 寫路徑。**不採納：接管的存在是為了事後猜測所有權；當生命週期顯式移交控制代碼後，無法服務舊控制代碼的過載後端會向寫入器響亮地失敗，而不是靜默地重新認領日誌，而沒有控制代碼的工作階段是一個由持久化缺席暴露、而非被接管掩蓋的組合缺陷。

**在控制代碼旁提供服務級 `append(id, events)`。**不採納：按 id 定址的寫路徑繞過所有權；每次寫入都流經持有控制代碼，使未來的租約檢查恰好只有一扇門。

**由持久化持有批處理設定。**不採納：批處理視窗是寫路徑內部的排程策略，而非隨部署變化的選擇，因此它是 provider 常數，任何地方都不存在設定旋鈕。

## 後果

恢復、fork、subagent、ACP、webhook 與 SDK 工作階段全部經由一個顯式取得點持久化，且 dispose 可證明地釋放寫所有權（teardown 之後重新以寫模式開啟可以成功）。代價：在有活躍工作階段時過載後端外掛會使它們的控制代碼失效——寫入會響亮地失敗，直到工作階段重新啟動，而以前接管會靜默重連；測試中 `ctx.sessions.create` + `flush` 在沒有控制代碼時什麼也不持久化（測試透過 `create`/`append`/`close` 播種）；只有當緊鄰其前沒有觀察讀解析過同一產物時，恢復才重新讀取冷日誌——一個有界的 provider 內部 memo（按工作階段 id + stat 修訂號，任何本地修改都使其失效）服務觀察後提升與授權後恢復這兩類交接，而不恢復已刪除的 borrow/reservation 生命週期；session-query reader 自己的已準備快取仍是其上方具備 pin 能力的一層（後續可考慮二者收斂）；空的已建立工作階段在顯式 flush 之前對其他程序不可見（ACP 為其可恢復空工作階段承諾強制執行一次 flush）。控制代碼所有權不改變序列化的 Session 表示。

## 相關

- [作為抽象服務的工作階段持久化](2026-06-14-session-persistence.zh.md)——本 Note 重塑的 seam；其介面列表已反映控制代碼 API。
- [持久化 export() 與預釋出讀取路徑精簡](../../archived/simplification/2026-08-27-persistence-export-and-pre-release-trims.md)——預備性的移除，包括已退役的冷空白探測。
- [保留可忽略的外部工作階段事件](2026-08-30-retain-ignorable-external-session-events.zh.md)——讀取側的拒絕約定，現經由 `storage-contract` 輔助函式共享。
- [為工作階段持久化寫入批處理設定上界](../../archived/architecture/2026-08-08-bounded-session-persistence-write-batching.md)——被路由寫路徑作為內部排程策略保留的批處理語義。
