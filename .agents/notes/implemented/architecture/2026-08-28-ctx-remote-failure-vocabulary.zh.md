# Agent Note: One Remote failure vocabulary for ctx.remote

Status: implemented

[English](2026-08-28-ctx-remote-failure-vocabulary.md) | 中文

## Problem

每個 Remote owner 包各自維護一套失敗面：一個 `XxxErrorDetailsMap` 介面、由它派生的 `XxxError` union，以及一個出口對映函式，把域內錯誤類（`UnknownPresetError`、`PresetMountError`、`SessionTitleInvalidError` 等）翻譯成 wire 失敗值。`@deepseek-ai/dsh-typert-protocol` 同時攜帶兩個失敗類——owner 主動上報用 `TypertRemoteFailure`，lookup resolver 產生的用 `TypertLookupFailure`——而 `@deepseek-ai/dsh-client-connection` 又保留了第二份 typed 檢視 `RpcErrorDetailsMap`，把 `agent-preset-not-found`、`session-not-found` 這類域碼硬編碼進載體層。

於是一個碼同時存在三處：owner 的表、載體的 typed 檢視、以及消費方為窄化而寫的 union 或 cast（`result.error as SessionError`）。新增一個域碼要改三處，跨域轉述一個別人的碼則要把對方的碼複製進自己的表——`SessionErrorDetailsMap` 就收編了 `agent-preset-*`、`subagent-*`、`workspace-not-found` 五個他域碼。

失敗資訊也在兩處被壓平。Gateway 自己的 17 個裝配失敗（未掛載的方法、歧義 endpoint、lookup provider 不匹配、結果未過 codec 等）一律以 `code: 'internal'` 上 wire，client 無法把裝配 bug 與業務拒絕區分開；owner 又出於防禦把無關異常預折成自己的域碼，於是一個真正的 Host bug 會以一個看起來合理的域失敗到達呼叫方。

Host 固定事實同樣繞過了 `ctx.remote`：Host home 取自 `(ctx.get('connection') as ConnectionHandle).generation.getSnapshot()?.host.home`，任何只需要一條固定事實的頁面都得注入載體並理解它的 generation store。

## Decision

`@deepseek-ai/dsh-typert-protocol` 匯出唯一的失敗類 `RemoteError<Code>`：一個真 `Error`，帶只讀 `code` 與 `details`、結構標記 `isDSHRemoteError`，以及標準 `ErrorOptions`（`cause` 只在程序內有效）。碼與 details 的對應關係收進一張 merge-extensible 的 `RemoteErrorDetailsMap`；`RemoteFailure` 是按碼分佈的實例 union，`RemoteResult<T>` 形狀不變。

```text
export class RemoteError<Code extends RemoteErrorCode = RemoteErrorCode> extends Error {
  readonly isDSHRemoteError: true = true
  constructor(readonly code: Code, message: string,
    readonly details: RemoteErrorDetailsMap[Code], options?: ErrorOptions)
}
export type RemoteFailure = { [C in RemoteErrorCode]: RemoteError<C> }[RemoteErrorCode]
export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: RemoteFailure }
```

失敗點直接 `throw new RemoteError(code, message, details)`。域內不再建錯誤類家族，也不再寫出口對映函式；只有「把任意 provider 異常歸類」這一種情境保留一個 `catch`，並在其中 `throw new RemoteError(code, messageOf(error), details, { cause: error })`。程序內仍需消費的既有異常類（`ApiSessionCwdConflict` 等）保留為不匯出的私有類，在出口一行轉成 `RemoteError`。

碼是 `<語義域>/<理由>` 形式的字串：`session/not-found`、`gateway/cancelled`、`workspace/invalid-path`、`agent-preset/locked`。字首與 wire namespace 同風格，讀者從碼本身就能看出它屬於誰，跨域轉述時也不再需要一個別扭的無字首名。

## Code ownership

一個碼只有一個宣告處，落點由「誰生產它」和「宣告對誰可達」共同決定——宣告合併只在增補檔案進入目前 program 時生效，所以正家必須是每個生產者都能看見的包：

