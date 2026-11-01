# Agent Note: Client Conversation 業務節點組裝與 Chat keyed snapshot

Status: implemented

[English](2026-08-09-client-conversation-node-assembly.md) | 中文

## 問題

Client Session 既維護傳輸視窗、連線狀態和待處理互動，也在中心化 transcript fold 中解釋 Assistant、Tool、訊息、命令、壓縮、重試及 turn tail 等業務事件。每增加一種業務節點，都要修改 Session 的 switch、歷史 replay、索引、快取和 React 分組；業務 identity、狀態演進與最終展示沒有獨立所有者。

缺少 target-neutral assembly 時，執行中的 Assistant 和 Tool 會位於 finalized flow 之外，結算後才進入按日誌排序的節點列表。React parent 因而改變，即使業務 ID 和 `key` 穩定也會重新掛載。全量歷史載入、older prepend、即時 append 與 token streaming 若分別走不同更新路徑，引用穩定和區域性重算也只能依賴各處特化快取。

業務事件之間的關聯方式並不統一。Tool 有 call ID，Assistant 以 turn/step 關聯，Compaction 有獨立生命週期和 checkpoint，Inbox splice 則表示一個連續狀態的瞬間。把這些差異繼續塞進統一 fold，會讓任一業務變化都經過全域查表並使無關快取失效。

## 決策

start 的瞬態建立入口、同 ID 多次 start 及工具準備階段以[工具呼叫三階段](2026-09-22-tool-call-three-phases.zh.md)為準；本記錄的其他節點組裝職責繼續適用。

Client Runtime 提供 target-neutral 的 Conversation Node 組裝引擎，業務外掛註冊 Event Definition，檢視外掛註冊 per-Session View Builder。`ui-conversation` 註冊第一批內建 Definition 和 `chat` builder；Session 只負責把目前連續 `SessionEventLikeEntry` window 送入引擎並行布它的 snapshot，且不解釋具體 conversation 業務。entry 的外層 discriminator 區分標準與 packed record，兩者都攜帶欄位對齊的內部 `SessionEventLike`，供 Definition dispatch。

本 Note 保留實作後仍有價值的方案推導、逐業務適應、職責、演算法和取捨。

Chat 只註冊 `next-step` Inbox Definition，因為訊息分類是其唯一消費方；`next-turn` splice 仍是持久 Session input，但不會建立 Chat Context。Chat 與 Trajectory 各自維護 target 專屬 next-step state。每次插入只把訊息 ID 寫入不可變 splice 節點。成功 claim 時只 materialize 一次 pending 鏈，以目前批次替換上一個 claimed Set，並讓後續 Context 共享該 Set，直到下一次 claim。AgentLoop 會在領取下一批訊息之前追加目前 claim 接納的全部訊息；被拒絕的 claim 不追加 `user/message`，因此後續分類只需目前批次。歷史 Context 因而只保留線性 ID state，不再保留累計陣列和 Set 快照。

### 責任分層

| 層 | 長期職責 | 明確不負責 |
|---|---|---|
| Session | 維護連續邏輯 event window，區分 replace、prepend 與 scalar append，排程 snapshot 通知 | 解釋 Tool、Assistant、Compaction 等業務事件 |
| Event Registry | 按 Cordis 生命週期儲存唯一 `kind` 的 Definition 和唯一 fallback | 儲存某個 Session 的 Context 或 State |
| Assembler | 匹配標準 event 或 packed run，維護 Context、Location、依賴和釋出髒集 | 理解業務 State 欄位或 Chat 排序 |
| Node Definition | 定義一個業務物件的 identity、State 演進、Location data 和 target Node | 建立 Context、修改別的業務 State 或掃描全部 Context |
| View Builder | 把最終 target Node 增量整理成該檢視的 snapshot | 重新解釋 `SessionEventLike` input |
| React renderer | 按最終 Node 的 `kind` 展示 renderer-owned data，並讀取目前 Node 所屬 Location 的只讀業務 data | 配對業務 Event、掃描全域 Nodes 或決定業務生命週期 |

Registry 註冊是 Cordis effect，Definition 解除安裝會觸發現有 Session 的低頻 registry rebuild。普通業務 Event 不改變 Registry，也不會因此重建全部業務型別。

### `ConversationNodeDefinition` 總體契約

每個 [`ConversationNodeDefinition`](../../../../packages/client/ui-conversation/src/client/contract/conversation.ts) 獨立擁有一種業務物件從 `SessionEventLike` input 到 State 和最終 view Node 的轉換。Definition 的 `kind` 是 Registry 內唯一名稱，也是業務 ID 的名稱空間。

同一個 input 可以被多個普通 Definition 認領。例如一條 Assistant event 或 packed run 同時更新 Assistant Node 和 Turn Tail；一條 Retry Event 同時更新 Retry、Assistant 和 Turn Tail。Assembler 只有在全部普通 Definition 都返回 `null` 時才詢問 fallback。

Definition 不持有跨 Session 的可變業務資料。每個 Session 的 Context、State、依賴和 View Builder 都由該 Session 的 Assembler 隔離持有。

#### `kind`、業務 ID 與 Context key

`match()` 返回的 `id` 只要求在目前 Definition 內穩定。Tool 的 ID 可以是 call ID，Assistant 的 ID 可以是 `turn:step`，Inbox 的 ID 可以是 splice Event seq。

Assembler 使用 `conversationContextKey(kind, id)` 組合無碰撞 key；不同 Definition 即使返回相同 `id` 也不會共享 Context。最終 view Node 必須沿用這個 engine-owned key，不能把 `seq` 或渲染位置當 identity。

每個 `(kind, id)` 最多存在一個 start Match。第二個 start 會立即報錯；Definition 需要表達新生命週期時必須返回新 ID。

#### `match(event)`

`match(event)` 只讀取目前 `SessionEventLike`，返回 `{ id, role: 'start' | 'update' }` 或 `null`。它拿不到 Context、history、Reader、Location 或 view envelope。Client-only `assistant/live-chunk` event 只能作為 update；Assembler 會拒絕每個 transient start，`start()` 接收的 `ConversationStartMatch` 只包含持久 `SessionEvent`。

