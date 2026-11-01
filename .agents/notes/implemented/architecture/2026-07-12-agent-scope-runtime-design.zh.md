# Agent Note: Agent 作用域執行時設計與正確性

Status: implemented

[English](2026-07-12-agent-scope-runtime-design.md) | 中文

## 問題

[agent（智慧代理）作用域約定](2026-07-08-agent-scope-contexts.zh.md)對貢獻者而言很簡單：透過 `agent.ctx` 註冊，解析出一個全域加單 agent 的檢視，僅在 setup 完成後釋出，並保持作用域直到工作停止。執行時必須在協作式外掛框架、非同步建立、可重入監聽器、持久化工作階段提交以及 worker 或程序故障等情境下維護這份約定。

主要的設計風險是為每個競態條件引入第二套機制。獨立的預留、就緒哨兵、取消中繼、快照層和保護註冊表可能映像同一個事實，直到沒有讀者能分辨哪個才是權威的。這些機制還會誘使執行時把可信的型別化呼叫當作敵對的序列化邊界來處理。

實作需要足夠的狀態來維護真實的所有權和結算邊界，但不能更多。正確性審查者必須能夠從接受、釋出到拆除，沿著一條事實鏈跟蹤下去，而無需在並行的表示之間做調和。

## 決策

執行時對每個獨立事實使用一種機制。作用域路由有一個不透明載體與共享 layer store；每個活躍的註冊表物件有一條註冊表條目；每個建立或恢復操作有一個事務；型別化的同程序呼叫借用 readonly 值；真實資料邊界只物化一次；協作式提示片語裝的結果即為權威；worker/程序程式碼僅在不同所有者確實可能競爭時才保留獨立的終止態和完全停穩態。

該設計可概括為七項選擇：

| 問題 | 權威機制 |
|---|---|
| 選擇全域加某個 agent 的註冊 | 不透明作用域鍵、路由載體與共享 layer store |
| 擁有一個活躍的 agent 或工作階段 | 由其 disposer 捕捉的單條註冊表條目 |
| 協調建立/恢復 | 單個 `AgentCreationTransaction` |
| 保護持久化、佇列、模型或協定格式資料 | 在該邊界處一次性物化 |
| 在同一程序內傳遞型別化值 | Readonly 借用約定 |
| 組合模型可見的提示詞與工具集 | 單個共享工具檢視加權威的 assembly-waterfall（瀑布式事件）結果 |
| 協調 subagent、worker 和程序關閉 | 單個取消訊號加該邊界獨立的終止態/完全停穩態事實 |

本 Agent Note 餘下部分按依賴順序展開這些選擇：Cordis 機制、作用域路由、建立與工作階段提交、工具與提示詞、subagent 與工作流，最後是可執行檢查。

[7 月 8 日 Agent Note](2026-07-08-agent-scope-contexts.zh.md) 仍然是貢獻者約定。獨立的 [subagent 組合控制 Agent Note](../feature/2026-07-12-subagent-persona-tool-filter-and-depth.zh.md) 擁有 `persona`、`toolFilter` 和 `maxDepth`；本文僅討論它們的 setup 如何融入生命週期。

## Cordis 模型：上下文、fiber、effect、receiver 與 waterfall

理解實作需要五個 Cordis 概念。上下文選擇服務和註冊所有權；fiber 是一個活躍的外掛或子生命週期；effect 將清理邏輯附加到 fiber；事件接收器選擇監聽器；waterfall 讓監聽器按順序變換或短路一個操作。

### 上下文是貫穿單個服務圖的所有權路徑

所有 agent 共享一個 Cordis 服務圖。派生的上下文不會克隆 `ToolRuntime`、`SystemPrompt`、持久化或模型介面卡；它改變的是：透過該上下文進行的註冊如何被標記，以及哪些 effect 擁有其清理邏輯。

`agent.ctx` 就是這樣一個派生上下文。服務呼叫仍然到達共享實例，而註冊操作可以檢查其呼叫上下文並將貢獻儲存在最近的作用域鍵下。普通的外掛上下文不攜帶作用域鍵，因此註冊到全域。

Agent 上下文就是 `createScope` 返回的上下文，不攜帶第二份指回 Agent 的關聯。需要主體的 API 顯式傳遞 Agent，因此註冊所有權與路由只依賴一種正式的作用域機制。

### Fiber 與 effect 使清理成為結構性的

Cordis fiber 是外掛或子上下文被啟用時建立的活躍實例。其狀態記錄該生命週期是 active、unloading、failed 還是 disposed。`ctx.effect()` 和 `ctx.on()` 返回 disposer，同時將這些 disposer 附加到註冊所在的 fiber，因此解除安裝一個外掛或 agent 作用域會移除透過該上下文註冊的一切，無需單獨的清單。

