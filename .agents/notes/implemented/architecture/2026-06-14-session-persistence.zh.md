# Agent Note: 工作階段持久化作為基於現有 `SessionEvent` 的抽象服務

Status: implemented

[English](2026-06-14-session-persistence.md) | 中文

## 問題

工作階段此前僅存在於記憶體中。範例外掛 `session-jsonl.ts`（在兩個範例中逐位元組重複）是隻寫的遙測：它緩衝 `session/event` 並追加 JSON 行，沒有讀取/回放路徑，沒有崩潰安全性（無 fsync、無原子寫入、dispose（資源釋放）時採用 fire-and-forget 方式排空），沒有列表功能，也沒有格式版本控制。沒有任何機制能將磁碟上的歷史工作階段重新注入到活躍的 agent（智慧代理）中，因此持久恢復、持久 fork 以及主機側的工作階段瀏覽都無法實作。

[事件溯源模型](2026-06-11-event-sourced-sessions.zh.md)將僅追加日誌作為唯一真源，並從中派生 LLM（大語言模型）歷史。持久化必須忠實於這一設計：直接持久化現有的 `SessionEvent`，不引入需要來回轉換的並行「持久化訊息」型別。後端也必須可替換——目前用檔案儲存，以後用資料庫儲存——並由同一介面封裝。

## 決策

持久化是一個具有抽象 Service Definition 的**能力 seam**（[能力 seam](2026-06-13-capability-seams.zh.md)，`dsh-shell` 範本），而非迴圈或核心邏輯：

1. **介面**（`dsh-session-persistence`，`ctx.sessionPersistence`）：一個抽象的 `SessionPersistence` 服務，提供 `create`/`open`/`stat`/`list`/`flush`，其中 `create`/`open` 返回逐工作階段的 `SessionHandle`，控制代碼承載 `read`/`append`/`flush`/`close`（[基於控制代碼的 seam](2026-08-27-handle-based-session-persistence.zh.md)）。其持久化單元就是現有的 `SessionEvent`（`{ type, seq, time, data }`），原樣複用，無轉換型別。
2. **實作**（`dsh-session-persistence-jsonl`）：每個工作階段一個僅追加的邏輯 JSONL 日誌：先是一行 `SessionHeader`，隨後是無損表示連續 `SessionEvent` 流的儲存記錄。目前格式每個事件寫一行；凍結的 v0 與 v1 reader 保留其歷史 packed-delta 表示。[帶總和檢查碼的 Zstandard 幀](2026-07-19-zstandard-jsonl-session-logs.zh.md)是預設物理編碼，也可透過設定使用原始行。

長期有效、存在爭議的關鍵選擇：