這項限制使單條 scalar event 或 packed run 的路由成本只隨已註冊 Definition 數量增長。Assembler 不會為了判斷一條 update 屬於誰而遍歷該 Definition 的歷史 Context。

start、result、resource、checkpoint 及業務自有終止 Event 必須攜帶或可直接推導同一 ID。若單個 Event 不能算出 ID，生產 Event 的協定負責補足關聯欄位，Client 不透過“最近一個未完成物件”猜測。

`role` 描述 State 生命週期，不描述可見性。start 可以立即生成 terminal Node；update 也可以在 start 尚未載入時先進入 pending Context。

#### `ConversationMatch`

匹配成功後，Assembler 把標準或 packed event、`role` 和引擎計算的 `location` 組成只讀 `ConversationMatch`。一個 packed run 始終只佔一個 Match，並保留 fragment 與 timestamp-gap 陣列。

Context 的 `matches` 永遠按首 `seq` 升序儲存，而不是按網路到達或分頁攝入順序儲存。Session journal 已經拒絕邏輯 range 重疊。歷史尾頁先出現 result、older 頁後出現 call 時，最終 Match 順序仍然是 call 在前、result 在後。

Location 可以隨 prepend 補齊邊界或 append 關閉邊界而改變。Assembler 替換受影響 Match 的只讀 Location 並 replay Context；業務不把舊 Location 副本當權威儲存。

#### `ConversationNodeContext`

| 欄位 | 所有者 | Definition 可見語義 |
|---|---|---|
| `key` | Assembler | `kind + id` 的穩定最終 identity |
| `kind` / `id` | Definition + Assembler | 目前業務名稱空間和業務 ID |
| `matches` | Assembler | 目前視窗已收集且按首 `seq` 排序的完整 scalar 與 packed 業務證據 |
| `start` | Assembler | 唯一 scalar start Match；尚未載入時為 `undefined` |
| `state` | Definition 返回、Assembler 持有 | 最近一次 `start`/`update` 回傳值；未初始化時為 `undefined` |
| `current` | Assembler | 各 target 最近一次 materialize 的 Node 或 `null` |

Context 欄位只讀，不表示業務 State 必須是深度 immutable。Definition 可以返回新物件，也可以原地修改舊物件後返回同一引用。

Assembler 只採納函式回傳值。`start()` 或 `update()` 返回 `undefined` 是契約錯誤並立即報錯；修改了物件卻不返回它同樣不成立。

Definition 可以讀取完整 `matches` 輔助建構 State 或 fallback Node，但不能增刪 Match、替換 Context 欄位或修改另一個 Context。

#### `start(context, match, reader)`

`start()` 是 State 的唯一初始化入口。Assembler 首次得到唯一 start 後呼叫它，並採用其返回 State。

當更早分頁改變 Context 的 Match 順序、Reader 前序答案或 Location 事即時，Assembler 從 `start()` 重新計算，而不是對舊 State 做方向相反的補丁。

呼叫 `start()` 時，Context 可能已經收集 start 之後的 updates。`start()` 返回初始 State 後，Assembler 仍會從 start 之後按日誌正序逐條呼叫 `update()`，因此攝入方向不會改變最終 fold 結果。

`reader` 只在 `start()` 中可用。它允許初始化邏輯讀取嚴格位於目前 start seq 之前、指定 `kind` 的最近 active Context，但不給業務一個任意掃描引擎內部 Map 的介面。

每次重新呼叫 `start()` 都會替換上一次呼叫登記的 Reader 依賴，保證 Definition 改變查詢分支時不會保留陳舊邊。

#### `reader.previous(kind)`

`reader.previous(kind)` 查詢滿足 `candidate.startSeq < current.startSeq` 且 State 已初始化的最近 Context。它不會返回同 seq、未來 Context 或尚無 State 的 pending Context。

回傳值包含前序 Context 的 key、kind、id、start seq、只讀 State 和 Matches。消費者自行解釋 State；提供者只負責把自己的 State 維護正確，不需要註冊特化 query 方法。

Reader 每次查詢都記錄 `{ key, revision, windowGap }` 依賴。命中前序 Context 時，其 revision 變化會 replay 消費者；未命中且仍有 older 歷史時，window gap 會等待後續 prepend。

若視窗已經到達 Session 起點仍未命中，`undefined` 是確定答案。若 `hasMore` 為 true，Definition 看到的仍是同一個 `undefined`，但 Assembler 會記住這是暫定結果。

依賴嚴格從較早 start 指向較晚 start，因此傳遞 replay 不形成時序環。Inbox 瞬間態鏈和 Message 對 Inbox 的讀取都使用這一約束。

#### `update(context, match)`

`update()` 只處理已由 `match()` 精確路由到目前 `(kind, id)` 的 post-start durable 或 transient Match。它不判斷 input 屬於哪個 Context。Assistant Definition 會直接 fold 每個 `assistant/live-chunk` update，並在 history replay 期間展開嵌入式 `assistant/message` 或 `assistant/attempt` stream。

Assembler 按 `seq` 升序呼叫 `update()`。即時尾部 update 可以直接增量應用；任何非尾部證據插入、start 補齊或依賴失效都會從 `start()` 完整 replay。

沒有業務變化時，`update()` 返回原 State。存在業務變化時，它可以返回 immutable replacement，也可以原地修改並返回同一物件。

Assembler 不以 State 引用相等判斷是否需要釋出或傳播。每次成功 update 都增加 Context revision、標記 dirty，並使直接或傳遞 Reader 消費者重新求值。

#### `publication(match)`

`publication()` 只決定最新 State 何時 materialize 成 view Node，不改變 `match()`、`start()` 或 `update()` 的同步執行。

| 回傳值 | 行為 |
|---|---|
| `immediate` | 請求目前 microtask 通知與 flush |
| `animation-frame` | 跨過三個瀏覽器 animation frame 後，把多條高頻更新合併為一次 materialization |
| `none` | 本 Match 不主動安排 flush，State 和 dirty 標記仍被保留 |

省略 `publication()` 等於 `immediate`。Assistant token delta 與 packed run 使用 `animation-frame`，不可見 Inbox Context 使用 `none`，final、依賴 replay 和 Location 邊界會以 immediate 路徑釋出最新結果。