vendor 中的 Cordis fiber 實作在任意 setup 或 `internal/plugin` 觀察者執行之前就建立了所有權。可重入的解除安裝可以看到已啟動的子 fiber 或 effect，拒絕解除安裝開始後新增的 effect，並透過一個公開的一次性 disposer 加入已啟動的清理。拆除觀察者被逐個隔離，因此一個回呼無法阻止結構性清理。

這些是框架生命週期保證，而非 agent 特有的策略。Agent 建立依賴它們，因為 setup 可以啟用任意外掛並同步重入所有者的 dispose（資源釋放）。

### Receiver 路由監聽器；waterfall 組合決策

Cordis 使用 dispatch receiver（`this`）過濾監聽器，而 harness 的監聽器需要一個顯式的 agent、execution、request 或其他主體。`Scoped<T>` 標記作用域事件宣告所期望的 receiver，但執行時載體刻意不暴露主體 API。

因此，產品輔助函式建構載體並單獨傳遞領域主體。這防止監聽器路由變成另一套物件模型，並使事件簽名在不瞭解載體內部的情況下也可理解。

Cordis waterfall 是中介軟體風格的 dispatch。每個監聽器接收 `next()`：呼叫它則委託給剩餘監聽器和基礎操作，不呼叫則短路或替換下游結果。Waterfall 驅動提示片語裝和工具策略；普通 emit 事件同步通知，parallel 事件等待所有監聽器但沒有否決結果。

<a id="scope-routing-one-opaque-key-selects-one-layer"></a>

## 作用域路由：一個不透明鍵選擇一層

scope 包實作了 Cordis 路由所需的最小物件。其載體僅持有一個組合的服務過濾器和作用域謂詞，而包私有地記錄不透明鍵，並單獨暴露會等待作用域 fiber 完全停穩的 disposer。

### 作用域標識使用物件標識

`ScopeKey` 是一個按標識比較的不透明物件。harness 使用活躍的 `Agent` 作為自身的鍵，但該原語與領域無關，支援其他作用域所有者。

`createScope(parent, key)` 返回一個作用域，其 `ctx` 共享父級的服務，其 effect 被標記為該鍵。`scopeOf(ctx)` 讀取最近的註冊鍵。`scopeTarget(base, key)` 建立事件接收器，其過濾器保留 base receiver 的 Cordis 服務過濾器，然後接納無作用域的監聽器和具有該確切鍵的監聽器。

Receiver 是一個小型載體而非領域物件的透明代理。需要 agent 的程式碼接收顯式的 setup 參數或事件參數；需要註冊所有權的程式碼接收 `agent.ctx`。

### 註冊表讀取疊加一個精確 layer

作用域感知的註冊表使用 `ScopedLayers`，擁有一個即時建立的全域 aggregate 和按標識鍵惰性建立的 aggregate。讀取解析全域 layer 和至多一個精確區域性 layer；它不建立狀態，也從不遍歷父級鏈。註冊可見性與 Cordis effect 所有權都從同一個上下文派生，而回收會等待具體 layer 的完整 aggregate 變空（見[決策](../../archived/architecture/2026-07-12-scoped-layers-store.md)）。

每個服務保留其領域規則。命名 command 和提示詞檢視使用共享的、保持插入順序的 shadow 合併；工具保留更豐富的 resolver，因為限制會在加入區域性工具前過濾全域工具，保留的 PTC mode transport 則單獨插入。提示詞變數和工具 guard 保持即時迭代，而工具提供者成員關係按每次 assembly 物化。Scope 提供儲存生命週期和命名遮蔽，而非通用的註冊表檢視。

### 融合 dispatch 輔助函式防止主體漂移

`agentEvents(context, agent)` 建構 agent 的載體並注入同一個 agent 作為事件主體。工作階段、工具、approval、提示詞和 subagent 服務同樣從它們已擁有的物件派生路由，而非接受一個無關的鍵。

型別標記拒絕普通的裸 receiver 誤用，開發環境不變式覆蓋直接 JavaScript 或強制轉換的 dispatch。主體保持顯式，因為路由正確性和有用的事件資料是不同的關注點。

## Agent 建立：一個事務擁有完整操作

建立和恢復是一個具有多個階段的非同步生命週期，而非多個生命週期。`AgentCreationTransaction` 擁有呼叫方和工廠的活躍性、可選取消、私有資源、釋出、復原，以及每個所有者觀察到的記憶化拆除。

