---
description: "面向使用者與維護者的授權 flow 註冊表：取得設定無法提供的憑證，因為拿到它需要與人對話。"
kind: "package-reference"
---

# @deepseek-ai/dsh-authorization

[English](README.md) | 中文

## 概述

`dsh-authorization` 讓設定 UI 或其他呼叫方透過人引導的登入、輸入碼或回答問題來取得憑證。每次嘗試只把 notice 與 prompt 傳送到發起它的介面。只有新憑證已儲存時，它才報告 `authorized`；拒絕或撤銷會報告 `cancelled`，而故障仍作為錯誤。當憑證無法透過設定提供時選擇它。它需要憑證儲存和一個定義可用授權方法的整合；本包自身不提供特定提供者的授權方法。

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

本包是產品中負責取得「必須由人交出來」的憑證的部分：外掛註冊一個知道如何取得自己那份憑證的 flow，任何介面都能發起嘗試並向人展示該做什麼。常用路徑是顯式的——為你外掛持有的每個憑證註冊一個 flow，然後從人正看著的那個介面發起嘗試。

### 何時使用

只要憑證只能透過與人對話獲得——OAuth 式登入、一次性碼、選一個帳號——且無法存入設定，就使用它。如果憑證是部署方可以提供的一個固定金鑰，請改用憑證 seam 儲存它。無頭或 ACP（Agent Client Protocol）組合也可以安全掛載本包：它本身不提供任何 flow，因此除非外掛註冊了 flow，否則不會要求人登入。

### 註冊 flow

你的外掛為它持有的每個憑證宣告一個 flow，以該 flow 寫入的 `<scope>/<id>` 憑證記錄為鍵——scope 點名你的外掛，id 點名它擁有的一條憑證：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context
declare const exchangeCode: (code: string, signal: AbortSignal) => Promise<{ token: string }>

const key = credentialKey('llm-pi-ai', 'openai-codex') // <scope>/<id> — your plugin / this credential

const dispose = ctx.authorization.registerFlow({
  key,
  label: 'ChatGPT (Codex)',
  methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'Paste a key' }],
  async run(session: AuthorizationSession) {
    session.notify({ message: 'Continue in your browser', url: 'https://auth.example/start' })
    const code = await session.prompt({ kind: 'text', message: 'Paste the code' })
    const { token } = await exchangeCode(code, session.signal)
    await ctx.credentials.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: { token } }))
  },
})

