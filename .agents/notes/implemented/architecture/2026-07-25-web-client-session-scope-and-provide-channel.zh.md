# Agent Note: Web client Agent-scope 對等模型與供數通道（agents/scope / blank 複用 / provide）

Status: implemented

[English](2026-07-25-web-client-session-scope-and-provide-channel.md) | 中文

> 範圍：client Agent scope（actx）與定向事件、client/host 實體化對等模型、空工作階段 blank 位與複用（`connectWorkspace`）、逐工作階段供數通道（`sessions.provide`），以及承載這些能力的 host wire 小件（summary `blank` 列、`host/session-added` 幀欄位、`host/commands-changed` 幀）。輸入狀態機與 slash 管線見[輸入狀態機 note](../../archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)；命令業務面見[命令業務面 note](../../archived/architecture/2026-07-25-web-command-surfaces-and-assembly.md)。

## 問題

web client 只有一張全域工作階段面：slot 全部從根上下文渲染，外掛拿不到「目前是哪個 agent/工作階段」的語境；draft 的權威副本埋在 Session 物件裡，任何要參與輸入的外掛都無處下手。要支撐命令/輸入體系，平臺層必須先回答：

- 工作階段互動態（選單、popup、草稿、在途請求）歸誰持有，雙工作階段如何結構性隔離；
- 「新工作階段」在 host 實體存在之前是什麼——client 是否必須為它憑空建立獨立生命週期；
- 工作階段 scope 元件如何「自己拿工作階段資料」，而不是層層下傳 props；
- 使用者放棄的新工作階段在 host 側留下什麼，由誰回收。

硬約束：host 是唯一真源；一切註冊走 `ctx.effect` disposer；scope 機制與 host 的 Agent scope 架構一致；模型可見 ⟺ 已入工作階段日誌。

## 決策

[Client Session 引用](2026-09-15-client-session-references.zh.md)現已定義引用所有的生命週期與 Provider 定位。本 Note 保留 blank Session 與收養語義的理由，並描述它們的目前實作。

### 對等模型：client 與 host 同一根狀態軸

host 側 `session.create(workspaceId)` 一體產出 Session + Agent + cwd（作為不可拆分的原子整體）；client 側就是這次出生的映像——工作階段行進入 list mirror 的瞬間，client 為它鑄 Agent scope（actx + provide + 輸入面全套掛上）：

- 工作階段身份自出生即為 host 真身：sessionId 由 `session.create` 回應 / `host/session-added` 幀帶來，client 側一切定址（scope tag、slot store 鍵、RPC 地址）用的都是同一個 id。
- 手動選定 Workspace 或完成[首次使用的啟動初始化](../feature/2026-09-20-default-workspace.zh.md) 後，cwd 已確定，client 再調 `session.create({workspaceId})`，拿到完整實體。
- 「New Session 且未選 workspace」是**純檢視態**（一個導航位置），不對應任何工作階段/scope 實體；選定之前 composer 整體鎖死（無 slash、無純文字）。
- 「空工作階段」是尚無輪次的普通實體化工作階段；對 host 上的 Agent-scope 外掛（goal/plan/skill（技能）/…）而言，它仍是普通 Session，因此 slash/plan 自然可用。

### Agent scope：actx 是 client 側 cordis 世界的唯一工作階段載體

執行時 `agents/scope.ts` 與 host `dsh-scope` 機制層一致（fiber + tag + filter 過濾；不 value-import：host 包攜帶 scoped-events 的 `Events` merge，進 client program 撞 Context merge）：

- `createScope(ctx, key)`：no-op 外掛 fiber + `extend({[kScope]: key, [Context.filter]: …})`——filter 直接住 actx：untagged listener 全局可收，tagged 只收本 scope。
- 派發就是 cordis 原語，thisArg = actx 本身：`actx.bail(actx, event, req)` / `actx.emit(actx, event, payload)`。
- `Session.bindScope(actx)`：resolve 鑄 scope 時單次配對（重複綁 throw；dropScope unbind），映像 host `Agent.loopCtx`——Session 用它自行派發 scoped 事件。actx→Session 反向走 `sessions.sessionOf(actx)` 一跳（映像 host 外掛 `agent.session` 用法）。

