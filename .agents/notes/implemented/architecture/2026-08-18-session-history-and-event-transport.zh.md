# Agent Note: 工作階段歷史、控制狀態與 Remote 事件傳輸

Status: implemented

[English](2026-08-18-session-history-and-event-transport.md) | 中文

## 問題

瀏覽器同時消費三類生命週期不同的資料：可持久化並分頁的 Session 日誌、需要 opening baseline 才能在重連後收斂的程序內狀態，以及無需重放的即時通知。

這三類資料不能共用一種恢復規則。Session 日誌有穩定 seq 和 persistence，可以按 cursor 補齊缺口；jobs、projection 值和 Workspace 列表等狀態需要以完整 snapshot 替換舊映像；普通通知只保證目前 Connection generation 內投遞。

觀察 Session 歷史、列表和投影必須允許冷讀取。若 transport 因參數中出現 Session 或 Agent 就觸發通用 Typert lookup，開啟頁面、切換標籤或網路重連都會隱式恢復 Agent，觀察操作因此產生執行副作用。

prompt、create、fork、模型選擇等命令又確實需要按各自語義建立或恢復 Agent。啟用權限必須屬於具體 Remote 方法，而不能由 carrier、參數型別或共享 lookup 暗中決定。

舊 API Proxy 的全 Session mux、`HostFrame` 與 Workspace 通知把領域資料、baseline、錯誤和連線生命週期編碼進同一手寫協定。每增加一種狀態都要複製幀定義、Client bridge、重連和清理邏輯，API Proxy 也無法退回只承接尚未遷移的業務方法。

Host 向 Client 的 Cordis 事件還有兩種呼叫語義。普通通知只需要廣播；Approval 與 Question 一類 Agent-scoped waterfall 必須允許 Client claim、呼叫 `next()` 委託、返回結果或拒絕，並在多 Client、斷線和取消下保持一次 Host 呼叫的身份。

這些需求需要一個通用 transport 生命週期，但不能讓 Gateway 理解 Session、Workspace、Approval 或 Question 的業務資料。

## 決定

API Gateway 擁有 Remote transport、stream 生命週期和 Remote Event 協調；Session Controller 與 Workspace Controller 擁有各自的 Host API、wire 型別和 Client 領域 adapter；Client Runtime 只裝配並消費這些物件，不再實作另一套 carrier 狀態機。

目前所有權如下：

```text
[client/connection]
|-- Host description
|-- Connection generation
`-- unary RPC transport

[api/gateway/client]
|-- RemoteStream
|-- RemoteSnapshotStream
|-- RemoteJournalStream
`-- ctx.remote.$on + $events pump

[api/session-controller]
|-- ctx.remote.session unary commands
|-- session.control snapshot stream
|-- session.page + session.follow journal
`-- Session Client adapters

[api/workspace-controller]
|-- ctx.remote.workspace unary commands
|-- workspace.follow snapshot stream
`-- Workspace Client model and adapter

[api/remotes]
`-- application Remote Event allowlist and Host Cordis source

[client/runtime]
`-- compose Session and Workspace domain state for consumers
```

API Proxy 不擁有 Session 或 Workspace Remote namespace，也不擁有 Host 下行事件 carrier。`/api/events.host`、`HostFrame`、`stream/error`、`ServerRequest` 及其 WebSocket／SSE 分支不參與這條資料鏈結。

### Connection generation 與物理連線

瀏覽器的 Client Remote 外掛啟用時冪等啟動 `RemoteStreamMuxClient`，並立即連線 `/api/remote.mux`。沒有業務 logical stream 時物理 WebSocket 仍保持常駐，但 mux 不執行獨立的 retry 排程。

Host 按設定的 `websocketHeartbeatIntervalMs` 間隔（預設 2 秒）向每條已開啟的 mux socket 傳送一個 RFC 6455 Ping 控制幀；瀏覽器在協定層回覆 Pong。兩種控制幀都不進入 Remote stream JSON union，也不改變 Connection generation 狀態。每次 Ping 前，Host 把 socket 標記為等待 Pong；若到下一間隔仍未收到 Pong，Host 會終止該 socket。