三幀間隔內的每條 live delta 仍執行 `update()`，一個歷史 packed run 則執行一次 batch `update()`；Location-data publication、`buildViewNode()`、View Builder 與 React snapshot 通知會合並執行，不會丟失 fragment。immediate publication 會取消等待中的幀間隔，並立即釋出最新 State。

#### `buildLocationData(context, scope)`

`buildLocationData()` 讓 Definition 把 State 的只讀派生值釋出到 Engine-owned Step 或 Turn，而不把另一個業務的可變 State 暴露出去。Assembler 會把前一次 publication 傳回它的 owner；業務資料未變時，owner 原樣返回該值。Assembler 在每次 materialize 中固定先處理 `step`、再處理 `turn`，因此 Turn 級聚合可以讀取同一輪已經更新的 Step data；全部 Location data 就緒後才呼叫 `buildViewNode()`。

Definition 分別收到 `step` 和 `turn` scope，可以在任一階段返回一個值或 `null`。回傳值必須宣告準確的 turn/step 座標，並使用與 Definition `kind` 相同的 key；Assembler 擁有替換和移除，並拒絕另一個 Context 佔用同一 Location key。

`ConversationStepDataMap` 和 `ConversationTurnDataMap` 透過 declaration merging 約束 key 與 value。Location 只暴露穩定的 `data.get(key)` reader，消費者不能取得提供者 Context 或修改它的 State。

#### `buildViewNode(context, target)`

`buildViewNode()` 在釋出階段讀取最新 Context，為指定 target 直接生成最終業務 Node。Assembler 不在它之後附加通用 activity、tail candidate 或 layout 業務層。

`null` 表示該 Context 對這個 target 尚未 materialize。普通增量路徑中，一個已經返回過非空 Node 的 Context 不能再返回 `null`；暫時隱藏必須保留同 key Node，並使用 target 自己的 visibility。

Assembler 驗證 Node `key === context.key` 且 Node `target === target`。業務可以改變 `anchorSeq`、data、Location 或 visibility，但不能在一次生命週期內改變 identity。

`current` 讓 Definition 區分“從未生成”與“已經生成後需要隱藏”。Assistant retry suppression 使用它避免非法的 Node 撤回。

一個 Definition 最多擁有一個 view target；僅維護狀態的 Definition 同時省略 `target` 與 `buildViewNode()`。即使 Chat 與 Trajectory 識別同一持久 Event 族，它們也分別註冊自己的業務 Definition；共享 Assembler 則為兩個 target 提供相同的匹配、replay、Location 與釋出機制。

#### 不提供通用 `end()`

引擎不提供固定 `end()` 生命週期。單 Event 業務在 `start()` 中完成，多 Event 業務在自己的 update 中記錄完成，長期瞬間態業務則每條 Event 建立新 Context。

Step/Turn 關閉屬於外部 Location 事實，不替業務修改 State。邊界變化會 replay 並 build 受影響 Context；業務結合“自己的 State 是否完成”和“Location 是否 closed”生成正常、running 或 interrupted 表現。

ID 不復用，完成的 Context 繼續存在於目前視窗，既提供穩定渲染 identity，也可以作為後續 Reader 的前序證據。

### Location 是一級引擎事實

[`ConversationLocationIndex`](../../../../packages/client/ui-conversation/src/client/conversation/location-index.ts) 根據 `turn/start`、`step/start`、顯式 turn/step payload、`step/end` 和 `turn/end` 建立標準 event 與 packed run 到 Location 的對映。同一 row 的成員共享 turn、step、block index 與 delta kind，因此只需以首 `seq` 建立一條 Location entry。

Location 有 `session`、`turn`、`step` 和 `unresolved` 四種形狀。Turn/Step 各自帶 `open`、`closed` 或 `unknown` 狀態，以及已載入的 start/end Event。

每個 Turn 和 Step 還持有 reference-stable 的 Location data store。Definition 更新只替換自己擁有的 key；同一個 store identity 可以隨 append 或 prepend 獲得新值，使 Context、View Builder 和 React renderer 共享已經確定的層級業務事實，而不複製或遍歷全域 Node 陣列。

`unresolved` 表示目前歷史視窗缺少足夠前序邊界，不等於 session-level。older prepend 補入邊界後，索引修正 Match Location，並只 replay 擁有這些 seq 的 Context。

Append 標準 Event 只繼承目前座標；append 邊界只重算所屬 Turn。Prepend 會基於連續 `SessionEventLikeEntry` window 重建 Location facts，但引用穩定邏輯保留未變化 Turn/Step 物件。

Assembler 還把 reference-stable timeline 交給 View Builder。業務不重複維護 turn order、step list、last step 或邊界 Map。

## 三種 input window 鏈結

“歷史反掃”描述 UI 從最新尾頁向 Session 起點逐頁載入的方向，不表示 Definition 逆序執行 `update()`。Session journal 會在釋出前驗證每條 record 的邏輯 range；無論分頁載入方向如何，Assembler 都按每個已接受標準 event 或 packed run 的首 `seq` 排序。

| 情境 | 輸入範圍 | Context/State 處理 | View Builder |
|---|---|---|---|
| 初始歷史尾頁或 resync | 目前完整連續邏輯視窗 | 清空並按首 `seq` 正序重建全部 Context | `replace()` |
| 載入一頁 older history | 只傳透過 range 驗證的更早標準 event 或 packed run | 保留現有 Context identity，補 Match、Location 和依賴後區域性 replay | `apply(upserts)` |
| 即時 append | 一條連續尾部 Event | 只匹配 Definitions 並精確更新命中 ID，邊界隻影響所屬 Turn | `apply(upserts)` |

### 初始歷史尾頁與邏輯反掃

