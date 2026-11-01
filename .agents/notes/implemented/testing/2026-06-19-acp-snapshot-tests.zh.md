# Agent Note: ACP 快照測試——一次錄製 / 確定性回放

Status: implemented

[English](2026-06-19-acp-snapshot-tests.md) | 中文

## 問題

單元測試不會覆蓋組裝後的完整 agent（智慧代理）子程序及其 ACP（Agent Client Protocol）自動化協定格式，而真實 API 測試不具確定性且受金鑰門控。因此，即使單元測試覆蓋率檢查透過，Loader 接線、後端行為和協定輸出仍可能迴歸，[預設匯出事故檢討（postmortem）](../../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md)已經證明了這一點。

完整 transcript（文字記錄）測試的阻塞因素在於模型：agent 的輸出由非確定性的 LLM（大語言模型）驅動，而每次執行都命中真實 API 的金鑰門控測試既不確定也無法在 CI 中執行。該測試層級需要真實執行的保真度與 fixture（測試前置資料）的確定性兼得。

## 決策

錄製工作階段快照透過 `dsh` 啟動隨附 profile，驅動其公開介面，並將規範化輸出與已提交的預期輸出比較。歸 ACP 所有的情境還會驅動 stdio 協定並比較其 transcript。從真實 API 一次記錄的工作階段日誌為後續所有模型流提供資料。fixture 是[產品持久化 JSONL 的投影](../../archived/testing/2026-08-18-session-snapshot-envelope-projection.md)：保留 header 與 payload，省略正文序號／時間 envelope。

[Session-log 快照語料決策](2026-08-24-session-log-snapshot-corpus.zh.md)取代本 Note 中 ACP 專屬的放置位置與控制器所有權；本 Note 繼續負責工作階段日誌 fixture、回放推導、例外 override、規範化和 ACP transcript 比較的理由。

### fixture 投影持久化工作階段 JSONL

每個情境數值最高的選定 parent generation 都從真實執行中採集：v0 為 `session.jsonl`，正 generation 為 `session.vN.jsonl`。`assistant/message` 與 `assistant/attempt` 中嵌入的緊湊 stream 會復現模型 attempt；工具、message 與 boundary event 捕捉 harness 行為。因此，一份普通 Session generation 同時充當 replay source 與行為預期輸出。

每個目前 Session-format fixture 都為每個持久事件使用一條物理行。保留的 v0 與 v1 predecessor generation 可以包含其凍結 packed-row 表示，並保持不可變。普通 replay 與 log 比較證明組裝程序會選擇、遷移、消費並復現目前 generation。

### 回放從日誌推導模型腳本

`llm-replay` 短路 provider-neutral `llm/stream` waterfall。`deriveReplayScript()` 把每個已記錄 `assistant/message` 或 `assistant/attempt` stream 展開為一次位置式呼叫，並驗證其 terminal chunk。攜帶 `llmStreamCall: true` 的 `compaction/summary` 會在其持久 log 位置貢獻一次呼叫：replay 根據 `rawOutput` 重建規範 block boundary，保留已記錄 usage（如有），並提供 terminal `stop`。該 marker 將這次本地呼叫與 template 或 remote summary 區分開；後兩者即使保留 `rawOutput`，也未使用此 context 的 adapter。

### 記憶體中的回放條目遵守完整的 LLM 約定

`deriveReplayScript` 產出一組 `ReplayEntry`，即回放監聽器按位置服務的記憶體單元：

```
{ kind: 'chunks', chunks: StreamChunk[] }
| { kind: 'throw', chunks: StreamChunk[], message: string, code: string }
| { kind: 'hang' }
```

Log 從持久 Assistant settlement 與顯式標記的 compaction call 推導 chunk 或 throw entry。Stream 開始前的 throw、hang 與 external summarizer call 沒有可重建的本地 stream 表示，因此這些情境提供 `replay.override.json`。throw entry 可以包含 prefix chunk 以模擬 stream 中途失敗。顯式 override 避免從有損 turn-end reason 或單獨 provider output 推斷 adapter 行為。

### 位置式回放，單個在途流

