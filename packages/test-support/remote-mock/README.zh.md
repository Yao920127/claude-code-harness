---
description: "Typert Remote 流量的端點具名 mock：一元應答與流腳本的表、活流控制、日誌與 Connection 載體面，供測試作者在沒有 Host 的情況下啟動真實瀏覽器用戶端。"
kind: "package-library"
---

# @deepseek-ai/dsh-remote-mock

[English](README.md) | 中文

## 概述

`dsh-remote-mock` 讓測試透過 `mock.remote.<namespace>.<method>`，使用原生 Vitest mock 方法設定 Host 回應。同一組函式應答直接呼叫與真實 Connection 流量；可複用的表提供預設回應，顯式宣告的流支援測試驅動的推幀與取消。缺少回應時呼叫失敗，`assertNoUnmatched()` 會在收尾時再次報告。本包無需業務 Host 即可在 Node 或瀏覽器頁面中執行，不匯入 DOM、React 或 Node 模組，只從 `devDependencies` 消費。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 何時使用

當測試要啟動與 `ctx.remote` 對話的真實用戶端外掛、並想按端點名腳本化 Host 側時使用它：整體用戶端測試把 `mock.rpc` 繫結到各自的 Connection 實例，單元測試也可以直接呼叫 `mock.remote`、`dispatch` 或 `open`。端點是 Gateway 的 wire 名（`session/page`、`settings/describe`）；`args` 是呼叫方的位置參數列表，末尾的 `AbortSignal` 已剝掉；值就是測試登記的東西，原樣應答。唯一的宣告是端點是一元（`unary`）還是流（`stream`）。

<a id="remote-proxy"></a>
### 使用 Remote Proxy

`mock.remote` 無需方法清單或領域專屬 Helper 即可提供每個名稱空間和方法。每個存取過的端點使用快取的原生 Vitest mock；`@vitest/spy.fn` 就是 `vi.fn` 背後的實作，也能在沒有 Vitest runner 的瀏覽器頁面中執行。同一個 mock 應答直接呼叫與 Connection 流量，因此回傳值覆蓋和呼叫斷言觀察的是用戶端實際呼叫的函式：

```text
const mock = RemoteMock.create().load(remoteDefaultResponses)
mock.remote.settings.describe.mockResolvedValue(ok({
  writable: true, hasDocument: false, namespaces: [],
}))
mock.remote.settings.mutate.mockResolvedValueOnce(ok(updatedNamespace))
// After the client writes:
expect(mock.remote.settings.mutate).toHaveBeenCalledWith('locale', operations, revision)
```

使用 `mockResolvedValue` 設定持續回應，使用 `mockResolvedValueOnce` 或 `mockReturnValueOnce` 排隊設定回應，使用 `mockImplementation` 按參數決定行為。原生佇列按登記順序消費回應，耗盡後由 mock 的目前實作應答；初始實作讀取已登記的預設回應。`mockClear()` 保留回應與佇列；`mockReset()` 清除覆蓋並恢復初始實作，由它讀取最新預設回應。若未設定預設回應，排隊回應耗盡後仍會失敗，包括可能同步拋錯的直接呼叫。

只有顯式 `stream()` 或回應表中的流宣告才選擇流方法；其餘均使用一元 mock。存取方法不會憑空建構成功的業務結果。儲存方法引用前先宣告流模式：每個端點/模式擁有各自的 mock。名稱空間和方法的 `then` 探測及 symbol 讀取均無副作用。

`MockedRemote` 使用 Vitest 的深層 mock 型別轉換，覆蓋完整生成的 `TypertRemoteNamespaceMap`。非空對映保留名稱空間與方法名、參數、回傳值和原生 spy 型別。對映為空時只有這個測試 Proxy 變成 `any`，允許任意名稱空間和方法；它不增補或弱化生產 Remote 宣告。不需要複製方法簽名、抑制可選生成模組錯誤或開啟編譯器級全域 Flag。交付 Remote/mock 改動前執行 `pnpm run typecheck`，生成並檢查真實 Client 型別；宣告缺失、陳舊或不完整時先重新建置。無建置測試透過或推斷為 `any` 都不是嚴格型別證據。

