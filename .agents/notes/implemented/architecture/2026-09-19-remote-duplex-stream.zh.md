# Agent Note: Remote 雙工流：一種流、上行通道與呼叫上下文

Status: implemented

[English](2026-09-19-remote-duplex-stream.md) | 中文

## 問題

### 現狀

`dsh-api-gateway` 在一條 WebSocket 上覆用全部 Typert Remote 流，路徑固定為 `/api/remote.mux`（`packages/api/gateway/src/stream-protocol.ts`）。一個 Host 方法用 `@Remote({ mode: 'stream' })` 修飾並返回 `Iterable` 或 `AsyncIterable`，就成為一條 Host 到 Client 的邏輯流；可選的末位 `signal: AbortSignal` 是唯一的保留參數，不進線路參數，由閘道在解碼後的業務參數之後追加（`packages/api/gateway/src/index.ts`）。用戶端拿到的生成方法返回一個裸 `AsyncIterable`。

線路幀只有五種：

| 方向 | 幀 | 定義 |
| --- | --- | --- |
| Client 到 Host | `{ type: 'open', streamId, endpoint, payload }` | `stream-protocol.ts` |
| Client 到 Host | `{ type: 'cancel', streamId }` | `stream-protocol.ts` |
| Host 到 Client | `{ type: 'item', streamId, value? }` | `stream-protocol.ts` |
| Host 到 Client | `{ type: 'error', streamId, error: { code, message, details } }` | `stream-protocol.ts` |
| Host 到 Client | `{ type: 'end', streamId }` | `stream-protocol.ts` |

用戶端能發的只有開啟與取消。解析器 `parseRemoteStreamClientMessage`（`stream-protocol.ts`）對其他任何幀拋錯，Host 連線收到後以 1008 關閉整個 socket（`stream-server.ts`）。結論：閘道今天只支援"後端 iterable 發到前端"。需要前端向後端持續發資料的功能，各自繞路。

Host 方法也沒有"這次呼叫是誰發起的"這個概念：`InvokeRemoteRequest = { namespace, method, args, signal }`（`packages/api/gateway/src/types.ts`）沒有呼叫者槽位，`RemoteStreamOpener` 的簽名是 `(endpoint, payload, signal)`（`stream-server.ts`），WebSocket 只在握手時校一次 cookie。

### 三套各自為政的上行機制

| 功能 | 上行方式 | 位置 | 代價 |
| --- | --- | --- | --- |
| Web 終端按鍵 | 每次 xterm `onData` 一個 unary RPC `terminal.write(agent, id, attachmentId, data)`，用戶端用 promise 鏈序列化並自限位元組預算 | `packages/api/terminal-controller/src/client/model.ts`；Host `src/index.ts` | 一次按鍵一次 HTTP 往返與授權驗證；兩條載體靠 `attachmentId` 手工關聯；滿了報 `inputFull` |
| 檔案上傳 | `Blob` 或 `ReadableStream` 走 Remote 層之外的原生 `POST /api/session/uploadFileBinary`，`duplex: 'half'` | `packages/client/file-upload/src/client/runtime.ts`；路由 `src/index.ts` | 不經 Typert 描述符，沒有型別投影 |
| 審批與提問的回答 | Host 在 `$events` 流上下發 waterfall 幀，Client 用一個獨立的 unary RPC `$events/result` 回答，靠 `clientId` 加 `eventId` 關聯 | `packages/api/gateway/src/client/remote-events.ts`；Host `index.ts` | 第二套關聯鍵；`index.ts` 記錄了由此產生的競態 |

這三套機制解決的是同一個問題：一條已經開啟的邏輯流，用戶端想往裡寫。

### 具體代價

- **兩條載體對齊**。終端要用 `attachmentId` 把 `follow` 流與 `write` RPC 關聯起來，並用它決定誰擁有輸入權。審批要用 `clientId` 把 `$events` 流與 `$events/result` RPC 關聯起來。
- **沒有順序保證**。unary RPC 走 HTTP，與 WebSocket 下行互不排序；終端只能在用戶端序列化寫入來自保順序。
- **每次上行單獨授權驗證與查詢**。`write(agent, id, attachmentId, data)` 每次解析 `agent`、查終端、驗證 attachment。
- **沒有 EOF**。用戶端無法表達"我這邊寫完了"，半關閉要再加一個 RPC。
- **取消不覆蓋兩半**。取消下行流不會取消排隊中的上行寫；反之亦然。
- **背壓各寫一套**。下行按 socket 寫回呼節拍拉迭代器（`stream-server.ts`）；終端用有界 follower 讓慢消費者顯式失敗（`terminal-controller/src/stream.ts`）；上行靠用戶端自限 `maxInputBytes`。
- **文件已經過時**。`docs/api-gateway.md:160` 仍寫著 Remote 只處理一請求一結果，這一句已經落後於 README 記錄的 stream 模式。

### 與後臺 job 的關係

後臺 job 的程序形雙工流面（已存檔為草稿 PR，分支 `worktree/job-stdio-stream-pair-archive`）把 job 建成一對映像的流面，瀏覽器要接它就需要一條既下行又上行的 Remote 流。它是本 Note 的動機之一，但不是本 Note 的範圍：job 要不要一種專用的讀寫流，是 jobs 那條線自己的架構問題。本 Note 只覆蓋傳輸層。

### 目標

1. 傳輸層只有一種流，天生雙工：下行 `item` / `end` / `error`，上行 `item` / `end`，一個 `streamId`，一個代際。
2. 上行型別與下行型別寫在同一個位置：方法的返回型別。
3. Host 方法透過呼叫上下文取上行；呼叫上下文同時攜帶呼叫者（Peer）。
4. 用戶端拿到的不再是裸 `AsyncIterable`，而是一個能讀、能寫、能關的控制代碼。
5. 上層協定（snapshot、journal、任何業務自定義的流）不進傳輸層。

## 決定