回放是位置式的，因此每個情境只允許一個在途模型流。並行工作階段快照需要按請求鍵索引的條目。呼叫順序變更需要重新錄製，fixture 缺失或耗盡時立即報錯。

### 錄製採集日誌；無金鑰回放需要無提供者的設定

記錄模式使用真實 `llm-deepseek` 介面卡和設定為 `persistenceCompression: 'none'` 的 JSONL 持久化後端執行情境，再把生成的 `.jsonl` 投影到情境目錄。顯式 raw 模式讓採集日誌保持逐行可讀，而普通部署使用後端的壓縮預設值；符合條件的分片連續段仍使用預設的打包儲存行。逐事件追加具有永續性，但 harness 會在採集前優雅關閉子程序（關閉 stdin → `await ctx.dispose()`），以確保最終事件已刷出。`llm-replay` 本身不執行記錄——它只負責回放。

回放使用 `cordis.snapshot.yml` overlay，以 `llm-replay` 替換真實介面卡，同時保留實際組合。記錄使用普通設定和由 harness 提供的持久化根目錄。回放模式跳過 `.env` 載入，因此意外存在的 API 金鑰不會觸發真實呼叫。參見[單一來源設定 Agent Note](../../archived/testing/2026-07-04-single-source-acp-replay-config.md)。

### 兩個表面：歸一化後比對

快照執行斷言**兩個**歸一化後的表面，因為 harness 的外部表面是不同的：

1. **stdout transcript**——自動化用戶端收到的、分幀後的 ACP JSON-RPC 回應與已提交的訊息更新。它捕捉傳輸約定的迴歸，與已提交的 `stdout.expected.jsonl` 比較。
2. **重新持久化的 Session JSONL**，規範化後與選定的最高 parent fixture 比較。同一個 generation 同時作為 replay source 與預期日誌；新鮮目前 writer 可以產生更高的規範檔名，而邏輯比較會保留較舊 replay 輸入。prompt 與工具 bulk 會被清理；每種 request header 類別由一個情境固定餘下 header sequence。該 pin 預設擁有可讀的 prompt 與工具 schema sidecar；完整對應 sequence 相同時，也可把另一個 pin 指定為任一來源，因此每個不同 sidecar 版本只提交一次。fixture guard 會拒絕重複 sidecar 內容，record/refresh 會拒絕生成不同位元組的共享 claimant。最初的 request header 固定理由保留在[請求頭固定 Agent Note](../../archived/testing/2026-07-06-pin-request-header-content-in-one-scenario.md)中。Override 情境只從其 sidecar 派生模型行為。

兩個表面互補：stdout 覆蓋精簡的自動化協定格式，JSONL 覆蓋協定格式有意省略的迴圈、工具和邊界結構。

規範化會替換工作階段、cwd、協定 id、時間戳、路徑和程序易變值；fixture 投影會省略正文序號／時間 envelope，而不修改 payload 引用。共享快照寫入器在儲存前展開頂層 `sourceEventSeqs` 區間，使錄製與重新整理直接產出規範 fixture 位元組，無需依賴回放時的規範化。錄製與重新整理還會在回放 fixture 中將生成的 workspace 及其檔案系統解析出的別名儲存為 `{{cwd}}`，使平臺臨時根目錄和隨機 basename 不影響錄製結果；手工編寫的臨時路徑與顯式 `workspaceParent` 下的 cwd 值仍保留字面值。情境把真實 bash 使用限制在穩定命令上。stdout 預期輸出仍是符合協定格式的 JSONL，每個原始行都必須可解析為 JSON。普通 Vitest 快照更新只寫入 stdout 預期輸出；回放 fixture 的寫入由顯式 `record` 和 `refresh` 模式負責。

### 隔離：目前靠歸一化，後續可加沙箱

工具確定性來自生成的 cwd、清理後的環境、全新的非登入 shell、受限命令和規範化。cwd 預設為平臺臨時目錄；當臨時目錄是始終可寫的策略根，而行為需要獨立專案位置時，情境可以改為提供其父目錄。並行回放執行各自擁有獨立 cwd、持久化目錄和定長且按情境鍵區分的 spill 根目錄，因此一個情境的清理操作無法刪除另一個情境仍在進行的完整輸出恢復，同時真實路徑預覽預算保持穩定。該層不聲稱提供 OS 級隔離。如果需要更強層級，沙箱執行器可以透過現有[能力 seam](../architecture/2026-06-13-capability-seams.zh.md)替換本地後端。