### 登記預設回應

`load(table)` 安裝可複用的 `unary` 值或 handler、`stream` 腳本以及無腳本的 `streams` 宣告。`unary(endpoint, value)` 與 `unary(endpoint, fn)` 登記單個預設回應；handler 接收呼叫方的位置參數，並使用現有請求型別。每個端點僅儲存最新預設回應，包括顯式 `undefined`；更新預設回應不會清除原生覆蓋。`ok(value)` 建構 `{ ok: true, value }`；失敗使用 `{ ok: false, error: { code, message, details } }`。有狀態 handler、promise 與原生佇列均由各測試獨立持有：

```text
const initial = { writable: true, hasDocument: false, namespaces: [] }
const mock = RemoteMock.create().load({
  unary: { 'settings/describe': ok(initial) },
})
mock.remote.settings.describe.mockResolvedValueOnce(ok({ ...initial, hasDocument: true }))
```

### 駕馭流

流腳本是一個接收開啟時的 `args` 與 `StreamHandle`（`push`、`end`、`fail(error)`、`signal`）的函式；腳本返回後流保持開啟，直到控制代碼結束或失敗。`frames(items)` 建構吐完即結束的腳本，`openStream(initial)` 建構吐完後保持開啟的腳本。`mock.streams` 控制用戶端目前開啟著的流，可按開啟時的參數過濾；`opened(endpoint, count)` 在該端點被開啟達到該次數時 resolve，`drained(endpoint)` 在每條匹配流的消費方都拉完了迄今推入的全部內容時 resolve——開啟的流要其消費方再次等待，已定局的流要佇列已空（拉完指從佇列取走；只有在讀迴圈內處理項的消費方才等於處理完）：

```text
mock.stream('session/follow', openStream([snapshotFrame]))
await mock.streams.opened('session/follow', 1)
mock.streams.push('session/follow', eventFrame, ([request]) => (request as { sessionId: string }).sessionId === SID)
mock.streams.fail('session/follow', new Error('gone'))
await mock.streams.drained('session/follow')
```

失敗的流讓消費方的下一次讀取以給定的 `Error` reject。消費方取消（開啟時的 signal 或 iterator 提前 `return()`）會中止 `StreamHandle.signal`、結束迭代而不拋錯，並把該流記為 `cancelled`。`StreamHandle.uplink` 是腳本讀到的 Client 上行：經 `rpc.open` 開啟時它是載體傳入的 iterable；直接呼叫 `mock.remote.<namespace>.<method>(...)` 時它由返回的控制代碼喂入——該控制代碼就是生成方法返回的 `RemoteStreamHandle`（迭代它讀下行，`send()` 與 `end()` 喂上行，`dispose()` 取消流）；`send()` 像真實控制代碼一樣拒絕非無損 JSON 項，它擁有的上行在流結束、取消或消費方離開時關閉，之後的 `send()` 拋錯。mock 函式只以方法自己的參數被呼叫，上行不會出現在呼叫斷言或記錄的 args 裡。

替代生成流方法的假實作返回生成方法所返回的 `RemoteStreamHandle`。`streamHandle(source)` 把一個 `AsyncIterable` 標註為該控制代碼，其 `send`、`end`、`dispose` 為空操作；`streamMethod<M>(generator)` 把按方法參數編寫的 async generator 函式提升為方法自己的簽名，供 `vi.fn<M>()` 與 `mockImplementation` 使用。

### 接上用戶端

`mock.rpc` 是 `ClientConnectionRpc` 面。把它作為 `{ transport: { rpc: mock.rpc } }` 傳給 Connection 安裝函式，或讓 `TestClient` 將其繫結到自身實例，每次 Remote 呼叫就會直達 `dispatch`、每條流直達 `open`，中間沒有信封。payload 攜帶 `{ args }`——整機代理發陣列、Gateway 自身端點發一個物件（到達時是一個位置參數）；signal 中止的呼叫以中止原因 reject。`RemoteMock.create()` 登記一條流 `$events`，用 `{ type: 'ready', clientId, host: { home } }`（host 來自 `RemoteMockOptions.host`，預設 `/home/mock`）應答 Gateway 用戶端的開啟並保持開啟——這正是整機能達到 `connected` 的原因；測試可以像任何流一樣覆蓋或讓它失敗。