### 一句話

所有 Remote 流都允許用戶端上行。方法的返回型別 `RemoteStream<Out, In = never>` 同時宣告下行項與上行項的型別；生成器從中生成兩個 codec。Host 方法透過 `this.ctx.invocation.uplink<In>()` 取上行迭代器，透過 `this.ctx.invocation.peer` 知道呼叫者。用戶端生成方法返回 `RemoteStreamHandle<Out, In>`：`for await` 讀下行，`send` / `end` 寫上行，`dispose` 關。斷線重開、遊標續傳、基線驗證都是上層協定的事。

```
                 Client                                             Host
   ─────────────────────────────────              ───────────────────────────────────────────
   const s = remote.job.attach(req, signal)
        │  open { streamId, endpoint, payload } ───────▶  opener(endpoint, payload, uplink, peer, control)
        │                                                     │ prepareInvocation
        │  s.send(v1) → item { streamId, v1 }    ───────▶  inbox.push(v1)   │ invocation = { request, service, peer, signal, uplink() }
        │  s.send(v2) → item { streamId, v2 }    ───────▶  inbox.push(v2)   │ receiverContext.extend({ invocation }).get(service)
        │  s.end()    → end  { streamId }        ───────▶  inbox.end()      │ method(...args, signal)
        │                                        ◀───────  item { streamId, o1 }   │   for await (v of this.ctx.invocation.uplink()) …
        │  for await (o of s) …                  ◀───────  item { streamId, o2 }   │   yield o …
        │  s.dispose() → cancel { streamId }     ───────▶  control.abort()         │ signal aborts; uplink.return()
        │                                        ◀───────  end | error
```

### 術語

| 術語 | 含義 |
| --- | --- |
| 邏輯流 | 一個 `streamId` 標識的一次呼叫，跨越 `open` 到終止幀 |
| 代際 | 一條邏輯流的一次物理生命期。傳輸層只認一個代際；斷線即失敗，重開是上層的事 |
| 下行 | Host 到 Client 的 `item` 序列，以 `end` 或 `error` 終止 |
| 上行 | Client 到 Host 的 `item` 序列，以 `end` 終止（半關閉），或隨 `cancel` 一起結束 |
| 半關閉 | 一個方向已結束而另一個方向仍開放 |
| 項 | 一個方向上的一個業務值；每項獨立經 codec 驗證 |
| inbox | Host 側每邏輯流一個的有界上行佇列 |
| Peer | 連線層被接納的一方，一個 `PeerScope`；本 Host 只有操作者一個 Peer |
| 呼叫上下文 | `RemoteInvocation`：本次呼叫的請求、接收服務、Peer、取消訊號與上行入口 |

### 型別簽名

```text
// @deepseek-ai/dsh-typert-protocol
/**
 * One Remote stream. Host face: the method returns it, and at runtime it is AsyncIterable<Out>.
 * On the Client face the generated method returns RemoteStreamHandle<Out, In>; each name has exactly one meaning.
 * In is the item type the Client may send uplink; the default never means the method reads no uplink.
 */
export type RemoteStream<Out, In = never> = AsyncIterable<Out> & { readonly [STREAM_UPLINK]?: In }

// Host
@Remote({ mode: 'stream' })
async *attach(request: JobAttachRequest, signal: AbortSignal): RemoteStream<JobFollowFrame, JobInputFrame> {
  const uplink = this.ctx.invocation.uplink<JobInputFrame>()
  void (async () => { for await (const frame of uplink) … })()
  yield …
}

// Generated Client signature: same parameters, returns the handle
attach(request: JobAttachRequest, signal?: AbortSignal): RemoteStreamHandle<JobFollowFrame, JobInputFrame>

// Client usage
const stream = remote.job.attach(req, signal)
for await (const frame of stream) …
stream.send(frame)     // typed as JobInputFrame
stream.end()
stream.dispose()
```

`RemoteStream` 是別名而不是介面，是刻意的：將來若把傳輸層做成 Node 流形態，只換別名的定義與兩端的適應，方法簽名、描述符、上層協定都不動。

### Host 面

```text
/** The context of this Remote call. A method reads it through this.ctx.invocation. */
export interface RemoteInvocation {
  readonly request: {
    readonly namespace: string
    readonly method: string
    readonly args: Readonly<Record<string, unknown>>
  }
  /** Cordis service key of the receiving service. */
  readonly service: string
  /** The Peer that initiated the call. In-process carriers and unadmitted calls are the operator. */
  readonly peer: PeerScope
  /** Carrier cancellation: Client cancel, socket closure, uplink failure. */
  readonly signal: AbortSignal
  /**
   * The uplink items of this call. Can be taken once; the second call throws. With an uplink codec
   * in the descriptor each item is decoded to In; without one, items are delivered as unknown with
   * only a JSON-safety check.
   * The iteration ends after the Client's end; when the method ends the downlink, the Gateway calls
   * its return() and drops unconsumed items.
   * The generic In is only the caller's type assertion; runtime decodes per the descriptor and does not cross-check.
   */
  uplink<In = unknown>(): AsyncIterable<In>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Remote call this Context was derived for; undefined on a Context not derived from a Remote call. */
    readonly invocation: RemoteInvocation | undefined
  }
}
```

規則：

1. 任何 `mode: 'stream'` 方法都可以呼叫 `this.ctx.invocation.uplink()`；unary 方法也可以，但它的流在方法返回時結束，上行項只在方法執行期間可讀。
2. `uplink()` 未被呼叫時，上行項在 inbox 裡攢著，直到超限（見背壓）或流結束被丟棄。這是刻意的：不讀上行的方法不用知道上行存在。
3. `In` 預設為 `never` 時描述符沒有 uplink codec；用戶端控制代碼的 `send` 型別為 `never`，編譯期就不能發。執行時若仍有幀到達（手工建構的用戶端），按 `unknown` 交付。
4. `this.ctx.invocation` 在非 Remote 呼叫的 Context 上是 `undefined`；方法內讀它時按 TS 的可選處理，或在方法第一行斷言。該屬性的 accessor 由 `TypertRemoteService` 基類建構時註冊一次，任何裝有 Remote 服務的組合都能讀它。