1. `Session.open()` 拉取最新 tail page，並把連續 `SessionEventLike` entry 交給 `replaceWindow(entries, hasMore)`。
2. `replaceWindow` 清空舊 Context、start-seq 索引、seq 反向索引、Reader 依賴和輸入 Map。
3. 全部 entry 按首個邏輯 `seq` 升序排序並寫入目前視窗。
4. LocationIndex 對這個視窗重建 Turn/Step facts。
5. Assembler 按升序存取標準 event 與 packed run，並逐條呼叫每個普通 Definition 的 `match(event)`。
6. 每個命中結果按 `(kind, id)` 取得或建立 Context，並把 Match 插入該 Context 的有序陣列。
7. 遇到 start 時執行 `start()`；已有 State 的尾部 update 直接執行 `update()`。
8. 目前頁只含 result/resource 而缺 start 時，Context 仍會按 ID 建立並收集 Matches，但 State 保持 `undefined`。
9. 全部 input 匹配後，Assembler 複查 Reader 依賴，使同一視窗內較早瞬間態先穩定、較晚消費者再讀取它。
10. 所有 Context 標記 dirty，下一次 flush 先按 Step→Turn 完整重建 Location data，再對每個 target 呼叫 `buildViewNode()`。
11. 某些業務在缺 start 時返回 `null`；Compaction、Command、Tool result 或 Turn Error 等可根據充分 update 證據建構 fallback Node。
12. 每個 View Builder 收到完整 Node 集和 timeline，透過 `replace()` 建立初始 snapshot。

這條鏈結“從最新頁開始”只發生在分頁選擇層。頁面內部 State 始終正序計算，因此同一個視窗不會因為掃描方向不同產生不同業務結果。

缺 start 的 Context 不是錯誤。它是等待 older 頁補齊的 pending 聚合容器；是否提前可見由該 Definition 的 `buildViewNode()` 決定。

若目前頁中的同 ID update 在日誌順序上真的早於 start，而不是僅僅先被載入，補齊 start 後 replay 會報協定錯誤。到達順序可以反向，業務日誌順序不能反向。

### 新 older 分頁的 prepend

1. `Session.loadOlder()` 以目前 `baseSeq` 拉取緊鄰前頁，並先驗證頁尾與目前視窗連續。
2. Session 把已接受的標準或 packed entry prepend 到自己的視窗，只把這一頁傳給 `assembler.prepend(entries, hasMore)`。
3. Journal 已經丟棄完整重複 range 並拒絕部分重疊；Assembler 再按首 `seq` 排列 fresh page。
4. 已存在的 Context、State、current Nodes 和 View Builder 實例不清空。
5. LocationIndex 用擴充功能後的完整輸入重建 facts，並報告 Location identity 真正變化的 seq。
6. 擁有這些 seq 的 Context 更新 Match Location，並從 start replay；無關 Context 不參與 Location replay。
7. fresh 標準 event 與 packed run 透過同一 Definition matcher 和穩定 ID 進入已有或新 Context。
8. 新頁補出 pending Context 的 start 時，該 Context 從 start 初始化，再正序應用已經收集的所有 updates。
9. 新頁建立更近的 Reader predecessor、改變 predecessor revision 或消除 window gap 時，消費者從 `start()` 重算。
10. Reader 依賴沿 start seq 向後傳遞 replay；同一傳播批次不會把 Event 逆序應用。
11. `hasMore` 從 true 變為 false 的空頁也會複查依賴，把暫定 `undefined` 收斂為確定不存在。
12. flush 只為 dirty Context 重新發布 Step/Turn Location data 和 target Node，並把非空結果作為 `upserts` 交給 View Builder `apply()`。

Prepend 保留已有 Context key 和 current Node identity。新頁可以在 Chat `order` 前部增加 key，也可以修正既有 Node 的 anchor、Location、visibility 或 data，但不會為無關業務重新建立 Context。

Chat Builder 遇到結構變化時會從 keyed store 重算可見 `order` 和 Location 二級索引；這是檢視索引計算，不會重新執行全部業務 Definition 或替換未變化 Node value。

Reader gap 修復是 prepend 與普通 append 最大的演算法差異。新頁不僅可能建立可見歷史 Node，也可能改變後續 Inbox 瞬間態以及依賴它的 Message 分類。

### 正向即時 append

1. Session 只接受緊鄰目前邏輯 tail seq 的標準 live Event；重疊時去重，出現 gap 時先走 tail-page repair。
2. 非邊界 Event 增量寫入目前 Turn/Step 座標；邊界 Event 更新所屬 Turn 的 Location facts。
3. Assembler 對這一個 Event 的每個普通 Definition 呼叫一次 `match()`，不會遍歷任何 Definition 的 Context 集合。
4. 每個命中結果透過 `(kind, id)` 直接定位一個 Context。
5. 新 ID 建立 Context；已有 ID 的正常尾部 update 直接呼叫一次 `update()`。
6. start 或任何需要插入非尾部位置的證據會走完整 `replayContext()`，保持同一正序語義。
7. Context revision 變化後，只沿已登記 Reader 依賴 replay 消費者。
8. Location close 會更新所屬 Turn 中受影響 Match 的 Location，並 replay 這些 Context，使未完成 Assistant、Tool 或 Retry 得到 interrupted/cancelled 語氣。
9. Assembler 彙總所有命中 Definition 的 publication urgency；`immediate` 高於 `animation-frame`，後者高於 `none`。
10. Session 把 immediate 交給 microtask notifier，把 animation-frame 交給 RAF notifier。
11. flush 先為 dirty Context 更新 Step/Turn Location data，再呼叫 `buildViewNode()`，最後把本輪 upserts 和最新 timeline 交給 View Builder。
12. React 訂閱的新 snapshot 複用穩定 Context key；同一 Tool running→settled 或 Assistant streaming→final 不跨父節點移動。

Append 的業務匹配成本是 Definition 數量加實際命中的 Context 更新，不隨歷史 Context 數量增長。Reader 消費者和 Location 關閉會增加與真實依賴或所屬 Turn 成比例的 replay。

Chat `order` 的結構性變化仍可能重排目前可見 key；純 data 更新只替換 keyed store 中一個 Node，並 touch 所屬 Location 索引。這裡保證的是無關業務不 refold、Node identity 不替換，而不是宣稱所有檢視索引操作都是常數複雜度。

### Replace、prepend 與 append 的一致性

三條鏈結最終都遵守同一不變數：Context Matches 按 seq 排序，State 從唯一 start 正序 fold，Reader 只看嚴格前序 active Context，Location data 按 Step→Turn 釋出，Node key 只由 kind 和 ID 決定。

`replaceWindow` 是初始開啟、resync、gap repair 和 registry 變化的低頻完整替換，不用於實作普通 load older。`prepend` 與 `append` 都保留現有 Builder 和 Context identity。

