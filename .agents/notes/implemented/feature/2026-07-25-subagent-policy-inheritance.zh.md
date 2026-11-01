# Agent Note: 程序內 subagent 策略繼承——子 agent 在父級的沙箱覆蓋項下啟動

Status: implemented

[English](2026-07-25-subagent-policy-inheritance.md) | 中文

## 問題

Auto 或 Full access 預設身份以及沙箱與審批覆蓋項都是按工作階段的日誌摺疊。程序內 subagent 會獲得一個新工作階段，因此 spawn 子 agent（智慧代理）過去會退回到部署預設值，fork 子 agent 則只能看到其已完成輪次字首中的切換。因此，委派可能放寬已經切換到 `read-only` 的父級，或在 Auto 與 Full access 共用同一旋鈕組合時靜默保留陳舊身份。

## 決策

委派邊界會在第一次 await 之前呼叫共享的子 agent 輔助函式（`dsh-subagent` 中的 `captureDelegatedPolicyOverrides`／`appendDelegatedPolicyOverrides`）；一次性驅動器與[可繼續啟動](../../../../packages/subagent/subagent/README.zh.md)都會使用它們。當 `permissionPresets.current(parent.session)` 為 `auto` 或 `danger-full-access` 時，捕捉會複製目前 `permission/preset` 身份，同時對 `sandboxPolicy.overrideOf(parent.session)` 取得快照，並把子 agent 的審批策略釘定為 `'never'`。父級後續的切換屬於父級的未來；取消後重新委派會取得新快照。權限預設與沙箱策略服務都是可選的：只複製 Auto 或 Full access 身份與顯式沙箱工作階段覆蓋項，絕不複製部署預設值或一次性授權。審批策略不繼承——[審批釘定決策](2026-08-10-subagent-approval-pinned-never.zh.md)取代了本 note 原先的審批覆蓋項繼承。

繼承的 Auto 或 Full access 身份會成為一條 `permission/preset` 事件，捕捉的沙箱值與釘定的審批值則會在子 agent 工廠的未釋出設定階段成為帶來源標記的 `sandbox/mode` 與 `approval/policy` 事件。工作階段建構函式已把 `Session.firstLiveSeq` 固定在 constructor seed 之後，而 `Session.inheritedEventCount` 保留精確的 fork 字首長度，因此繼承事實會排在 fork 歷史之後，卻不改變其譜系 cut。生命週期本地遙測從 `firstLiveSeq` 開始，因此排除 constructor seed，幷包含這些未釋出設定事件。因此，既有的末事件勝出摺疊會讓委派快照壓過陳舊的 fork 歷史，並讓子 agent 後續的切換壓過該快照。孫代 agent 會摺疊其父級已記錄的狀態，因此無需另一套繼承機制即可組合此規則。

Auto review 不會把這條繼承的 preset 事件變成授權回執。每次 child 呼叫仍會重新分類：普通專案內工作為低風險並直接允許；中風險工作必須在 child 建立 prompt 或已核驗的 human／直接父級訊息中得到點名動作、準確目標和範圍的明確授權，且不存在未解決衝突；高風險工作始終拒絕。`parentSession`、建立 prompt 與既有 `agent-message.senderSessionId` 足以在 one-shot、continuable 與 cold resume 路徑中恢復這份上下文；不會新增父 call id、解析後的任務 metadata、委派記錄、review receipt 或 Session format migration。

普通的工作階段追加會在釋出前驗證繼承事件，持久化層則在工作階段公佈時捕捉完整的未釋出日誌。因此，任何已物化的子 agent 日誌都會在首批資料中存下繼承事件；不存在第二套策略儲存、schema 欄位或查詢索引。`source: 'delegation'` 標記讓審批敘述能夠區分繼承與子 agent 側的使用者切換。

### 被攔住的子 agent 會經歷什麼

受限子 agent 會得到普通拒絕標記，升級請求則被子 agent 釘定的 `'never'` 策略確定性拒絕；`subagent:delegation` 執行時上下文宣告告知子 agent 上報限制而不是重試，由控制器持有的父 agent 可以放寬自己的工作階段後重新委派（[審批釘定決策](2026-08-10-subagent-approval-pinned-never.zh.md)）。

[Auto review 決策](2026-08-28-auto-review.zh.md)為共享 Auto／Full access 旋鈕組合擴充功能此繼承規則；本文仍擁有委派時權限捕捉的決策。

## 考慮過的替代方案

- **通用的 `SessionHeader` 策略欄位**：不予採納。它們會在中繼資料中複製一項事件溯源事實，並要求貫穿核心工作階段型別、持久化後端、查詢索引、碰撞標識與每個策略消費方進行傳播。未釋出設定階段的事件具備所需順序，並複用現有持久化儲存。
- **將新策略事實與建構歷史合併**：不予採納，因為這會把 child 擁有的委派策略歸類為繼承歷史，並模糊 child 快照壓過陳舊 fork 值所依賴的生命週期順序。未釋出設定讓歷史與新事實留在建構邊界各自原有的一側，無需再增加工作階段選項；遙測會捕捉 child 自有的一側。
- **首個提示詞監聽器**：不予採納。儘管建立事務已經允許在釋出前追加日誌，它仍會引入監聽器順序與更晚的時序邊界。
- **複製部署預設值**：不予採納。預設值仍由運維人員擁有且可能變化；未切換的父級不會記錄任何值，因此其子 agent 跟隨目前部署。
- **每次呼叫時沿 `parentSession` 即時解析**：不予採納。這會打破「兩個工作階段永遠看不到彼此狀態」的隔離不變數，要求父工作階段在子 agent 的整個生命週期內保持載入，還會讓父級在子 agent 執行途中做的切換追溯性地改變一個正在執行的子 agent。委派時快照才是本設計的語義：子 agent 保持它被交付時的策略；取消後重新 spawn 即可拿到收緊後的策略。
- **強制使用 `'never'`**：本 note 當初不作為繼承行為採納，理由是強制值會排除未來的子 agent 應答器；該結論已被[審批釘定決策](2026-08-10-subagent-approval-pinned-never.zh.md)推翻，現行理由歸其所有。把 ask 路由到根控制器需要父鏈所有權與發起 spawn 的 `callId`，仍按[審批 seam Agent Note](2026-07-06-approval-seam.zh.md) 所述延期。

## 後果

- spawn、fork 和巢狀的程序內子 agent 會在父級選中 Auto 時保留其身份，保留父級顯式的沙箱覆蓋項，並被釘定為 `'never'` 審批。聚焦測試套件證明 Auto 身份、真實檔案系統拒絕、陳舊 fork 優先順序、委派時捕捉、即時事件邊界、預設值省略與上下文釋放。
- 在 Auto 下，這些 child 仍會為每次呼叫重新獲得 low／medium／high 決定。human 指令在中風險動作上優先於直接父級任務調整，而且兩種來源都不能授權高風險動作。
- 無金鑰 headless 快照是組裝後應用層面的迴歸測試：只有父級是 `read-only`，部署預設值是 `workspace-write`；若移除捕捉，子 agent 的持久化事件與被拒的磁碟寫入這兩項檢查都會失敗。
- 每次委派最多增加三條僅日誌事件。權限預設、沙箱策略與審批這三項服務的可選 peer 型別由 `dsh-subagent` 擁有——其共享輔助函式持有 `ctx.get` 消費；未組合這些服務的組合保持原有行為。程序外子 agent 仍採用自身的部署策略，正在執行的子 agent 不跟隨父級後續切換。
