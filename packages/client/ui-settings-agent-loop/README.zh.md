---
description: "dsh Web 用戶端外掛頁上的 Agent 迴圈設定頁：agent-loop 名稱空間的並行工具呼叫上限。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-agent-loop

[English](README.md) | 中文

## 概述

在側欄開啟**外掛**，在官方分組裡選擇 **Agent 迴圈**，即可設定一步之內最多同時執行多少個可並行的工具呼叫。頁面暫存輸入、只在儲存時寫入，標明使用者覆蓋過的值，並允許把它重置回部署預設值。頁面只在 Host 服務 `agent-loop` 名稱空間期間存在。

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

官方分組裡的 **Agent 迴圈**卡片開啟這一頁。**並行工具呼叫數**限制迴圈在一步之內同時執行的呼叫數；欄位顯示生效值，一旦被覆蓋就帶**已覆蓋**標籤，旁邊是**恢復預設**。點選**儲存**之前不會寫入任何內容；離開頁面即丟棄草稿，清空欄位並儲存等於重置，填了不是數字的文字則儲存被阻止，並在欄位下說明原因。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

主機半側是一個空的 `apply`，只為讓本包占一條 Loader 行，用戶端模組系統據此送出瀏覽器半側。瀏覽器半側透過 `ctx.configForms.get` 繫結 `agent-loop` 名稱空間，用 `ui-primitives` 的共享 `SettingsFormModel` 在 `AgentLoopCardController` 裡維護暫存表單，並透過 `ctx.configForms.whileServed` 把 `AgentLoopCard` 註冊進外掛頁的 `plugins.item` slot。頁面文案在本包的 `settings.agentLoop` 字典裡。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [ui-plugin-manager](../ui-plugin-manager/README.zh.md)——外掛頁以及本頁註冊進去的 `plugins.item` slot。
- [ui-settings](../ui-settings/README.zh.md)——本頁依賴的設定 scope 與"名稱空間被服務期間"的監視。
- [ui-primitives](../ui-primitives/README.zh.md)——本頁渲染的設定表單模型與欄位。
- [agent-loop](../../core/agent-loop/README.zh.md)——註冊 `agent-loop` 名稱空間的迴圈。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包是瀏覽器側的設定介面，不註冊任何模型面。

#### KV 快取影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只編輯名稱空間的一個欄位**——Host 的這一節只承載並行上限；組合進來的 `agents` 陣列屬於啟動組合而非使用者設定，這裡沒有對應欄位。
- **執行時不變數：**不釋出伴生。本頁沒有自己擁有的關係：它顯示的內容派生自設定映像，它寫入的內容由 Host 驗證。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