分頁頁寬、record packing、歷史載入次數和 RAF 合批隻影響何時得到更多證據或何時釋出，不改變邏輯證據相同時的最終 Context State 與 Node。

## 內建業務如何使用 Definition

### 匹配、ID 與 State

| 業務 / `kind` | 穩定 ID | start Match | update Matches | State 與跨 Context 讀取 |
|---|---|---|---|---|
| Next-step Inbox / `inbox-next-step` | splice Event seq | 每條目標為 next-step 的 `agent/inbox/spliced` | 無 | 把訊息 ID 追加到持久 splice state；每次 claim 只 materialize 一次，並向 Message 暴露共享的目前 claimed batch |
| Message / `input-message` | message ID | append-surface `user/message` | 無 | 根據 source 生成 context message，或讀取最近 next-step Inbox 判斷 user/steering |
| Request Prompt / `request-prompt` | header Event seq | 每條 `request/header` | 無 | 透過 Reader 讀取前一條 Request Prompt，保留完整 prompt 狀態，並判定 system/tool 變化 |
| Assistant / `assistant-step` | `turn:step` | `step/start` | Live `assistant/live-chunk`、持久 `assistant/message` 或 `assistant/attempt`、同 step Retry | 聚合 block、usage、首 token 時間、settlement 證據與 retry-hidden state，再發布同 key Step data |
| Tool / `tool-call` | root call ID | root `tool/call` | root result、PTC dispatch start/result | 聚合 root、children 和 parent Map；Dispatch Event 用 `rootCallId` 精確路由 |
| Command / `command` | command ID | `command/run` | `command/done`、帶 source command ID 的 compact lifecycle/checkpoint | 聚合 command outcome 和手動壓縮證據 |
| Automatic Compaction / `compaction` | compaction ID | 無 source command ID 的 `compaction/start` | summary、end、replacement checkpoint | 聚合 summary/checkpoint；checkpoint 足夠時可在缺 start 下 fallback |
| Retry / `model-retry` | retry ID | attempt 1 的 `llm/retry` | 後續 `llm/retry` 與 `llm/retry-started` | 聚合同一 RetryId 的 attempts 與 scheduled/started 狀態 |
| Turn Error / `turn-error` | turn number | `turn/start` | error `turn/end` | 聚合 terminal failure；該 turn 的 Retry 歷史經由 Retry 渲染，絕不會隱藏此行 |
| Turn Tail / `turn-tail` | turn number | `turn/start` | Assistant、Retry、`step/end`、`turn/end` | 儲存 turn end，讀取各 Step 的 Assistant data，釋出 Turn data；完整 Matches 用於選擇視覺尾部 anchor |
| Deliverables / `deliverables` | turn number | `turn/start` | 該 Turn 的 Tool call/result | 聚合成功 mutation paths 並行布 Turn data，不生成 view Node |
| Unknown fallback / `unknown-surface` | Event seq | 未被普通 Definition 認領的 append-surface Event | 無 | 儲存原始 type/data 作為 JSON fallback |

### Chat Node 與歷史/即時特性

| 業務 | `publication()` | Chat 產物 | 歷史分頁與執行時行為 |
|---|---|---|---|
| Inbox | `none` | 不生成 Node | prepend 補前序 splice 時沿 Reader 鏈重算 next-step ID state；next-turn 不建立 Chat Context |
| Message | 預設 immediate | `user`、`steering` 或 `context` | window gap 修復可讓同一 message key 重新分類 |
| Request Prompt | 預設 immediate | 初始請求、每個顯式序列或真實 system 變化各生成一個非空 `system-prompt` | Step 首條 header 錨定在請求訊息之前；prepend 補入前序 header 並證明 system 未變後，可隱藏此前保守渲染的 resume |
| Assistant | scalar chunk 與 packed run 為 RAF，final immediate，純 usage/finish 為 none | 同 key `assistant-step`，狀態為 running/settled/interrupted | scalar 與 packed reducer 等價；缺 `step/start` 可先用 Matches fallback；Location close 生成中斷表現 |
| Tool | 預設 immediate | 一個遞迴 `tool-call` root，包含全部 `subCalls` | result-only 歷史視窗可 fallback；running→settled 保持 key |
| Command | 預設 immediate | 普通 `command` 或整合 `manual-compaction` | checkpoint 到達可改變 anchor，但不改變 Context key |
| Compaction | 預設 immediate | `compaction` marker | checkpoint 可先展示，older 補 start 後正序 replay |
| Retry | 預設 immediate | 一個 `model-retry` Node 內含 attempts | 多次 retry 更新同一 key；Location close 把最後 scheduled 表現為 cancelled |
| Turn Error | 預設 immediate | terminal failure 時的 `turn-error` | 缺 start 可從 error end fallback；該 turn 定格的 Retry 鏈在其旁渲染 |
| Turn Tail | 僅 `turn/end` immediate，其餘 none | 獨立 `turn-tail` footer | 從 Step Assistant data 計算 closing/metrics，並透過同 turn Matches 決定 anchor |
| Deliverables | 預設 immediate | 不生成 Node | Tool 結算增量更新所屬 Turn data，Turn Tail 擴充功能槽讀取 produced files |
| Fallback | 預設 immediate | `unknown` JSON row | 只後備 append surface，普通業務已認領但暫不可見時不會重複生成 |

Inbox 展示了“每條 Event 都是一個 start-only 瞬間態 Context”，不是所有業務都需要 start/update 配對。每個 next-step state 透過 Reader 與前一個同 kind Context 形成連續 fold，而非給整個 Inbox 人工製造生命週期 ID。state 自身共享不可變 pending splice 節點和一個目前 claimed-batch Set；未消費的 next-turn input 不進入 Conversation，因為 Chat 與 Trajectory 都不讀取它來分類。