與 host dsh-scope 的有意分歧三條：

- filter 住 actx 自身而非獨立 carrier：host 包裝層護的是「業務 Agent subject 與 scope key 不漂移」（host 事件首參注入 Agent 本體），client 事件 payload 只帶 id、無 subject 可護。
- key 用品牌 `SessionId` 值比較而非物件身份：host 裡 agent.id === 工作階段 id（1:1 同軸），agent 身份直接複用 `SessionId` 品牌，client scope 的身份即 wire id。
- client 是 **Agent 身份** scope 而非活物件 scope：cold 工作階段期 host Agent 物件已 dispose（資源釋放）而 client actx 存活（視野內）——身份軸嚴格對等、物件冷熱有意不同步。

id→ctx 換乘只許三類位置（業務提供者永不換乘）：

- slot inject 工廠：ctx 不進渲染層，slot 框架交給元件的身份就是 sessionId，經服務 map 換回物件/controller。
- root 協調服務自定址：從投影的 sessionId 經 `sessions.scope(id)` 找回 actx。
- root untagged listener：按 payload 的 sessionId 查自有 store。

### scope 生命週期：掛靠顯式引用

Session 實例與 scope 同生命週期；catalog 只報告可發現性，不持有 generation：

- 出生 = 第一次顯式呼叫 `sessions.retain(target, options)`；它同步返回 reference，並在歷史就緒前鑄造 Session binding 與 scope。
- 最後一份 reference 釋放時，Controller 先撤下確切 generation，再拆除其 Session 實例、scope fiber（級聯掛在 actx 上的一切消費方）與工作階段鍵控 slot store。仍有 reference 時，catalog 移除不會結束 generation。
- 重開 = 後續 retain 惰性重建 generation，並透過 `reference.ready` 暴露歷史就緒結果（Host Session 日誌是持久真相）。
- 遺留 TODO：approval/question 幀不進 history，跨 prune 不可恢復（manager 級 pendingBuffers 只覆蓋「從未實例化」視窗）。

### blank 位：空工作階段的可見投影、轉正與複用

「實體化但無首條提示詞」的工作階段經 summary 派生位 `blank` 治理（派生列而非 header 欄位，SessionHeader 保持不可變）：

- Host 判據是沒有 `turn/start`：`sessionListMetadata.blank` 投影初始為 true，且只有該事件會清除它，因此 slash 命令、設定事件與建立檢查點即使已寫入磁碟也不會清除——blank 不代表未持久化。metadata 缺失時，live Session 退回到 `session.seq === 0`，cold Session 退回到 false；cold summary 其餘情況讀快取中繼資料，快取缺失時以未知狀態保留在列表中。複用按[空白 Session 取得](2026-09-17-process-local-blank-sessions.zh.md)規則取得寫鎖。
- wire 承載兩處：`SessionSummary.blank` 必填列；`host/session-added` 幀必填 `blank` 欄位（建立時恆 true，供別的 tab 按同一空工作階段狀態入映像）。
- 用戶端展示還受已觀察到的受理/執行影響，其保留期限由 [blank 退回修復決策](../bug-fix/2026-09-15-client-session-blank-reconciliation.zh.md) 擁有：
  - 傳送方本地：首次 `prompt()` 的**成功回應**把目前 `New Session` 行原地轉正，不新增列表行——受理是展示記憶，不證明輪次或使用者訊息已寫入持久歷史。首條提示詞被拒則工作階段保持 blank：與 host 權威對齊、繼續顯示為 `New Session`、在仍為該工作區成員時保持 connectWorkspace 複用資格。
  - 其他端：`host/session-status (running:true)` 幀轉正——blank 工作階段從不 running，首次 running 必然已非 blank；
  - 重連對齊：列表拉取更新 Host 摘要，Manager 則保留這些觀察；在此基礎上，`sessionListMetadata` 提示已有歷史也會阻止退回 blank，因此空歷史回應不能把已轉正的工作階段標回 blank。
