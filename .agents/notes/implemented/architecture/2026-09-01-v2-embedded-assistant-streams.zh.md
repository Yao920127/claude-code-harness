# Agent Note: 在 v2 attempt settlement 中嵌入 Assistant stream

Status: implemented

[English](2026-09-01-v2-embedded-assistant-streams.md) | 中文

## 問題

Token 粒度的 `assistant/chunk` 事件會保留精確的 stream 順序、時間、usage、terminal state、replay metadata 與失敗時的部分輸出，但讓每個 chunk 成為頂層 Session event 會在持久化、遙測、歷史傳輸、索引和 Client 組裝中重複信封。物理 packed row 可以減少 JSONL 位元組，卻不會減少邏輯事件數，也不會減少接收規範 stream 的消費方工作量。

只儲存組裝後的成功 message 可以消除這些開銷，但會丟失失敗與放棄的輸出、token 邊界、時間戳和確定性 provider replay。持久記錄需要讓每個模型 attempt 只佔一個單位，同時不減少 replay、診斷、取消恢復、usage 記帳、snapshot 與 UI 歷史依賴的證據。

改變事件基數也會改變 Session 序號。已釋出遷移必須保留無關事件的相對順序、改寫每個已宣告的同 Session 引用、保留精確 fork 切點，並拒絕任何無法保持語義的關係。

## 決策

[V3 規範信封決策](2026-09-06-v3-canonical-session-envelopes.zh.md)負責目前替換鍵與請求頭接納規則。它保留本文的嵌入式 stream、嘗試結算與凍結的 v1-to-v2 轉換。

Session format v2 沒有頂層 `assistant/chunk` 事件。每個模型 attempt 提交一個包含 `stream: AssistantStreamRecord[]` 的持久 settlement：

- `assistant/message` 是成功回應或具有可見組裝內容的已取消回應所對應的 surface settlement。它在組裝 message 旁嵌入精確的緊湊帶時間 stream、可選 usage 與可選 `interrupted: true` marker。
- `assistant/attempt` 只進入日誌。它保留已到達 settlement、但沒有 surface message 的失敗、重試、取消或 stream error attempt，因此診斷與記帳不會虛構模型可見歷史。

`AssistantStreamAccumulator` 對每個 chunk 只快照一次。同一 block 的連續 text、reasoning 或 tool argument delta 會變成一個緊湊 run，包含首個時間戳、精確時間戳間隔和每個原始 delta 對應的一個陣列成員。其他 chunk 保留為帶時間戳的 raw record。`expandAssistantStream()` 會嚴格驗證並重建精確的帶時間序列；壓縮絕不會合並 delta 邊界。

Migration publication verifier 與凍結的 v2 fixture validator 要求嵌入式 stream 能復現非空 `assistant/message` 的 content、usage 與 replay state。對於沒有源 chunk 的已遷移舊 message，空 stream 仍然有效。普通 Session restore 只驗證 runtime 直接依賴的 settlement 欄位，不展開全部歷史 stream；需要展開 compact stream 的 consumer 會在讀取時驗證 record。`assistant/message` 不能攜帶已停用的 chunk `sourceEventSeqs`；普通 user 與 tool source-event reference 保持可用。

### 即時呈現與持久回放

`agent/assistant-stream` 釋出程序本地 start、瞬態 chunk 與 end frame。loop 會在 committed end frame 命名其型別和序號前追加完整的 `assistant/message` 或 `assistant/attempt`。abandoned end 沒有 settlement。

Web follow adapter 顯式選擇接收這些程序本地 frame，併為每個 start 補充當時觀察到的最後一個持久序號。它把 chunk 呈現為持久 cursor 之間的 Client-only `assistant/live-chunk` update，只暫存 start 之後匹配的 settlement，並在 revision 缺口時重新開啟 follow。committed end 會發布具名 settlement delta，刪除該 attempt 的 transient match、加入持久 entry，並只重放受影響的 Conversation Context；abandoned end 會發布不含 entry 的同類 delta。重連 baseline 攜帶活躍 attempt 的持久起始 cursor 與緊湊字首。