Request Prompt 展示瞭如何在不共享 target State 的前提下共用純解釋邏輯：Chat 與 Trajectory 各自在自己的 Definition 中呼叫 `inspectRequestPrompt()`。該函式規範化完整 header，並判定面向模型的 system/tool 差異；隨後每個 target 自行選擇產物。Chat 會物化非空的初始 system 欄位、真實 system 變化，以及每個顯式開啟訊息序列或緊隨表層替換的 `series` 快照。即使 system 文字未變化，resume header 仍保留 Chat prompt 卡片。普通的僅追加後續 Turn 不會再次寫入未變 header。一個 Step 中的首條 header 遵循提供者信封，而不是 header Event 位置：step one 使用所屬 Turn start，後續 step 使用各自的 Step start，把 system 欄位放到該請求的 user-role 訊息之前；同一 Step 的後續 header 保留在開啟新序列的表層改寫之後。部分視窗未包含前序 header 時，非 `initial` header 會保留在自身 Event 並保守渲染。prepend 補入相同的前序 header 後，內容未變的 `change` header 可以隱藏，但不撤回其穩定 Node key；resume 和顯式序列起點的卡片仍然可見。每條 header 都是完整快照，因此已載入視窗中的首條 `resume`、`change` 或 `series` header 無需憑空建構與未載入歷史的比較，也能渲染其 system 欄位（[request-prompt Definition](../../../../packages/client/ui-chat/src/client/conversation-nodes/request-prompt.ts)）。

Retry、Assistant 和 Turn Tail 展示了同一 Event 被多個 Definition 獨立認領。每個 Definition 只更新自己的 State，最終分別生成原子 Chat Node。

Assistant、Turn Tail 和 Deliverables 展示了 Location data 的分層組合。Assistant 負責寫好每個 Step 的 `assistant-step` data；Turn Tail 從這些 Step values 計算 `turn-tail` data；Deliverables 獨立維護同一 Turn 的 `deliverables` data。消費者只讀取宣告合併後的 key，不掃描其他業務 Node，也不取得提供者的 Context State。

Tool 和 Command 展示了多 Event 聚合：生產者提供共同 ID，Context 在業務內部構樹或整合 Compaction，不把配對工作推給 Chat Builder。

Compaction 和歷史 Tool result 展示了缺 start 時的業務 fallback。引擎不統一規定“沒有 start 就不渲染”；Definition 根據目前 Matches 是否足夠自行決定。

Retry 展示了業務 State 與 Location 的分工。scheduled/started 屬於 Retry State；Step/Turn 是否關閉屬於引擎 Location；`buildViewNode()` 組合兩者得到 cancelled 視覺狀態。

Unknown fallback 展示了 Registry ownership：fallback 只處理沒有任何普通 matcher 認領的 append surface Event，不會因為普通 Context 暫時返回 `null` 而誤生成第二個 Node。

## View Builder 與 React identity

[`ConversationViewRegistry`](../../../../packages/client/ui-conversation/src/client/conversation/view-registry.ts) 為每個 target 儲存獨立的 builder factory，不共享某個 Session 的排序或快取。

shell 選擇或 target source 的首個 subscriber 會把該 target 加入 Session 單調增長的 active-target set。Assembler 按唯一 target 索引每個 Context，但不會為 inactive target 建立 builder、Node 或 snapshot。首次啟用會 flush 尚未釋出的 target-neutral 工作、建立 builder，並從該 target 的目前 Context 呼叫一次 `replace({ nodes, timeline })`。

Session binding 可用、快取的 binding 成為 current 或 View roster 變化時，shell 會同步解析持久化選擇，再顯式啟用已註冊的偏好 View 或 Chat fallback。Tab 與 focus action 在更新選擇狀態前先啟用解析出的 target。blank Session 不渲染 View slot；`ConversationSnapshot.activeTargets` 只從已物化的 active snapshot 派生，不查詢 inactive target Context 的 activity。

普通 prepend 與 append flush 只對 active target 呼叫 `apply({ upserts, timeline })`。完整 window replace 與 Registry rebuild 只對 active target 呼叫 `replace()`。取消訂閱不會移除 target，因此返回已開啟的 View 不會重建。

[`ChatSnapshotBuilder`](../../../../packages/client/ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts) 維護 `order`、帶身份穩定 Node 與 Turn-process source 的 keyed `nodes` store、turn/step `locations` index、`timeline`，以及由 StatsPills 使用並映像到頂層公共相容欄位的 `legacy` slice。

Chat 結構變化只由新 key、`anchorSeq`、visibility 或 Location identity 變化觸發。普通內容變化不重建 `order`；keyed Node store 只替換該 key 的 value 並行布其 source。Turn-process projector 僅為結構、規格或狀態發生變化的 Turn 重算跨 Node 呈現，再只發布該 Turn 的 process source。

Builder 遇到結構變化時從 store 的目前 values 計算 visible order，並按未變化引用複用索引陣列。Prepend 可以增加前部歷史 key，append 可以增加尾部或按業務 anchor 落位，既有 key 不因排序變化而重新命名。

[`ChatView`](../../../../packages/client/ui-chat/src/client/chat/ChatView.tsx) 只遍歷 `order`，併為每個 key 解析兩份穩定 source。每個 [`ChatNodeSeat`](../../../../packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx) 以 Context key 固定在同一個父列表中，只訂閱自身的 Node 與 Turn-process source，並按 `node.kind` 分發 `'conversation.chat.node'` keyed slot。

[`ChatNodeDataMap`](../../../../packages/client/ui-chat/src/client/contract/chat-nodes.ts) 是 declaration-merged 的 renderer payload registry。每個業務模組分別註冊自己的 Definition 和 keyed renderer；`registerConversationNodes()` 與 `registerChatNodeRenderers()` 只負責裝配這些獨立貢獻，不透過 closed union 或中心 switch 解釋業務。內建實作位於 `ui-chat`，且該型別和註冊邊界允許業務遷入獨立 package 而不修改 Chat dispatcher。

`conversation.view` 的 Chat entry 在宣告 `conversation.chat.node` child slot 時統一註冊 `ChatNodeTurnDataInjected`。`ChatNodeSeat` 把 Node 所屬 Turn 的穩定 data store 作為 `hookContext` 傳給 slot；Slot renderer 直接在該 store 上繫結 `useTurnData(businessKey)`，因此每個 keyed Chat renderer 都能讀取自己 Node 所屬 Turn 的強型別只讀 data，Assistant renderer 不擁有特殊注入權限。