- **載體碼**：`gateway/bad-request`、`gateway/cancelled`、`gateway/internal` 由 protocol 宣告，人人可達。
- **Gateway 裝配碼**：17 個 `gateway/*` 由 `packages/api/gateway/src/remote-error-codes.ts` 宣告，details 統一為 `TypertGatewayFaultDetails { endpoint, field? }`；該模組 face-neutral，Host 與 Client 兩面各自 import，因此兩個 program 看到同一批條目。
- **跨包共產**：兩個及以上不同包拋同一個碼時，宣告落到雙方都已依賴的最低層。`session/not-found` 落 `@deepseek-ai/dsh-session`（session-controller 與 workspace-controller 都依賴它），`workspace/not-found` 落 `@deepseek-ai/dsh-workspace`（session-controller 與 workspace-controller 之間沒有依賴邊，能力包是唯一共同下層）。
- **單一生產者**：只有一個包拋的碼落生產者包。`subagent/not-found` 與 `agent-preset/conflict` 因此落 session-controller——全倉只有它拋這兩個碼，subagent 與 agent-presets 的碼錶裡都沒有它們。

共享的是驗證邏輯，不是碼。`session/invalid-time-zone` 與 `subagent/invalid-time-zone` 是兩個域各自宣告、各自丟擲的兩個碼，兩個端點共用 `@deepseek-ai/dsh-util-time` 的 `canonicalClientTimeZone()` 做規範化；client 對這個碼沒有分支語義，拆碼的成本是零，而合成一個碼就會重新制造可達性問題。

## Discrimination by code

判別一律讀 `code`，從不用 `instanceof`。Client 與 Host 是兩個獨立打包的 program，worker 傳輸還會把頁面側再分一次包，因此同一個類會存在多份副本，跨副本的原型鏈身份不成立。機制層用 protocol 的 `remoteErrorOf(value)` 讀結構標記加一個字串 `code`，Gateway client face 另外匯出 `isRemoteFailure(error)` 供消費方在 catch 裡判別；兩者都只看這兩個欄位、不看類——連 `instanceof Error` 都不要求，因為另一個 realm 丟擲的 Error 同樣通不過它。

業務程式碼通常連這兩個函式都不需要：`RemoteResult` 的 `ok: false` 分支已經是型別化的 `RemoteFailure`，`if (result.error.code === 'session/not-found')` 就把 `details` 窄化到該碼的形狀，無需 cast。需要向上拋的站點直接 `throw result.error`——它是真 `Error`，棧與 `message` 都成立。

client 面不建構 `RemoteError`：唯一例外是 Gateway 的 client face 本身，它在 `invoke()` 裡按 wire 資料重建實例、在流邊界把載體 throw 折進同一詞彙。測試替身要建構失敗值時從 `@deepseek-ai/dsh-client-test-runtime` 取 `RemoteError`，而不是讓 client 包值引入 protocol。斷言用 `toMatchObject` 判 code（必要時加 details 欄位）：`RemoteError` 是 `Error`，own key 集合與舊字面量不同，`toEqual` 會失敗。

## Fixed Host facts

`ctx.remote.$host` 暴露兩條固定事實：`home: string | undefined` 與 `isLoopback: boolean`。它是 Client Remote service 上的 getter，讀的是 service 建構期取得的 connection 控制代碼——`home` 來自 generation 快照的 ready frame（ready 之前是 `undefined`），`isLoopback` 來自載體。沒有 store、沒有訂閱、沒有 generation 計數器。

重連後的重新整理走既有訊號：Client Remote 在連上時 emit `connection/reset`，需要重取的消費方監聽它或各域自己的 remote event，而不是讓 `$host` 變成一個可訂閱物件。因此消費方不再注入 `connection`：`@deepseek-ai/dsh-client-connection` 的消費白名單收縮到 hmr、frontend-static、bundle/web-app、session-log-export、webworker-runtime、gateway 與 api-remotes 裝配。

## What the wire carries

envelope 不變：wire 上仍是 `{ code, message, details }` 資料，`RemoteError` 是兩端各自的程序內載體。Host 側 `rpcFailure()` 收斂為兩分支——結構識別出的 `RemoteError` 原樣編碼，其餘折成 `gateway/internal`；載體訊號取消也走同一詞彙（`RemoteInvocationCancelled` 類整體刪除，四個 throw 點改拋 `RemoteError('gateway/cancelled', …)`）。

