# Agent Note: 工作階段首幀讀取的快取身份與呼叫時序

Status: implemented

[English](2026-09-20-session-open-read-coordination.md) | 中文

## 問題

開啟歷史工作階段時，`session.follow`、輸入框目錄預熱和依賴 Agent 參數的 RPC 可能同時存取同一份冷日誌。`skills/list` 自行請求完整 observation；`commands/list`、`goals/get`、`fileReferences/list` 與 `sessionReferenceResolver/candidates` 則可以在參數解析階段經 Agent lookup 發起恢復。輔助請求不等待歷史首幀，會與主對話爭用讀取、解析和 projection 計算，而不是複用已經完成的結果。

完成後的 observation 複用還有一個獨立問題：Cordis 對同一服務的存取可以返回不同代理物件。以 `ctx.get('sessionPersistence')` 返回物件的引用相等性判斷服務身份，會把同一底層服務誤判成另一個實例。另一方面，徹底去掉實例身份檢查也不安全，因為持久化 revision 只在對應服務實例和 Session 身份內可比較。

子工作階段導航混合了兩種需求：展示一個已知地址的對話，以及發現該工作階段的父目錄或後代目錄。已有父子地址的導航再次重新整理 parent projection，既增加前置工作，也會在目錄快取缺席時拒絕一個本可由 Host 驗證並開啟的地址。

## 決策

### 用服務自身的 Symbol 標識快取生產者

`SessionPersistence.identity` 是每個服務實例建立一次的 `Symbol('sessionPersistence')`。代理存取保留這個值，服務被替換後新實例獲得不同值。Prepared observation cache 按 Session id 查詢，並同時比較 `persistence.identity` 與 `stat().revision`；相同實例、相同 revision 可以複用已完成的 preparation。

該身份只存在於程序內，不進入 Session header、事件或持久化檔案。現有快取容量、lease、live 優先順序和 revision 失效規則不變。這個修復不增加尚未完成的冷讀取之間的 Promise 合併；穩定身份解決的是完成後的誤失效，不是所有呼叫方的並行去重。

### 輔助 RPC 等待目前對話的首次開啟成功

Client 在實際 RPC 傳送位置使用既有 `sessions.using()`，不只延遲預熱掛鉤。選單候選、顯式引用查詢和後續目錄重新整理因而經過相同的等待入口。每個操作先確認目標已經有 Client binding，不因後臺預熱重新開啟一個已經關閉的工作階段。

| Client 消費方 | 等待後的 RPC | 臨時引用來源 |
| --- | --- | --- |
| Skill 目錄 | `skills/list` | `skillCatalog` |
| Command 目錄 | `commands/list` | `commandCatalog` |
| Goal 啟用狀態 | `goals/get` | `goalActivation` |
| `@` 檔案與工作階段候選 | `fileReferences/list`、`sessionReferenceResolver/candidates` | 共用 `referenceCandidates` |

`sessions.using()` 先等待 `reference.ready`，再等待操作返回的 Promise，最後釋放自己的引用。`ready` 表示首次 `Session.open()` 嘗試已結算，不保證成功；這些消費方還檢查 `openState === 'open'`，失敗時不傳送輔助 RPC。Goal 讀方還確認捕捉的 binding 未被替代，並記錄讀取拒絕而不清除已有展示狀態。

Skill 保留共享目錄請求自己的取消訊號；`@` 查詢將目前候選請求的訊號用於歷史等待和兩個 RPC。未加引號的 `@` 在等待後仍並行查詢檔案和工作階段，加引號的路徑仍只查詢檔案。Command 與 Goal 不新增取消協定。這裡的引用持有 Client 資料和跟隨流，不賦予 Host Agent 新權限，也不禁止首幀之後發生正常 Agent 恢復。

### 對話使用 follow，目錄分支保留顯式讀取

主對話的 `follow` 首幀已經攜帶該 Session 的完整 projection baseline。後續共享 projection 值變化會通知訂閱者，不需要在切換工作階段或開啟選單時再次讀取相同 baseline。

- 主檢視切換不再額外重新整理所選 Session 的 projection；恢復儲存的子工作階段地址不再預先重新整理其 parent。
- 側欄從完整父子地址直接保留目標子工作階段，不把父目錄讀取作為開啟對話的前提。
- Header 下拉選單的 `changeOpen` 只改變展示狀態，不重新整理 `rootSessionId`。展開子節點和失敗重試仍呼叫顯式重新整理，UI 回呼命名為 `refreshProjection`；底層 `sessions.refreshProjections` API 不改名。
- Team 點選使用已有 lead 與 roster 成員 id，直接開啟 `{ parentSessionId, childSessionId, mode: 'continuable' }`。它不重新整理 parent catalog，也不要求目標預先出現在 Client catalog 中；成員角色、主檢視持有檢查及 UI 對 provisioning、failed 成員的限制保持不變。

已知地址不等於免除授權驗證。Host 在開啟子工作階段歷史時，仍檢查目標自身 header 的 parent、origin，以及自身 `subagent` projection 的 mode 和描述符歸屬。後續 continuation 仍受直接 parent 的既有授權規則約束。

## 實作邊界