### 註冊表條目是唯一的活躍標識記錄

AgentRegistry 和 SessionStore 各為每個活躍物件保留一條註冊表條目。註冊表條目持有穩定 ID、物件、作用域載體，以及屬於該物件的少量釋出或追加狀態。

detach 閉包捕捉其確切註冊表條目。它僅在對映仍指向該註冊表條目時才刪除，因此舊的 disposer 無法刪除一個複用相同 ID 的後續物件。註冊表不會重讀可變的呼叫方物件來決定標識。

沒有預留 API。呼叫方提供的 ID 在最終寫入註冊表時被接納。並行的同 ID 操作可能都完成私有 setup；恰好一個最終 `enter()` 成功，每個失敗者復原其私有資源。前一個 disposer 達到完全停穩態後，順序複用即為有效。

### 事務在等待之前就擁有準備工作

事務在持久化載入或 setup 可能掛起之前，就被安裝到呼叫方的 Cordis 上下文和具體的 AgentLoop 工廠下。它還在公開操作結算之前觀察可選的建立/恢復訊號。

建立準備一個新 Session。恢復載入並驗證持久化的 Session，然後準備相同的活躍工作階段標識。兩條路徑隨後建置作用域、agent 和 driver，並呼叫相同的 setup/釋出演算法。

工廠儲存具體的 trace 目標，但透過呼叫方繫結的 Cordis trace 呼叫它們。執行時子 Agent 的建立方在 create 或 resume options 中設定 `parentAgent`，AgentRegistry 轉交這些 options，不從呼叫方 Context 推導父級。這既保留了依賴來源和兩種所有權事實，又不堆疊 trace 代理，也不把領域物件附著到 Context。作用域 Remote 事件介面卡同樣從 request 接收 Agent，驗證它就是 carrier key，再直接投影其 Context 與 wire identity。系統不會透過作用域索引從 Context 重建 Agent。[顯式執行時身份決策](2026-08-31-explicit-agent-runtime-identity.zh.md)擁有這項分離原則及由此確定的可續跑子級歸屬規則。

### Setup 是私有世界內的可信組合

Setup 接收完整的子上下文和確切的未釋出 Agent，可以等待外掛啟用。它可以註冊工具、提示詞段、限制、監聽器和其他 effect；需要子 Session 的消費者從 Agent 參數讀取它。公開約定不支援透過強制轉換或內部註冊表呼叫來驅動或釋出正在建立中的 agent。

事務將非同步載入和 setup 與停用進行競爭，而非無限等待外部程式碼擁有的 promise。如果取消或所有者解除安裝獲勝，即使外部 promise 永不結算，公開建立也會在事務擁有的清理之後拒絕。

### 釋出有一條有序的提交路徑

釋出按觀察者所需的順序接納和宣告資源：

1. 將工作階段寫入註冊表。
2. 將 agent 寫入註冊表。
3. 宣告 `session/created`。
4. 等待序列 `agent/created` 監聽器。
5. 向驅動器釋放已排隊輸入。

Agent 在兩個註冊表與建立監聽器都完成前絕不驅動。監聽器可以拒絕或 dispose 一個所有者；事務保留作用域與工作階段，等待分發結算後再繼續拆除。每個已開始的建立宣告在復原期間都有匹配的銷燬宣告。[可等待建立決策](2026-09-09-awaited-agent-creation.zh.md)擁有非同步初始化器時序。

建立監聽器可以在釋出仍擁有兩個註冊表條目時請求 dispose。Teardown 會立即停用，並等待所呼叫的非同步分發完成後才停止和分離資源。

```mermaid
sequenceDiagram
  participant Tx as AgentCreationTransaction
  participant Registries
  participant Listener as Creation listener
  participant Driver

  Tx->>Tx: mark publication in progress
  Tx->>Registries: announce agent/created
  Registries->>Listener: await listener
  Listener->>Tx: dispose reentrantly
  Tx->>Tx: deactivate, teardown waits for publication
  Tx-->>Listener: disposal request accepted
  Listener-->>Registries: settle
  Registries-->>Tx: dispatch settled
  Tx->>Tx: resolve publication settlement
  Tx->>Driver: stop and drain
  Tx->>Registries: detach agent, then session
  Tx->>Tx: dispose scope and resolve teardown
```

### 拆除在撤銷註冊之前保留工作

每個拆除請求加入一條記憶化路徑。順序為：

1. 停用建立或驅動，並等待建立分發。
2. 停止並排空 driver，丟棄仍處於待處理狀態的注入。
3. 分離 agent。
4. 分離工作階段。
5. dispose agent 作用域。
6. 退役事務所有權追蹤。

