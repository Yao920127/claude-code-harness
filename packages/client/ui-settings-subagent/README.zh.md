---
description: "dsh Web 用戶端外掛頁上的子智慧代理設定頁：subagent 名稱空間的委派深度與並行容量，以及 subagent-model-selection 裡 Agent 可選的模型，同一頁一次儲存。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-subagent

[English](README.md) | 中文

## 概述

在側欄開啟**外掛**，在官方分組裡選擇**子智慧代理**，即可設定委派可以多深、多寬，以及 Agent 可以為子智慧代理選擇哪些模型。頁面把 Host 的兩個名稱空間 `subagent` 與 `subagent-model-selection` 收在一次儲存之下；Host 服務其中任一名稱空間時頁面就存在，並只顯示被服務的部分。

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

**執行限制**把**最大遞迴深度**和**子智慧代理並行數量上限**並排放置，窄屏時上下堆疊；每個標籤旁的資訊按鈕展開它的規則——深度是一張兩行範例表，容量是計數口徑——填了不在範圍內的整數會阻止儲存並在欄位下說明。深度讓位於工具自己的上限；容量統計同一主 Agent 下所有層級存活的子智慧代理，主 Agent 不計入。

**模型選擇**把權限開關和精確的介面卡路由一起暫存。開啟時至少要選一條路由；關閉會保留已選路由以備後用。Host 已儲存但沒有介面卡公佈的路由留在**已儲存但目前不可用**分組裡並且仍可移除；載入失敗的提供者會被報告而不隱藏其他提供者，載入失敗時提供**重試**。

一次**儲存**透過各自的名稱空間寫入兩個部分，每次寫入都以其草稿讀取時的修訂號作柵欄。兩次寫入相互獨立：Host 拒絕的部分保留草稿並報告失敗，另一部分照常落實；被更新的 Host 修訂號超越的模型草稿會以衝突形式報告並要求放棄，而不是覆蓋較新的路由。離開頁面即丟棄所有草稿。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

主機半側是一個空的 `apply`，只為讓本包占一條 Loader 行，用戶端模組系統據此送出瀏覽器半側。瀏覽器半側透過 `ctx.configForms.get` 分別繫結兩個名稱空間：`SubagentLimitsCardController` 用 `ui-primitives` 的共享 `SettingsFormModel` 暫存執行限制，欄位規格只接受不低於各自下限的安全整數；`SubagentModelSelectionCardController` 自己維護草稿，因為它的兩個欄位要作為一次帶修訂柵欄的 `mutate` 儲存，它把已儲存的路由與 `remote.session.modelCatalog()` 合併，在 `llm/adapters-updated` 與 `settings/document-updated` 時重讀目錄，連線重置時丟棄草稿。`subagentCardFace` 把兩者合成 `SubagentCard` 在共享 `SettingsForm` 裡渲染的一個 face，儲存時驗證兩部分並寫入有改動的那些。頁面透過 `ctx.configForms.whileServed` 監視兩個名稱空間，註冊進外掛頁的 `plugins.item` slot。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [ui-plugin-manager](../ui-plugin-manager/README.zh.md)——外掛頁以及本頁註冊進去的 `plugins.item` slot。
- [ui-settings](../ui-settings/README.zh.md)——本頁依賴的設定 scope 與"名稱空間被服務期間"的監視。
- [ui-primitives](../ui-primitives/README.zh.md)——執行限制部分渲染的設定表單模型與欄位。
- [tool-subagent](../../subagent/tool-subagent/README.zh.md)——註冊這兩個名稱空間的委派工具。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包是瀏覽器側的設定介面，不註冊任何模型面。

#### KV 快取影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **目錄只在三種訊號下重讀**——介面卡變化、文件提交和重連；在這三者之外開始公佈模型的提供者，要等下一次訊號或點選**重試**才會出現。
- **執行時不變數：**不釋出伴生。本頁沒有自己擁有的關係：它顯示的內容派生自設定映像與模型目錄，它寫入的內容由 Host 驗證。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