- 列表紀律：store 保留全部行；Workspace browser 的分組、平鋪、搜尋和計數共用同一可見投影——所有非 blank 工作階段都顯示，blank 工作階段只顯示由 `mainView` 來源持有的一行，並強制標題為 `New Session`。切換 Workspace 後，舊 blank 實體仍在映像中但從列表隱藏，目標 Workspace 的主 blank 顯示；因此使用者可見面全域至多一條 blank 行。
- blank Session 可以透過建立檢查點與命令事件持久化，且沒有自動垃圾回收：瀏覽器重新整理、Host 重新啟動與工作區連線會在取得寫鎖後複用符合條件的空白工作階段並跳過被佔用的候選；但列表載入與多 tab 競態仍可能建立額外的 blank Session，其舊日誌保留在磁碟上。

### connectWorkspace：New Session 的唯一入口

`workspaces.connectWorkspace(workspaceId): Promise<SessionId>`（歸屬 WorkspaceRuntime——它同時持有 workspace 規範 path 與 sessions 引用）：

- 複用臂：list mirror 中找 `blank && cwd == workspace.path && sessionIds.includes(id)`——host 自己的成員規則，絕不只按 cwd。沒有帳戶槽位的 cwd 匹配（CLI（命令列介面）/TUI 在 host cwd 建立的工作階段，或已刪除/重建的註冊）會開啟一個任何分組表面都無法顯示在該工作區下的工作階段，因此落到新建臂（見[成員複用修復](../../archived/bug-fix/2026-08-05-workspace-blank-session-reuse-membership.md)）；命中後透過顯式 ID 的 `session.create` 收養，在返回前取得並持續持有寫鎖。僅寫鎖爭用會跳過候選。
- 新建臂：沒有可取得的候選時，`session.create({workspaceId})`，返回新 id。
- 未知 workspaceId fail loud（不靜默建立到別處）。
- 解析保證（兩臂同約定）：promise resolve 時返回的 id 已在 list store。檢視 owner 隨後同步 retain，因此 draft 搬運方可以在歷史就緒前透過該 binding 寫入文字，無需等待 notifier flush。
- 呼叫方拿 id 安裝一份 `mainView` reference；首條提示詞傳送就是普通 `session.prompt`——Session 本來就在，失敗即普通提示詞失敗，draft 文字還在 machine 裡，重試即再次傳送。
- 全域 New Session 按鈕預設取 `recentWorkspaceId`：先比較各 Workspace 內 Session 的最新 `updatedAt`，無 Session 時退回 Workspace `createdAt`，同值保持 Host 順序；只有完全沒有 Workspace 時才釋放主檢視 reference，進入無 Session 檢視。Workspace 分組內的建立動作仍顯式命中該 Workspace。
- 執行時啟動時訂閱首次完整基線：若已有恢復成功的 current 工作階段則保持不動，否則自動 `connectWorkspace(recentWorkspaceId)` 並 open 返回的 blank 工作階段。該策略只結算一次；之後使用者主動 clear 不會再次被自動選擇覆蓋，連線失敗則等下一次基線投影重試。
- blank Hero 中改選 Workspace 也走 `connectWorkspace`；若目標 id 與主檢視 id 不同，`ui-workspace` 先 retain 目標，透過 preparation callback 搬運目前 input machine 的非空 draft，再發布新的主 reference。舊 blank 實體不刪除，只因其 `mainView` reference 被釋放而從列表隱藏。

### 逐工作階段供數：`uiSession.provide` 標準件通道

Session slot 元件「自己拿 Session 資料」的唯一供數路徑。外掛以靜態描述符 `uiSession.provide({hooks, props, resolve})` 宣告固定鍵表（重名 key 註冊時 throw），`resolve(binding)` 在確定 binding 下物化值並隨其 scope 拆；ui-renderer `standardKit` 統一迴圈把 hooks 格綁成 `use<Name>` 選擇器掛鉤（`observableHook`→uSES，防 tearing）、props 格原樣直接傳遞。