此順序讓最終的 agent 和工作階段事件能使用匹配的作用域監聽器，並使持久化觀察者在最終重新整理完成前保持附加。作用域 dispose 放在最後，因為註冊撤銷是外部可見的生命期邊界。

<a id="session-append-materialize-validate-commit-notify"></a>

## 工作階段追加：物化、驗證、提交、通知

工作階段事件跨越持久化邊界，因此追加操作擁有其資料。演算法的其餘部分使用一條已附加的註冊表條目和一個提交點。

### 持久化資料一次性物化

Session 頭部、種子和追加的事件是無損 JSON 資料。Session 建構函式或追加路徑在儲存前物化並驗證它們，並暴露凍結的快照，因此後續呼叫方的修改無法改變持久化、回放或模型重建。

這是一個真實的所有權邊界：值離開呼叫方，可能被持久化，且必須在之後重建相同的請求。這比型別化的同程序回呼或註冊表定義有意更嚴格。

### 提交前監聽器可以否決；提交後觀察者不能

追加遵循一個序列：

1. 物化持久化事件和表層意圖。
2. 取得 SessionEntry 的獨佔所有權，並拒絕該註冊表條目上的重入追加。
3. 解析作用域回呼並執行內部不變式驗證。
4. 恰好推送一次；這是提交點。
5. 逐個通知每個觀察者，隔離同步和非同步失敗。
6. 釋放追加狀態並兌現釋出期間請求的 detach。

沒有觀察者錯誤能讓已提交的事件看起來未提交，一個壞的監聽器也無法餓死後續監聽器。Session 不變式在提交前暫存其轉換，僅當同一事件到達被隔離的提交後觀察者時才應用。

`flush()` 啟動每個持久化監聽器並等待所有結果後再報告失敗。這種有意的 all-settled 行為防止同步失敗餓死另一個後端或最終重新整理。

## 信任邊界：僅在所有權真正變更時複製

執行時區分型別化的程序內約定與序列化及持久化邊界。這是值和回呼的主要簡化規則。

| 邊界 | 所有權規則 |
|---|---|
| 同程序內的型別化服務/外掛呼叫 | 借用 readonly 值和回呼 |
| 解析的外掛設定或外部檔案 | 驗證語義和結構輸入 |
| 佇列中的收件箱訊息 | 在非同步消費前物化 |
| 模型/工具 JSON 輸入或輸出 | 在模型/工具邊界處物化 |
| 持久化工作階段或持久化資料 | 在提交前物化並驗證 |
| Worker、程序或協定格式訊息 | 序列化、驗證並擁有解碼後的值 |

測試中建構惡意 getter、在交接後替換型別化回呼、或強制轉換偽造服務物件的做法本身不定義生產約定。執行時在資料跨越解析器、佇列、模型、持久化、檔案、worker、程序或協定格式（wire format）邊界時保留檢查，並在可信程序內依賴 readonly 型別加外掛紀律。

回呼隔離與資料所有權是分開的。監聽器是任意擴充功能程式碼，即使其參數是可信的也可能丟擲異常；釋出和提交後路徑仍按其事件約定隔離失敗。

## 工具與提示詞：單一檢視、權威組裝、已提交的結果

工具展示和執行共享一個私有解析器。提示片語裝仍然是可信的協作式組合：註冊表提供有序輸入，assembly waterfall 的回傳值就是 agent loop（智慧代理迴圈）記錄和傳送的內容。執行僅在策略或結果結算必須單調時才使用獨立的單向邊界。

### 一個解析器定義工具檢視

私有解析器應用目前展示模式、活躍的全侷限制、精確的區域性疊加和區域性遮蔽。Schema、查詢、執行、PTC mode SDK 生成和限制驗證都使用該解析器或其限制前的全域名稱檢視。