ctx.authorization.list()          // every registered flow, with inFlight
ctx.authorization.describe(key)   // the entry above, or undefined
dispose()                         // unregister; withdraws any running attempt
```

flow 宣告它寫入的憑證記錄、面向使用者的標籤以及它提供的登入方法，最優先者在前。`run()` 透過工作階段與人對話——單向 notice 與 flow 無法自行回答的問題——並且必須在返回前透過 `ctx.credentials` 提交記錄：seam 會拒絕未提交就返回的 flow。`list()` 與 `describe()` 讓介面展示可授權的內容以及是否有嘗試在執行；`dispose()` 登出該 flow 並撤銷仍在執行中的嘗試。

### 發起一次嘗試

每個憑證同時只允許一次嘗試。互動隨請求傳入而非存放在註冊表中，因此提問恰好抵達發問的那個頁面；無頭呼叫方傳入一個直接拒絕的互動實作。當記錄在嘗試期間被提交併被觀察到時，`begin()` 報告 `{ status: 'authorized' }`；當人拒絕或呼叫方撤銷時，報告 `{ status: 'cancelled' }`。`cancel(key)` 從第二次呼叫撤銷正在執行的嘗試，服務於那種用第二次呼叫來回應「取消」按鈕、卻不持有第一次呼叫 signal 的請求/回應式傳輸。

### 可能出錯的地方

- **沒有 flow 的憑證是惰性的**——對沒有任何 flow 認領的鍵呼叫 `begin()` 會丟擲 `NO_FLOW`；被解除安裝外掛遺留的記錄可以刪除，但無法重新授權。
- **每個憑證同時只允許一次嘗試**——已有嘗試在執行時再次 `begin()` 會丟擲 `ALREADY_IN_FLIGHT`；entry 上的 `inFlight` 讓介面預先停用按鈕。
- **未提交就返回的 flow 會被拒絕**——丟擲 `NOT_COMMITTED`，因此 `authorized` 永遠意味著記錄真的已儲存。
- **點名 flow 未提供的方法會丟擲 `UNKNOWN_METHOD`**——不點名則執行 flow 的第一個方法。
- **「不」是一種結果，不是故障**——被拒絕的 prompt 讓嘗試以 `cancelled` 結算，與撤銷的 signal 完全一致；其餘任何失敗都以丟擲的錯誤抵達呼叫方。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋本 seam 背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **seam 擁有對話，從不擁有協定。** 知道如何取得自己那份憑證的外掛，以它寫入的記錄為鍵註冊一個 flow；第二種授權協定以另一個 flow 的形式到來，而不是另一個 seam，能渲染一個 flow 的介面就能渲染全部 flow。
- **寫入由 flow 擁有。** `run()` 返回即表示記錄已透過 `ctx.credentials` 提交；seam 核實的是它在嘗試期間觀察到的提交——只看記錄存在與否，會讓重新授權把陳舊記錄冒充成新鮮的——並拒絕未提交就返回的 flow。讓提交發生在 flow 內部，才能使一個透過自有儲存介面卡持久化的庫保持為唯一寫入方，而不是把憑證複製出來再寫第二遍。
- **互動隨請求傳入，而非註冊表。** 發起授權的一方才是能與人對話的一方，因此提問恰好抵達發問的那個介面，無頭呼叫方則傳入一個直接拒絕的互動實作。這樣既不存在「環境提供者缺席」的問題，也不會有某個提問該歸兩個已開啟頁面中哪一個的疑問。
- **人的「不」是一種結果，不是故障。** 選擇拒絕的互動實作以 `AuthorizationDeclinedError` 拒絕其 prompt，嘗試以 `cancelled` 結算，與撤銷的 signal 完全一致；其餘任何 prompt 拒絕仍是抵達呼叫方的 flow 故障。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：flow 註冊表、每鍵單嘗試生命週期、互動路由、提交確認 |
| [`src/types.ts`](src/types.ts) | 跨程序安全的詞彙：方法、notice、prompt、結果、entry |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：`authorization/settled` 點名的鍵必已釋放 |

### 生命週期

每個鍵同時只允許一次嘗試。`begin()` 驗證鍵與方法、拒絕繁忙鍵的第二次嘗試，並用一個 `AuthorizationSession` 執行 flow——它攜帶所選方法、取消 signal 以及路由到請求互動的 `notify`/`prompt` 回呼。被撤銷的嘗試會立即結算，即使 flow 從未回應它的 signal——被遺棄的執行任其自行結束，而它若仍設法提交了一條記錄，那也是一條人確實授權過的記錄。鍵在 `authorization/settled` 觸發之前釋放，因此以啟動下一次嘗試來回應的監聽器不會被拒絕；監聽器失敗按憑證 seam 的規則就地遏制。

### 互動詞彙

notice 是單向的，且從不攜帶機密：一條訊息，以及可選的「人需要開啟的頁面」與「需要在該頁面輸入的碼」。prompt 是 flow 無法自行回答的問題——`text`、`secret` 或 `select`——其中 `secret` 與 `text` 的差別僅在呈現方式。prompt 自帶 signal，使得讓手輸碼與瀏覽器回呼賽跑的 flow 可以在嘗試繼續的同時撤下落敗的那個問題；撤銷整次嘗試則用請求的 signal。這套詞彙刻意小於任何單個提供者的詞彙：它描述的是介面必須渲染什麼，因此能渲染一個 flow 的介面就能渲染全部 flow。

### 提交確認

嘗試期間，seam 監聽該 flow 鍵上的 `credentials/record-updated`，`run()` 返回後再重讀 `describeRecord`——確認提交確實發生在當下，因為在重新授權時記錄早已存在，只看存在與否會讓陳舊憑證冒充新鮮授權。未提交就返回的 flow，或刪除記錄而非提交的 flow，會丟擲 `NOT_COMMITTED`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享憑證詞彙逐步進入 flow 寫入的記錄儲存，以及本 seam 背後的決策證據。

- [憑證子系統參考](../../../docs/subsystems/credentials.zh.md)——兩個鍵空間與兩個 seam 的生成 Cordis 介面面。
- [憑證包對映](../README.zh.md)——憑證引用、本地儲存與授權三個包。
- [憑證引用 seam](../credentials/README.zh.md)——每個 flow 都經由它提交的記錄儲存。
- [能力 seam](../../../docs/capability-seams.zh.md)——本 seam 遵循的 Service Definition / Service Provider / Consumer 拆分。
- [憑證記錄與授權 flow](../../../.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.zh.md)——記錄半側與本 seam 背後的理由與決策。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為授權是設定期與人的對話，flow、notice 與 prompt 都不會抵達模型請求。

#### KV Cache 影響

不失效；任何授權狀態都不會進入請求字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適或需要特別注意。它們是目前包約束，不是任務積壓。

- **flow 不可恢復**——一次嘗試只存活於發起它的程序中，因此登入途中重新整理瀏覽器會丟棄它，人需要重來；可持久的嘗試需要一個本 seam 並不具備的儲存。
- **沒有吊銷**——登出即 `ctx.credentials.deleteRecord(key)`，它只遺忘本地記錄而不通知簽發方；需要伺服器端吊銷的提供者沒有可宣告之處。
- **沒有 flow 的鍵是惰性的**——seam 只報告已註冊的內容，因此被解除安裝外掛遺留的記錄可以刪除但無法重新授權；識別這種孤兒記錄由呼叫方負責，與 `listRecords()` 的情況相同。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

上文限制點名的開放方向——可恢復的嘗試、伺服器端吊銷、孤兒記錄發現——每一項落實前都需要各自的設計與儲存。不變式伴生外掛是唯一承重的執行時檢查：結算時鍵必須已釋放，因為卡死的鍵與繁忙的鍵無法區分，只有重新啟動才能釋放它。

</details>

flow 可使用 session.commit(record) 拒絕取消後的寫入。提交一旦獲准，cancel() 會保留執行，直到持久化和流程結束。透過自有憑證介面卡寫入的 flow 仍須負責自身的取消順序。