### 回放外掛是獨立的包

`@deepseek-ai/dsh-llm-replay` 是一個支撐包，而非範例本地的膠水程式碼。它透過用從 JSONL 重建的流短路 `llm/stream` 來替換真實介面卡，其包級放置使回放邏輯處於正常覆蓋率門禁之下。

### 兩個子命令，回放在預設門禁中

`pnpm run test:snapshot` 無需金鑰即可 replay 已提交 fixture；`test:snapshot:record` 使用真實 API，並寫入投影后的目前 Session generation 與介面專屬預期輸出。同一無金鑰 gate 會透過檔名/header 一致性發現儲存庫中的規範 JSONL generation，並拒絕與共享 codec 的投影后規範打包表示不同的任何 fixture。缺失角色會明確失敗。每個 ACP 情境都包含 `input.json`、`stdout.expected.jsonl` 與一個選定 parent `session[.vN].jsonl`；不呼叫模型的情況使用僅含 header 的日誌。其他 profile 從選定 parent generation 推導普通 accepted user input，只在 `snapshot.yml` 中保留 accepted Session 無法重建的 controller input。只有成功模型行為無法從日誌推導的情境才需要 `replay.override.json`。fixture guard 會拒絕缺失、不匹配、非規範與孤立檔案。兩個命令都接受情境 filter。

## 曾考慮的替代方案

- **手工編寫包含模型分片的 `llm.json`**——早期草案；複用真實工作階段日誌，使 fixture 成為系統的真實產物而非手工建置的 mock，並讓它同時充當行為預期輸出。
- **為每個壓縮摘要強制提供回放 override**——否決：持久摘要事件已經固定成功本地呼叫的位置、完整輸出與可選 usage。顯式的本地呼叫標記保留了這份單一來源 fixture，而不會為範本摘要器或遠端摘要器憑空建構呼叫。
- **位元組級 HTTP 錄製庫（Polly/nock/MSW）**：否決。與介面卡耦合，處理流式 SSE（Server-Sent Events）時笨拙，且層級低於被測物件。
- **從 `turn/end {kind:'error'|'aborted'}` 合成拋錯/取消條目**：否決。這會將 `llm-replay` 耦合到 loop 內部的輪次關閉語義，且 `turn/end` 原因是有損的（無法區分丟擲的 401 與 finish-error）；顯式的 `replay.override.json` 伴隨檔案是更清晰的 seam。
- **在每個類別 pin 旁複製兩個請求頭伴隨檔案**：否決。提示詞與工具 schema 的組合各自獨立變化，因此一個共享元件發生變更，就會使不相關類別 pin 中位元組完全相同的檔案產生無意義改動。顯式的分元件來源可在不重複內容的情況下，為每個類別保留一個結構性 pin。

## 後果

該測試層為每個情境增加經過評審的工作階段、manifest、介面專屬預期輸出、可選 override 和可選 workspace fixture，併為每個不同的已固定提示詞序列、每個不同的已固定工具 schema 序列各增加一個檔案。記錄與回放都會把 workspace seed 複製到生成的 cwd。作為回報，該層透過真實 Loader 和工具組合提供確定性的無金鑰覆蓋，其中包括一個組裝後的上下文溢位恢復情境，其帶標記的壓縮摘要提供輔助呼叫。ACP 子樹現在只保留協定行為；屬於 headless、SDK 和 Web 介面的行為由各自介面擁有。

本 Agent Note 與[擬議的確定性 Agent Note](../../proposed/testing/2026-06-11-deterministic-and-stress-testing.zh.md)相關，但不取代它：該提案的「通用回放 fixture」在每次測試後重新派生工作階段*訊息歷史*（內部一致性不變數），而這些快照固定組裝後的行為與介面專屬輸出。兩者仍相互補充。
