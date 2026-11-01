# Agent Note: 每次工具呼叫前的實驗性 Auto review

Status: implemented

[English](2026-08-28-auto-review.md) | 中文

## 問題

Full access 讓有用的專案工作無需反覆審批即可繼續，但也允許破壞性操作與敏感資訊外洩。把審批委託給模型的權限模式需要明確的權威策略、完整待執行動作描述，以及絕不執行被拒絕 body 的失敗路徑。共用 Full access 的執行旋鈕也使獨立持久模式身份成為必要，包括 child 繼承較早 fork 字首的情況。

## 決策

[`dsh-experimental-auto-review`](../../../../packages/experimental/auto-review/README.zh.md)是顯式安裝的實驗性 Web 層，按[實驗包釋出決策](../process/2026-09-12-publish-all-experimental-packages.zh.md)參與釋出。預設 Web 保持 Read Only、Workspace Write 與 Full access。此層貢獻僅限目前工作階段的 `auto`，唯一持久身份為 `permission/preset:auto`；它使用 Full access 的 `danger-full-access` 沙箱與工具定義，審批策略由[使用者審批後備決策](2026-09-24-auto-review-user-approval-fallback.zh.md)決定。Headless、通用設定與新工作階段預設值都排除此 integration。

每個原生呼叫與已開始的 PTC `tools.*` inner call 都在 body 前接受一次審查。外層 `run_code` transport 與 PTC 程式內直接 Node 效果不在保證範圍內。不提供按工具名豁免、快取 grant、重試、可設定策略或第二授權檢查；拒絕之後的行為由[使用者審批後備決策](2026-09-24-auto-review-user-approval-fallback.zh.md)負責。重複呼叫也重新審查。

### 效果與權威

固定策略遵循 allow／soft-deny／hard-deny 區分，按動作實際效果分類，不按名稱或聲稱意圖分類：

| 風險 | 範例 | 決定 |
| --- | --- | --- |
| `low` | 普通專案內讀寫、分析、format／lint／test／build、非破壞性 Git，以及保留呼叫能證明在本 Session 建立的物件的精確清理 | 允許 |
| `medium` | 不可逆刪除既有狀態、force push／歷史改寫、生產讀寫／部署、非敏感外部寫入／傳送，以及權限／安全／系統變更 | 只有目前 human 或直接父級明確授權動作、準確目標與必要範圍時才允許 |
| `high` | 敏感資料跨越目前信任邊界外洩及等價 hard-deny 效果 | 拒絕，包括顯式請求的動作 |

實際效果不明確或超出已確立範圍時按拒絕處理。後續指令只有明確撤銷或替換舊指令才能消除衝突；直接父級指令不能覆蓋 human 限制。歷史可以證明物件由本工作階段建立，但不能授權 medium 操作或解除 high 禁令。

Reviewer 從既有 Session 事實派生權威。Shipped Web human 指令具有 `source.kind === 'user'` 和瀏覽器 prompt admission 寫入的 `rpcId`。Child 初始直接父級 prompt 在其自身既有建立 descriptor 之後識別；後續 `agent-message` 只有 `senderSessionId` 與 `SessionHeader.parentSession` 匹配時才屬於直接父級指令。Human 文字定義或替換任務與限制。直接父級文字在這些限制內定義 child 任務。專案指令只施加約束；checkpoint 恢復有損語境；圖片、附件中繼資料和歷史呼叫提供事實。Compaction 不會把 checkpoint 提升為已經離開 surface 的原文字所擁有的 human 權威。

### 一次完整 reviewer 請求

Integration 只使用最新 `request/header.config` 的 provider／model 與 shipped adapter 預設 reasoning。它既不比較冗餘 route metadata，也不複製主 agent 請求。請求固定包含五個分割槽：