slot scope 是閉集 `root | session-maybe | session`：

- `root` 只拿全域標準件，不接收工作階段身份或供數。
- `session-maybe` 以**收養（adoption）身份語義**繼承最近 `SessionProvider` 的 binding：空態出生的化身在該 Provider 第一次收到 binding 時保持 React 實例，此後 Provider 切換 generation 或回到空態時重掛。Provider 切換 generation 時，元件本地的逐 Session 狀態會清零。切換過程中，只有持久化 Store 值能活過 generation 退休；只有另一份 reference 保活該 generation 時，binding 自有 source 才能保留。無 binding 時，`sessionId`、`useSession`/`useInput` 的結果與 `inputActions` 均可預設。Provider roster 變化會重新物化已掛載 binding，但不改變其 identity；逐 entry 的收養記帳住在 renderer 的 `SessionMaybeEntry`。
- `session` 保證 `sessionId`、所有掛鉤 source 與 props 均存在；每個嚴格 entry 的錯誤邊界以 `sessionId` 為 key，切換工作階段會重建該 entry 及其工作階段 store。

`conversation` 是其 owner `SessionProvider` 下的 `session-maybe` 常駐外殼：`ConversationRoot`、HeroShell、Workspace picker、scrollport 與 composer stack，以及 overlay chain 的 fallback 外框，在無 Session → blank Session 的切換中保持 React 實例。兩個嚴格 session entry 只填入固定區域，不改變該樹的父級：`conversation.session.header` 在 scrollport 上方承載 breadcrumb／tab／action，`conversation.session` 在其內部承載 view ring 與 draft mirror；二者共享同一個 Session scope chat store。composer bar（`conversation.composer.bar`）本身即為 `session-maybe`：無 Session 時，其 machine faces 和訊息動作保持惰性，整張虛線卡片可經指標開啟現有 Workspace picker，只讀 textarea 也可透過 Enter 或 Space 開啟。binding 出現後同一實例（含 textarea）轉為 live；其餘輸入 slot 保持嚴格 `session`，在此之前不派發任何內容。blank → engaging/active 的 InputBar 不因 phase 翻轉而重建。

blank Session 保留 header 的 leading 與 corner slot，讓右側欄展開入口等導航控制元件在首條訊息之前即可使用。標題、actions、utilities 和 View tabs 在 blank phase 中繼續隱藏。header 仍要求已選中的 Session；Files 與 Terminal 入口使用該 Session 的工作區和執行服務，無需已有 Turn 記錄。

- 執行時內建第一條：`'session'` 掛鉤——`useSession` 本身走同一機制，無特判。
- Concurrent 紀律：渲染平面只從 hooks 格讀（uSES 一致性保證）；props 格回呼只在事件 handler 空間用；描述符解析 render-safe（冪等快取、廢棄渲染殘留由 prune 收屍）。
- 第三方元件值零依賴，型別一行 type-only import（declaration merging 進 `SessionStandardProps` / `SessionMaybeStandardProps`）。

### 輸入投遞

- 佇列語義：running 不鎖輸入；普通訊息經 `session.prompt {mode:'queue'}` 排隊，命令永不排隊。

### host wire 小件

- summary `blank` 列與 `host/session-added` 幀 `blank` 欄位（見上文 blank 位）。
- SSE（Server-Sent Events）幀 `host/commands-changed`（純失效訊號）；client 路由為型別事件 `commands/changed` 與 `connection/reset`（連線代建立後廣播，wire 派生快取一律視舊態為陳舊）。 該 commands 幀及其型別化 client 事件後來被「`commands/change` 經 `ctx.remote.$on` 原樣轉發」取代（[轉發的 Remote 事件](2026-08-10-remote-event-delivery.zh.md)）；`connection/reset` 不變；本條陳述的「失效而非差分」契約依然成立。
- `command.list/execute`、`skills/list` 一律 `sessionId` 單址（工作階段恆有 Agent，`agentFor` 的恢復語義現成）；命令面敘述見[命令業務面 note](../../archived/architecture/2026-07-25-web-command-surfaces-and-assembly.md)。
- `session.create` 請求形狀：workspaceId/cwd 二選一 + 可選呼叫方預分配 sessionId（同 id 同 cwd 重試冪等，異 cwd 報 `session-conflict`）。