#### 呼叫上下文如何到達方法

機制依賴 Cordis 的兩條既有行為：

- `ctx.extend(meta)` 是 `Object.create(parent)` 加自有屬性（`vendor/cordis/src/context.ts:99-107`），無註冊、無 fiber、不需釋放，每次呼叫派生一個是零成本的。
- `ctx.get(service)` 返回 `createTraceable(ctx, service)` 代理（`vendor/cordis/src/reflect.ts:233-234`，`utils.ts:117-125`）。讀 `ctx` 屬性直接返回存取方的 Context（`utils.ts:175`）；讀方法時用 `createShadowMethod` 包一層，`apply` 時把 `this` 換成 shadow receiver，shadow 上的 `ctx` 是 `ctx.extend({ [symbols.shadow]: origin })`（`utils.ts:149-163`）。
- 閘道因此寫 `receiverContext.extend({ invocation }).get(descriptor.service)` 取一個呼叫檢視，`Reflect.apply(method, callReceiver, args)`；方法體裡 `this.ctx.invocation` 沿原型鏈讀到本次呼叫。async generator 體延後執行不受影響，因為 `this` 在呼叫時已繫結為 shadow 物件。

### PeerScope

```text
/** The opaque identity of one Peer. */
export type PeerId = Branded<'PeerId'>

/** One Peer's session on this Host: opened and released by the admitting side; ctx owns connection-lifetime registrations. */
export interface PeerScope {
  readonly id: PeerId
  readonly ctx: Context
  dispose(): Promise<void>
}
```

本 Host 只有一個 Peer：操作者。`@deepseek-ai/dsh-client-connection` 在服務 apply 時用 `createScope(connectionCtx, peer)` 建它，與 Agent 建自己的 scope 是同一機制：Peer 物件就是 ScopeKey，`peer.ctx` 承接連線期效果，`dispose()` 隨 connection 釋放讓 fiber 靜默。它以 `connection.operator` 暴露。

| 成員 | 語義 |
| --- | --- |
| `connection.operator: PeerScope` | 唯一的 Peer，隨 connection 生滅 |
| `connection.admit(request): PeerAdmission` | 過既有的 `requestRejection`：被拒返回 `{ rejection: 401 \| 403 }`，否則返回 `{ peer: operator }`。將來的接納方在這裡接入 |

閘道 `handleUpgrade(req, socket, head, peer)` 為該 socket 綁一個固定 Peer 的 opener，並在 `peer.ctx.effect` 裡登記 socket 關閉；scope 已失效時改為直接以 1001 關閉 socket。`InvokeRemoteRequest.peer?` 與 `RemoteStreamOpener` 的 `peer` 形參缺席時按操作者作答，現有程序內呼叫方零改動；沒有 connection 的組合裡閘道自建的操作者替身同樣經 `createScope` 建立，`dispose()` 契約一致。按 id 查 Peer、把載體關聯到第二個 Peer、Peer 的開關事件，都等第一個需要多 Peer 的消費者出現時再加。

Peer 不攜帶存取模型：Peer 是誰、能做什麼，由業務外掛透過 `peer.ctx` 自行附加。

### Client 面

```text
/** The handle a generated method returns on the Client face. A different name from the Host's RemoteStream, exported from the same entry point. */
export interface RemoteStreamHandle<Out, In> extends AsyncIterable<Out> {
  /** Send one uplink item. Throws on a value that is not lossless JSON, after termination, or after end. */
  send(item: In): void
  /** Half-close the uplink: sends the end frame. Idempotent. */
  end(): void
  /** Cancel the whole logical stream: sends the cancel frame (when no terminal frame has arrived); the downlink iterator ends quietly. */
  dispose(): void
}
```

- 控制代碼代表一個代際。載體丟失時 `for await` 以 `RemoteStreamCarrierError` 失敗，控制代碼到此結束；要不要重開、帶什麼參數重開，是上層協定的事。
- `send` 是同步的：入隊前做 `isRemoteJsonValue` 驗證，非無損 JSON 值同步拋錯。瀏覽器 `WebSocket.send` 沒有寫回呼，傳送節流沒有意義；Host 側的 inbox 上限是唯一的背壓點。
- 收到終止幀（`end` / `error`）時，mux 用戶端在收幀路徑上立即停泵並關閉上行佇列，之後 `send` / `end` 拋錯，不等消費者下一次讀。
- `dispose()` 呼叫載體迭代器的 `return()`，讓 `cancel` 幀在無人讀下行時也發出；之後控制代碼的 `next()` 直接結束，緩衝項丟棄。消費者提前 `break` 出 `for await` 等價於 `dispose()`。
- `$stream` 監督器、`RemoteSnapshotStream`、`RemoteJournalStream` 是上層工具，不在傳輸層內。它們的 `open` 工廠拿到的物件現在就是控制代碼，`for await` 行為不變；把 `send` 透出到這些上層協定是後續的事。

### 線路幀

```text
export type RemoteStreamClientMessage =
  | { readonly type: 'open'; readonly streamId: string; readonly endpoint: string; readonly payload: unknown }
  | { readonly type: 'item'; readonly streamId: string; readonly value?: unknown }   // new: uplink item
  | { readonly type: 'end'; readonly streamId: string }                              // new: uplink half-close
  | { readonly type: 'cancel'; readonly streamId: string }

/** Frames sent by the Host are unchanged. */
export type RemoteStreamServerMessage =
  | { readonly type: 'item'; readonly streamId: string; readonly value?: unknown }
  | { readonly type: 'error'; readonly streamId: string; readonly error: RemoteStreamFailure }
  | { readonly type: 'end'; readonly streamId: string }
```