Slot-level contextual Hook 與 entry-owned `inject.hooks` 是兩條獨立路徑。後者繼續只繫結 registration-owned Observable；前者按穩定 slot inject face 快取定義，並按穩定 render occurrence 繫結 factory 和 Hook。`useTurnData()` 訂閱 `turn.data.source(key)`，其他 Location-data key 或 Session snapshot 的釋出不會通知它。

標準 `useSession` 仍屬於所有 session-scoped slot renderer 的公開能力，但 `ChatNodeSeat` 不再需要它或聚合 `useChat`。`useTurnData()` 是收窄常見讀取方式而不是權限沙箱。全視窗統計或任意物件索引仍可顯式使用 Session snapshot；它們不能偽裝成“目前 Node 的 Turn data”。

Assistant streaming 到 final、Tool running 到 settled 始終留在同一個 Seat，只更新 data 和必要的排序屬性。結算不會因跨 parent 移動而重置元件內部 State。

業務主動把已釋出 Node 改成 hidden 時，它會退出 visible order，恢復 visible 時會重新 mount。這是明確的業務撤顯語義，與 running→settled 的穩定 Seat 保證不同。

具體 Tool renderer 仍由 [`ui-tool ownership decision`](../../archived/architecture/2026-08-08-client-tool-presentation-ownership.md) 約束。Tool Definition 只交付遞迴 root/subcall data，`ui-tool` 再按 Tool name keyed slot 分發具體表現。

Trajectory 針對與 Chat 相同的 Assembler 和 `SessionEventLikeEntry` window 註冊自己的 target 與業務 Definition。它的 target builder 保留 stage-oriented read model，既不消費 Chat Builder 的 legacy slice，也不執行獨立 history fold。Chat 與 Trajectory 分別維護獨立的 scalar 和 packed Assistant reducer；target 專屬 Definition 不改變共享的 Context、Reader 或 Location 契約。

target 專屬 Trajectory Definition、保留的 stage model、Steering 適應、複雜度上界與表現層熱點由 [Trajectory Context 組裝決策](../../archived/architecture/2026-08-11-trajectory-conversation-context-assembly.md)負責。

## 執行時與渲染鏈結

```text
SessionEventLike window
  -> ConversationNodeAssembler
       -> Definition.match(event) -> (kind, id, start/update)
       -> Context matches + State + Location
       -> Definition.buildLocationData(step -> turn)
            -> StepLocation.data / TurnLocation.data
       -> Definition.buildViewNode() for each active target
  -> active target View Builder
       -> chat: ChatSnapshotBuilder -> ChatView -> keyed ChatNodeSeat
       -> trajectory: TrajectorySnapshotBuilder -> stages/layout/table
```

## 驗證

Runtime tests 固定 Definition 生命週期註冊、exact-ID append、update-before-start 收集與 start 後正序 replay、prepend identity、Reader window-gap 修復、傳遞依賴、Location closure、Step→Turn data phase order、Location data replacement、publication cadence、非法撤回、首次訂閱 activation、單調 active target 和 per-target Builder。

Conversation tests 覆蓋全部內建 Chat Definition、Assistant Step data、Turn Tail 與 Deliverables Turn data、Chat 排序和結構共享、selector isolation、Assistant/Tool running-to-settled identity、nested PTC dispatch、steering、Compaction、Retry、interruption、load-older anchoring 和 slot dispatch。Trajectory tests 則覆蓋它獨立註冊的 Message、Assistant、Tool、Compaction、Request-header 與 boundary Definition，以及繼續保留的 stage-oriented view model。

Slot type/runtime tests 固定父註冊必須提供宣告的 common inject、`hookContext` 型別、不同 Node context 的 Hook 隔離、factory/Hook identity 穩定，以及無關 Session publication 不重渲染業務 renderer。原 entry-owned Observable Hook 測試繼續固定未使用 contextual factory 的路徑。

Assembled Web snapshot、GUI 和瀏覽器情境覆蓋真實 plugin graph。瀏覽器證據比較 Assistant streaming→settled、Bash running→settled 以及 PTC mode root + nested subcalls 與 master 的佈局。

歷史鏈結驗證同時覆蓋完整 replace、非重疊 prepend、完整 range 去重、部分重疊拒絕、空頁 `hasMore` 收斂和 scalar live append。相同 Assistant 歷史的 scalar 與 packed 表示產生相同 Chat/Trajectory State、timing boundary 與最終 Node；一個 packed run 在 replace、prepend、Location replay 與 registry rebuild 中始終只保留一個 Match。

## 考慮過的替代方案

**保留中心化 Session transcript fold，只抽 helper。** 拒絕：業務 identity、歷史 replay 和 cache invalidation 仍屬於一個閉合 switch，移動函式不會產生獨立所有權。

**讓 React renderer 自己掃描 Session Event。** 拒絕：每種 view 都會重複匹配和生命週期 State，React 會成為業務權威，paging 與 streaming 也會重算無關元件樹。

**把全域 Nodes 或 Location 索引傳給每個業務 renderer。** 拒絕：業務元件會自行掃描和推斷目前 Turn/Step，訂閱範圍隨視窗增長。Definition 把聚合值釋出到 Engine-owned Location，renderer 只讀取自己 Node 的 Location data。

**每個新 Event 都呼叫同 Definition 的全部 Context。** 拒絕：append 成本隨歷史增長，`update()` 也會同時承擔匹配與轉換。無 Context 的 `match(event)` 先算出 ID，隨後只更新一個 Context。

**讓 Definition 的 matcher 讀取 Context 或掃描歷史。** 拒絕：匹配將依賴攝入方向，result-first 歷史頁無法獨立算出歸屬，即時 append 也退化成開放物件查詢。

**為歷史反掃定義逆向 State fold。** 拒絕：每個業務都要維護互為逆運算的兩套邏輯，刪除、非可逆聚合和跨 Context 依賴很難保持一致。統一 Matches 後從 start 正序 replay 只有一套業務語義。

**增加獨立 live-stream matcher 與 update lifecycle。** 拒絕：第二條 Definition path 會重複 dispatch、replay、publication 與 Context type。Client-only `assistant/live-chunk` 與持久 settlement 使用既有 `match(event)` 和 `update(context, match)` lifecycle；只有 event discriminator 與 stream expansion 不同。