| 分割槽 | 保留輸入 |
| --- | --- |
| `REVIEW_POLICY` | 固定分類、來源權威與嚴格結果規則；allow 後立即以 Full access 執行，沒有後續確認 |
| `ENVIRONMENT` | 僅既有 Session header `cwd` |
| `PROJECT_INSTRUCTIONS` | 可見專案指令，保留原始來源並賦予約束角色 |
| `FILTERED_HISTORY` | 目前 compaction surface 中帶來源的 human／直接父級訊息、checkpoint、圖片／附件事實，以及歷史呼叫名稱與日誌參數 |
| `PENDING_ACTION` | 工具名稱、描述、參數 schema 與解析後的 arguments |

reviewer 從 Session 的完整動作歷史建置這兩個動作分節：授權是符合 `REVIEW_POLICY` 來源規則的那個更早呼叫，而重複或衝突的身份必須在整份日誌的任何位置都可見，而不是隻在近期視窗內可見，因此 Session 投影與有界讀取都無法支撐該判定。這次讀取使用已廢棄的同步 `snapshotEvents()`，並帶有行級 `typescript/no-deprecated` 豁免。

主 agent 的 V3 `system/message` 節點、assistant 正文／reasoning 與 tool results 全部排除。目前呼叫必須屬於 `step/start` 記錄的開放 step；缺少 step 歸屬時拒絕執行。該呼叫只在 `PENDING_ACTION` 出現；尚未開始的 sibling 沒有歷史呼叫事實。原生 schema 來自最新 request header。PTC 在 binding 建構時捕捉凍結 schema，經由排程器傳入 `ToolExecution`；描述與參數 schema 不進入開始／結算事件或 Session／SDK wire。動作事實缺失、不一致或有歧義時拒絕呼叫，不查詢 live registry。超窗請求直接拒絕，不做摘要、截斷、額外 compaction 或設定小型輸出 token 預算。

### 結果與取消

Reviewer 可以輸出 reasoning blocks，隨後恰好一個 JSON text block 和終態 `stop`。封閉物件只允許 `low + allow`、`medium + allow/deny` 與 `high + deny`；只有 deny 可攜帶字串 `reason`。額外欄位、重複成員、非法組合、其他 block 或終態以及 provider 失敗都是 reviewer 失敗，由[使用者審批後備決策](2026-09-24-auto-review-user-approval-fallback.zh.md)以具體錯誤報告。風險與 reviewer trace 不成為持久狀態。

最終拒絕（[使用者審批後備決策](2026-09-24-auto-review-user-approval-fallback.zh.md)將其限定在 `never` 審批策略下）讓原生結果與 PTC 結算事件攜帶同形結構化 `AutoReviewDeniedError`／`AUTO_REVIEW_DENIED` 及可選原始理由。對最終拒絕，主 agent 透過普通失敗渲染只收到 `Auto review rejected tool "<name>"; its body was not executed`。PTC 保留既有程式異常／catch 行為；捕捉拒絕不會將其提升為外層失敗。通用 Web 工具卡片為摺疊行提供拒絕身份，為展開行提供一行未執行輸出，不提供輸入正文。只有該顯示過程會 trim、摺疊行分隔符，或提供在地化空理由 fallback；持久化與兩套 SDK 保留完整原始理由，不增加長度或脫敏規則。

准入與在途 review 登記在首次 await 前同步完成。Integration 擁有一個生命週期 controller 和一個在途操作集合。解除安裝先關閉新選擇／review admission，經由既有 preset writer 把存活 Auto Session 切為 Full access，該 writer 寫入 `never` 審批策略，不改變沙箱值、不關閉終端，然後中止並等待 review 結清，最後移除 listener 與 contribution。Provider 結算後，lifecycle abort 始終形成規範的 dispatch 前取消，包括晚到 allow、deny 或 failure。Caller 取消保留 ToolRuntime 優先順序：晚到 allow 在 dispatch 前取消；晚到 failure 或最終拒絕保留原結果，`ask` 下晚到的拒絕產生已取消的審批與規範的 dispatch 前取消。被取消的 review 不啟動工具 body。