解析規則：`item` 精確鍵 `type` `streamId` 加可選 `value`，`value` 須為無損 JSON 值（`isRemoteJsonValue`）；`end` 精確鍵 `type` `streamId`。其餘形狀是幀格式違規，socket 以 1008 關閉。不引入二進位制幀。

### 邏輯流狀態機

#### Host 側

```
                open frame
   (none) ───────────────────▶ opening ──── opener resolves ────▶ running
                                  │                                  │
                                  │ item frame: inbox.push           │ item frame: inbox.push
                                  │ end frame: inbox.end             │ end frame: inbox.end (uplink half-close)
                                  │                                  │ method yield: sends item frame
                                  │ cancel frame / socket close ────▶│ cancel frame / socket close: control.abort
                                  ▼                                  ▼
                               aborted ◀───────────────────────── finished (sends end or error frame)
```

`opening` 期間到達的 `item` 幀進入 inbox：`receive()` 是同步的，`open` 幀處理時就建立 `ActiveStream` 與 inbox，而 opener 是非同步的。用戶端在 `open` 之後立刻發的項不會丟。

#### Client 側

```
   call generated method ──▶ await socket ──▶ send open ──▶ handle usable
                                                            │ send(v): sends item; end(): sends end
                                                            │ downlink: inbox.next() → yield; end → ends; error → throws
                                                            │ downlink terminates first: send/end throw
                                                            │ dispose or caller signal abort: sends cancel (when no terminal frame has arrived)
```

### 半關閉與結束語義

| 上行 | 下行 | 結果 |
| --- | --- | --- |
| 用戶端 `end` | 仍開放 | Host 的 `uplink()` 迭代結束；方法繼續產出。這是 stdin EOF 的形狀 |
| 仍開放 | Host 方法結束，發 `end` | 用戶端控制代碼終止，之後 `send` / `end` 拋錯；Host 呼叫 `uplink` 迭代器的 `return()`，未消費項丟棄 |
| 仍開放 | Host 方法拋錯，發 `error` | 同上；用戶端下行以 `RemoteError` 失敗 |
| 用戶端 `dispose` 或 signal 中止 | 任意 | 發 `cancel`；Host `control.abort()`，`cancellableStream` 先關 `uplink`，再調方法迭代器的 `return()`；不發終止幀 |
| socket 關閉 | 任意 | Host 中止全部流並等待 `done`；用戶端每條流以 `RemoteStreamCarrierError` 失敗 |
| `end` 之後又收到 `item` | 任意 | 該流以 `gateway/protocol` 錯誤幀失敗並中止；socket 不關閉 |
| 未知 `streamId` 的 `item` / `end` | 任意 | 忽略，與 `cancel` 相同：Host 結束流並刪除 id 後，用戶端在途的上行幀屬正常現象，不能連累同一 socket 上的其他流 |

### 取消等待的生命週期

`cancellableStream`、`UplinkDecoder.next()` 和 Client 上行泵各自為單次讀取建立取消或停止 Promise。讀取完成後，`Promise.race` 不會移除另一輸入上的 reaction：複用流級未完成 Promise 會保留已完成的競爭及其讀取結果，直到該 Promise 完成或不可達。單次讀取的 Promise 使取消狀態的保留量不隨已交付項數增長。

Host 下行在每次讀取後清除目前拒絕回呼，並在再次讀取前檢查取消狀態。上行解碼器只保留尚未完成的讀取：取消時拒絕這些讀取，正常關閉則以 `done` 喚醒全部讀取，包括重疊的讀取。Client 泵在每次讀取後移除停止 Promise，停止後不再發起讀取。源迭代器的釋放仍由原有所有者負責；Host 仍先關閉上行，再返回方法迭代器。

### 順序保證

同一條 socket 上的幀全序到達：一條邏輯流的 `open`、`item`…、`end` 按傳送順序到達 Host；上行項進入 `uplink()` 的順序就是 `send` 的順序。上行與下行之間沒有跨方向順序保證；需要請求應答配對的協定自帶序號。

### 背壓

WebSocket 沒有 HTTP/2 那樣的每流視窗，一個連線一條序列寫鏈，慢流會拖住同連線的其他流。下行的這一性質不變。上行：

**有界 inbox 加整流失敗。** Host 每條邏輯流的 inbox 按幀的 UTF-8 位元組計量，上限為閘道設定 `streamInboxBytes`（預設 262144），對所有流生效。超限時整條邏輯流以 `gateway/uplink-overflow` 失敗：下行一起斷，向用戶端發 `error` 幀，`uplink()` 迭代器以同一錯誤結束。資料不丟棄；一個方法不讀上行而用戶端持續發，是用法錯誤，由失敗顯式暴露。

credit 幀留待需要持續大流量上行的消費者出現時再加；inbox 上限就是初始授信，加法是增量。

### 安全與驗證

| 項 | 規則 |
| --- | --- |
| 授權驗證 | 與今天相同：升級時 `connection.requestRejection(req)`；開啟時描述符與查詢參數驗證。上行項屬於一條已授權驗證的流，不重複授權驗證 |
| Peer | 升級時接納為一個 `PeerScope`，該 socket 上所有流的 `invocation.peer` 都是它 |
| 項驗證 | 有 uplink codec 時逐項嚴格解碼，失敗即整條流以既有的 `gateway/input-invalid` 失敗（details `{ endpoint, field: 'uplink' }`）；無 codec 時只做 JSON 安全驗證 |
| 幀大小 | 單幀沿用 `ws` 的 `maxPayload`；inbox 上限限制累計量 |

### 程序內與 worker 載體

