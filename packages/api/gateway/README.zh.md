---
description: "帶型別的 Client 到 Host 呼叫與流：分派、驗證、取消、重連與轉發的 Host 事件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-gateway

[English](README.md) | 中文

## 概述

為 Host 與 Client 兩側的 Cordis 環境提供 Typert RPC endpoint。Host 入口提供 `ctx.typertGateway`，`@deepseek-ai/dsh-api-gateway/client` 則提供 `ctx.remote`；兩者使用同一份生成的 `InvocationDescriptor` 約定，並將業務選擇交給 API Remotes。Connection 承載一元呼叫的請求關聯、信任和回應 envelope，Gateway 則擁有多路複用的 Remote 流，每條流都在同一條邏輯流上攜帶從 Client 到 Host 的上行（uplink）。

## 目錄

- [Host 服務：`TypertGatewayService`（ctx key：`typertGateway`）](#host-service-typertgatewayservice-ctx-key-typertgateway)
- [Client 服務：`ClientRemote`（ctx key：`remote`）](#client-service-clientremote-ctx-key-remote)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="host-service-typertgatewayservice-ctx-key-typertgateway"></a>
## Host 服務：`TypertGatewayService`（ctx key：`typertGateway`）

每次呼叫時，`ctx.typertGateway.invoke()` 都會解析目前的描述符和 Cordis 服務，驗證具名參數是否完全匹配，解析已註冊的物件或 Context 身份標識，並呼叫公開的業務方法。業務服務繼承 [`dsh-typert-protocol`](../../typert/protocol/README.zh.md) 的 `TypertRemoteService`，並用 `@Remote` 或 `@RemoteScope` 標記方法；已有其他基類時仍可改用 `bindTypertRemote()`。

嚴格模式從 `ctx.typert.local` 讀取生成的呼叫描述符。查詢參數使用 `ctx.typert.lookups` 中目前有效的解析器：業務包註冊穩定宣告與預設策略，Host 組合可用 effect-scoped `configure()` 覆蓋解析行為；`@RemoteScope` 則透過已註冊的 Host Context 介面卡解析其接收者。SRC 模式是開發階段的退回路徑，適用於從未具備嚴格定義的端點；它解析簡單參數名，並且只允許非查詢參數使用可安全表示為 JSON 的值。已觀測到的嚴格定義一旦撤回，系統會直接報錯，而不會降低驗證強度。對於一元結果，Gateway 在生成 codec 提供 `encode()` 時執行它，否則保持 strict JSON 值不變；SRC 則遞迴識別執行時位元組值。兩條路徑都向 Connection 返回 JSON 相容中繼資料及相對於結果的位元組附件，由 Connection 完成傳輸幀封裝。

Connection 可用時，Host 入口會在 Connection 共享的 `/api` FetchHandler 上註冊 trusted-host interceptor。Connection 把這個複合 handler 交給 HTTP bridge；handler 將已認領 endpoint 分發給 Gateway，未認領且沒有精確 Fetch 路由負責的請求返回 404。直接呼叫 `invoke()` 會保留業務錯誤；`TypertGatewayError` 是 `RemoteError` 的子類，其 `gateway/*` 碼命名了分發、繫結、提供者、查詢、Context、參數、編解碼器以及上行各自負責的故障：緩衝幀超過 `streamInboxBytes` 的上行報 `gateway/uplink-overflow`，`end` 之後的上行項報 `gateway/protocol`，被 codec 拒絕的上行項報編解碼碼 `gateway/input-invalid`。因策略而拒絕的解析器——冷恢復失敗或 ownership fence——丟擲自己的 `RemoteError`，它選定的碼原樣到達呼叫方。

支援取消的 Remote 方法會把 `signal: AbortSignal` 宣告為最後一個 Host 參數。signal 是 descriptor 中繼資料，而不是 wire 參數：Connection 將它提供給 Gateway，Gateway 則在已解碼的業務參數之後注入它。SRC 識別這個保留的末位參數名，嚴格生成還要求它具有全域 `AbortSignal` 型別。

流式 Remote 使用 `@Remote({ mode: 'stream' })` 並返回 `Iterable` 或 `AsyncIterable`。`ctx.typertGateway.stream()` 執行與一元呼叫相同的 endpoint、參數、lookup 和取消驗證，再返回可取消的業務項 iterable。Client 外掛啟用時開啟 Gateway 自有的 `/api/remote.mux` WebSocket，並讓它在空閒時保持連線。Connection 擁有重試排程；每次 retry 前，它要求 mux 取消候選或活動 socket，並且只做一次全新的物理連線嘗試。Host 按設定的 `websocketHeartbeatIntervalMs` 間隔（預設 2 秒）傳送 Ping 控制幀，瀏覽器在 WebSocket 協定層自動回覆 Pong，使空閒網路中間層持續看到流量，而不新增 Remote 流幀。若 socket 尚未回覆上一次 Ping，Host 會在下一間隔終止它。可獨立取消的邏輯流共享這條連線；程序內 Connection 載體直接提供等價的流，不開啟該 WebSocket。

啟動器提供 `ctx.appReady` 時，Gateway 僅在應用成功啟動後註冊 WebSocket 升級路由。此前的連線嘗試仍屬於載體故障，由 Connection 的重試策略處理，因此重新啟動中的 Host 不會在控制器仍在初始化時接受流。解除安裝會取消尚未觸發的就緒訂閱，並關閉已註冊的載體。不提供 `appReady` 的嵌入式 Host 會立即註冊，並自行負責啟動順序；程序內呼叫不變。

每條流還在同一條邏輯流上攜帶從 Client 到 Host 的上行。方法把上行項型別宣告為返回型別的第二個型別參數——來自 [`dsh-typert-protocol`](../../typert/protocol/README.zh.md) 的 `RemoteStream<Out, In>`；`In` 預設為 `never`，返回 `Iterable`、`AsyncIterable` 或 `RemoteStream<Out>` 的方法即宣告自己不讀上行。執行中的方法透過 `this.ctx.invocation` 讀取本次呼叫：Gateway 從攜帶該 `RemoteInvocation`（`request`、`service`、`peer`、`signal` 與 `uplink()`）的 Context 派生接收者，因此沒有任何東西進入參數列表，而非 Remote 呼叫派生的 Context 上 `ctx.invocation` 為 `undefined`。`uplink()` 每次呼叫只能取一次。描述符帶 codec 時它在交付前逐項解碼；不帶時——SRC 方法，或 `In` 為 `never` 的方法——它交付經 JSON 安全驗證的 `unknown` 值。Client 在已開啟的邏輯流上把每一項作為 `item` 幀傳送（頂層 `undefined` 項是不帶 `value` 的 `item` 幀），以 `end` 幀表示半關閉；方法透過 `uplink()` 迭代結束感知半關閉，透過 `signal` 感知取消。被拒絕的項使整條流以 `gateway/input-invalid`（欄位 `uplink`）失敗。上行項在 Host 逐項驗證，因為它們來自瀏覽器；下行項是 Host 方法產出的值，不經驗證原樣直接傳遞。方法結束下行時 Gateway 呼叫 uplink 迭代器的 return 並丟棄未讀的項；發給從未取用 uplink 的方法的項在 inbox 裡等到那時為止。每條邏輯流最多緩衝 `streamInboxBytes`（預設 262144）位元組的上行幀；超限使流以 `gateway/uplink-overflow` 失敗，`end` 之後的項使流以 `gateway/protocol` 失敗，兩種情況都不關閉 socket。發給 Host 已結束的流 id 的 `item`、`end` 與 `cancel` 幀被丟棄；只有重複的 `open` 會關閉 socket。`$events` 這類 Gateway 自有的流在開啟時立即 return 其 uplink，因此它們的 `item` 幀被丟棄而不緩衝。一元方法也可以呼叫 `uplink()`；其項只在方法執行期間可讀。每條流都代表操作者 Peer：WebSocket 上的流代表 Connection 在升級時接納的 Peer，該 scope 釋放時 socket 關閉；程序內載體的流直接代表操作者。

Host 下行、Host 上行和 Client 上行泵的取消與停止狀態歸屬單次讀取，不保留已交付項的歷史。下行結束也會喚醒尚未完成的上行讀取。

Host 組合可透過 `registerRemoteEvents()` 註冊唯一的應用事件 source。Gateway 為它保留內部 `$events` logical endpoint，只接受空 `args`，並在 source 撤回時中止該註冊開啟的流。事件名單、參數驗證、每個 Client 的佇列及 opening `{ type: 'ready', clientId, host: { home } }` frame 中的 Host home 由 API Remotes 擁有。source factory 在返回 iterable 前同步掛好增量 listener，因此 Client 只在增量投遞就緒後釋出 generation 並開始 baseline 讀取。

<a id="client-service-clientremote-ctx-key-remote"></a>
## Client 服務：`ClientRemote`（ctx key：`remote`）

瀏覽器載體接受 [Connection](../../client/connection/README.zh.md#use-this-package) 定義的 shell 所擁有的流 origin；邏輯流幀與生命週期保持一致。

`ctx.remote.$mount()` 會驗證並註冊生成的 Host-for-Client 貢獻項，然後為發起呼叫的 Cordis fiber 安裝具體的直接方法和作用域方法。每個 namespace 都是可追蹤的 `remote.<namespace>` 子 Service，並在最後一個方法撤回後解除安裝。重複端點、名稱空間衝突，以及缺少生成的嚴格 codec 的 Client 供值欄位，都會在方法可呼叫前報錯。

每次一元呼叫都會檢查位置參數數量，建構與描述符完全匹配的具名 `args`，再把帶型別的值原樣交給 `ctx.connection.rpc.call('/api', endpoint, ...)`，而不執行 Client 側 schema；Host 會在業務呼叫前驗證收到的 wire 欄位。生成的流方法返回 `dsh-typert-protocol` 的 `RemoteStreamHandle<Out, In>`，並在被呼叫時就開啟一條邏輯流，程序內 Connection 載體可用時透過它開啟，否則透過共享的 Gateway WebSocket 開啟。控制代碼只迭代下行一次。`send(item)` 把一個上行項入隊，在 `open` 幀之後發出；`end()` 半關閉上行；`dispose()` 在未收到終止幀時傳送 `cancel`，並讓迭代安靜結束。提前跳出迭代等價於 dispose 控制代碼；下行終止後 `send` 拋錯，`end` 被忽略。生成的支援取消的方法接受最後一個可選 `AbortSignal`；Client 會在呼叫載體前將它與貢獻項的掛載生命週期合併。Client 將一元結果轉換交給 codec 的可選 `decode()`。生成的解碼器驗證巢狀中繼資料與原生位元組型別，不逐位元組遍歷、複製或凍結位元組載荷。JSON 一元結果與流項不經 Client 側型別解析直接傳遞。撤回貢獻項會同時移除其描述符和方法、中止正在進行的呼叫與流，並使外部仍持有的方法控制代碼在呼叫時返回拒絕。

每次一元呼叫都解析為 `RemoteResult<T>`——`{ ok: true, value }` 或 `{ ok: false, error }`——且絕不因載體問題 reject：本面把斷線載體折入錯誤分支，呼叫方 signal 中止時答以 `gateway/cancelled`，因此沒有消費方需要包一層來兜載體失敗。只有裝配故障仍會 reject：參數個數不符、方法未掛載、貢獻已撤下、缺少 Context 介面卡。`error` 是活的 `RemoteError` 實例，所以 `throw result.error` 保持 throw 語義；而 `isRemoteFailure(value)` 是消費方唯一需要的謂詞——它認下的捕捉值帶著 Host 碼，它拒絕的一律是本地故障，呼叫方應當讓其崩掉。`carrierFailure(endpoint, error)` 與 `cancelledFailure(endpoint, cause)` 建構這兩種摺疊結果，測試裡的替代實作據此採用相同的摺疊方式。

`ctx.remote.$host` 以普通值讀取固定的 Host 事實：`home`（首個 ready 幀之前為 undefined）與 `isLoopback`。它不是儲存——沒有訂閱、沒有代次計數——所以需要回應重連的消費方去監聽 `connection/reset`，而不是輪詢它。

`ctx.remote.$stream()` 返回跨越多個物理載體代次的單消費方 `RemoteStream`。Host 仍線上時，它允許一次立即重試；Host 離線時，它等待下一代連線，併為每個流項標註物理代次。領域消費方驗證並接受各代次的 opening value；業務與協定錯誤仍然終止流。一切終態失敗離開本面時都是 `RemoteError`，包括重試耗盡和在 opening value 之前就結束的代次，因此流消費方與一元呼叫方用同一種方式判別。`RemoteStreamCarrierError` 命名的是可重試的物理丟失，它只作為 `carrierFailed` 回呼參數到達領域，絕不作為終態結果。`RemoteSnapshotStream` 在此之上規定每代由一個初始快照和後續 delta 組成。`RemoteJournalStream` 基於領域提供的 entry 閉區間提供 follow-before-page、分頁、重連追趕與缺口修復；它丟棄完整重複項，並拒絕缺口、倒置區間和部分重疊。領域還可以攜帶無 cursor 的通知：通知絕不推進或修復持久 cursor，在缺口修復期間收到的通知只會在 replacement page 提交後釋出。若更新代次取代該修復，舊代次 held notification 會與其 page 一同丟棄。對任一種流執行 dispose（資源釋放）時，系統會取消該流的請求，並在活動 iterator 完全停止後完成資源釋放。

`ctx.remote.$on()` 訂閱一條被轉發的 Host 事件。它的合法鍵恰好等於 Host 裝配宣告的轉發選擇，listener 型別就是事件所屬包自己的 Cordis `Events` 宣告，因此不存在會與之漂移的第二份簽名。每個訂閱歸屬呼叫方 fiber，並隨該 fiber 一起消失。Client Remote 服務啟用時就把 `$events` pump 註冊為 Connection generation source，無論目前是否存在 `$on` listener。瀏覽器使用 Remote mux，程序內組合使用 `connection.rpc.open`；opening `ready` 項建立 Connection generation 並提供 Host 資訊。物理 carrier 失敗、Remote 流故障、意外正常結束、非 ready 首項或畸形事件項都會終止該 generation，由 Connection 按持續且間隔封頂的帶抖動指數退避重開。普通通知按註冊順序執行並隔離 listener 失敗；Agent-scoped waterfall（瀑布式事件）允許 listener 返回結果、呼叫 `next()` 或拒絕，Gateway 再透過現有 HTTP 一元載體回送該結果。

Client waterfall 的 Context 解析保持同步。解析器可以返回借用的 Context 或 `TypertOwnedValue<Context>`；Gateway 僅在處理器使用和回覆結算均結束後釋放 owned value。Context 解析失敗保留既有的記錄錯誤並委託語義，處理器失敗產生拒絕回覆。取消會抑制遲到回覆，但不會釋放處理器仍在使用的 Context。每個 handler 都必須回應 `request.signal` 並在取消後結束；外掛銷燬與 Connection generation 替換會等待未結束的 handler 結算。Session Context 的取得本身不執行歷史 I/O。

`ctx.remote` 不暴露 Connection 生命週期控制。只有職責包含恢復的消費方才直接讀取 `ctx.connection.state` 並呼叫 `ctx.connection.reconnect()`；普通 Remote 消費方仍只使用生成的 namespace 與 `$stream()`。

生成的宣告合併透過共享的 `TypertClientRemote` 約定提供 TypeScript API。Client 入口不包含 Host 服務或 Host Cordis 介面合併；方法查詢和呼叫使用普通物件與函式，而不使用 JavaScript Proxy。

<a id="model-experience"></a>
## 模型體驗

無，因為該包分發應用呼叫，不註冊任何提示詞、工具或工作階段事件。

#### KV Cache 影響

無直接影響；被呼叫的業務服務負責產生任何模型可見結果。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- Connection 介面卡對分發故障與未歸類異常答以 `gateway/internal`，且不附帶詳細資訊；擁有方或 Gateway 自己丟擲的 `RemoteError` 帶著自有碼、message 與 details 過線。其 `cause` 鏈與 `TypertGatewayError` 子類身份只對同程序呼叫方留存。
- SRC 模式僅支援名稱唯一的識別符號參數，不支援解構、預設值或剩餘參數。它只驗證值能否安全表示為 JSON，不驗證生成的業務型別，也絕不會推斷可選欄位。
- contribution 掛載時，每個由 Client 供值的欄位都必須具備生成的嚴格 codec。SRC 標記沒有 Client 型別投影，不是常規的 Client contribution 輸入。
- `$stream()` 監督載體替換，但不推斷回放語義；各領域自行擁有恢復 cursor 或替換 baseline 的驗證，以及正常結束的分類。Connection generation 會重開內部 `$events` 流；單向通知不會重放，仍處於 pending 的 scoped waterfall 則沿用同一個 event id 重放。
- lookup 解析器按 key 設定；目前無法讓單個 Remote 參數或 endpoint 在同一 `agent`/`session` key 下選擇 live-only 策略。
- 被轉發的事件到達 `$on` 時不做業務載荷投影或脫敏。普通通知在重連後不重放；Agent-scoped waterfall 只投影選擇 Client Context 所需的頂層 Agent 身份，並自行攜帶 pending 生命週期。
- `websocketHeartbeatIntervalMs` 同時是 Ping 週期和 Pong 截止時間。對端未在下一週期前回復時，Host 會終止連線；如果部署的事件迴圈或網路可能停頓超過該間隔，必須調大此設定。
- 上行除了有界的 Host inbox 之外沒有流控：Client 傳送快於方法讀取，或發給從未取用 uplink 的方法時，其流以 `gateway/uplink-overflow` 失敗；上行項不會跨載體代際重放，需要恢復上行的領域在重開的請求裡自帶確認遊標。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。Host 呼叫會重新讀取權威的 Cordis 與 Typert 狀態，Client 方法、描述符與 `$on` 訂閱的變更則統一歸屬同一個 effect。

./stream-protocol 匯出為原生桌面呼叫方提供共享的 Remote 流幀格式和解析器。它們與瀏覽器用戶端使用同一個經過認證的 WebSocket 端點。