完整 integration 缺失或失敗時，持久 Auto Session 不能釋出。日誌不改寫，也不後臺重試。重灌後使用者可以重新開啟它；已經遷移為 Full access 的存活 Session 保持原狀，直到顯式切換。

### 程序目錄與 child

Permission owner 透過生成的 `permissionPresets` Remote 方法釋出一份完整程序目錄；BFF 顯式掛載它，並轉發無 payload 的失效事件。一個瀏覽器目錄在讀取前訂閱，為兩個選擇器提供資料。Epoch 與 connection-generation 檢查只發布勝出的完整結果。勝出讀取失敗或 connection reset 會清空舊快照；只有後續既有讀取、通知或 reset 才重試。已 dispose 或陳舊的結算不能釋出。每次目錄失效都透過命令 owner 關閉 slash 選擇器與待確認對話方塊，同時保留草稿，因此等待自身讀取的選擇器仍保留失敗與重試狀態；重新開啟時載入目前目錄。Session 投影只攜帶目前選擇，因此目錄安裝或移除不寫 Session 事件或序號。

Auto 帶右上標 `EXP`。兩個可見目前工作階段選擇器都要求實驗確認；顯式 `/permission auto` 已構成同意。Composer 使用通用 Menu 既有 portal 定位保持在視口內，同時保留 218–360px 邊界。Slash popup 保留 `min(220px, 100%)` 與 `max-width: 100%`，窄 composer 將 trigger 摺疊時也一樣。

[委派時權限捕捉](2026-07-25-subagent-policy-inheritance.zh.md)在首次 await 前記錄 Auto 或 Full access，並在 fork seed 與 sandbox／approval override 之後追加該既有 preset event。單次與可繼續建立共用此規則；cold resume 只讀取 child 日誌。後續 parent 切換不改變該 child，後續 child 自己的切換仍可勝出。Read Only 與 Workspace Write 保留 sandbox 繼承加 `approval: never`，因此可能保持 `custom`。Auto child 使用既有 lineage 與訊息獨立分類每次呼叫，不增加父 call metadata、委派記錄、receipt、Header／descriptor 欄位或 Session format。程序外 child 在父委派獲准後保留自己的權限系統。

## 考慮過的替代方案

**預設或正式釋出 integration** 會把實驗模型審批策略帶入每個部署。私有原始碼 Web patch 在複用既有外掛安裝器的同時保持顯式 opt-in。

**新增 sandbox 或 approval-policy 值**會把 review 與執行耦合，產生沒有目前消費者的組合。顯式 preset 身份保留 Full access 未改變的執行行為。

**持久化 PTC schema 或重新讀取 registry**要麼為臨時輸入擴張持久 wire，要麼審查與程式收到的 binding 不同的定義。Binding 已經擁有所需不可變快照。

**用 Session 事件表達目錄變化**會把程序可用性歸到 Session，並要求同序號重新發布。完整 Remote 讀取加失效通知讓每項事實保留在自己的 owner。

**可設定策略、豁免、grant 或另一個審批階段**會削弱固定安全上限，或引入第二個決定生命週期。每個受支援呼叫一次 review 提供單一結果與取消 owner。

## 後果

Auto 增加模型延遲和 token 成本，並可能誤判效果。Full access 執行與 PTC 程式限制使實驗確認成為必要。過濾限制不可信指令角色，但不會把 LLM 分類器變成確定性安全邊界。

聚焦 owner 測試固定請求過濾、嚴格回應解析、拒絕傳播、目錄順序、取消與 seed 後 child 身份。真實 Web composition 測試覆蓋預設／實驗選單、確認、拒絕卡片、live 移除／重灌、持久恢復和終端存活。認證 runner 在隔離目標上使用 shipped tools，嚴格發起八次真實 reviewer 呼叫：Flash 覆蓋精確清理本工作階段建立物件、未授權／已授權刪除既有物件，以及顯式請求的合成敏感資訊外洩；Pro 與 Vision 各只重複 medium pair。它記錄脫敏決定與外部效果，不重試、不跳過 case；確定性測試在無憑證時提供同形策略案例。