| 載體 | 改為 |
| --- | --- |
| `ClientConnectionRpc.open`（`packages/client/connection/src/rpc.ts:245-250`）與 `RpcStreamOpen`（`client/rpc.ts:21-25`） | 追加可選 `uplink?: AsyncIterable<unknown>`；程序內沒有幀也沒有 inbox，呼叫方迭代器直接作為 `uplink()` 的源，背壓就是迭代器本身的節拍 |
| worker 隧道（`packages/experimental/webworker-runtime`） | 頁面新增 `stream-uplink-item` / `stream-uplink-end` 幀；`serveStream` 把它們組裝成 `uplink` 交給 `seams.openStream`。同源可信邊界：沒有 inbox 上限，`end` 之後的項丟棄 |
| `remote-mock`（`packages/test-support/remote-mock`） | `StreamHandle.uplink: AsyncIterable<unknown>`；`rpc.open` 直接傳遞 |

程序內載體的 `peer` 缺席即操作者。

### 與 `$events` 的關係

`$events` 是一條保留端點的流；有了上行幀，waterfall 的回答可以成為同一 `streamId` 上的上行項，`clientId` 因 `streamId` 已標識代際而多餘，`$events/result` 與 `index.ts:527-529` 的競態一起消失。不在本 Note 範圍，見「後續」。

## 型別與線路定義

### typert protocol（`packages/typert/protocol/src`）

```text
// types.ts
export type RemoteStream<Out, In = never> = AsyncIterable<Out> & { readonly [STREAM_UPLINK]?: In }
export type PeerId = Branded<'PeerId'>
export interface PeerScope { readonly id: PeerId; readonly ctx: Context; dispose(): Promise<void> }
export interface RemoteInvocation { … }              // see Host face
declare module '@deepseek-ai/cordis' { interface Context { readonly invocation: RemoteInvocation | undefined } }

export interface InvocationDescriptor {
  // existing fields unchanged; mode still has only 'stream'
  readonly mode?: 'stream'
  /** Uplink item codec, generated from In of the return type RemoteStream<Out, In>; absent when In is never. */
  readonly uplink?: { readonly codec: TypertCodec }
  readonly cancellation?: { readonly parameter: 'signal' }
  readonly result: TypertCodec
}
```

`Remote` 修飾器、`RemoteMethodOptions`、`RemoteMethodMarker` 恢復為只認 `mode: 'stream'`。

### typert generator（`packages/typert/generator/src`）

- `model.ts`：`InvocationModel.uplink?: { boundary: RemoteBoundaryModel }`。
- `analyzer.ts` `remoteResultType`：對 `mode: 'stream'`，接受的返回型別包裝器為 `Iterable<Out>`、`AsyncIterable<Out>`、`RemoteStream<Out, In?>`。識別 `RemoteStream` 的方式與識別標準庫 `AsyncIterable` 相同：符號名加宣告所在檔案（`@deepseek-ai/dsh-typert-protocol` 的 `types.ts`）。第一個型別參數是下行項，第二個存在且不是 `never` 時生成 `uplink` boundary，鍵名 `${endpoint}:uplink`。
- `emitter.ts`：描述符字面量輸出 `uplink: { codec }`；生成的 Client 簽名返回 `RemoteStreamHandle<Out, In>`。
- 參數迴圈不再識別任何名為 `uplink` 的參數。

### 兩個名字，一個入口

Host 方法用 `RemoteStream<Out, In>` 宣告一條流；Client 持有的是 `RemoteStreamHandle<Out, In>`。兩者都從 `@deepseek-ai/dsh-typert-protocol` 主入口匯出，控制代碼介面沒有任何 Host 依賴。生成的 Client 契約把返回型別寫成 `RemoteStreamHandle<Out, In>`。一個名字只有一個含義：Client 程式碼從主入口拿到的 `RemoteStream` 永遠是宣告型別，不會與控制代碼混淆。

### 閘道 Host（`packages/api/gateway/src`）

```text
// types.ts
export interface InvokeRemoteRequest {
  readonly namespace: string
  readonly method: string
  readonly args: Readonly<Record<string, unknown>>
  /** Uplink items; absent is equivalent to an iterator that ends immediately. */
  readonly uplink?: AsyncIterable<unknown>
  /** The Peer that initiated the call; absent means the operator. */
  readonly peer?: PeerScope
  readonly signal?: AbortSignal
}

export interface TypertGatewayWireStream {
  open: (endpoint: string, payload: unknown, uplink: AsyncIterable<unknown>, peer: PeerScope | undefined, signal: AbortSignal) => Promise<AsyncIterable<unknown>>
  failure: (error: unknown) => RemoteStreamFailure
}

// stream-server.ts
export type RemoteStreamOpener = (
  endpoint: string,
  payload: unknown,
  uplink: AsyncIterable<unknown>,
  peer: PeerScope,
  control: AbortController,
) => Promise<AsyncIterable<unknown>>

// index.ts Config addition
/** Uplink inbox limit per logical stream, in UTF-8 bytes of frames (default 262144). */
readonly streamInboxBytes?: number
```

`prepareInvocation`：

```text
const args = await Promise.all(descriptor.parameters.map(parameter => this.resolveParameter(parameter, request.args, endpoint)))
const signal = request.signal ?? NEVER_ABORTED_SIGNAL
const invocation = new GatewayInvocation(
  { namespace: request.namespace, method: request.method, args: request.args },
  descriptor.service,
  request.peer ?? this.operatorPeer(),
  signal,
  new UplinkDecoder(request.uplink ?? EMPTY_ASYNC_ITERABLE, descriptor.uplink?.codec, endpoint, control),
)
const callReceiver = receiverContext.extend({ invocation }).get(descriptor.service) as object
if (descriptor.cancellation !== undefined) args.push(signal)
```

`GatewayInvocation.uplink()` 第一次呼叫返回解碼器，第二次拋錯。`UplinkDecoder` 是手寫迭代器：有 codec 時逐項 `decode(codec, value, endpoint, 'uplink')`，失敗即 `control.abort(failure)` 並丟擲；無 codec 時只做 `isRemoteJsonValue` 驗證。`cancellableStream` 的 `finally` 先關閉解碼器（`invocation.close()`）再等待方法迭代器的 `return()`，阻塞在 `uplink.next()` 上的方法得以退出。unary 與 stream 的模式分支恢復為今天的兩分支。SRC 退回：描述符無 `uplink` codec，`uplink()` 交付 `unknown`。