Client event source 原樣傳遞持久 settlement。Chat 與 Trajectory 在 attempt 活躍時摺疊 `assistant/live-chunk`，直接從 `assistant/message` 建構 settled output。結算移除臨時 chunk 後，Chat 不會重建首 token 計時。Trajectory 從 `assistant/message` 與 `assistant/attempt` 中的[緊湊流記錄](2026-09-06-embedded-stream-record-readers.zh.md)讀取計時，包括開啟歷史時。兩個目標都不會為展示將已結算流展開為逐 delta 物件；其他消費方需要精確證據時仍可展開持久 stream。

### 已釋出 v1 到 v2 遷移

相鄰遷移會驗證完整的凍結 v1 產物，按 turn、step、terminal boundary 與精確 message chunk reference 對 chunk 分組，再為每個 attempt 替換一個 settlement。成功分組的 chunk 移入其 message。未被認領的分組會在最後一個被消費 chunk 的位置變成 `assistant/attempt`。無關的交錯事件保持相對順序，存活事件獲得密集 v2 序號。該遷移邊透過 `dsh-llm` 執行時的 `AssistantStreamAccumulator` 壓縮嵌入 stream，而不持有凍結副本，因為該包擁有 v2 stream 編碼。隔離的 publication verifier 透過 `expandAssistantStream()` 與 `BlockAssembler` 展開並重組寫入後的 stream，並在釋出前檢查每個遷移後的 `assistant/message` 是否與其一致。日後若某個格式改變 stream 編碼，必須把這些 helper 的凍結副本納入本遷移邊。

該遷移邊會重對映有限的已宣告引用清單：信封 source-event reference、surface replacement 端點、command source event、compaction range 與 shadowed list，以及 title message list。經過驗證的 `session/title-llm-request` 模型可見文字會在源序號名稱空間中保持逐位元組不變，而它的 `messageSeqs` 欄位會遷移到 v2 名稱空間；因此目標驗證不會根據重對映後的序號重建該文字。指向被消費 chunk 的引用會使遷移失敗；它絕不會被重定向到含義不同的 settlement。該遷移邊也會拒絕切開 attempt 的繼承切點。

v2 物理 header 要求 `isSeeded`，且不儲存數值切點。帶 seed 的產物用 `session/end-seed { inherited: true }` 標記其精確切點；解碼從最後一個 tagged marker 推導切點。v2 編解碼器為每個持久事件寫一條物理行，只對 `sourceEventSeqs` 做範圍編碼，並在不凍結普通事件詞彙或 payload 新增項的前提下驗證物理 envelope。v1-to-v2 target validator 會另行凍結 released-v2 清單，current restoration 則使用 installed Session 詞彙。凍結的 v0 與 v1 編解碼器繼續為不可變歷史 generation 解碼 packed row。

新建 subagent 子項的 constructor seed 與繼承的父項字首完全相同。`Session` 會追加 tagged cut marker，隨後 subagent setup 再追加子項持有的 descriptor 與 delegated policy。原 descriptor-seed helper 會被刪除，因此 descriptor 絕不會計入繼承內容，cold resume 則重放已經持久化的子項 setup。曾把 untagged marker 放在 descriptor 後面的歷史 snapshot fixture 會在源處修正；目前比較仍會暴露 marker 數量與序號引用。

`dsh_session_log` request extension 的外層 schema 保持版本 1：它的 Session header 投影仍從邏輯 inherited cut 推導 `seedLength`，只有其中的 `sessionFormatVersion` 成員標識嵌入的邏輯 Session generation。projection unit 同樣保持各自的 `stateVersion`；projection cache 把每個 checkpoint 繫結到 Session format generation，因此 generation 變化不需要提升 unit 版本。

Generation 選擇與釋出遵循[已釋出 Session 遷移決策](2026-08-31-released-session-format-migrations.zh.md)：源路徑、位元組與 inode 保持不變，只發布最終具名版本 successor；保留 predecessor 不提供 fallback 或 downgrade 支援。

## 驗證