首次建連失敗或已連線 socket 丟失後，已開啟的 logical stream 會以 `RemoteStreamCarrierError` 結束目前物理 generation。`ConnectionController` 擁有持續且間隔封頂的指數 retry 排程；每次嘗試都要求 mux 恰好一次替換候選或活動 socket，再重開 `$events`。使用者要求的重連透過同一路徑重置 attempt 序列並跳過等待（見[決策](../../archived/feature/2026-08-28-web-connection-recovery-control.md)）。


瀏覽器網路狀態事件是同一 Controller 的輸入。`offline` 會撤回 Connection generation 並暫停自動 retry；下一次 `online` 轉換會從基礎退避檔重新開始。這些事件不會建立連線；只有新的 `$events` ready 幀才會釋出 Connection generation。

程序內 `connection.rpc.open` 使用同一 logical endpoint 語義，但繞過瀏覽器 WebSocket mux。

Gateway 內部 `$events` logical stream 是 `ConnectionHandle` 唯一的 generation source。它不依賴是否已有業務 `$on` 訂閱，因此連線健康狀態不會隨 UI listener 數量變化。

Host event source 在返回首幀前同步安裝增量 listener。Gateway 隨後傳送 `{ type: 'ready', clientId, host: { home } }`；該 frame 證明目前 generation 已經能夠接收增量，並攜帶穩定的 Host 路徑顯示資訊。

`ConnectionController` 只有在 `$events` ready 後才釋出 `connected`，所以 Session 或 Workspace baseline 不會在 Host 增量 listener 就緒前開始讀取。

`$events` 正常意外結束、Host 錯誤、畸形首幀或 carrier 失敗都會結束目前 Connection generation。Connection 撤回該 generation，隨後按有界退避重新建立 `$events`；瀏覽器離線時暫停，使用者要求立即重試時則跳過等待。

Gateway stream、Connection generation 與 Session 業務 open epoch 是三個獨立計數：前者表示某條 logical stream 的物理替換，第二個表示 Host 可用性握手，最後一個防止已淘汰的 Session open 寫回目前狀態。

Host 外掛銷燬會停止心跳定時器、終止 mux socket，並等待活躍 iterator 完成。Client 外掛銷燬會停止重試等待，取消候選與活動 socket，終止 logical stream，並等待後臺迴圈和 consumer 完全停穩。

### 通用 Remote stream 模型

Gateway Client 提供三個不依賴 React、只允許一個 consumer 的生命週期物件：

