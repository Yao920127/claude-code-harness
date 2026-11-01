---
description: "面向使用者與維護者的憑證 seam：在不把機密值寫進設定的前提下解析、描述或儲存憑證——引用值與持久化記錄。"
kind: "package-reference"
---

# @deepseek-ai/dsh-credentials

[English](README.md) | 中文

## 概述

`dsh-credentials` 透過讓 settings 與 `cordis.yml` 引用 `DEEPSEEK_API_KEY` 等金鑰名稱，使機密值留在設定之外。它還儲存持久化的按外掛組織的憑證記錄，包括授權 grant 與提供者環境值。輪換後的已儲存金鑰會作用於下一次請求，無需重新啟動或修改設定。設定介面可以報告金鑰或記錄是否已設定、來自哪裡及能否寫入，而不會暴露值。空金鑰值視為不存在，而空記錄仍表示一項有意儲存的憑證。

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

本包是產品中負責儲存與查詢機密值的部分：金鑰只存一次、處處按名引用，並可在任意時刻讀取、檢查或移除。它還儲存持久化的憑證記錄，讓外掛可以為自身 id 儲存、更新或移除它持有的憑證。產品的預設組合已包含憑證儲存；自定義組合只需載入本地儲存包並給出檔案路徑。

### 何時使用

只要設定需要與機密值絕緣，就使用憑證儲存：需要同步、共享或渲染進設定介面的設定檔案，或希望在不改設定的情況下輪換金鑰的團隊。當外掛必須儲存沒有單一環境變數的憑證——登入流程產生的授權 grant，或提供者環境值——並希望設定介面能列出使用者獲得了哪些授權時，請使用記錄。設定介面能顯示某個金鑰或記錄是否已設定、來自哪裡、能否修改——但絕不顯示值本身。如果只需要一個固定的環境變數，直接讀該變數即可，無需儲存。

### 加入你的組合

載入本地儲存包並給出文件路徑：

```yaml
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: /absolute/path/to/.credentials.yaml
```

本地儲存 README 擁有完整設定面；生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-credentials-local)是窮盡式欄位清單。

### 儲存、檢查與移除金鑰

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const ref = credentialRef('DEEPSEEK_API_KEY')          // POSIX shell identifier, branded
const hit = await ctx.credentials.resolve(ref)         // { value, source } | undefined
const info = await ctx.credentials.describe(ref)       // { configured, source?, writable } — never the value
await ctx.credentials.set(ref, 'sk-…')                 // rejects while a read-only source shadows the ref
await ctx.credentials.unset(ref)                       // no-op when absent; same shadowing rule
```

用 `set` 儲存金鑰、用 `unset` 移除、用 `describe` 檢查狀態、在操作需要時用 `resolve` 讀取目前值。`describe` 報告金鑰是否已設定、來自哪裡、能否寫入——它絕不回傳值。

### 儲存、更新與移除記錄

外掛按 `<scope>/<id>` 定址每條記錄——自身註冊名加一個自選 id，例如提供者路由鍵——並讀取、修改或移除它所持有的內容：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const key = credentialKey('llm-pi-ai', 'openai-codex')   // <owner>/<id>, branded
const hit = await ctx.credentials.readRecord(key)        // CredentialRecord | undefined
await ctx.credentials.describeRecord(key)                // { configured, kind?, writable } — never the value
await ctx.credentials.listRecords()                      // [{ key, kind }] — never values
await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { token: '…' } }))
await ctx.credentials.deleteRecord(key)                  // no-op when absent
```

`modifyRecord` 是唯一寫路徑：它讓你的變更函式看到寫入取得獨佔那一刻的記錄，返回 `undefined` 則保持原狀。記錄沒有空值規則——一條既無 key 也無環境值的記錄，陳述的是其擁有者確認了 ambient 認證——設定介面還可以列舉每條記錄，顯示你獲得了哪些授權，並找出已解除安裝外掛留下的記錄。

### 在設定中使用金鑰

settings 分節或 `cordis.yml` 條目按名引用金鑰，而不是包含金鑰本身——例如 LLM（大語言模型）介面卡接受 `apiKeyEnv`：

```yaml
apiKeyEnv: DEEPSEEK_API_KEY
```

需要該金鑰的請求使用它目前儲存的值，因此輪換金鑰會作用於緊隨其後的下一次請求——無需重新啟動，無需改設定。

### 可能出錯的地方

- **啟動環境提供的金鑰無法被覆蓋**——`DEEPSEEK_API_KEY=… dsh`（或 CI 機密、容器 `-e`）在本輪執行中優先，並被報告為只讀；請先在啟動 shell 中清除該變數，再儲存其他值。
- **空值無法儲存**——儲存空字串會被拒絕；請改為移除金鑰。
- **金鑰值絕不會出現在設定介面或診斷資訊中**——介面只顯示金鑰是否已設定、來自哪裡、能否修改；值本身留在儲存中。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋本包背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一條準則，四個推論：