緊湊 stream 測試固定 text、reasoning、tool argument、raw chunk、時間戳間隔、格式錯誤 record 與分離 snapshot 的精確累積和展開。v1 到 v2 測試覆蓋成功與失敗 attempt、交錯、密集序號與引用重對映、源序號 title framing、seed 切點插入與切分拒絕、嚴格源與目標驗證、每行一個事件的 v2 編碼、與 backend 相容的 source-event range、原始與 Zstandard 釋出，以及無寫入的目前讀取。

合併前的 performance acceptance 在三輪、100 組 warmup pair 與 600 組 measured pair 下，針對同一批已經解析的物理 row，把靜態 catalog routing 與直接 released-v2 restoration 比較；它不比較 v1 與 v2，也不計入 backend I/O。每個 pooled median 與 p95 regression 都保持在 5% 預算以內，最差 p95 regression 為 3.150%。

Agent-loop 測試固定先持久後 end 的順序、中斷的可見字首、失敗與重試 attempt、abandonment、usage 與 replay metadata。Session Controller 與 Conversation 測試固定即時瞬態顯示、重連 baseline、committed settlement 釋出與歷史回放。Chat 與 Trajectory 測試固定即時 partial 展示和最終 message 的直接投影；TypeScript 與 Python SDK snapshot 固定外部事件表示。

## 備選方案

**只持久化組裝後的成功 message。** 這會丟失部分失敗輸出、時間、token 邊界、沒有 message 的 attempt usage，以及精確確定性 replay。`assistant/attempt` 與嵌入式緊湊 stream 會保留這些事實，且不把它們加入模型歷史。

**保留頂層 chunk，只打包物理行。** 這會保留 v1 邏輯表示，卻讓序號密度、遙測量、wire 信封、Client entry 與消費方 dispatch 繼續與 token 數成正比。歷史編解碼器仍然解碼該表示；它不是目前事件模型。

**透過歷史 API 傳遞 packed chunk row。** 這會減少 v1 的 wire 與 Client 工作，卻讓 Client 擁有第二套事件詞彙，並讓傳輸繼續與 token-row 基數耦合。目前 API 攜帶標量持久 settlement，並使用獨立的即時瞬態 stream。

**在 Session Controller 中刪除嵌入式 stream。** 這會減少 Client 保留的記憶體，卻會引入第二種持久事件型別，並讓面向傳輸的 owner 決定展示消費方需要哪些證據。實測瓶頸來自重複展開，因此由各 UI 消費方決定是否檢查原樣傳遞的 settlement。

**把 stream 存在 sidecar 或 replay-only fixture 中。** 這會把一個 attempt 的 message 與證據拆給不同永續性 owner，也無法讓普通恢復 Session 獲得相同的失敗輸出與時間事實。settlement 是原子 owner。

**把被消費 chunk 的引用重定向到其 settlement。** Chunk 與 attempt settlement 不是可互換事實。拒絕可以防止遷移悄然改變外掛自有引用的含義。

## 後果

目前日誌、遙測與歷史頁按模型 attempt 而非 token chunk 擴充功能，同時在每個 settlement 內保留精確 stream 證據。Client event window 保留這份緊湊證據，但 Chat 與 Trajectory 的 Assistant node 不會把 settled stream 展開成逐 delta 物件。即時呈現保持增量，並且有意僅存在於程序內。

v1 的頂層 chunk 可能在 attempt 結束前由帶緩衝的持久化 writer 刷盤；與之不同，v2 在 settlement 之前沒有持久 attempt 證據。如果程序或主機在 settlement 前硬中斷，完整的 in-flight stream 都會丟失；`agent/assistant-stream` 不是 write-ahead log。這項取捨避免為即時輸出增加第二個永續性 owner。

一個 settlement 可能很大，v1 到 v2 遷移會物化完整產物及其序號對映。封閉的 Alpha 清單會拒絕未知 v1 事件與未宣告引用，而不會猜測。需要單獨 chunk 的消費方呼叫 `expandAssistantStream()`，並且絕不能從 `agent/assistant-stream` 推斷永續性。

遷移會改變被消費 v1 chunk 之後的序號，因此每個同 Session 引用都必須屬於顯式改寫規則。該約束有意讓未來的基數變化遷移保持昂貴，並防止格式鏈執行無聲的語義重定向。
