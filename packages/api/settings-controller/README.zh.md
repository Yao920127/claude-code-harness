---
description: "settings 與憑證設定介面的 Host Remote owner，涵蓋脫敏讀取、寫入、憑證引用與原生文件開啟。"
kind: "package-reference"
---
# Settings Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-settings-controller` 為瀏覽器設定介面提供生成的 `ctx.remote.settings` 與 `ctx.remote.credentials` namespace。它返回脫敏的 settings 與憑證中繼資料，支援 settings 與憑證寫入而不返回機密值，並在 Host 桌面開啟由提供者持有的 settings 或 Agent preset 位置。提供者缺失時，namespace 仍會註冊，並返回可操作的設定錯誤。

## 目錄

- [使用本包](#use-this-package)
- [設定](#configuration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

請把本包作為 Loader entry 掛載到提供瀏覽器設定的 profile 中。本 entry 不依賴提供者是否存在而註冊兩個 namespace，因此缺少提供者會在呼叫時產生具名設定錯誤。它生成的 descriptor 進入嚴格 Typert 註冊表，而 settings 與憑證 Definition 仍是普通 Cordis 服務，自身不承擔任何 wire 義務。

`describe(refs)` 以請求的名字為鍵返回一份 map，因此設定頁描述其各行攜帶的全部引用時，這些行會一起落定。單次呼叫最多接受 64 個名字，無效名字或空寫入值報告為 `bad-request`，並逐欄位複製每個答案——提供者返回超出 `CredentialInfo` 宣告的內容也無法擴大跨越 wire 的欄位。有效的 `set(ref, value)` 與 `unset(ref)` 呼叫把提供者拒絕報告為 `credential-rejected`，攜帶提供者的訊息，details 中只有該引用。機密值只在這個方向跨越 wire：這裡沒有任何方法會返回它。

`settings.describe()` 返回部署資訊，以及在 `redactSecrets: true` 下讀取的所有 namespace。`settings.update`、`settings.replace` 與 `settings.mutate` 暴露 settings 服務的三種寫入操作，並返回該 namespace 的新脫敏檢視；陳舊寫入使用 `settings-conflict`，其他提供者拒絕使用 `settings-rejected`。

`settings.openSettingsDocument()` 準備提供者持有的文件，並用原生文字編輯器開啟；該方法不接受瀏覽器提供的檔案系統目標。

-----

<a id="configuration"></a>
## 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-settings-controller)是所有受支援欄位及其 JSDoc 的完整來源。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 settings 與憑證設定屬於瀏覽器和 Host 狀態，並且不註冊提示詞、工具或工作階段事件。

#### KV Cache 影響

無直接影響；讀取或寫入這些設定值不會改變已經在途的模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 批次上限固定為 64 個引用，不是可按部署設定的欄位。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。settings 與憑證 seam 負責儲存和更新事件，本包只把它們的方法投影到 wire。