三條 wire 可見行為隨之確定。Gateway 的 17 個裝配碼按語義上 wire，client 因此能把「方法未掛載」與「業務拒絕」分開處理。owner 不預折無關異常：未歸類的 throw 交給 Gateway 折一次 `gateway/internal`，診斷串保留在 `message` 裡。client 一元呼叫被呼叫方 abort 時答 `gateway/cancelled`，即使本地 throw 搶在 wire 往返之前贏得競爭，也與 Host 會給出的碼一致。

載體層只保留開放的 wire 形狀。`@deepseek-ai/dsh-client-connection` 的 `ConnectionRpcFailure`/`ConnectionRpcResult` 不含任何域碼知識，其 `transportError()` 產出 `gateway/internal`；typed 檢視的正家從此只有 protocol 的 `RemoteFailure`。

## Alternatives considered

**每域一套 `RemoteFault` 錯誤類家族。** 讓每個域（或每個碼）有自己的 `Error` 子類，看起來更 OO，但它把「碼」這一條資訊拆成了類身份加欄位兩處，跨 realm 又只能退回判欄位——於是類身份成為純粹的負擔：每個域要維護子類、匯出它、在文件裡解釋它，而消費方仍然只能判 code。單類加一張碼錶把這份重量換成了一行宣告。

**在呼叫點加 `attempt` / `unwrap` / `remoteFailureOf` 包裝函式。** 包裝能讓呼叫點少寫一個 `if`，但它把 `RemoteResult` 這個 canonical 形狀變成了「先過一層庫函式」，兩種風格會長期並存；`unwrap` 還會把「失敗是正常結果」重新變成異常流，與 Remote 面不 reject 的契約背道而馳。被保留的 `remoteErrorOf` 只服務機制層與測試斷言，業務程式碼拿到的要麼是已型別化的 `result.error`、要麼是自己拋的，不需要它。

**`host/updated` 事件加訂閱式 `$host` store。** 訂閱能在 Host home 變化時自動重新整理，但 home 與 isLoopback 在一條連線內是固定事實，為它引入 store、generation 與訂閱生命週期，等於讓每個只想讀一次的頁面都承擔一套狀態管理。重連是已有訊號（`connection/reset`），業務失效走各域 remote event，固定事實保持普通值讀取。

**把不上 wire 的本地失敗也納入碼錶。** 例如 ui-goal 的 `no-current-goal`：它從不跨程序，納入碼錶會讓共享詞彙混入只有一個 client 包關心的條目，還會誤導讀者以為它有 wire 語義。本地失敗保持各自的本地型別，碼錶只描述 Remote 詞彙。

## Consequences

新增一個域碼是一處 declaration merging 加一個 throw：不再有對映函式、錯誤類、載體 typed 檢視三處聯動。代價是落點需要判斷——正家必須對每個生產者可達，而這條判斷只有在真的出現第二個生產者時才顯現；`workspace/not-found` 就是這樣從 workspace-controller 遷到能力包的，併為此給 `@deepseek-ai/dsh-workspace` 加了一條 type-only 的 protocol 依賴。

碼字串帶字首後，wire 字串整體變化，connection fixture 內嵌的碼、host 與 client 兩側斷言、spec 本地 declare 一次性同步。釋出前階段接受這次一波切；釋出後同樣的改名需要一個相容期。

`details` 的型別由碼決定，因此碼與 details 的搭配錯誤在編譯期就被拒。反面是每個拋點都要給全 details 的必填欄位：protocol 把 `gateway/bad-request` 的 `issues` 設為可選，正是為了讓沒有 codec issues 的業務驗證點仍然只寫 `{}`。

`RemoteError` 是 `Error`，所以它進任何日誌與 `errorChain()` 都保留 `message` 與 `cause`；但 `cause` 只在程序內成立，wire 上只有 `code`、`message`、`details` 三個欄位。跨 realm 的判別永遠讀結構標記，任何新增的傳輸（worker、bundle 分片）都必須把標記或等價的 marker 幀帶過去，否則失敗值會退化為普通 `Error`。

Remote 方法的消費端簽名統一為 `Promise<RemoteResult<T>>`，與[方法呼叫面](2026-08-02-typert-remote-method-calls.zh.md)描述的生成投影一致；一元呼叫的遷移帳本見[一元端點遷移](../../archived/architecture/2026-08-10-unary-apiproxy-remote-migration.md)。