```text
RemoteStream<Item>
|-- RemoteSnapshotStream<Snapshot, Delta>
`-- RemoteJournalStream<Page, Entry, Cursor>
```

領域 Controller 透過組合或薄 adapter 使用它們；Session 與 Workspace 不繼承一個知道領域幀的共同 Controller 基類。

#### `RemoteStream`

`ctx.remote.$stream(options)` 返回 `RemoteStream<Item>`，負責一個 logical stream 跨物理 generation 的重開、取消和 dispose。

每個 item 攜帶單調 generation、該 generation 的 `AbortSignal` 與 `accept()`。領域 consumer 只有在驗證 opening cursor 或 baseline 後才呼叫 `accept()`。

只有 `RemoteStreamCarrierError` 可觸發重試。Host 仍可用時允許一次獨立重開；否則等待新的 Connection generation。業務錯誤、協定錯誤和 opening 失敗直接終止。

`restart()` 只淘汰目前物理 generation，保留 logical stream；`dispose()` 永久結束 logical stream、pending retry 與 iterator，並等待 quiescence。

`RemoteStream` 不理解 baseline、delta、page、cursor、seq 或任何領域 frame。

#### `RemoteSnapshotStream`

`RemoteSnapshotStream<Snapshot, Delta>` 要求每個 generation 恰好以一份完整 snapshot 開始，之後只能出現 delta。

update 早於 snapshot 或同 generation 出現第二份 snapshot 都是 terminal protocol error。

snapshot 成功應用後才接受該 generation。carrier 重連期間保留上一份已釋出狀態，新 generation 的 snapshot 一次性替換舊映像。

領域 adapter 提供 frame 判別、snapshot replacement、delta reducer、carrier 狀態和 terminal failure sink；通用層不解析 Session 或 Workspace 欄位。

Session control 與 Workspace state 各使用一個獨立的 `RemoteSnapshotStream`。

#### `RemoteJournalStream`

`RemoteJournalStream<Page, Entry, Cursor>` 組合一個 live follow 與同 namespace 的 page 方法，適用於有穩定順序、可分頁歷史和 live tail 的 append-only journal。

首次開啟先建立 follow 並取得 opening cursor，再讀取 initial page。page 請求期間產生的 live entries 已進入 follow 佇列，因此不會落在“先讀歷史、後訂閱”的競態視窗中。

通用層按 cursor 去除 page 與 queued entries 的重疊，驗證連續性，並在 page 覆蓋 opening cursor 後釋出一份完整 window。

連續 live entry 釋出 `append`，更早的歷史頁釋出 `prepend`。重連、cursor 跳躍或無法證明連續性時觸發 tail page repair。

repair 期間舊 window 保持可讀；page 與期間積累的 live entries 拼成連續視窗後只發布一次 `replace`，不會把半修復狀態暴露給消費者。

若 page 請求隨物理 carrier generation 一起取消，journal 等待下一 generation 的 opening cursor，再以新 cursor 重讀 page；該取消不會作為 terminal page failure 洩漏給領域物件。

`RemoteJournalStream` 擁有 opening cursor、resume cursor、分頁、重連 catch-up、重疊去重和 gap repair。領域 Session 物件不複製這些狀態機。

### Session Controller

`packages/api/session-controller` 提供 Host `ctx.sessionController` 與生成的 `ctx.remote.session` namespace。

它擁有 Session list、search、create、selectModel、rename、fork、prompt、attachment、updateQueue、cancel、page、follow 與 control。Host generation 的 model catalog 透過獨立的 `session/modelCatalog` 公開，因為它不屬於特定 Session。

包內的 agent、commands、control、history 與 list controller 分開實作，但 Session 身份解析、啟用策略、subagent ownership 和 Remote 錯誤投影只有一個公開 owner。

其他 Host Remote namespace 透過 `ctx.sessionController.inspect()` 或 `resolveAgent()` 複用同一身份規則，不保留第二份 Session resolver。

#### 啟用策略

Session Remote 方法傳遞 `SessionId` 或 `SessionAddress`，不靠參數型別觸發通用 Typert Session lookup。

每個方法顯式選擇冷檢查、live-only 查詢或允許 resume 的解析方式：

| 操作 | 無 live Agent 時的資料來源或結果 | 啟用規則 |
|---|---|---|
| `session.list`、`search` | header 與投影快取；可透過有界的小日誌讀取判斷不確定的 blank 狀態 | 永不恢復 Agent |
| `session.page(address)` | attached Session 或 persistence 日誌 | 永不恢復 Agent |
| `session.follow(address)` | 一份攜帶 opening page 與 projection 的 live 或 prepared observation | 先發布 snapshot，再在後臺把普通冷 Session 提升一次 |
| `session.control()` | 目前 attached Agent、pending registry 與程序內 registry | baseline 與重連不恢復 Agent |
| `session.attachment`、fork 源讀取 | 已授權的持久 Session 資料 | 讀取不恢復 Agent |
| `session.updateQueue` | live Agent 或普通持久 Session | 修改 Inbox 前恢復普通冷 Session |
| `session.cancel` | 僅命中目前 live Agent | 不為已消失狀態恢復 Agent |
| `models`、`selectModel`、`rename`、`prompt` | 命令解析目標 Session | 僅按方法約定顯式恢復 |
| `create` 與 fork 目標 | 新 Session／Agent | 使用者命令提供建立授權 |

讀取 title、列表和投影不要求 Agent。觀察操作不能因為另一個 Remote endpoint 使用了 Agent lookup 而繼承其恢復權限。

`SessionQuery.observeSession()` 選擇 attached Session，或從讀取方自己的 prepared cache——經由持久化讀控制代碼填充——提供冷 Session。該 cache 共享並行冷讀取，並在所有 observation lease 釋放前固定同一條目。一次 observation 要麼計算所有已註冊 projection，要麼完全不計算；呼叫方可以只公開其中一部分，但不會建立只計算部分 projection 的中間狀態。

`session.list` 不會無界掃描冷日誌。它優先使用快取的 projection hint，僅在獨立儲存 artifact 不超過設定的小日誌位元組上限時，才可能完整觀察日誌以判斷不確定的 blank 狀態。hint 缺失或不可讀時，列表仍保留該行，並把 metadata 視為未知。

`model/selection` 是 required-on-read 的持久 event，因為它改變下一次請求使用的 model route。對應 projection 同時記錄最近一次 request selection 與之後的 pending selection；prompt assembly 在提交匹配的 `request/header` 時消費 pending value。

#### Session 日誌

`session.page` 返回一段按訊息邊界裁剪、內部 seq 連續的歷史視窗。每個請求必須顯式攜帶 `throughSeq`；該值來自對應 `session.follow` generation 的 opening cursor，並把本次讀取固定在同一個日誌切點。無 `beforeSeq` 的 tail page 必須精確結束於 `throughSeq`，其中 `-1` 表示空日誌；`beforeSeq` 只選擇該切點之前的更早頁面，不能替代同步 cursor。`maxMessages` 限制 user／assistant 訊息數，不丟棄這些訊息之間的 chunk、tool 或狀態事件。

tail page 同時攜帶不晚於 `throughSeq` 的 projection baseline；舊頁只攜帶歷史 entries。Client 以 projection watermark 合併 page 與後續 live control 更新。

普通 Session 與 direct subagent 使用同一個 `SessionAddress` 協定。direct subagent 地址同時攜帶父 Session、子 Session 與 mode，Host 冷讀時驗證持久 ownership 和 descriptor，不能只憑 child id 越權讀取。

`session.follow` 在觀察 attached 或 prepared Session 前先安裝 `session/event` 與 `session/created` listener。

首次 follow 返回完整的 `{ type: 'snapshot', header, cursor, events, hasMore, projections }` frame。每次重連都傳送另一份完整 snapshot replacement；協定不含 `afterSeq`。觀察期間提交的 event 會保留在緩衝區，並在 snapshot 之後按 seq 發出。

普通冷 Session 可以立即釋出 prepared snapshot。首幀之後，Controller 把 retained observation 交給一次後臺 promotion；follow 不等待啟用。Direct-subagent 地址不會進入該 promotion 路徑。

Client 的 `SessionEventStream` 繼承 `RemoteJournalStream`，只提供 `session.follow`、`session.page`、Session seq 演算法與 repair request。通用層直接驗證並行布 opening snapshot；僅在讀取更早歷史或後續 event 暴露 seq gap 時呼叫 `session.page({ throughSeq })`。

```text
ctx.remote.session.follow(address, pageArgs) ----------------|
  snapshot(header, cursor, page, projections), event*        |[]> SessionEventStream