### 閘道 Host mux（`stream-server.ts`）

```text
interface ActiveStream { readonly control: AbortController; readonly inbox: UplinkInbox; done: Promise<void> }

/** Bounded uplink queue; iterated as the source of uplink(). */
class UplinkInbox implements AsyncIterable<unknown>, AsyncIterator<unknown> {
  constructor(maxBytes: number, onOverflow: (error: RemoteError) => void)
  push(value: unknown, frameBytes: number): void   // push after ended fails the stream with gateway/protocol; overflow calls onOverflow
  end(): void                                        // idempotent
  fail(error: unknown): void                         // ends the iterator with an error on cancel or carrier closure
  next() / return()                                  // hand-written: next races failure, return releases immediately
}
```

`receive(text)` 分派：

```
open   : exists → throw (socket 1008); otherwise create { control, inbox, done } and start the pump
item   : missing → ignore; otherwise inbox.push(value, bytes)
end    : missing → ignore; otherwise inbox.end()
cancel : missing → ignore; otherwise control.abort(new Error('Remote stream cancelled'))
```

`pump` 把 inbox 與該 socket 的 Peer 傳給 opener；`finally` 裡 `inbox.fail(...)`。以 `RemoteError` 為 reason 的中止由 pump 作為 `error` 幀發出（閘道或 mux 發起的失敗）；以普通 `Error` 為 reason 的中止（cancel、socket 關閉）不發終止幀。

### 閘道 Client（`packages/api/gateway/src/client`）

- `prepareInvocation` 不再剝離任何上行參數；位置參數仍是業務參數加可選 `signal`。
- `invokeStream` 返回 `RemoteStreamHandle`：內部持有一個上行佇列，`send` 入隊並由泵發 `item` 幀，`end` 發 `end` 幀，`dispose` 中止代際 signal。下行仍是 `openRemoteStream` 返回的迭代器。
- `RemoteStreamMuxClient.open(endpoint, payload, signal, uplink?)`：在發出 `open` 幀後啟動上行泵，逐項發 `item`，源結束髮 `end`；下行終止或 signal 中止時停泵並呼叫源的 `return()`（不等待，避免鍵盤類生成器卡死）；源拋錯時 `inbox.fail(error)`，下行以該錯誤失敗，`finally` 按既有規則發 `cancel`。泵檢查 `this.socket === socket`，舊代際不往新 socket 上發幀。
- 程序內載體：`connection.rpc.open(channel, endpoint, payload, signal, uplink)`。

## 落點

| 包 | 承載 |
| --- | --- |
| `dsh-typert-protocol`（`types.ts`、`index.ts`） | `RemoteStream`、`RemoteStreamHandle`、`PeerId`、`PeerScope`、`RemoteInvocation`、`ctx.invocation` 宣告合併、`InvocationDescriptor.uplink`；修飾器只認 `mode: 'stream'`；`TypertRemoteService` 建構時註冊 `invocation` accessor |
| `dsh-typert-registry` | 載入驗證 `uplink.codec` 為有效的嚴格 codec |
| `dsh-typert-generator`（`model.ts`、`analyzer.ts`、`emitter.ts`） | `remoteResultType` 識別 `RemoteStream<Out, In>` 並生成 `uplink` boundary；描述符輸出 `uplink: { codec }`；生成的 Client 簽名返回 `RemoteStreamHandle<Out, In>`；參數迴圈只認業務參數與末位 `signal` |
| `dsh-client-connection`（`operator-peer.ts`、`rpc.ts`、`rpc-host.ts`、`index.ts`） | 操作者 `PeerScope`；`connection.operator` 與 `admit`；`/api` 與升級路由經 `admit` 取 Peer；`rpc.open` 的可選 `uplink` |
| `dsh-api-gateway` Host（`stream-protocol.ts`、`stream-server.ts`、`types.ts`、`index.ts`） | `item` / `end` 幀；`UplinkInbox`；`Config.streamInboxBytes`；`GatewayInvocation` 與 `extend({ invocation })`；`UplinkDecoder`；`handleUpgrade(req, socket, head, peer)`；`operatorPeer()` |
| `dsh-api-gateway` Client（`client/index.ts`、`client/stream-client.ts`） | `invokeStream` 返回控制代碼；上行泵由控制代碼的佇列驅動 |
| `dsh-webworker-runtime`、`dsh-remote-mock` | worker 隧道的兩種上行幀與 `serveStream` 組裝；`StreamHandle.uplink`；直接代理返回真控制代碼 |
| 文件 | gateway、api 組、connection、protocol、generator 的 README；`docs/api-gateway`；`docs/subsystems/typert` 的 type-equiv 塊；config 與 Cordis 目錄 |

## 關鍵流程時序

### 開啟、上行、半關閉、下行結束

```
Client caller      mux client              mux server              gateway                 Host method
   │ attach(req)        │                       │                     │                         │
   │───────────────────▶│ open { id, ep, payload } ──────────────────▶│ create inbox            │
   │ s.send(v1)         │ item { id, v1 } ───────────────────────────▶│ inbox.push(v1)          │
   │                    │                       │                     │ prepareInvocation       │
   │                    │                       │                     │ extend({ invocation })  │
   │                    │                       │                     │── method(req, signal) ─▶│
   │                    │                       │                     │                         │ uplink() → v1
   │ s.send(v2)         │ item { id, v2 } ───────────────────────────▶│ inbox.push(v2)          │ → v2
   │ s.end()            │ end { id } ────────────────────────────────▶│ inbox.end()             │ iteration ends
   │◀── yield o1 ───────│◀────────────────────── item { id, o1 } ─────│◀── yield o1 ────────────│
   │◀── ends ───────────│◀────────────────────── end { id } ──────────│◀── method returns ──────│ gateway calls uplink.return()
```