**把 Inbox 做成引擎一級公民或一個視窗級 Context。** 拒絕：Inbox 是普通業務狀態，不應汙染通用引擎；逐 splice 瞬間態加嚴格前序 Reader 同時支援 prepend、append 和 Message 查詢。

**給跨業務查詢註冊特化 query method。** 拒絕：消費者仍要依賴提供者 API，新增關係會擴張中心介面。Reader 暴露指定 kind 的只讀前序 Context，由提供者寫好 State、消費者讀懂 State。

**讓 Location data 消費者直接讀取提供者 Context State。** 拒絕：消費者會依賴另一個業務的可變內部形狀，也無法表達值屬於哪個 Turn/Step。declaration-merged data map 只公開提供者選擇釋出的只讀值和 Engine-owned 座標。

**按 State identity 快取每個 Definition 的 Location data。** 拒絕：Definition 可以原地修改並返回同一個 State 物件，其 Location data 也可能依賴 Match Location 或其他 Definition 釋出的 value。各 Definition 改為自行判斷業務值是否變化；未變化時原樣返回前一次 publication。

**增加通用 `end()`、prepared 或 window reset 生命週期。** 拒絕：不同業務完成條件不同，分頁缺口也不是業務生命週期。業務 Event 更新 State，Location close 觸發 replay/build，Reader dependency 負責補頁失效。

**在同一個 Event Definition 內透過 `buildViewNode(target)` 為 Chat 與 Trajectory 分支。** 拒絕：兩種檢視需要不同的業務 State 與中間記錄，共用 Definition 會迫使每個 package 攜帶另一邊的條件與 payload。target 自有的 Definition 把這些選擇留在本地，同時複用 Assembler 的攝入與生命週期約定。

**最後一個 subscriber 離開時停用 target。** 拒絕：返回該 View 會反覆重建完整 snapshot。訂閱只確認首次使用；隨後 target 在 Session 剩餘生命週期中保持增量更新。

**在最終業務 Node 上再疊一層通用 layout model。** 拒絕：activity、tail candidacy 和 layout enum 會把目前 Chat 的業務語義重新集中到引擎。最終 Node 直接攜帶 renderer 所需 data，只共享 identity、排序和 Location 事實。

**只在 Assistant renderer 註冊 Turn data Hook。** 拒絕：存取目前 Node Location 是 `conversation.chat.node` slot 的公共能力，不屬於某個業務 renderer。父 Chat entry 註冊一次 common inject，所有 keyed renderer 共享同一強型別約定。

**把 running Assistant 或 Tool 保留在獨立 tail container。** 拒絕：結算時會跨 React parent 移動，穩定業務 key 也無法阻止 remount。統一 keyed order 允許 data 和排序位置改變，但不改變 Seat identity。

## 後果

新增業務節點可以區域性註冊自己的 matcher、State 轉換、可選 Location data、最終 target Node 和 renderer，無需修改 Session 的業務 switch。`ChatNodeDataMap` 和 Location data maps 允許業務 package 透過 declaration merging 合入強型別 data；所有相關 Event 仍須暴露可單 Event 推導的穩定 ID。

Host 業務 package 把自己的持久 Event 成員 declaration-merge 到 `@deepseek-ai/dsh-session/types`，Client Definition 則透過對應業務 package 的 `/types` 子路徑進行 type-only import。增強實際宣告介面而不是重匯出 barrel，使 Host 和 Client 的獨立 TypeScript Program 都能獲得相同的 Event narrowing，同時不把 Host runtime 帶入 Client 圖。

初始尾頁、older prepend 和 live append 共享一套 Context 不變數。缺 start、Reader window gap、Location unknown 以及 packed 高頻 delta 都是引擎明確表達的狀態，不需要業務另建方向相關 cache。

Append 不掃描歷史 Context；prepend 只 replay Match、Location 或 Reader 答案真正受影響的 Context。Chat 結構變化仍可能重算 visible order 和索引，但不會重跑無關業務 fold 或替換未變化 Node identity。

State update 與 publication cadence 分離後，Assistant 的每條 live delta 與每個歷史 packed run 都會被 fold，同時每三個 animation frame 最多 materialize 一次。Assistant view 讀取前置 Step Location 階段剛寫入的同一 projection。Turn Process 對持續 Assistant chunk 直接返回已有 open data 和 Node，不再重複派生或編碼；Turn Tail 到 `turn/end` 才執行完整 Match 掃描。Step/Turn close 與 final Event 會立即釋出最新 State。

inactive target 會保留 Definition State 和 target Context 索引，但不保留 builder、已物化 Node 或 snapshot。已掛載的內建或第三方 View 透過正常訂閱啟用自己的 target；已經開啟的 target 則繼續接收增量更新。

Step/Turn 是業務間共享聚合的穩定主機。Turn Tail 和 Deliverables 無需由 renderer 掃描全域 Nodes 即可派生值；Slot-level `useTurnData()` 把常見讀取限制到目前 Node 所屬 Turn，並透過 keyed Location source 隔離無關更新。

Inbox Context 的保留量隨 splice 數和已 claim 訊息數增長，不再隨其累計字首增長。該結構消除了重複 state 增長，但不會對持久 Session event 中的訊息正文去重，也不會限制已載入 event window。

代價是 Runtime 新增 Registry、Assembler、Location data、依賴重放和 per-target Builder 契約，UI Slots 也新增 parent-owned common inject 與 per-occurrence `hookContext`。消費 Assistant delta 的 Definition 還需要維護等價的 scalar 與 packed update 分支。Definition 作者必須理解穩定 ID、唯一 scalar start、正序 replay、Step→Turn 釋出順序、只讀 Reader 和 Node 不撤回規則。

`useTurnData()` 不撤銷 session-scoped renderer 的標準 `useSession`，因此該邊界依靠 API 引導和測試，而不是能力隔離。Registry 變化仍是低頻完整 rebuild；Chat Builder 繼續為 StatsPills 和頂層公共欄位維護 legacy slice，Trajectory 則在共享 Session 視窗上擁有 target 專屬 Definition 與 Builder。內建 Definition 分別留在所屬 UI package；這些相容邊界不把業務解釋權交還給 Session。