ctx.remote.session.page(address, throughSeq, pageArgs) -------|    |-- replace(window)
                                                                  |-- prepend(history)
                                                                  `-- append(live entry)
```

每個 Client Session 只持有一個目前 `events: SessionEventStream | undefined`。只讀 `SessionEventSource` 把已物化 event window 交給 Conversation consumer。

Session 的 `openGeneration` 只阻止被 resync、地址替換或 dispose 淘汰的非同步結果寫回；它不參與 transport retry。

initial page、repair page 或 follow 的 terminal failure 進入目前 Session 的 `openError`。舊業務 epoch 或舊 stream 的失敗不能覆蓋新狀態。

#### Session live control

`session.control()` 是 Host 範圍的 snapshot stream，一個瀏覽器可觀察所有目前 live Session 的瞬態狀態，而不必為每個 transcript 開啟 journal。

每個 generation 先發完整 baseline，再發 jobs 與 projection 增量幀。baseline 讀取程序內 registry 和已摺疊的 projection 值，不恢復冷 Agent。

jobs 使用完整 replacement 值並按 last-wins 應用。Projection update 攜帶單調遞增 revision，新 baseline 則替換完整 projection map。Session 與 owner disposal 會清理陳舊映像。

原始 `approval/request` 與 `user-questions/request` 是可轉發 waterfall。若某個 Agent-scoped Client listener claim，請求直接返回；若所有已投遞 Client 都呼叫 `next()`，原 Cordis waterfall 繼續到後續 Host listener。Session control 不儲存或重放這些請求。