### 用戶端 dispose

```
Client caller      mux client              mux server              gateway                 Host method
   │ s.dispose()        │                       │                     │                         │
   │───────────────────▶│ stop pump; source return() (not awaited)    │                         │
   │◀── iterator ends ──│ cancel { id } ─────────────────────────────▶│ control.abort()         │
   │                    │                       │                     │ cancellableStream: invocation.close() closes uplink
   │                    │                       │                     │ iterator.return() ─────▶│ finally cleanup
   │                    │                       │ no terminal frame   │                         │
```

### inbox 超限

```
Client caller      mux client              mux server                        gateway / Host method
   │ s.send(vN)         │ item { id, vN } ─────▶│ inbox.push: bytes > streamInboxBytes │
   │                    │                       │ onOverflow → control.abort(RemoteError uplink-overflow)
   │                    │                       │                                      │ uplink() ends with that error; method iterator return()
   │◀── throw ──────────│◀──────────────────────│ error { id, uplink-overflow }: the pump sends an error frame because the reason is a RemoteError
```

## 邊界矩陣

| 事件 | opening | running | 上行已 end | 下行已終止 |
| --- | --- | --- | --- | --- |
| 收到 `item` | 入 inbox 緩衝 | 入 inbox | 流以 `gateway/protocol` 失敗 | 忽略 |
| 收到 `end` | inbox.end | inbox.end | 冪等 | 忽略 |
| 收到 `cancel` | abort | abort | abort | 忽略 |
| inbox 超限 | 流以 `uplink-overflow` 失敗 | 同 | 不可能 | 不可能 |
| 解碼失敗 | 不可能 | 流以 `input-invalid` 失敗 | 同 | 不可能 |
| Host 方法結束 | 不可能 | 發 `end`；`uplink.return()` | 發 `end` | 已發 |
| Host 方法拋錯 | 發 `error` | 發 `error`；`uplink.return()` | 發 `error` | 已發 |
| socket 關閉 | abort，等 done | 同 | 同 | 無事 |
| Client `send` | 入隊，open 後發 | 發 | 拋錯 | 拋錯 |
| Client `end` | 記錄，open 後發 | 發 | 冪等 | 忽略 |
| Client 側下行先結束 | 不可能 | 停泵；源 `return()`；不發 `end` | 無事 | 無事 |

## 錯誤碼

| 錯誤碼 | 何時 |
| --- | --- |
| `gateway/input-invalid` | 既有：參數 codec 解碼失敗；新增：上行項解碼失敗 |
| `gateway/uplink-overflow` | 新增：inbox 超過 `streamInboxBytes` |
| `gateway/protocol` | 新增：`end` 之後的 `item` |
| `gateway/cancelled` | 既有：`signal` 中止 |

新碼登記在 `packages/api/gateway/src/remote-error-codes.ts` 與 README 的錯誤碼一節。

## 最小 echo 方法

`packages/api/gateway/tests/echo-stream.host.spec.ts` 讓同一個方法分別穿過 WebSocket 載體與程序內載體：

```text
class EchoService extends TypertRemoteService {
  constructor(ctx: Context) { super(ctx, 'echo', { namespace: 'echo' }) }

  @Remote({ mode: 'stream' })
  async *echo(prefix: string, signal: AbortSignal): RemoteStream<string, string> {
    for await (const item of this.ctx.invocation!.uplink<string>()) {
      signal.throwIfAborted()
      yield `${prefix}${item}`
    }
  }
}

// Client
const stream = remote.echo.echo('> ')
stream.send('a'); stream.send('b'); stream.end()
const replies: string[] = []
for await (const reply of stream) replies.push(reply)   // ['> a', '> b']
```

## 考慮過的替代方案

**三處讀取迴圈共用一個取消控制器。** 每處迴圈已有自己的所有者和不同的關閉行為。單次讀取的 Promise 能限制保留狀態，不需要把這些職責遷入新抽象。

**要求源迭代器自行取消 `next()`。** Gateway 接受任意 iterable，其待處理讀取不一定回應取消或 `return()`。Gateway 仍需獨立於源清理來喚醒自己的等待者。

**獨立的 `mode: 'duplex'` 加一個與 `signal` 同級的保留參數 `uplink: AsyncIterable<In>`。** 每一處都是特殊邏輯：analyzer 要認第二個保留參數及其位置規則，生成簽名多一個參數，載入期要驗證 `duplex ⟺ uplink`，mux 不知道方法模式所以閘道要替 `'stream'` 方法拒絕上行幀。雙工是傳輸層流的固有性質，不是方法的一種模式：載體本來就有 `streamId`、`open`、`cancel`，上行只是再加兩種幀，任何流都能收，不用就不發。

**用裝飾器選項宣告上行型別，`@Remote({ mode: 'stream', uplink: 'JobInputFrame' })`。** 字串引用型別名不受編譯器約束，重新命名即斷。返回型別別名把兩個型別寫在同一個編譯器可見的位置。

**執行時傳 schema：`uplink(schema)`。** 不經生成器，用戶端失去型別投影，與"每項嚴格 codec"的體系分裂。codec 的來源仍是生成器，方法裡的泛型只是斷言。

**analyzer 交叉驗證 `uplink<In>()` 手填的泛型與返回型別一致。** 業務特化的驗證，寫錯後果由呼叫方承擔，與儲存庫其他處手填斷言一致；不加。

**傳輸層控制代碼帶重開、遊標、`reopen` 掛鉤。** 斷線重開是上層協定的事：job 的續傳是 `opened` 幀帶 `from`、用戶端記住 `next` 再調一次；snapshot 與 journal 各有自己的錨點與分類。傳輸層只認一個代際。