### 觀察與斷言

`mock.log.calls(endpoint?)` 列出經 `dispatch` 或 `rpc.call` 的一元呼叫（`args`、`seq`、即時 `state` 為 `pending` / `answered` / `failed`，以及作為 `result` 的應答值或丟擲的錯誤），`streams(endpoint?)` 列出腳本流的開啟記錄及其即時 `state` 與 `pushed` 計數，`requests(endpoint?)` 按順序列出呼叫與開啟的首個位置參數（不帶端點時去掉 Gateway 自己帶 `$` 字首的端點），`unmatched()` 列出沒找到規則的請求。原生 `.mock.calls` 還包含直接 Proxy 呼叫；載體的流 mock 會收到末尾的取消訊號。`assertNoUnmatched()` 在收尾時報告漏配。`modeOf(endpoint)` 報告顯式登記；`endpoints()` 還包含存取過的 Proxy 方法，使裝配能夠提供它們的名稱空間。

### 可能出什麼問題

- **請求沒有規則**——`dispatch` reject、`open` 丟擲 `remote-mock: no rule for <endpoint>; registered: …`，日誌記下這次漏配；請登記該端點。
- **payload 不是 `{ args: unknown[] | object }`**——`rpc.call` reject、`rpc.open` 拋 `TypeError`；整機代理發陣列形式、Gateway 自身端點發物件形式，所以問題出在手寫呼叫。
- **同一條流上有第二個並行讀取**——該讀取 reject；Gateway 順序讀取流，因此這指向測試側誤用。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計

`dispatch` 與 `open` 接收端點與位置參數；`rpc` 透過 Connection 的已解碼載體介面暴露同一個核心。每個 mock 獨立持有原生函式及排隊覆蓋；共享表提供預設回應，不複製 handler 或應答物件。每條腳本流擁有自己的佇列、唯一掛起讀取和日誌條目；`end`、`fail`、消費方取消三者中最先發生者定局。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 公開面轉出 |
| [`src/remote-mock.ts`](src/remote-mock.ts) | `RemoteMock`：預設回應、原生 mock、Connection 分發、受控流與缺失回應檢查；`ok` |
| [`src/remote-proxy.ts`](src/remote-proxy.ts) | 名稱空間／方法查詢與生成對映的 mock 型別 |
| [`src/streams.ts`](src/streams.ts) | `frames` / `openStream` 腳本、`streamHandle` / `streamMethod` 假實作標註，以及 `MockStream`（控制代碼 + `AsyncIterable`） |
| [`src/log.ts`](src/log.ts) | 帶共享 `seq` 計數器的日誌 |
| — | 不釋出執行時不變數伴生件；本測試支援庫不擁有任何生產事件流或可變程序狀態，其行為由本包測試覆蓋。 |

</details>

-----

<a id="model-experience"></a>
## 模型體驗

無；本包是瀏覽器側測試基礎設施，無一物到達模型請求。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅程序內載體**——`rpc` 服務同一 realm 中的 Connection 實例；不提供給瀏覽器車道測試用的 HTTP 或 WebSocket 載體。
- **值按引用傳遞**——應答與下行項都未經序列化就到達用戶端，真實線路會拒絕的非 JSON 下行值在這裡原樣透過；只有控制代碼的 `send()` 施加真實的上行驗證。
- **不驗證值**——一元應答必須是呼叫方讀取的結果（`{ ok, value }` 或 `{ ok: false, error }`）；mock 原樣傳遞它，不檢查這些欄位。
- **不做 payload 匹配**——規則只按端點匹配；在 handler 內按業務參數判別。
- **原生流覆蓋自行管理 iterable**——覆蓋返回自有 iterable 時，不參與腳本流日誌、`requests`、`opened`、`drained` 以及 `push` / `end` / `fail`；呼叫方也負責取消。原生呼叫斷言仍然有效。需要這些控制能力的情境應使用已登記的流腳本。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