[subagent 組合控制 Agent Note](../feature/2026-07-12-subagent-persona-tool-filter-and-depth.zh.md#tool-filtering-is-one-live-global-view-rule) 擁有使用者可見的 allow/deny 語義。實作要求是一致性：被過濾掉的全域工具不能透過另一條查詢路徑仍可執行，區域性遮蔽的定義就是被展示和執行的同一個定義。

`ToolRestriction` 接受 readonly 的 allow/deny 名稱並將其編譯為內部集合。多個限制取交集。公開的 `visible()` 和 `knownNames()` 方法是不必要的，因為只有註冊表需要中間檢視。

### 工具執行擁有標識和邊界物化

註冊表為每次執行分配一個新的帶品牌的 `Symbol` token。巢狀的 PTC mode 呼叫將外層 token 作為 `parent` 攜帶，因此結構化輸出可以透過標識將內層捕捉與其外層 `run_code` 結果關聯。

註冊表分配的新 Symbol 提供無碰撞的執行標識，無需 WeakSet 成員註冊表。呼叫方無法透過 `ToolExecutionInput` 提供執行自身的 token；它們僅在註冊表建立後接收流水線擁有的 `ToolExecution`。這是一個可信的型別化約定，而非針對任意強制轉換或 JavaScript 呼叫方的執行時防禦。

參數在模型/工具 JSON 進入流水線時一次性物化。Pre-、around- 和 post-execute 監聽器操作型別化的 execution 和決策。Call ID 關聯、審批、單調守衛和 PTC mode 巢狀仍然是顯式的關係檢查。

在 post-execute 或外層流水線完成規範化後，註冊表先為候選結果建立無損快照，並將快照失敗轉為普通錯誤；隨後呼叫在本次呼叫建立時已快照的可選 `ToolDefinition.finalizeContent` 回呼，最後一次性物化並凍結被接受的最終結果。該回呼只能替換內容，因此即使工具強制最後一道結果上限，結構化錯誤標識、上下文與中繼資料仍由註冊表擁有。每個同步的 `tools/result` 觀察者接收該確切的已提交物件，觀察者失敗被逐個隔離。外層流水線失敗或候選快照失敗會在最終內容處理之前被規範化，因此觀察者可以丟棄針對同一權威邊界的暫存工作。

### Assembly waterfall 擁有最終的模型可見組合

SystemPrompt 首先將全域加 agent 的段、變數和工具提供者解析為確定性的註冊表貢獻。作用域過濾的 `system-prompt/assemble` waterfall 隨後可以重排、替換、新增或移除任何段、變數或 schema。其返回的組裝結果即為權威；沒有後續的恢復步驟，普通提示詞段、工具定義或提供者結果上也沒有終態中繼資料。

這是一個可信的同程序擴充功能點，而非權限邊界。修改 PTC mode 的 `run_code` schema 或 `tools:sdk` 指令，或結構化子級的捕捉 schema 或指令的監聽器，有責任在其返回的組裝中保持協定的一致性。ToolRuntime 仍然保留 `run_code` 不受普通工具註冊和限制影響，因為那些是註冊表不變式，但 assembly 中介軟體仍然可以自由變換最終的模型可見表面。

Scope 直接解決了真正的隔離問題。結構化輸出貢獻註冊在子級的精確作用域中，而 PTC mode 從同一個已解析的工具檢視派生其傳輸和 SDK。第二套命名保護系統需要另一套所有權和碰撞規則來覆蓋任意 schema 提供者（包括有意貢獻重複名稱的提供者），卻不建立新的信任邊界。

<a id="structured-output-commits-only-authoritative-outcomes"></a>

### 結構化輸出僅提交權威結果

結構化輸出將子作用域組合與兩階段執行提交相結合。子級在釋出前註冊其 `structured_output` 工具和指令；可信的 assembly 監聽器可以變換這些普通貢獻，並有責任在期望子級完成時保持協定。工具體驗證候選值並按目前 `ToolExecution` 暫存，但成功捕捉僅由不可變的 `tools/result` 觀察決定。

對於原生呼叫，觀察者僅在該確切執行的最終結果成功時才刪除暫存並提交其值。因此 post-execute 阻止或外層流水線失敗不會留下已捕捉的值。

對於 PTC mode SDK 呼叫，內層成功結果記錄 `{ parentToken, value }` 而非提交。觀察者等待 token 匹配 `parentToken` 的 `run_code` 執行，僅在該外層最終結果也成功時才提交。程式失敗、執行時中止或外層 post-policy 拒絕會丟棄待定值。

一旦值處於待定或已提交狀態，作用域單調守衛拒絕後續工具呼叫。成功的結構化輸出執行會呼叫 `exec.concludeTurn()`，因此其自身不可變結果攜帶 `concludesTurn: true`，迴圈在該步驟結束工具迴圈。Schema 驗證失敗仍然是普通的 `INVALID_ARGS` 工具錯誤，子級可以在同一輪次內重試。

純 PTC mode 的註冊表貢獻從原生 wire schema 中省略 `structured_output`，並透過生成的 SDK 暴露它。Assembly waterfall 可以有意改變該展示；執行仍然針對子作用域定義進行驗證，監聽器擁有其建立的任何替代模型可見路由的一致性。

<a id="three-execution-boundaries-are-deliberately-one-way"></a>

### 三個執行邊界有意設為單向

提示片語裝有意是協作式的，但三個執行事實在其可擴充功能階段之後需要單向結算：

| 邊界 | 最終權力 | 為何普通監聽器順序不夠 |
|---|---|---|
| 工具 pre-policy | 單調拒絕 | 後續監聽器不得重新允許已被拒絕的呼叫 |
| 工具結果 | 觀察不可變的已提交結果 | 結構化輸出必須僅提交實際逃出流水線的結果 |
| 輪次 continuation | 透過已提交工具結果終止 | 已提交的終端輸出必須結束輪次 |

`ToolGuard` 是單調策略註冊表。已提交的工具觀察是上述被隔離的 `tools/result` 點。終端結構化輸出在自身執行上標記 `concludesTurn`，因此終止性成為權威結果上的資料，而不是獨立 hook 決策。

### skill（技能）和 approval 服務信任型別化呼叫方

Skill 註冊表定義和 approval 策略是 readonly 的同程序約定。它們的服務不克隆回呼物件，也不防禦交接後的回呼替換。

Skill 仍然驗證外部 skill 檔案和解析的提供者輸出，透過呼叫 agent 的工具檢視路由目錄，並精確 dispose 註冊。Approval 仍然解析策略、觀察取消、按 `request.agent` 路由 `approval/request`、記錄持久化審計對，並隔離應答者和提交後觀察者的失敗。

## subagent：釋出即 start promise

subagent 啟動有一次所有權轉移。提供者擁有未釋出資源，直到其 start promise 以一個已釋出 run 兌現；呼叫方擁有返回的 run 並必須 dispose 它。

### 服務約定有一個取消通道

`SubagentProvider.start()` 和 `SubagentRuntime.start()` 返回 `Promise<SubagentRun>`。Promise 會在後端跨過釋出邊界後兌現，因此呼叫方和 `subagent/start` 觀察者從不需要第二個 `run.started` promise。提供者工作如果在釋出前失敗，`start()` 就會被拒絕；釋出後的提示詞、輪次、取消與基礎設施結果會透過 `SubagentRun.result` 結算，且不會隱藏 child id，這也是[持久化目錄決策](../../archived/feature/2026-07-22-durable-subagent-catalog-and-list-agents.md)所要求的約定。

`SubagentStartRequest.signal` 是必需的。中止它會在啟動期間，以及已釋出 run 的剩餘就緒或輪次工作中請求取消。`SubagentRun.dispose()` 也請求取消並等待完全停穩。沒有單獨的公開 `run.cancel()` 通道。

可繼續對話使用各自獨立的建立和後續操作，並且沒有 `SubagentRun`；其管理器擁有每個駐留中的 `AgentHandle`。

服務在呼叫提供者之前驗證提供者能力和請求語義。提供者 rejection 在逃出之前清理未釋出資源，且不發射 `subagent/start`/`subagent/end` 對。兌現之後，服務附加結果觀察、發射作用域 start 並返回 run；釋出後的結果 rejection 會結束該事件對。提供者移除會阻止後續 start，但不撤銷提供者已接受的 run。

### 程序內提供者複用核心事務

spawn 和 fork 共享一個程序內 driver。它透過 `parent.ctx` 建立子級，將必需的 signal 傳入核心建立事務，並在未釋出的 setup 期間安裝 persona、工具限制和結構化輸出貢獻。

提供者等待建立並僅返回已釋出的 run。在交接時，核心建立分離其僅用於建立的 abort 監聽器；提供者在安裝活躍 run 監聽器之前立即重新檢查 signal，因此在那個窄視窗中的 abort 會 dispose 新控制代碼而非逃脫取消。父級拆除會一併拆除子級，因為操作屬於 `parent.ctx`；提供者解除安裝阻止新 start 但不成為已接受 run 的第二個撤銷所有者。Run disposer 取消子級並等待 AgentHandle 的有序拆除。

spawn 使用空工作階段種子。fork 使用經驗證的已完成輪次字首。對話種子僅改變歷史，不匯入作用域、工具、服務或權限。

### ACP（Agent Client Protocol）提供者擁有程序直到就緒或清理

ACP 提供者跨越真實的程序和協定格式邊界，因此它保留驗證、環境清洗、訊息序列化、abort/程序競爭，以及從 kill 到程序退出並完全停穩的過程。

Start 僅在 `initialize` 和 `newSession` 成功後才 resolve。Abort、spawn 失敗、RPC 失敗或無效啟動回應在拒絕前回收程序。就緒後，result 對映 ACP 提示詞結果和流式輸出；dispose 請求取消、關閉連線並透過一條記憶化路徑等待程序退出。

## 工作流與 ACP 程序：僅保留獨立的非同步事實

Worker 和子程序橋接比同程序註冊表需要更多狀態，因為訊息、程序死亡和清理可以獨立結算。它們的狀態圍繞這些真實事實組織，而非重複的取消協定。

<a id="workflow-children-are-pending-starts-or-published-records"></a>

### 工作流子級是待定 start 或已釋出記錄

工作流主機保持待定的提供者 start promise 和已釋出的子級記錄。子級僅在非同步 `SubagentRuntime.start()` 兌現時才從待定變為已釋出；被拒絕的 start 清理其部分提供者工作且不產生子級生命週期對。

一個主機擁有的 AbortController 向待定和活躍子級提供必需的 signal。關閉工作流准入中止該 signal；完全停穩需要等待待定 start 和已釋出子級 dispose 兩者。[工作流沙箱複用](2026-09-13-workflow-ptc-sandbox-reuse.zh.md)負責 PTC 程序取消和不另設工作流清理定時器的規則。

PTC 序列化請求和結果並負責程序終止。工作流介面卡保留終態結果仲裁和子級歸屬，因為程式結算、程序退出和子級完全停穩仍是獨立事實。

### 終端結果與物理清理保持分離

工作流結果按公開優先順序規則記錄首個被接受的終端結果。選定結果不會釋放資源：PTC 程序和活躍子級仍需清理，子級資源釋放必須履行其提供者約定。

公開 dispose 匯入同一個清理操作。執行結算關閉子級准入，合成缺失的生命週期結束並清理子級，不重寫已經認領的結果。

### ACP 提示詞結算不依賴更新投遞

[僅面向自動化的 ACP 橋接層](../simplification/2026-07-23-acp-automation-only-protocol.zh.md)直接將一個進行中的提示詞與其觀察到的使用者訊息輪次關聯。它不從日誌水位線掃描，也不使用工作階段狀態作為第二個調和預言機。

即使已提交訊息的更新無法送達用戶端，工作階段事件監聽器也會從匹配的 `turn/end` 結算關聯。因此更新投遞不能讓工作階段永久處於進行中狀態。ACP 建立由伺服器分配 id 的全新工作階段，並擁有由此產生的每個 agent 控制代碼，直到連線拆除。

## 正確性強制

該設計透過型別、執行時逃逸點、生成的約定和行為測試來強制執行。沒有哪一層被要求證明它無法觀察到的東西。

### 型別使常規路徑難以誤用

Readonly 約定描述借用的同程序值。`Scoped<T>` 標記事件接收器，`agentEvents()` 融合載體和主體，工具輸入省略註冊表擁有的 token，subagent 非同步返回型別直接暴露釋出與結算。

TypeScript 無法管控 JavaScript 強制轉換、直接 Cordis dispatch、程序訊息或持久化檔案，因此執行時強制保留在這些逃逸點。

### 執行時不變式覆蓋跨服務事實

`dsh-scope/invariant` 配套外掛在被選用時驗證每個宣告的作用域事件使用帶標記的載體，以及暴露主體的事件族使用匹配的鍵。獨立的 `dsh-session/invariant` 貢獻在追加提交前暫存 trace 驗證，並在同一事件提交後推進；二者都透過 `ctx.invariants` 註冊。

該外掛不透過掃描註冊表來管控可信 setup，也不拒絕透過強制轉換建構的提示詞 assembly 物件。這些檢查會將組合約定變成推測性的執行時機制，卻不保護真實的外部邊界。

### 生成的產物使公開約定保持對齊

事件目錄、服務目錄、生產者/消費方矩陣、設定目錄、模組圖、工具目錄、type-equiv 塊和作用域事件解析器對映都是從原始碼生成或受新鮮度門禁約束的。[TypeScript 語義門禁 Agent Note](../../archived/process/2026-07-14-typescript-program-backed-semantic-gates.md) 擁有 Program 建構、語義事件發現和解析器生成規則。

行為測試固定了作用域路由和 dispose、最終寫入註冊表時的碰撞清理、釋出復原、有序完全停穩、持久化前/後提交行為、跨展示和執行的活躍工具過濾、協作式提示片語裝、原生和 PTC mode 中的結構化輸出提交、非同步 subagent 啟動和訊號取消、工作流終態仲裁、ACP 結算和程序拆除。

## 曾考慮的替代方案

[7 月 8 日 Agent Note](2026-07-08-agent-scope-contexts.zh.md#alternatives-considered) 擁有公開扁平作用域約定的替代方案。此處的替代方案關注實作形態。

### 使用透明代理作為作用域載體

模擬主體的代理必須保持屬性、可呼叫、可建構、私有欄位、描述符和代理不變式行為，而監聽器路由從不需要這些。一個小型不透明載體保持過濾器和鍵，而顯式事件參數攜帶主體。

### 在 setup 前預留 agent 和工作階段 ID

預留防止重複的私有 setup 工作，但需要跨服務能力、釋放排序、廢棄預留清理和已準備物件繫結。ID 由呼叫方提供，並行複用是呼叫方錯誤；最終寫入註冊表時可以選擇贏家，而失敗的事務乾淨地復原。

### 對每個型別化的同程序參數做快照

通用複製防禦有狀態 getter 和違反 readonly 約定的呼叫方，但增加分配、重複驗證器和可能遺忘複製的路徑。物化屬於解析器、佇列、模型、持久化、worker、程序和協定格式邊界——即所有權真正變更的地方。

### 為就緒、取消和 dispose 提供獨立控制器

並行哨兵可能都映像一個操作是否活躍。一個事務或 start promise 擁有操作；獨立 promise 僅在釋出展開、外部工作、終端結果和物理層面的完全停穩可以獨立結算時才保留。

### 保留同步 subagent start 加 `run.started`

這將提供者接受與釋出分離，迫使每個消費方註冊部分 run、附加結果觀察、等待發布並清理釋出失敗。非同步 start promise 將提供者到呼叫方的所有權轉移保持在釋出邊界；現有的結果 promise 負責所有剩餘就緒工作，無需增加另一個生命週期 promise。

### 在 assembly 之後恢復選定的提示詞或工具貢獻

Waterfall 之後的恢復步驟會在文件化的協作式 waterfall 之後建立第二套組合規則。正確分配規範的存在或缺失還需要為任意工具 schema 提供者制定所有權和碰撞規則，而這些提供者的普通輸出可能包含重複名稱。作用域註冊已經提供了所需的按 agent 隔離，可信的 assembly 監聽器擁有其返回內容的協定一致性，因此命名恢復增加了機制卻不建立獨立邊界。

### 用同程序加固替代 worker/程序生命週期守衛

Worker 訊息、程序死亡和持久化輸入確實跨越所有權和序列化邊界。首個結果仲裁、驗證、環境清洗和使程序完全停穩的清理即使在敵對的同程序回呼機制不存在時仍然必要。

## 後果

實作更小，其證明與所有權圖具有相同的形狀。一個鍵選擇一層，一條註冊表條目擁有一個活躍註冊表物件，一個事務擁有建立，一個解析器擁有工具檢視，一個非同步 promise 轉移 subagent 所有權。

### 設計保證的內容

- 作用域貢獻僅在其精確的 agent 檢視中可見，並隨該作用域一起 dispose。
- 建立和恢復不暴露部分設定的控制代碼；最終寫入註冊表時的失敗者和釋出失敗清理每個已準備的資源。
- dispose 在 driver 排空和最終工作階段工作期間保留作用域監聽器和持久化，然後撤銷作用域。
- 持久化、佇列、模型、worker、程序和協定格式的值在其真實邊界處被擁有；型別化的同程序值遵循 readonly 約定。
- ToolRuntime 的展示、查詢和執行在專家 assembly 變換之前解析相同的活躍檢視，已提交的結果有一個不可變的觀察點。
- 註冊表貢獻是確定性輸入，而可信的 assembly waterfall 擁有最終的模型可見組合。
- subagent start 僅返回已釋出的 run，必需的 signal 取消待定或活躍的工作，dispose 到達後端的完全停穩約定。
- Worker/程序結果優先順序和清理在死亡、遲到訊息和有界拆除下保持正確。

### 代價與侷限

作用域感知服務仍然維護全域和按標識鍵索引的對映，操作必須顯式攜帶其真實 agent。非同步建立/恢復和 subagent start 要求呼叫方等待所有權轉移並 dispose 返回的控制代碼。

可信的 `system-prompt/assemble` 監聽器可以移除或替換 PTC mode 和結構化輸出協定片段。這是有意為之：監聽器擁有最終組合，必須保持部署期望仍可用的任何協定。

該設計信任同程序中的型別化外掛。它不防禦任意強制轉換、有狀態 getter、違反 readonly 約定的修改，或外掛有意在支援的組合 API 之外使用環境服務存取。

[安全與權限非目標](2026-07-08-agent-scope-contexts.zh.md#security-and-authority-are-non-goals)仍然是根本性的。這些機制證明註冊組合、釋出和生命期所有權；它們不證明隔離或父到子的非升權。