projection baseline 與 tail page 的日誌切點獨立產生，Client 總是保留較高 seq 的值。訂閱 live projection 不會為取得值而啟動 Agent。

Session added、removed、activity、running status 與無 turn 位置的 Agent error 不進入 stateful control stream；它們是可由列表 baseline 修復或無需重放的 `ctx.remote.$on` 通知。

Session 列表的 `updatedAt` 取 `max(header.createdAt, sessionListMetadata.lastPromptAt)`。`lastPromptAt` 只由使用者來源的 `user/message` 更新，可從冷 projection 恢復，不依賴瀏覽器是否正在跟隨該 Session。

### Workspace Controller

`packages/api/workspace-controller` 提供 Host `ctx.workspaceController` 與生成的 `ctx.remote.workspace` namespace。

它擁有 create、rename、delete、insertBefore、insertSessionBefore、archiveSession、unarchiveSession 與 `follow`。Workspace registry 仍是持久事實來源，Controller 負責 Remote 命令、投影和錯誤對映。

`WorkspaceFeed` 同步觀察 storage `domain/changed`，併為每個 follow generation 先傳送完整 baseline，再傳送 `upsert`、`remove`、`order` 與 `archived` 增量。

完整 `order` frame 是 Workspace 排序的權威值。它避免 Client 根據 upsert 到達順序猜測展示順序，也能在重連 baseline 後收斂。

`createWorkspaceStateStream()` 把 `workspace.follow` 裝配為 `RemoteSnapshotStream`。Client Runtime 只負責啟動和持有該 stream。

`ClientWorkspaceModel` 位於 Workspace Controller 的 Client 面，擁有 baseline／increment 解析、已物化列表、歸檔集合、命令結果回顯及 unary 與 stream 到達競態的合併規則。

成功的 unary 命令可以立即更新本地模型；後到的 stream commit 仍以 Host projection 與完整 order 校正狀態。已刪除 Workspace 的 id 被記錄，延遲結果不能把它重新插回列表。

```text
ctx.remote.workspace.follow() -|[]> RemoteSnapshotStream
                                      |-- replace(baseline)
                                      |-- upsert/remove(view)
                                      |-- replace(order)
                                      `-- replace(archived ids)