- **規範持久日誌無損保留每個目前 `SessionEvent`。** 一個 `assistant/message` 或 `assistant/attempt` 會嵌入該 attempt 的精確帶時間 provider stream；`deriveMessages()` 只投影 surface message。刪除嵌入 stream 成員看似誘人，但會丟失 replay、timing、usage、部分失敗與診斷事實。移除完整事件同樣需要密集重新編號，因為 `seq = log.length` 且 `events[i].seq === i`；[v1 到 v2 遷移](2026-09-01-v2-embedded-assistant-streams.zh.md)會顯式執行該改寫，而不是過濾規範日誌。
- **僅追加；崩潰的輪次被關閉，而非截斷。** 已刷寫的事件永不被重寫。[語義檢查點策略](../../../../packages/session/session-checkpoint-policy/README.zh.md)會在呼叫模型前排空請求、在呼叫工具前排空已記錄的頂層呼叫，並在步驟結束後排空完整的回應/結果批次；迴圈則排空最終輪次邊界。由於一個被中斷的輪次可能包含大量有效工作，持久化會原樣返回其連續、可解析的事件；配平是讀方的職責——resume 會為未應答的 assistant 呼叫計算按風險分類的錯誤結果、補一個缺失的 `step/end`，以及帶 `{ kind: 'interrupted' }` 的 `turn/end`（`interruptedTurnClosers`），並透過其寫控制代碼追加它們，而只讀觀察方僅在記憶體中新增同樣的收尾事件。合成結果保證恢復後的提供者 transcript（文字記錄）仍然有效。只有撕裂的最終 append 中不完整的碎片會被丟棄——從中恢復的完整記錄由寫路徑在第一次新 append 之前持久重寫；已提交字首中的解析錯誤或序號間隙，屬於資料損壞，會使該工作階段不可載入。
- **檔案後端為規範實作，服務保持可擴充功能。** `dsh-session-persistence-jsonl` 是唯一 first-party provider，並透過 `runPersistenceContract`；抽象服務繼續供儲存庫外 provider 使用。[JSONL-only 持久化決策](../simplification/2026-08-30-jsonl-only-session-persistence.zh.md)負責 first-party 資料庫 provider 的刪除及其明確 compatibility cut。
- **中繼資料在日誌之外。** 格式版本、cwd 和譜系是儲存關注點，不是可回放的對話狀態，因此它們存放在 `dsh-session` 擁有的 `SessionHeader` 中，並透過新的只讀屬性 `session.header` 附加到 `Session` 上——永遠不進入 `SessionEventMap`，永遠不到達 `deriveMessages()`。`createdAt` 是以 Unix epoch 毫秒錶示的非負安全整數：執行時建立和持久化註冊會拒絕小數值，JSONL 會驗證解碼後的 header。替代方案（一個可合併擴充功能的 `session/meta` 事件作為日誌第 0 行）被否決：日誌內事件會自然隨 seed/fork 的工作階段攜帶，但中繼資料不是可回放狀態，因此顯式的日誌外 header 邊界是更清晰的取捨。（header 最初被拆分為不可變的 `SessionHeader` 加可變的 `SessionSummary`，二者的聯合型別為 `SessionMeta`；可變 summary 後來因屬於死狀態而被移除——見 [移除可變工作階段摘要](../../archived/simplification/2026-06-19-drop-mutable-session-summary.md)。）
- **`ctx.agents.create()` 和 `ctx.agents.resume()` 是非同步工廠；恢復還跨越持久化邊界。** `ctx.agents.resume({ resumeSessionId })` 開啟該工作階段的寫控制代碼，讀取已儲存的日誌，並以持久化 id 釋出準備好的 Session，繼續其投影。[Session 準備階段決策](../../archived/architecture/2026-08-05-session-preparation.md)定義未釋出 Session 的所有權視窗。agent loop（智慧代理迴圈）不會硬注入 `sessionPersistence`（那樣會讓非持久化的演示永遠掛起）；當它不存在時，`resume` 會以明確的錯誤拒絕。

## 曾考慮的替代方案

上述每個關鍵選擇都在陳述處記錄了被否決的替代方案：**過濾 stream 的規範日誌**會丟失 attempt 證據，而未透過顯式遷移移除事件會破壞連續序號；**截斷崩潰的輪次**會靜默銷燬長時間自主執行中的真實工作；**日誌內 `session/meta` 事件作為第 0 行**——中繼資料不是可回放狀態；**有限的非整數 `createdAt` 值**沒有生產方，且與整數 Unix 毫秒儲存不一致；**將 `sessionPersistence` 硬注入迴圈**會讓非持久化的演示永遠掛起。

格式版本控制：header 攜帶 `version`；控制代碼只暴露由 `SESSION_FORMAT_VERSION` 選定的邏輯格式（[版本真源](../../../../docs/session-format-status.zh.md)）。JSONL 的事件正文讀取會在返回控制代碼前組合完整的靜態相鄰遷移鏈；每條遷移邊擁有自身的歷史轉換。V0 保留無字尾的 `session.jsonl[.zstd]`，正版本則使用不可變的小寫 `session.vN.jsonl[.zstd]` 名稱（[已釋出 Session 遷移](2026-08-31-released-session-format-migrations.zh.md)）。目前 generation 的 append 與 flush 能穩健處理不完整尾部寫入；未來 provider 或 WAL 必須定義自己的斷電與恢復約定。

## 後果

Service Definition、JSONL provider 與 `dsh-session` 中的中繼資料約定（`session.header`，`create(header, options?)` 簽名）帶來持久恢復/fork、讀取/replay 路徑、崩潰容忍，以及基於現有事件溯源日誌的主機側 Session 存取。可複用 `runPersistenceContract` 測試套件以相同的僅追加、連續 seq、惰性物化、邏輯恢復、整數中繼資料與可序列化語義約束該 provider 與未來實作。持久化完整邏輯日誌也確定了事件保真度：每個 Assistant attempt 都在一個持久 settlement 中保留其精確緊湊帶時間 stream。