- 沒有修改 Session 格式、遷移、Host observation 的 `all | none` 策略或 `session.projections` 返回欄位。
- 沒有實作全域 cold-read singleflight，也沒有把所有 Agent lookup 改成只讀 lookup。
- 沒有刪除 `SessionManager.handleConnected()` 對此前請求目錄的批次重新整理；本決策不保證重連只有一次冷讀。
- 工具側 `listDescendants` 觀察每個可達子級目錄。觀察可以複用即時狀態或有效的 prepared Session，否則會讀取冷日誌。前端展開子節點也可能冷讀該節點。普通主工作階段首開不等於所有後代列舉情境。
- `@` 工作階段候選仍列舉 header，並從 live projection 或 projection cache 取名稱；快取缺失退回到 id。原有排序、預設 50 條上限和直接 subagent 分組規則不變，沒有改成沿 `subagentCatalog` 遞迴發現。

## 考慮過的替代方案

**取消 persistence 實例比較。** 不採用。同一個 Session id 和 revision 不能證明兩個持久化服務提供同一份資料；服務替換仍必須使舊 preparation 失效。

**在呼叫方解包 Cordis 代理或按 Context 快取服務物件。** 不採用。快取需要的是生產者身份，而不是某次服務存取返回物件的身份；每實例 Symbol 足夠表達這個要求，不需要傳播代理實作細節。

**為所有冷讀增加統一 singleflight。** 未納入本次實作。它可以合併更多並行呼叫，但需要另外定義獨立等待方取消、lease 和服務替換期間的任務歸屬；它也不能代替“輔助 RPC 不搶在首幀前恢復 Agent”的時序要求。

**只延遲 warm，或只給額外 projection 請求補 await。** 不採用。顯式選單查詢仍能繞過 warm；序列執行一個重複 projection 請求也沒有刪除重複工作。等待放在實際輔助 RPC 入口，已有 follow 能提供的讀取直接取消。

**保留 Team 的父目錄存在性檢查。** 不採用。Team roster 已給出成員身份，顯式地址可以由現有 Host 歷史入口驗證；把 Client catalog 快取命中作為導航前提，會把資料尚未載入誤當成子工作階段不存在。

## 後果

普通主工作階段先完成自己的歷史和 projection 讀取，輔助操作再複用已完成的 observation 或已掛載狀態。前端直接子代列表消費主工作階段的 catalog，不為顯示每一行讀取對應子工作階段正文。目錄與對話的開啟入口分開，導航到一個已知子工作階段不再附帶 parent projection 預熱。

代價是輔助目錄首次可用時間晚於對話首幀；操作還會持有臨時 Client 引用直到結束。該等待只對應目前 Client generation 的首次開啟，不是每次底層 follow 重建的就緒屏障。所有重連和異常重試情境仍需各自驗證。

Header 根目錄缺失仍是明確的覆蓋缺口：若它屬於未開啟的 parent，且沒有其他來源提供 catalog，僅開啟下拉選單不會補讀；現有 UI 仍可能顯示載入提示。本次沒有增加新的父目錄載入入口，也沒有實作統一的 unknown 互動協定。

## 驗證與已知缺口

使用者在本地長曆史主工作階段切換流程中，透過臨時 `readColdSessionLog` 計時和呼叫堆疊觀察到重複呼叫收斂為一次，並驗證了 teammate 直接導航。這個結果只描述該操作的冷讀輔助函式呼叫次數，不代表所有底層檔案 I/O、全部重連情境或端到端效能都只有一次成本。診斷期間的私有 Session 內容和身份不作為測試 fixture。

開發期對相關包執行過定向 TypeScript 建置與打包；尚無這批完整變更的門禁、行為測試或組裝 Web 快照驗證結果。現有測試只完成部分回呼改名，仍有舊 fixture 名稱、開啟根選單即重新整理、側欄先重新整理 parent，以及 Team 拒絕缺失 catalog 的預期需要調整。這些是已知驗證缺口，不是已經透過的檢查。

## 與既有記錄的關係

- [Session observation 與 projection 所有的用戶端狀態](../architecture/2026-08-25-session-observations-and-projection-owned-client-state.zh.md)繼續擁有讀取切面和共享值的職責劃分。本記錄補充快取生產者身份與首幀消費順序；舊記錄中“包括未完成冷載入的共享”描述與目前 reader 實作不一致，不能作為本次 singleflight 已實作的依據。
- [Client Session 引用、引用來源與 UI 狀態](../architecture/2026-09-15-client-session-references.zh.md)繼續擁有 `retain`、`ready`、`using` 與顯式地址語義。本記錄限定四類輔助讀取作為獨立非同步操作持有臨時引用，不把額外引用擴充功能到所有 UI 動作。
- [Web 子代理目錄消費共享 projection](../simplification/2026-09-08-web-subagent-catalog-projections.zh.md)繼續擁有通用 projection store、顯式目錄讀取和 control 更新。本次實作落實“開啟工作階段使用 follow baseline”的規則，不替換整個目錄機制。
- [Web subagent 目錄與使用者繼續互動](../feature/2026-07-27-web-subagent-conversations.zh.md)繼續擁有展示和 continuation 授權。本記錄只調整導航前置讀取及根選單重新整理時機，不取消子工作階段自身的 Host 驗證；舊記錄對缺失根目錄互動載入的描述需與這裡的覆蓋缺口一起核對。
