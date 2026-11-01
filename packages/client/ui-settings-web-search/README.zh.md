---
description: "dsh Web 用戶端外掛頁上的搜尋來源設定頁：由哪個提供者回答網頁搜尋，以及它讀取的金鑰。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-web-search

[English](README.md) | 中文

## 概述

在側欄開啟**外掛**，在官方分組裡選擇**搜尋來源**，即可選擇由哪個提供者回答網頁搜尋，並儲存該提供者讀取的金鑰。頁面暫存輸入、只在儲存時寫入；金鑰透過憑證域寫入而不進設定檔案，其明文從不出現在任何回應裡。頁面只在 Host 服務 `web` 名稱空間期間存在。

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

**搜尋來源**頁面列出每個出廠提供者；第一個選項恢復為組合預設值，被覆蓋的選擇帶**已覆蓋**標籤和**恢復預設**。讀取已儲存金鑰的提供者會顯示按該提供者出廠引用（例如 `OPENAI_API_KEY`）定址的 **API Key** 控制元件，一次儲存同時寫入選擇與金鑰。金鑰每次載入都是空的，只報告是否已設定；留空儲存等於保留現有金鑰，而當憑證不能從這裡寫入時該控制元件會被停用。Exa 與 Perplexity 從啟動環境讀取金鑰，頁面會說明這一點；Claude Code 使用 Host 的登入，無需金鑰。點選**儲存**之前不會寫入任何內容；離開頁面即丟棄草稿。選擇從下一次搜尋起生效。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

主機半側是一個空的 `apply`，只為讓本包占一條 Loader 行，用戶端模組系統據此送出瀏覽器半側。瀏覽器半側透過 `ctx.configForms.get` 繫結 `web` 名稱空間，用 `ui-primitives` 的共享 `SettingsFormModel` 在 `SearchProviderCardController` 裡維護暫存表單。它暫存 `searchProvider`，並把生效提供者的金鑰作為表單裡唯一的密文控制元件，其引用取自 `search-providers.ts` 中的出廠提供者表：寫入走該引用下的 `remote.credentials.set`，是否成功由 `remote.credentials.describe` 回讀判定；請求途中引用已變化時，回答會被丟棄。scope 變化時、以及 Host 對所監視引用發出 `credentials/reference-updated` 時，控制器都會重讀憑證，因為在模型頁寫入的金鑰不會改變任何設定節。頁面透過 `ctx.configForms.whileServed` 把 `SearchProviderCard` 註冊進外掛頁的 `plugins.item` slot。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [ui-plugin-manager](../ui-plugin-manager/README.zh.md)——外掛頁以及本頁註冊進去的 `plugins.item` slot。
- [ui-settings](../ui-settings/README.zh.md)——本頁依賴的設定 scope 與"名稱空間被服務期間"的監視。
- [ui-primitives](../ui-primitives/README.zh.md)——本頁渲染的設定表單模型與欄位。
- [credentials](../../credentials/README.zh.md)——金鑰寫入所經的憑證引用 seam。
- [web](../../web/web/README.zh.md)——註冊 `web` 名稱空間並選擇搜尋提供者的 web 服務。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包是瀏覽器側的設定介面，不註冊任何模型面。

#### KV 快取影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **提供者專屬欄位**——各提供者自己的名稱空間（例如 `web-search-deepseek` 中 DeepSeek 提供者的介面地址與單次請求搜尋次數）保持組合值，需在 `cordis.yml` 中修改；本頁只編輯提供者選擇及其金鑰。
- **執行時不變數：**不釋出伴生。本頁沒有自己擁有的關係：它顯示的內容派生自設定映像與憑證域，它寫入的內容由 Host 驗證。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