```

Workspace Remote 方法、狀態 feed 和 Client 資料模型均不經過 API Proxy，也不依賴 `host/workspace-*` 通知。

### Remote Event

Remote Event 複用 owner 包的 Cordis `Events` 宣告。Host 原事件是唯一業務簽名，Client `ctx.remote.$on(event, listener)` 從同一宣告推導參數、waterfall 結果與 `next()`。

`packages/api/remotes` 的 allowlist 是應用選擇的唯一來源。每項顯式標註 `emit` 或 `waterfall`，該 mode 同時決定 Host 監聽方式、Client 合法鍵集和 wire frame 型別。

系統不宣告 `RemoteInvocationMap`，不要求 Client 再寫一份 `@Remote`，也不以最後一個執行時參數是否為函式來猜測呼叫模式。

Remote Event 下行幀是顯式 discriminated union：

```text
ready     { type, clientId }
emit      { type, event, args }
waterfall { type, event, eventId, agentId, request }
cancel    { type, eventId }
```

WebSocket JSON 與程序內 carrier 的入口都從 `unknown` 開始按 `type` 和精確欄位驗證；驗證完成後的分發只接收 typed union。TypeScript 靜態型別不替代 wire 驗證。

普通 `emit` 參數必須是無損 JSON。Client 在每個 Remote 實例私有的 Cordis key 上呼叫 `parallel()`，保留註冊順序、呼叫方 fiber 所有權和 listener 錯誤隔離。

私有 key 防止 Host 事件與 Client 本地同名 Cordis 事件互相觸發。Client Remote 不維護自己的 subscription registry 或手寫 listener chain。

可返回的 waterfall 目前只支援 Agent scope。事件簽名必須是一個含直接 `agent` 欄位的 request，加一個返回同型別結果的 `next()`，整體返回 Promise。

Host 只投影 request 一級的 `agent` 與 `signal`：`agent` 變為 frame 的一級 `agentId`，`signal` 成為 delivery lifetime，其餘欄位必須整體為無損 JSON。

Client 用 `agentId` 同步解析或物化 Agent Context，把目前 delivery signal 放回 request 的直接 `signal` 欄位，再在目標 Context 的私有 key 上呼叫 Cordis `waterfall()`。Session-backed adapter 在首個成功 Session 列表 baseline 到達前允許 transport 先物化 scope；baseline 到達後由列表生命週期接管 scope 存活判斷。

系統不掃描任意深度物件，不傳 path array 或 placeholder，不 deep clone／restore Context 和 AbortSignal，也不等待未來出現的 Agent Context。

Client adapter 未註冊、resolver 未返回 Context 或解析拋錯時，本 Client 立即返回 `next`。它不訂閱 registry、不做 resolve 後競態複查，也不為一次 delivery 建立臨時 Fiber。

Gateway Host 為每個未完成 waterfall 儲存 `eventId`、Host continuation 與已投遞 Client generation。新 Client generation 會收到同一 pending event 的重放。

每個 generation 的佇列保證一次投遞，因此 Client 不儲存 `seen` 集合。`clientId + eventId` 繫結結果與目前 generation，舊連線的回包不能完成新連線上的 delivery。

多 Client 同時接收 waterfall 時，第一個 result 或 rejection 完成 Host 呼叫，並向其餘 Client 傳送 `cancel`。只有所有已投遞 Client 都返回 `next` 時，Gateway 才繼續原 Cordis chain。

Host caller signal 取消、Agent Context 釋放、Client generation 結束和 losing-client cancellation 都會終止對應的等待。

Client 透過現有 HTTP unary RPC `$events/result` 回送 `next`、result 或 rejection；下行事件仍復用 Remote WebSocket mux，不為應答建立 duplex WebSocket。

Gateway 只驗證 waterfall 回傳值能無損表示為 JSON，不解釋業務欄位。Question 回答的 option 歸屬等語義由請求方或 UI 領域承擔，transport 不重複驗證。

`UserQuestionService` 在請求期間觀察到呼叫方 `AbortSignal` 已取消、且 provider 丟擲普通錯誤時，將其歸一為 `UserQuestionError` 的 `ASK_ABORTED`，並把原錯誤保留為 `cause`；provider 已給出的領域錯誤保持不變。

`$events/result` 失敗會令目前 Connection generation 失敗。Host 隨 generation 撤銷該 Client 的 delivery，pending event 在下一 generation 重放，Client 不維護第二套結果重試佇列。

普通 `$on` 通知在斷線後不重放。凡正確性依賴恢復的資料必須有 query、cursor 或 opening baseline，不能依賴 Remote Event 恰好送達。

Client listener 晚於事件到達才註冊時不補送；HMR 也沒有專用補投語義。

### API Proxy 的剩餘邊界

Session Controller 與 Workspace Controller 直接提供生成 Remote namespace；API Remotes 與 API Gateway 直接提供 Host-to-Client 事件。

Client Connection 只維護 Host generation、description 與通用 RPC，不解析領域 frame。

Client Runtime 只接收 Controller adapter 產出的領域變更，不識別 `HostFrame`、`session/subscribed`、`session/event` mux frame 或 `host/workspace-*` frame。

API Proxy 只承接自身擁有的獨立業務 API，不是 Session、Workspace、Remote Event 或 Connection generation 的依賴。

## 備選方案

**建立任意 Session stream 時自動恢復 Agent。** 這會讓檢視歷史、讀取 title、重連標籤頁或觀察後臺狀態產生執行副作用，也會讓多個瀏覽器觸發重複恢復；冷日誌和投影已有 persistence 來源。

**只允許 live Agent 使用 `session.follow`。** 這會迫使 transcript 首屏恢復 Agent，或重新引入 unary history 與 live subscription 之間的競態；按 identity 先 follow 再冷讀能同時覆蓋歷史和未來的顯式啟用。

**把 Session transport 與 Session commands 拆成兩個公開包。** 兩者共同依賴 Session address、Agent 啟用策略、subagent ownership、錯誤對映和 Client 掛載順序；一個公開 Controller 保持統一所有權，內部 class 仍可獨立演化。

**把 jobs、projection、Workspace 與日誌都改成普通 `$on`。** 普通事件沒有 reconnect baseline、cursor 或 gap repair，漏掉一次推送就會留下永久陳舊狀態；只有無需恢復、可由獨立查詢修復，或以 waterfall 本身持有請求生命週期的通知適合 `$on`。

**讓每個領域 Controller 繼承一個 page／follow／retry 基類。** Session journal 與 Workspace snapshot 的 opening、恢復和排序規則不同；Gateway 的三個組合式 stream 物件複用 transport 生命週期，同時讓領域 adapter 只宣告自己的 frame 語義。

**給 Remote Event 新建一份 Client invocation 宣告。** 第二張 map 或 Client `@Remote` 會複製 owner Cordis 事件簽名並形成漂移點；從同一 `Events` 宣告推導 `$on` listener 和結果型別可以建構性地保持一致。

**把 Agent scope 做成任意深度物件投影。** 遞迴掃描 Context 與 AbortSignal 需要 path、placeholder、clone 和 restore 協定，並把偶然物件結構升級成 wire 約定；一級 `agent` 與 `signal` 足以覆蓋目前 waterfall。

**等待 Client Agent Context 或 adapter 後再分發。** registry waiter、競態複查和臨時 delivery Fiber 會為一個可同步解析或物化目標的 Client 增加額外生命週期；resolver 當下不能提供目標時立即 `next` 保持 Cordis waterfall 語義。

**給 Remote Event 使用獨立物理 WebSocket 或 duplex stream。** Gateway mux 已提供認證升級、複用、取消、錯誤對映和重連；下行 `$events` 加上 HTTP `$events/result` 足以表達 request／response，不需要第三條連線。

**傳送應用層 JSON 心跳幀。** 這會擴充功能嚴格的 Remote stream message union，並要求瀏覽器處理沒有業務含義的流量。WebSocket Ping/Pong 無需改變 logical stream 語義即可保持 carrier 活躍。

**繼續保留 API Proxy 的 Host mux。** 這會保留手寫 union、schema、回應 envelope 和第二套 stream 生命週期，並使 Session 與 Workspace Controller 不能獨立擁有自己的資料協定。

**從聚合 `session/event` 更新 Session 列表時間。** 列表正確性會依賴瀏覽器正在消費哪些 Session，並把任意外掛事件誤判為使用者活躍；持久 `lastPromptAt` 投影直接表達排序事實。

## 驗證

Gateway mux 測試固定無 logical stream 時建連、空閒常駐、每次請求只做一次物理嘗試、可設定且不產生應用訊息的 Ping/Pong、活動 stream carrier failure、取消和 dispose 後不再重連。

Connection 測試固定 generation source 缺失、重複註冊、撤回、ready 超時，以及 generation 失敗後的撤回和重建。

`RemoteStream` 測試固定單 consumer、opening acceptance 後清零 retry、`restart()` 只替換 generation、terminal error 不重試和 dispose quiescence。

`RemoteSnapshotStream` 測試固定每 generation 恰好一份 opening snapshot、update-before-snapshot 拒絕、重複 snapshot 拒絕和重連 replacement。

`RemoteJournalStream` 測試固定 snapshot-first opening、連續 append、歷史 prepend、重連 replacement、gap repair 與一次性 replacement。

Session Host 測試固定 cold page／follow 不增加 attached Agent、顯式 prompt 後 cold follow 收到連續事件、direct subagent ownership、message-aligned pagination 和終止錯誤投影。

Session control 測試固定 baseline-first、冷 Session 不恢復、jobs replacement 與 projection watermark。

Session Client 測試固定每 Session 單一 journal owner、舊 open epoch 不寫回、control 與 journal 獨立取消，以及 carrier retry 期間保留已釋出視窗。

Workspace Host 測試固定 baseline-first、upsert／remove、權威 order、archived set 和 follower disposal。

Workspace Client 測試固定 snapshot replacement、unary／stream 競態、刪除不復活、穩定排序和 terminal failure。

Remote Event 型別測試拒絕未選擇事件、非 void 的 unscoped 事件、非 Agent-scoped waterfall 和簽名不匹配的 mode。

Remote Event Host 測試固定 listener-before-ready、payload 驗證、pending replay、多 Client first-result、all-next delegation、rejection、Host cancellation、Context release 和 losing-client cancel。

Remote Event Client 測試固定實例私有 key、Cordis 註冊順序、Agent Context 解析、`next`、result、rejection、cancel、舊 generation 回包拒絕和 `$events/result` 失敗導致 generation 結束；User Question 測試固定進行中 signal 取消的錯誤歸一化及 cause 保留。

缺失 source、重複 source、撤回 source、非 ready 首項、未知 discriminant、額外欄位與非 JSON 值都在各自 wire 入口響亮失敗。

靜態檢查固定 API Proxy 不再匯出 Session／Workspace Host frame carrier，Client Runtime 不再包含對應 bridge。

## 後果

瀏覽器可以在 Agent 停止時讀取持久 Session。開啟普通 Session 時先發布 prepared snapshot，再開始一次後臺 promotion；list、search、page 及其他只讀 observation 不會啟用 Agent。

持久日誌用 seq 與 page 修復缺失字尾；Session control 和 Workspace state 用 opening snapshot 收斂；普通 Remote Event 不承諾重放。恢復語義由資料型別決定，不再互相模擬。

Gateway 只擁有 transport、generation、pending waterfall 和嚴格 wire 驗證，不擁有 Session 或 Workspace 業務欄位。領域 Controller 只提供 opener、cursor 規則、baseline reducer 和錯誤呈現。

每條常駐瀏覽器連線會按設定間隔增加一次空載荷 Ping/Pong 交換。面對更嚴格的空閒超時，部署方可縮短間隔，而無需改變 Remote stream 協定或瀏覽器程式碼。

Session 與 Workspace 的 Host API、stream adapter 和 Client 資料模型各有明確 owner；API Proxy 不再是它們之間的中介。

通用 stream 物件增加了三個明確層級，但刪除了每個 Controller 各自複製的 retry、cancel、generation、baseline 和 gap-repair 外殼。

Remote waterfall 保留多 Client 首個 claim、全體 `next` 後繼續 Host chain、斷線重放 pending 和端到端取消；代價是目前協定只支援一級 Agent scope 與無損 JSON 請求／結果。

本決定擴充功能[Remote 事件投遞](2026-08-10-remote-event-delivery.zh.md)的 allowlist 與單一 Cordis 簽名設計：普通通知繼續使用 `emit`，Agent-scoped async waterfall 使用同一 `ctx.remote.$on` 面和顯式 `waterfall` mode；不建立第二套 invocation map。

本決定接管[簡單一元 API Proxy 遷移](../../archived/architecture/2026-08-10-unary-apiproxy-remote-migration.md)中保留的 Session、Workspace 與 Host event carrier，並保留[後臺任務展示](../feature/2026-08-08-web-background-job-display.zh.md)所要求的完整 jobs snapshot、程序內生命週期和“觀察不恢復 Agent”語義。