- **設定只攜帶引用，絕不攜帶機密。** settings 分節或 `cordis.yml` 條目點名一個憑證；引用背後的值存放在提供者處。設定文件可以放心同步、放心渲染，`describe()` 無需持有值就能回答，輪換機密不觸碰任何設定檔。
- **消費方按操作解析。** 解析是一次按呼叫讀取，無跨操作快取；這次讀取正是熱更新機制。
- **空的儲存值等於不存在。** `resolve` 跳過它，`describe` 報告未設定——空白永遠不會偽裝成已設定的機密。
- **記錄是持久化的，存在即事實。** 記錄按 `<scope>/<id>` 儲存並跨重新啟動保留；空值規則不適用，因此一條既無 key 也無環境值的 `api-key` 記錄是有意陳述，而不是空白。
- **監聽器失敗受到隔離。** `notifyUpdated` 扇出 `credentials/reference-updated`，保證每個監聽器都會執行；同步丟擲與非同步拒絕都會被記錄，不改變已提交操作的結果，`INVARIANT` 編碼的失敗除外——它們在所有監聽器執行完畢後重新丟擲。

### credentials/reference-updated 事件

`credentials/reference-updated (ref)` 在提供者管理的來源發生已提交變更後觸發——`set`、`unset` 或在儲存中觀察到的外部編輯。程序環境變數的變化不可觀測，永不觸發。消費方不需要該事件（它們按操作重新解析）；它服務於設定介面重新整理「已設定」徽標。

`credentials/record-updated (key)` 在儲存記錄發生已提交變更後觸發——一次確實寫入的 `modifyRecord`、一次確實移除的 `deleteRecord`，或在儲存中觀察到的外部編輯。它保持獨立事件，因為兩個鍵文法互斥：一個監聽器若在同一事件上同時收到兩個空間，將無法分辨主體屬於哪一邊。

### 記錄寫入與讀取路徑

`modifyRecord` 是唯一寫路徑，因為正確的寫入依賴目前值：重新整理 token 是「讀—決定—替換」，變更函式看到的是寫入取得獨佔那一刻的記錄——返回 `undefined` 則保持原狀。獨佔在支援它的底層儲存上跨程序成立，這正是防止兩個程序同時輪換一個 refresh token、丟掉先寫那一個的機制。讀取與引用一側對稱，但絕不分層：沒有任何東西能遮蔽記錄，`grant` 的 payload 會原樣返回給其擁有者，因為只有擁有它的外掛能解釋它。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：`credentialRef`/`credentialKey` 品牌、`ResolvedCredential`/`CredentialRecordInfo`、覆蓋兩個鍵空間的抽象提供者、帶失敗隔離的扇出 |
| [`src/types.ts`](src/types.ts) | 用戶端安全型別面：`CredentialRef` 與 `CredentialKey` 品牌、儲存記錄聯合型別、`CredentialInfo` 引用檢視、`credentials/reference-updated` 與 `credentials/record-updated` 事件宣告 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：`credentials/reference-updated` 只在憑證服務存活時觸發 |

### 用戶端安全型別

`./types` 子路徑出口把事件宣告與其點名的 `CredentialRef`、`CredentialKey` 品牌、儲存記錄聯合型別，以及設定介面讀取的 `CredentialInfo` 引用檢視放在一起，包根繼續 re-export 它們。於是 Host 編譯面之外的消費方讀到的正是 Host 發射的那一份簽名，而不必再寫一遍。

### 生命週期

服務是提供者註冊的 Cordis `Service`：釋放掛載 fiber 會移除 `ctx.credentials`。不變式伴生外掛檢查 `credentials/reference-updated` 絕不在服務未存活時觸發——釋放後仍有發射意味著提供者把工作洩漏到了 teardown 完全停穩之後。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享子系統詞彙逐步進入隨附儲存與能力架構。

- [憑證子系統參考](../../../docs/subsystems/credentials.zh.md)——`CredentialRef`/`CredentialKey`、按操作解析、對 UI 安全的資訊、提供者層與生成的 Cordis 介面面。
- [本地憑證儲存](../credentials-local/README.zh.md)——預設本機儲存：金鑰與記錄存放在哪裡、環境層如何排序。
- [能力 seam](../../../docs/capability-seams.zh.md)——本包遵循的 Service Definition / Service Provider / Consumer 拆分。

-----

<a id="model-experience"></a>
## 模型體驗

經由消費方介面卡間接生效：介面卡解析每個憑證引用，並擁有值所授權的全部模型可見用途。

#### KV Cache 影響

無直接失效；解析出的值絕不進入請求字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適或需要特別注意。它們是目前包約束，不是任務積壓。

- **引用不提供列舉**——seam 只回答被問到的引用；設定介面從 settings schema 得知引用集合，對這一半做 `list()` 沒有目前消費方。記錄則可以列舉，因為沒有可用於發現記錄的 schema。
- **引用限定為環境變數形狀**——單一扁平的 POSIX 識別符號名稱空間，因為引用同時就是它藉以解析的環境變數名。記錄使用更豐富的 `<owner>/<id>` 定址。
- **程序環境變化不可見**——無法為啟動 shell 中改變的變數發出通知；介面只能在自身導航時重新讀取 `describe()`。
- **記錄的擁有者就是它的 scope，而沒有任何環節核驗該 scope 是否已掛載**——seam 存下被交予的內容，並報告它存了什麼；識別遺留記錄需要呼叫方將 `listRecords()` 的結果與擁有該 scope 的註冊表關聯起來，seam 自身沒有可供核對的註冊表。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包程式碼為準。

該 seam 的介面為 keyring、輔助命令與 KMS 後端提供者預留了擴充功能空間；遠端設定提供者永遠不必攜帶機密。目前沒有任何一種隨附，也沒有目前消費方需要它們。

</details>