**用戶端 `send` 放在生成方法返回的 `AsyncIterable` 上。** `AsyncIterable` 上掛方法不常規；控制代碼型別 `RemoteStreamHandle` 顯式擴充功能它。

**照搬 Access 機制。** 存取控制是業務語義，`vouch` 與 `remote/invoke` waterfall 為它服務；本 Note 只需要"這條流是誰的"，`PeerScope` 就夠。

**繼續用 unary RPC 做上行。** 每次上行一次 HTTP 往返、一次授權驗證、一次查詢；兩條載體沒有順序關係，只能靠用戶端序列化；沒有 EOF；取消不覆蓋兩半；每個功能各造一套關聯鍵。

**原生 HTTP 請求體流。** 一次性請求體，與下行流沒有關聯，不經 Typert 描述符，瀏覽器對全雙工 fetch 的支援不可依賴。

**每條雙工流一個獨立 WebSocket。** 失去與現有下行流共享的授權驗證、心跳與多路複用，每個功能要自己管一條 socket 的生命週期。

**WebTransport 或 HTTP/2 雙向流。** 有每流流控，但瀏覽器與 Node 兩側的支援、代理穿透與 Electron 載體都不成熟；在現有 mux 上加兩種幀比換傳輸層便宜幾個量級。

## 後果

- **買到的**：一條流兩個方向，終端按鍵、審批迴答、後臺任務 stdin 這類互動式情境不再各造一套"一條流加一個 unary"；Host 方法知道呼叫者；上行型別與下行型別在返回型別裡一處宣告，上行項來自瀏覽器，在 Host 逐項嚴格驗證，下行項是 Host 自產的型別值，直接直接傳遞；既有 `AsyncIterable<Out>` 方法與 unary 方法的生成物與線路幀完全不變。
- **`this.ctx.invocation` 在非 Remote 呼叫下是 `undefined`**，方法讀它要處理可選；一個只被程序內直接呼叫的服務方法讀到 `undefined` 是正確行為。
- **inbox 上限對所有流生效**：一個不讀上行的方法收到大量上行幀會整流失敗。這是刻意的顯式失敗，README 記明。
- **Peer 只有操作者一個**，`admit` 是唯一的接納點；第一個需要第二個 Peer 的消費者要在 `dsh-client-connection` 加上開啟、關聯與事件。
- **上行與下行之間沒有跨方向順序保證**；需要請求應答配對的協定自帶序號。
- **上層協定尚未透出 `send`**：`$stream`、snapshot、journal 的消費者今天只用下行；它們拿到的物件已經是控制代碼。
- **worker 隧道與 WebSocket 載體行為不同**：沒有 inbox 上限，`end` 之後的項丟棄，因為頁面到 worker 是同源可信邊界。

## 測試

`gateway-stream.host.spec.ts` 和 `gateway.client.spec.ts` 中的保留物件案例在流保持開啟時進行全量 GC，再統計存活的迭代結果。生命週期案例覆蓋正常關閉喚醒多個待處理上行讀取、兩次讀取之間的取消、源同步取消後拋錯，以及 Client 傳送期間流結束。

- `packages/api/gateway/tests/echo-stream.host.spec.ts`：同一個 echo 方法分別穿過 WebSocket 載體與程序內載體。
- 閘道 Host：幀解析的精確鍵驗證；`UplinkInbox` 的 opening 緩衝、`end` 後 `item`、超限、未知 `streamId` 忽略、socket 關閉時的收尾；`UplinkDecoder` 有無 codec 兩種交付與解碼失敗中止；`uplink()` 只能取一次；`extend({ invocation })` 檢視與 `peer` 的來源；`cancellableStream` 先關 uplink 再 `return()`。
- 閘道 Client：控制代碼的 `send`（JSON 驗證、open 前入隊、終止後拋錯）、`end` 冪等、`dispose` 驅動 `cancel` 幀並結束後續讀取；泵的三種退出；終止幀到達即停泵。
- typert：analyzer 對 `RemoteStream<Out, In>`、`RemoteStream<Out>`、`never` 與既有 `AsyncIterable<Out>` 的處理；修飾器選項；registry 載入驗證。
- connection：`admit` 的 401、403 與操作者三種結果；操作者經橋與共享處理器到達；隨 connection 釋放。
- remote-mock、worker 隧道：上行直接傳遞；直接代理返回真控制代碼。
- 既有 stream 與 unary 方法的測試不改期望值即透過。

## 後續

- `$stream` / snapshot / journal 把控制代碼的 `send` 透出給上層協定。
- Web 終端：一條 `attach` 流取代 `follow` 加 `write` 加 `resize`，`attachmentId` 退場。
- 雙工 `$events`：waterfall 的回答成為同一 `streamId` 上的上行項，`$events/result` 與 `clientId` 退場。
- credit 幀：等需要持續大流量上行的消費者出現；inbox 上限就是初始授信。
- `streamInboxBytes` 預設值 262144 對鍵盤與 stdin 遠超需要；若第一個消費者是終端貼上，可能與 `terminal-controller` 的 `maxInputBytes` 對齊。
- Host 發起的半關閉幀（Host 不再讀上行但繼續寫下行）：沒有消費者，不加。
- unary 方法的 `uplink()`：能讀到方法執行期間到達的項，語義成立但用處存疑；允許，README 註明。

## 相關

- [Remote 事件投遞](2026-08-10-remote-event-delivery.zh.md)：`$events/result` 的 unary 回答路徑；「後續」裡的雙工 `$events` 落實後部分取代它。
- [工作階段歷史與事件傳輸](2026-08-18-session-history-and-event-transport.zh.md)：`$stream()` 監督器與其上的 journal / snapshot 協定，本 Note 不改它們。
- [Web 側邊欄終端](../feature/2026-09-09-web-sidebar-terminal.zh.md)：終端按鍵的 unary `write` 與 `attachmentId`；「後續」裡的 `attach` 流落實後取代它。
