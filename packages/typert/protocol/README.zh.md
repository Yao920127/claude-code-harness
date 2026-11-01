---
description: "共享的 Typert Remote 協定：業務包、生成產物、Host Gateway 與 Client API 使用的裝飾器、wire 描述符、編解碼器與提供者約定。"
kind: "package-library"
---

# @deepseek-ai/dsh-typert-protocol

[English](README.md) | 中文

## 概述

藉助 `dsh-typert-protocol`，業務包可以向 Remote 用戶端暴露 Host 方法：用 `@Remote`（作用域接收者用 `@RemoteScope`）標記方法，把服務繫結到 wire 名稱空間，並透過可合併擴充功能的協定對映把 Host 物件與作用域 Context 關聯到 wire identity。生成產物、Host Gateway 與 Client API 消費同一套呼叫描述符、編解碼器與提供者約定。呼叫持有的值把清理責任交給 Gateway，不另增引用計數。本包不註冊任何 Cordis 服務，也不執行 TypeScript 分析。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本包供向 Remote 用戶端暴露 Host 能力的業務包與裝配維護者使用。它是一個宣告庫：標記方法、繫結服務，其餘交給生成的流水線與 Gateway。

### 暴露 Host 方法

業務包用 `@Remote`（當接收者來自作用域 Context 時用 `@RemoteScope(key)`）標記一個公開實例方法，所屬服務要麼繼承 `TypertRemoteService`，要麼透過 `bindTypertRemote()` 宣告 `typertRemote` 繫結：

```text
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export class GoalService extends TypertRemoteService {
  @Remote
  async create(agentId: string, objective: string): Promise<GoalResult> {
    ...
  }
}
```

生成會把方法變為服務名稱空間下的 wire 端點；Client 透過 `ctx.remote` 以型別化方法呼叫它（見 [API Gateway 參考](../../../docs/api-gateway.zh.md)）。方法把 `signal: AbortSignal` 宣告為最後一個參數即可選擇協作式取消——該訊號是注入的，絕不會成為 JSON 參數或查詢欄位。

一元方法可以直接返回 `Uint8Array`，也可以將其放在巢狀物件、陣列、元組、可選欄位、聯合型別和遞迴型別中。生成器提供可選的結果 codec `encode()` 和 `decode()`：編碼僅存取型別可能包含位元組的子樹，解碼則驗證還原後的值；Client 宣告在每個位元組位置使用 `Uint8Array<ArrayBuffer>`，同時保留其他欄位型別。純 JSON 結果不經 Host 位元組識別或 Client 解析直接傳遞。參數、事件與流條目仍僅支援 JSON；不支援執行時物件迴圈。

流方法（`@Remote({ mode: 'stream' })`）返回 `Iterable`、`AsyncIterable` 或 `RemoteStream<Out, In>`。`In` 宣告 Client 可以在同一條邏輯流上回送的項；方法透過 `this.ctx.invocation.uplink<In>()` 讀取它們，描述符攜帶其 codec。`RemoteInvocation` 還給出接收服務 `service`、發起呼叫的 `peer`（連線層接納的一個 `PeerScope`）與載體 `signal`；非 Remote 呼叫派生的 Context 上 `ctx.invocation` 為 `undefined`：樹中第一個 `bindTypertRemote()` 繫結（每個 `TypertRemoteService` 建構函式都會建立一個）在根上註冊該 accessor。生成的 Client 流方法返回 `RemoteStreamHandle<Out, In>`：在下行迭代之外提供 `send`、`end` 與 `dispose` 的控制代碼。上行項在 Host 逐項驗證，因為它們來自瀏覽器；下行項是 Host 方法產出的值，原樣直接傳遞。

### 把 Host 物件與 Context 關聯到 wire identity

複雜的 Host 物件不能直接跨 wire 傳輸。業務包透過可合併擴充功能的 `TypertLookupMap` 與 `TypertContextMap` 宣告關聯。Host Context 介面卡擁有穩定 wire 宣告，並把 wire identity 解析為活躍 Context。Client Context 介面卡需要雙向對映，因為作用域呼叫從 Client Context 發起，而轉發的 Host 事件要在 Client 側解析其顯式 wire identity。Host 組合可以覆蓋其同步或非同步解析器。因策略原因拒絕解析的解析器會丟擲帶有自身錯誤碼的 `RemoteError`，該碼原樣到達呼叫方。

Client Context 解析保持同步。`typertOwnedValue(value, release)` 把不拋異常、冪等的清理交給呼叫 owner；Gateway 在處理器和回覆均結束後呼叫它。借用的 Context 不需要清理包裝層。共享的 `TYPERT_OWNED_VALUE` symbol 與 `isTypertOwnedValue` 識別函式可跨獨立打包的提供者與 Gateway 使用；包裝層自身不會 retain 資源。

### 報告與讀取 Remote 失敗

所有 Remote 失敗都由一個類承載：`RemoteError`，攜帶穩定的 `<domain>/<reason>` 碼，以及按該碼定型的 details。本包宣告通用載體碼（`gateway/bad-request`、`gateway/cancelled`、`gateway/internal`），並擁有 `RemoteErrorDetailsMap`——可合併擴充功能的碼錶，其他每個包都在自己的丟擲點旁擴充功能它：