## 考慮過的替代方案

| 棄案 | 一行理由 |
|---|---|
| client-local Intent + materialize（published CAS / pendingPrompt attach 事務 / before-create 鏈） | client 被迫模擬 host 缺失的前半段生命，養出 published CAS、attach 事務、部分發布一坨狀態機 |
| host 預留 ID（draft Map） | host 只認了個號，狀態機原封留在 client |
| host draft Session（有 Session 無 Agent） | 每個查 Agent 的 host 面都要為 draft 分叉；core 要新增 `attachAgent` API + header cwd 後寫 |
| 無 cwd 先綁 Agent（ungrouped） | header.cwd readonly「created in」不變性被推翻 + launch-dir 副作用產品坑 |
| React Context 層層傳工作階段語境 | 外掛在 host/client 兩側應是一個心智模型；scope 機制與 host dsh-scope 同構 |
| `scopeTarget` carrier + 融合派發器（映像 host `agentEvents`） | host 包裝層護的是「業務 Agent subject 與 scope key 不漂移」，client 事件無 subject 可護；filter 住 actx + cordis 原語覆蓋全部需求 |
| Session 不持 ctx（物件層 cordis-free） | 只為篩選單測不引 cordis 而生的紅線，代價是 contribute 兩跳回呼 + 可變公有欄位；host Agent 本就持 loopCtx |
| Session 實例常駐（resident-instance） | host 工作階段日誌即持久真相；常駐僅為身份便利，與 scope 生命週期錯位是複雜度之源 |
| 元件收 wiring 回呼包（inject→props 兩層下傳） | 標準件通道讓元件自取；公共 API 收斂為 hooks + 穩定 props |
| Hero 無工作階段檢視與工作階段 Conversation 整支互換 | 即使外層 layout 不變，Hero、picker 與 composer 子樹仍會一起重建，介面產生整塊抖動 |
| 讓 InputBar 自身變成 `session-maybe` | 輸入狀態機、鍵盤命令面與動作都被迫接受預設值；只替換 disabled 輸入體能把可選性留在外殼邊界 |
| 專用「轉正」幀 | 既有受理和執行訊號已經提供展示規則所需的觀察；該規則不需要新增幀 |

## 後果

- 外掛獲得與 host 同構的工作階段上下文：逐工作階段狀態掛 actx、隨 scope fiber 一次拆裝，洩漏結構性不可能；雙工作階段隔離由 scope filter 結構性保證。
- client 物件層收斂為 wire 映像：工作階段身份、生命週期、能力判別全部以 host 實體為準——輸入體系（下一層）面對的永遠是「有真 Agent 的工作階段」，slash/skill 等提供者一律以 sessionId 直接定址。
- 空工作階段治理零專用機制：狀態靠一個派生位，可見性靠統一列表投影（僅 current blank 以 `New Session` 展示），複用時取得持久化寫鎖，常規上限靠同 Workspace 複用。轉正所依賴的受理/執行展示記憶僅保留在用戶端。

- 代價：id→ctx 換乘紀律、provide 的 Concurrent 紀律都是約定而非型別強制，靠 review 與測試釘住。單一狀態軸仍會在 Session 存在前隱藏 machine face；這段時間內，[常駐工作階段殼](../../../../packages/client/ui-conversation/README.zh.md)會把啟用操作轉到 Workspace picker。
- 已知欠帳：approval/question 跨 prune 恢復（TODO）；模型選擇以 live-mutation 形狀迴歸（host `selectModel` 三件套現成，其 client 消費方尚未建置）。
