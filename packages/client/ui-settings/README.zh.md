---
description: "設定領域底座外掛：共享設定表單、schema 服務，以及 dsh Web 用戶端的規範設定 slot 型別約定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings

[English](README.md) | 中文

## 概述

本包使 Web 用戶端功能能夠公開由主機設定文件支援的可編輯偏好設定，而無需自行實作傳輸或 schema 處理。每項功能都可按名稱空間讀寫、原子更新多個欄位、驗證 schema，並避免靜默覆蓋並行更改。它還為設定介面框架、頁面、標題欄操作、外掛標籤頁和引導流程提供標準擴充功能點，但自身不渲染任何介面。任何持有偏好設定的功能都可在不依賴呈現包的情況下使用它；設定外殼由單獨的包提供。

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

功能外掛用本包儲存與編輯自己的偏好設定，而無需重新實作傳輸層或 schema 處理。每個組合掛載一次即可；它注入 `remote` 服務及其 `settings` 名稱空間，並持有瀏覽器中唯一的 `settings.describe` 讀取方。

### 設定表單

`ctx.configForms.developerTools` 管理程式碼工作工具開關與 Web 和桌面端共享的偏好 `ui-settings.enabled`，預設為 `true`。其 `enabled` 可觀察值釋出已接受的選擇，`setEnabled` 使用相同的有序設定寫入。桌面端和迴環 Web 將設定持久化到 Host 文件；遠端 Web 將此選擇儲存在單個瀏覽器本地可觀察值中，重新整理後重置，不傳送 Host 寫入。此設定控制介面展示和 HTML 預覽權限，不控制 Host 授權或 Session 記錄。 使用 Host 偏好的用戶端在首個經過 schema 解析並接受的值到達前保持開發者功能關閉；首次回應缺失或失敗不會啟用它們。後續重新整理保留已接受的選擇。

功能介面卡使用 `ctx.configForms.get(entryId)` 取得該 Host 條目所有編輯器共享的已接受值和寫入佇列。快照包含解析後的 `value`、繼承 `base`、原始 `user`、修訂號、可寫性和持久化模式。`set` 與 `unset` 提交單個操作，`mutate` 提交一個原子操作列表。暫存編輯器傳入編輯前讀取的修訂號；衝突時保留草稿。清除操作移除覆蓋並恢復繼承。

### 跟隨被服務的名稱空間

編輯另一個外掛所擁有名稱空間的頁面透過 `ctx.configForms.whileServed(namespaces, register)` 註冊：只要所列名稱空間中的任一個進入共享映像，`register` 就執行一次，收到 Host 目前服務的名稱空間集合，並返回該註冊的 disposer；當它們全都不再被服務，或 `whileServed` 返回的 disposer 被呼叫時，這個 disposer 就執行。呼叫方持有返回的 disposer 並把它包進 `ctx.effect`；與 `get` 不同，服務不會在呼叫方的 context 上註冊任何東西。因此從未組合過所有者的部署看不到該頁面的任何痕跡，Host 停止服務的名稱空間會撤下它。外掛頁上的四個官方頁面各自透過一個伴生包走這條路徑。

### 填充設定 slot

設定介面會註冊進本包宣告的 slot 型別。外殼（`sidebar.settings` 佔位方、導航、介面框架）位於 ui-settings-general；功能頁面註冊 `settings.section` 貢獻；「外掛」分割槽承載 `settings.plugins.tab` 頁面；首次使用引導步驟註冊 `settings.onboarding`。跨名稱空間的表面（schema 內省、已服務名稱空間目錄、`hasDocument`）透過 `ctx.configForms.describe()` 讀同一面映像。

### 可觀察的成功與失敗

已提交的寫入將應答合入共享映像。被拒絕的寫入重新整理最新 Host 值。瀏覽器使用序列化的 Config schema 驗證；Host 驗證完整設定，包括無法序列化的檢查。

-----

<a id="understand-the-implementation"></a>
## 理解實作

可選的 `settings.launcher` 貢獻接收側欄佈局、設定面板是否覆蓋側欄、設定導航回呼，以及有效的設定鍵位標籤和無障礙組合。命令未繫結時，外殼不傳快捷鍵展示資訊；未註冊入口時，外殼保留普通設定按鈕。

<details>
<summary>實作細節——點選展開</summary>

本包實作一條歸屬規則：瀏覽器保留設定文件的一面共享映像，每個派生表面都讀這同一真源，因此任一時刻看到的都是同一份文件 revision。

### Describe 映像

`ui-settings` 條目的 Host Config 宣告預設開啟的 `enabled` 偏好。Client 外掛注入 `remote` 及其 `settings` 名稱空間，從固定的 `remote.$host` 事實一次性解析 Host 持久化模式，並持有瀏覽器中唯一的 `settings.describe` 讀取方：一面共享映像，在每次轉發的 `settings/document-updated` 事件與 `connection/reset` 時重新整理（首次連線也包含在內，關閉「提交落在急切讀取與 SSE 訂閱之間」的視窗）。跨名稱空間表面透過 `ctx.configForms.describe()` 讀它，這是一個讀取/摺疊面（`getSnapshot`/`subscribe`/`ensure`，另有把寫應答折入的 `acceptView`）。

### 共享條目寫入

提供者為每個 Host 條目持有一個控制器，包括其訂閱和寫入佇列；重複呼叫 `get(entryId)` 返回同一表單。消費者釋放自己的檢視訂閱。不建立呼叫方作用域的設定繫結。啟動 RPC 預算覆蓋共享的 describe 讀取。

### Schema 服務

`ctx.settingsSchema` 重建 schema、驗證草稿並編輯巢狀值。無效的線路值不會替換已接受值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設定介面家族及其背後的持久化 seam。

- [ui-settings-general](../ui-settings-general/README.zh.md)——設定外殼：觸發控制元件、導航、「通用」分割槽、引導投影。
- [ui-settings-plugins](../ui-settings-plugins/README.zh.md)——圍繞清單標籤頁的「內建外掛」分割槽殼。
- [ui-settings-shell](../ui-settings-shell/README.zh.md)、[ui-settings-agent-loop](../ui-settings-agent-loop/README.zh.md)、[ui-settings-subagent](../ui-settings-subagent/README.zh.md)、[ui-settings-web-search](../ui-settings-web-search/README.zh.md)——外掛頁上的官方設定頁，各自透過 `whileServed` 跟隨其名稱空間。
- [ui-settings-models](../ui-settings-models/README.zh.md)——建立在本底座之上的 Models 頁面與 DeepSeek 引導。
- [settings](../../settings/README.zh.md)——持久化使用者設定 seam 及其檔案提供者。
- [ui-sidebar](../ui-sidebar/README.zh.md)——底部席位承載設定觸發控制元件的側邊欄外殼。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明設定傳輸層夠不到的地方；它們是目前包約束。

- **非 loopback 頁面沒有持久化設定**：本 Client 在那裡停用 Host 持久化，因此 表單以 `unavailable` 起步且從不跨線路；儘管 Connection 認證覆蓋 API，表單寫入仍在那裡無效。共享的程式碼工作工具偏好單獨提供瀏覽器本地變更。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包只把 `settings.section` ledger 投影為導航，不發出 Cordis 事件，也不持有跨外掛可變關係；slot core 會在載入時拒絕衝突。