```text
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'goal/not-found': { readonly goalId: string }
  }
}
throw new RemoteError('goal/not-found', `goal "${id}" does not exist`, { goalId: id })
```

擁有方在失敗點直接丟擲；沒有任何包再寫錯誤類家族或出口對映函式。呼叫方按 `code` 判別——絕不用 `instanceof`——且 `code` 分支無需 cast 即收窄 `details`，因為 `RemoteFailure` 就是 `RemoteError` 實例按碼判別的 union。需要識別跨模組或跨 realm 類副本傳來的失敗時，基礎設施呼叫 `remoteErrorOf(value)`，它讀結構標記而不是原型鏈。

### 在 Client 側接收轉發的 Host 事件

Host 裝配以轉發給消費方的 Cordis 事件擴充功能 `TypertRemoteEventSelection`，從而收窄 `ctx.remote.$on` 的鍵集。`TypertForwardableEvent` 接受無作用域且返回 `void` 的通知，以及最後一個 `next()` 回呼返回事件結果型別的非同步作用域 waterfall（瀑布式事件）。`TypertClientEventListener` 從同一條 `Events` 成員派生 Client listener，並保留 signal、可選和只讀欄位、陣列、回呼與結果型別。`TypertClientRemote` 只公開 `$mount()` 與 `$on()`；事件傳輸仍由 Gateway 私有持有。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋宣告如何保持與編譯器無關，以及每個約定在哪裡執行；程式設計模型已在[使用本包](#use-this-package)中說明。

### 設計理念

本包把嚴格反射留在編譯器中：裝飾器初始化器把最小標記儲存在 Service 原型上的帶版本描述符中。描述符使用穩定的字串屬性名，因此協定包的另一個已安裝副本也能讀取同一組標記。完整的參數、結果、查詢與 schema 反射是 Typert 建置流水線的職責，透過 `InvocationDescriptor` 交付。

### Remote 標記

`@Remote` 與 `@RemoteScope` 排程一個初始化器，把方法名、可選匯出名與呼叫模式追加到原型描述符；`remoteMethods(service)` 驗證其版本，並返回與已存描述符分離、按宣告順序排列的快照，供 Gateway 的原始碼模式退回讀取。標記要求名稱為字串的公開、非靜態實例方法，同一方法上的衝突標記會被拒絕。

### 協定對映與描述符

可合併擴充功能的協定對映在型別系統中保留靜態關聯，執行時提供者則向 `ctx.typert` 註冊解析；對映的名稱與形狀見 [`src/types.ts`](src/types.ts)。`InvocationDescriptor` 是註冊表、Gateway 與 Client Remote 共同消費的共享執行時形式，涵蓋直接與 Context 接收者、JSON 與查詢參數、作用域投影、上行編解碼器、取消與結果編解碼器。

### Wire 標識文法

每個名稱空間、方法、查詢與 Context 段都必須滿足 `isTypertRemoteSegment()`，生成的名字才能原樣跨共享 RPC 載體傳輸。嚴格編解碼器攜帶生成的 schema factory；`src-json` 編解碼器標識約束更弱的原始碼啟動路徑。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 裝飾器、Gateway 繫結、`remoteMethods`、段驗證 |
| [`src/json-value.ts`](src/json-value.ts) | 各載體共享的無損 JSON 驗證 `isRemoteJsonValue` 與 `isRemoteUplinkItem` |
| [`src/remote-error.ts`](src/remote-error.ts) | `RemoteError` 與結構式識別函式 `remoteErrorOf` |
| [`src/types.ts`](src/types.ts) | 協定對映、`RemoteErrorDetailsMap`、`RemoteResult`、`RemoteStream`、`RemoteStreamHandle`、`PeerScope`、`RemoteInvocation`、`InvocationDescriptor`、編解碼器、提供者約定、註冊表介面、`TypertClientRemote` |
| — | 不釋出執行時不變數伴生入口；decorator 只保留私有不可變宣告，binding 也是凍結值，沒有可供交叉核對的獨立事件流。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從宣告逐步進入執行時與呼叫路徑。

- [API Gateway 參考](../../../docs/api-gateway.zh.md)——宣告如何成為實際的 Host 到 Client 呼叫。
- [Typert 子系統參考](../../../docs/subsystems/typert.zh.md)——從協定與 Gateway 型別記錄的字面公共約定。
- [Typert 註冊表](../registry/README.zh.md)——描述符與提供者在執行時存放的位置。
- [Typert 生成器](../generator/README.zh.md)——生成消費方宣告與描述符的包。
- [Remote 呼叫 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)——Remote 呼叫背後的架構與傳輸決策。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為與編譯器無關的 Remote 協定宣告不註冊任何面向模型的內容。

#### KV Cache 影響

無直接影響；宣告的約定只有在裝配將其放入請求時才會觸及請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明宣告能表示什麼；它們是目前包約束，不是任務積壓。

- **裝飾器標記是最小化的**——標記只包含方法名與直接呼叫或 Context 呼叫模式；參數、結果、查詢與 schema 反射需要 Typert 建置流水線。
- **Remote 簽名受限**——裝飾器只接受具有字串名稱的公開、非靜態實例方法，原始碼模式執行無法表示過載、解構、預設參數或剩餘參數簽名。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
