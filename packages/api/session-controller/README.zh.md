---
description: "Host 與 Client 工作階段控制：建立、恢復、提示、跟隨歷史並投影即時工作階段狀態。"
kind: "package-reference"
---
# Session Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-session-controller` 擁有 Host 的 `ctx.sessionController` 服務，以及生成的 Client `session`、`skills` 和 `fileReferences` Remote namespace。它提供 Session 生命週期與歷史、Host generation 模型目錄、人工後臺任務終止、工作區路徑開啟、使用者可呼叫 skill（技能）發現和 Agent（智慧代理）範圍的檔案引用。當 Client 需要按 Session 定址的操作時，請透過 API Gateway 使用它。

## 目錄

- [使用本包](#use-this-package)
- [Client 引用](#client-references)
- [工作階段媒體引用](#session-media-references)
- [設定](#configuration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

歷史頁與 follow opening 快照為每個持久 Session 事件攜帶一條 `{ type: 'event', event: SessionWireEvent }` record。Client 把每條已接受 record 保留為一個持久 `SessionEventLikeEntry`；Assistant token 邊界保留在 `assistant/message` 或 `assistant/attempt` 的緊湊流內。工具參數、結果內容、失敗資訊和 `tool/result.data.meta` 原樣透過；控制器不解析工具定義、不執行展示轉換器，也不附加 UI 資料。

Client journal 在釋出 follow 快照、live entry 或歷史頁之前驗證目前 Session 事件 envelope。它複用瀏覽器安全的 Session validator，檢查必需的 surface marker、精確的 replacement endpoint、更早且唯一的 source seq、內嵌 Assistant 提供者中繼資料、request header 可選欄位的省略規則以及工具錯誤一致性。無效 record 直接失敗，不刪除欄位或歸一化；範圍成員與來源存在性仍由 Host 的持久日誌檢查。

每個 endpoint 都宣告自己的啟用策略。列表只讀取持久化 header 與 projection cache row，絕不呼叫逐 Session stat 或開啟冷 Session body。目前格式 cache identity 可以提供全部列表 hint；生命週期匹配的 predecessor cache 只能提供版本相容的 title，作為可能過時的展示事實，絕不能作為權威 fold seed。搜尋、附件、歷史頁、日誌跟隨、skill 發現和工作區路徑開啟可以在不啟用 Agent 的情況下檢查 persistence；`canOpenWorkspacePath()` 無需指定 Session 即可報告原生開啟能力。取消要求 live 狀態；queue 變更、模型、重新命名、prompt 和檔案引用操作可以解析或恢復普通 Session。提示詞會在解析 Agent 或追加 Session 事件前，拒絕既沒有非空白文字也沒有附件的 content；queue edit 只接受非空文字 content。prompt 准入從注入的 [`fileUploads`](../../client/file-upload/README.zh.md) Host 服務取得不透明憑證，在把完整有序內容列表交給 `ctx.attachments` 前解析每個屬於同一 Agent 的憑證。`requestId` 已進入 queue 或日誌時，prompt 重試直接返回原來的接受結果，不會重複插入訊息。只有 create 與 fork 會直接建立新 Agent。該服務把同一套感知 preset 的恢復策略和 subagent ownership fence 同時用於自身方法，以及其他 Remote namespace 使用的 Typert Agent 與 Session lookup。Queue 變更只有一個狹窄例外：目前 projection identity 為 continuable 且來自自身非 seed suffix 的線上 child，可以在兩個 inbox 目標上使用普通 Edit、Remove 與 QueueDock Steer action。One-shot、缺失、未知、損壞、僅含 seed identity 或冷 child 繼續被拒絕，且不會恢復。skill 目錄優先使用已有 live Agent，否則使用所記錄 preset 的常駐 scope，因此列表查詢絕不會啟動 Agent。經過授權驗證的檔案交付路由透過 `workspaceDesktop()` 取得提供服務的 Host 名稱和檔案管理器行為。`openWorkspacePath({ path, action: "reveal" })` 將檔案管理器導航委託給原生介面卡；省略 `action` 時按檔案型別關聯開啟，包括 HTML 和 SVG。兩種操作都要求目前檔案系統將請求的 Host 路徑對映到同一個規範程序路徑；無法對映的遠端路徑會在執行原生命令之前被拒絕。 `session.projections` 透過一次 live-preferred Session observation 讀取完整基線，不啟用 Agent。Session 不存在時返回 null，並可提供任意已註冊的 projection key。Client 透過 `projectionsBySession` 暴露共享值和顯式讀取狀態，由領域選擇自身的 key。Session 列表摘要攜帶 `agentAvailable`，透過已有摘要與狀態事件更新，與持久化 projection 相互獨立。初始讀取與即時 projection 幀使用相同的序號排序規則。

Client 列表行和駐留 Session 使用目前 `sessionListMetadata` 投影糾正過期的空白工作階段提示；最近活動時間取摘要時間戳與投影中最後一次使用者提示詞時間的較晚值。當 SessionManager 在列表行到達前建立實例時，會使用已保留的該 Session 中繼資料對帳空白狀態。因此，即使舊列表回應仍將已有對話標為空白，新工作階段操作也不會複用已經開啟過的對話。

顯式 ID 的 `session.create` 會收養活動 Session，或恢復持久化 Session 並持續持有其寫鎖。寫鎖爭用返回 `session/writer-held`；呼叫方可以嘗試其他空白工作階段，同時保留其他失敗。`session.list` 根據快取中繼資料列出持久化空白工作階段，不開啟冷日誌正文。

Client 列表重新整理保留未變化的行物件，並在順序和值均相同時複用條目陣列。每行的 `retainedBy` 包含正數的本地引用來源計數，Host 中繼資料重新整理不能覆蓋它們。快取成員檢查使用每次重新整理建置的 ID 集合，因此對帳成本隨目前列表和保留快取的規模線性增長。 Host 摘要更新會替換執行狀態與 Agent 可用性；本地 create/fork 回應只補充已有行缺失的中繼資料。普通 Session 被移除後，僅在目錄仍有子項時保留其投影 store。

後臺 job 的名冊行與觀測流屬於 [`dsh-api-job-controller`](../job-controller/README.zh.md)；控制流只承載投影。

投影讀取獨立於其值保留載入與失敗狀態。重連會取消上一連線的讀取，並重新載入已請求的投影；即時成員更新透過 control stream 到達。父 Agent 可用性來自 Host 摘要，在收到對應摘要或成功的列表 baseline 前保持未知。地址查詢直接解析投影中的子項，不會選擇它們或建立 scope。

已受理的提示詞與已觀察到的執行，會使用戶端展示轉換跨列表重新整理、重連及 Session 物件替換保留。Manager 按 Session id 保留這些觀察；它們不證明持久歷史已經產生。草稿、投影儲存和側邊欄展示規則保留原有行為。[blank 退回修復決策](../../../.agents/notes/implemented/bug-fix/2026-09-15-client-session-blank-reconciliation.zh.md) 定義保留期限及遲到回應處理。

Client 介面卡提供 `SessionEventStream`，即繫結到一個普通 Session 或 direct subagent address 的 Gateway `RemoteJournalStream`。它在讀取首個 page 前開啟 follow，只發布連續的 `replace`、`prepend`、`append` 與 `settle-assistant` 變更，並透過 tail page 修復重連或 seq 缺口。向後分頁有兩個動詞：`loadOlder()` 拉一頁按輪次開頭對齊的歷史，而 `loadThrough(seq)`——輪次跳轉載入器——按輪次開頭對齊頁面迴圈拉取直到視窗覆蓋目標 seq，重複呼叫會下調共享目標，遇到無進展的頁即停止，忙碌狀態複用同一個 `loadingOlder` 快照位。Web 介面卡顯式選擇接收無 cursor 的 Assistant frame：每個 opening 攜帶活躍 attempt 的 `startedAfterSeq`、`nextIndex` 與緊湊 stream，每個 stream member 都成為排在持久 cursor 之間的 Client-only `assistant/live-chunk` 條目。Host 會隨該 baseline 捕捉 follower 本地到達序號，並抑制該 cut 及之前的 buffered frame；replacement Agent 可以從 revision 一重新開始。活躍 opening 之後到達的持久 `assistant/message` 或 `assistant/attempt` 只有在其 seq 晚於 `startedAfterSeq` 且輪次與步驟匹配時才會保持暫存；匹配的 end type、seq 與 index 會發布持久條目。成功訊息的瞬態 row 保留到所屬 `step/end`，讓待派發工具的身份持續可用；失敗或中斷的 settlement 立即移除對應 row，同一步驟中更早的 retry 仍然保留。已知 attempt 的 revision、密集 index 或 settlement 缺口會重新開啟 follow；若 controller 錯過 start，則忽略 unknown-attempt frame，並正常釋出其持久 settlement。Abandoned end 會發布不含持久條目的 settlement delta，使瞬態 row 立即退出。持久缺口修復 page 不攜帶 Assistant baseline，因此 held notification 會重新開啟 follow 一次，以取得配對的 page 與 baseline。每條歷史 record 只覆蓋自身的事件 seq。業務、persistence 或無法恢復的連續性錯誤會終止 stream，只有物理載體斷開才觸發自動恢復。`SessionControlStream` 是 Gateway `RemoteSnapshotStream`；每代都以完整的程序本地 baseline 開始，因此重連會替換 projection 狀態，而不會把瞬態值當作 durable event。每次 Host generation 就緒時，同步的 Client 訂閱會先清除保留的投影值及其水位，再重新整理查詢並重新開啟 control stream，其中也包括 control baseline 中沒有列出的 Session。首次 control stream 會等待 generation 就緒，確保其 opening 值不會先於舊狀態清理到達。上一代尚未完成的 list 回應無法重新發布這些值。同一 generation 內，延遲到達的 control baseline 不能覆蓋或清除較新的 sequenced 值，無論它們來自活 Session 的 list block、history page 還是 frame；冷 Session 從 projection cache 看出來的 cached list block 則不論水位都讓位於建連 Session 的 baseline。持久 `inbox` 投影透過與其他投影相同的冷讀取和重連路徑傳輸兩份待處理列表。Client Agent 上下文提供獨立 [`fileUpload`](../../client/file-upload/README.zh.md) 服務使用的身份；Session 物件提供生命週期、prompt、queue 與歷史操作，不提供檔案傳輸。

Session 物件還承載本地提交回顯：`session.beginSubmission` 在呼叫方序列化與提示詞之前，同步把一條回顯寫入 `SessionSnapshot.pendingSubmissions`，工作階段 UI 因此能在點選提交的當幀顯示訊息。回顯按順序存放圖片預覽與持久檔案引用。Session 根據目前執行狀態與請求的投遞模式推導其 `transcript`、`queued` 或 `steering` 位置，並保留該位置直到展示接管。提示詞的 `requestId` 是關聯標識：Host 把它回顯為 durable user source 的 `rpcId`，`inbox` 投影中的待處理訊息也保留同一 source。排隊回顯在佇列接受後延遲一個動畫幀退休；Chat 回顯遵循下述入檔規則。尚未入檔的回顯在帶標識的提示詞失敗或被放棄時立即退休。銷燬時保留已觀察到的入檔結果，其餘未結算提交按 failed 退休。每次退休恰好觸發一次 `onRetire`；observed 退休還會攜帶有序的持久附件引用，讓 composer 釋放成功卡片並保留失敗草稿。回顯只存在於 Client 記憶體；重新整理與重連只從持久事件重建工作階段。


正常線上時，transcript 與 steering 回顯在 Inbox 接受與領取期間留在 Chat，直到持久訊息到達。本地 Chat 訊息入檔後，其身份保留到 Inbox 水位覆蓋 next-turn 或 next-step 領取序號：Chat 已顯示真實 Node，而 Chat 與 QueueDock 排除匹配的舊 Inbox 行。其他排隊訊息照常顯示。新的 follow 基線會將已有接收回執的回顯按 observed 撤去，使用已接受的附件引用完成結算；尚未確認接收的提交繼續保留。待處理或已入檔的訊息隨後由 Host 資料呈現。在領取與入檔之間重連時，氣泡可能短暫消失；撤去回顯只確認接收，不代表執行或失敗。

面向使用者呼叫的 `skills/list` 中繼資料包含勝出提供者可選的指令檔案 `path`。輸入框可據此預覽檔案，無需載入每個 skill 的正文或啟用冷態 Agent。

`session.delete({ sessionId })` 永久刪除一個普通 Session 及其 subagent 來源的後代。它先以 `stopActivity` 歸檔該 Session，使執行中的工作停止、喚醒保持被攔截，再釋放本控制器建立的活躍 Agent，然後從最深的後代開始逐個刪除已儲存日誌、其投影快取行，以及其 Workspace 歸屬、歸檔與置頂條目，並行出 `api-session/removed`。未知 Session 以 `session/not-found` 失敗，subagent 擁有的 Session 以 `session/agent-busy` 失敗，其他所有者持有寫入權時以 `session/writer-held` 失敗。Fork 保留其複製的歷史；溢位輸出與按內容定址的附件不會被刪除。[刪除決策](../../../.agents/notes/implemented/feature/2026-09-26-permanent-session-deletion.zh.md)記錄了這些限制。

Fork 複製 `atSeq` 所選的精確事件字首，包含切點事件，允許在開放輪次內擷取。子工作階段在合成的 fork 結果和結束事件之前記錄繼承標記。省略 `atSeq` 時選擇最近已結束輪次及其獨立尾部，在下一輪次或排隊輸入之前停止；不存在的事件會被拒絕。聊天操作選擇已結束輪次。

恢復工作階段時若已有寫控制代碼佔用，返回 `session/writer-held`，並攜帶工作階段 id；其他恢復失敗仍返回 `gateway/internal`。

`loadThrough(seq)` 在共享目標被覆蓋或載入結束前私下保留較早頁面，隨後把成功取得的頁面按順序作為一次前插釋出。歷史載入期間即時事件仍然可見。後續頁面失敗時保留已成功取得的部分；歷史視窗被替換時丟棄被替換視窗的暫存頁面。普通 `loadOlder()` 直接釋出 Host 選取的一頁結果。

Client 的首次 `follow`、重連首屏與 `loadOlder()` 至少請求 50 條以 append 方式追加的 `user/message` 和 `assistant/message` 事件，並向前跨過至少兩個 `turn/start`，其中包含已載入視窗開頭尚未補齊的輪次。Host 在首次同時滿足兩個下限的輪次開頭停止；若先達到 500 條計數訊息或歷史已耗盡，則立即返回。Steering 不增加輪次分界。區間內的其他事件隨頁返回，但不計入訊息預算。分頁和 follow 請求可選的 `turnWindow` 在 `maxMessages` 上限內指定這兩個下限。`loadThrough()` 複用相同規則，僅將每頁訊息數下限設為 200；500 條上限不限制整次跳轉。不帶 `turnWindow` 的請求保留按訊息對齊的分頁方式。

佇列編輯僅允許用非空文字替換待處理內容。

附件授權讀取內建 Session 事件宣告的內容欄位與已完成的 assistant 流塊，包括扁平的 V4 tool 角色訊息。未知事件載荷與無關欄位不能授權附件讀取。

本控制器透過 `ctx.plugin` 組合 `ArchivedSessionGate`：在 Agent 註冊表、Session store 與 Workspace 註冊表就緒後載入，隨控制器一起釋放。它的 `agent/pre-step` 監聽器會拒絕為已歸檔工作階段或其子代理子孫——從 Session header 的血緣欄位讀出，從不包括 fork——提出的步驟，因此遲到的喚醒投遞會讓該回合以 `blocked` 收口而不發出模型請求；取消歸檔即為整條血緣解除門禁。已歸檔工作階段仍在跑的工作由各自的 owner 透過 Workspace 註冊表的歸檔准入（[接縫](../../workspace/workspace/README.zh.md)）報告與停止：執行中的回合由 [Agent 註冊表](../../core/agent/README.zh.md)負責，所屬任務由[任務註冊表接縫](../../jobs/jobs/README.zh.md)負責，子代理子孫由 [Subagent](../../subagent/subagent/README.zh.md) runtime 負責，提醒由 [Schedule](../../schedule/schedule/README.zh.md) 外掛負責；本控制器自己不報告任何內容。

<a id="client-references"></a>
## Client 引用

`sessions.retain(target, { source, signal? })` 立即取得一個精確 Client generation 的引用，並啟動其共享的首次歷史開啟。目標是已知 Session id 或持久的直接父子 subagent 地址；Host 在開啟歷史時驗證顯式地址。返回引用支援冪等的 `release()` 和 `Symbol.dispose`；其 `ready` Promise 跟隨共享的 `Session.open()` 結果，並在該次嘗試結算時解析為確切 binding，包括 Remote failure 以 `openState: 'error'` 表示的情況。僅當 `Session.open()` 拒絕、等待方取消或引用提前釋放時，`ready` 才拒絕。取消一個等待方不會取消其他 owner 的開啟。`sessions.using(target, options, operation)` 等待該次結算，持有引用直到回呼結束，並傳播被拒絕的就緒與回呼失敗。

引用保活本地工作階段資料、作用域 Context 和歷史流，不保活 Host Agent。普通 Session 不因保留引用而新增目錄行。已保留且具有明確直接父子地址的 subagent 即使尚未收到父目錄，也會保留後備行並通知列表讀取方；這些行不加入 Host 列表成員集合。Fork 標題設定直接傳送 rename 並應用返回的標題投影，不 retain 子工作階段，也不開啟其歷史。最後一個引用釋放時，generation 先退出可存取對映，再執行清理；後續取得可以為同一 id 建立新 generation。`binding(id)` 和 `scope(id)` 只借用已有 generation。`retainInfo(id)` 獨立於目錄成員關係觀察穩定的只讀來源計數，不執行歷史 I/O。消費方來源鍵可透過宣告合併擴充功能；導航和完成確認屬於 UI 消費方，不屬於本控制器。所有權與清理規則見 [Client 工作階段引用](../../../.agents/notes/implemented/architecture/2026-09-15-client-session-references.zh.md)。 模式未知的子代理地址允許讀取歷史，但仍驗證直接父級。成功恢復 descriptor 後確定展示模式；失敗隻影響該子工作階段，控制請求仍要求已確認的 continuable 身份。

<a id="session-media-references"></a>
## 工作階段媒體引用

當 `connection`、`fs` 與 `attachments` 均被組合時，`SessionMediaReferences` 在授權驗證 `connection.fetch` 通道上掛載 `GET|HEAD /api/file?path=<絕對路徑>`。它透過 `ctx.fs` 讀取普通檔案，包括已註冊工作區之外的臨時路徑與遠端提供者中的檔案。目錄包含關係與 MIME 類別均不限制存取；`mime-types` 提供回應型別，未知副檔名使用 `application/octet-stream`。GET 複用 `readBytes` 執行讀取前及讀取中的位元組限制；HEAD 只讀取中繼資料。所有檔案均使用 `ctx.attachments.imageLimits.maxImageBytes`（通常為 20 MiB）；超過此上限返回 413。回應包含完整檔案，忽略 Range，並攜帶 `private, no-store`、`nosniff` 與沙箱 CSP，使直接開啟的 HTML/SVG 無法以 API 源身份執行腳本。用戶端重寫位於 `ui-chat`（`AssistantMarkdown`）；音影片檔案回應已可用，Markdown 音影片播放器節點仍是獨立工作。

GUI 模型選擇要求確切提供者／模型對出現在可用目錄中；不可用的選擇以 `session/model-unavailable` 拒絕。提示詞准入保留已儲存的路由，不按目錄可用性阻斷髮送，由請求執行報告憑證缺失或模型不可用。`initializeDefaultModel()` 在帳號登入後、其他提供者均未設定 API key 時，將第一個可用帳號模型儲存為預設模型；憑證檢查使用已設定的引用，不依賴模型是否可用。提供者沒有可用模型時，初始化以 `session/provider-models-unavailable` 拒絕。可用性變化不會替換模型或改寫工作階段選擇。

`selectModel` 成功返回表示工作階段級模型選擇已生效，不等待預設 profile 設定儲存。預設設定在後臺按提交順序儲存；儲存失敗會記錄警告，並保留工作階段選擇。新工作階段讀取最近一次成功儲存的預設值。

-----

<a id="configuration"></a>
## 設定

| 欄位 | 預設值 | 含義 |
|---|---:|---|
| `nativeOpen` | 平臺探測 | 是否能把 Session 工作區路徑交給原生桌面開啟器 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-session-controller)是所有受支援欄位及其 JSDoc 的完整來源。

-----

<a id="model-experience"></a>
## 模型體驗

無；任何模型可見效果都由被呼叫的 Agent 命令負責。

#### KV Cache 影響

無直接影響；模型請求仍由 Agent 和 LLM（大語言模型）包擁有。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 圖片位元組上限不驗證解碼後的尺寸或畫素數。
- follow 恢復失敗會對呼叫方可見，而不會無限重試。
- 瀏覽器原始位元組上傳使用一次不帶斷點續傳偏移的流式 HTTP 請求；重試會從第零位元組重新傳輸整個檔案。
- 檔案引用補全使用共享 Agent lookup，因此可能恢復冷 Session；`skills/list` 目錄是不啟用 Agent 的 skill 中繼資料讀取路徑。
- 受理/執行的展示記憶只存在於用戶端記憶體，頁面過載後即丟失。
- 該記憶不在 tab 之間共享：同一工作階段可能在一個 tab 中已轉正，在另一個 tab 中仍顯示為 `New Session`。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。每個分頁與幀都會對照其指向的持久 Session 驗證。
