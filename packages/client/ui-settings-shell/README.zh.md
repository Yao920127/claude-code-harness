---
description: "dsh Web 用戶端外掛頁上的終端執行器設定頁：shell 名稱空間的命令超時與單流輸出上限。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-shell

[English](README.md) | 中文

## 概述

在側欄開啟**外掛**，在官方分組裡選擇**終端**，即可設定單條命令允許執行多久、每條輸出流在記憶體裡保留多少。頁面暫存輸入、只在儲存時寫入，標明使用者覆蓋過的值，並允許把每個值重置回部署預設值。頁面只在 Host 服務 `shell` 名稱空間期間存在，沒有本地終端執行器的部署看不到它。

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

官方分組裡的**終端**卡片開啟這一頁。**命令超時（毫秒）**終止執行更久的命令；**單流輸出上限（位元組）**把超出的輸出轉存到臨時檔案。兩個欄位都顯示生效值，即使用者覆蓋值疊在組合預設值之上；使用者覆蓋過的欄位帶**已覆蓋**標籤，旁邊是**恢復預設**。點選**儲存**之前不會寫入任何內容；離開頁面即丟棄草稿，清空欄位並儲存等於重置，填了不是數字的文字則儲存被阻止，並在欄位下說明原因。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

主機半側是一個空的 `apply`，只為讓本包占一條 Loader 行，用戶端模組系統據此送出瀏覽器半側。瀏覽器半側透過 `ctx.configForms.get` 繫結目前平臺組裝的 shell 執行器條目（非 Windows 為 `bash-sandbox`，Windows 為 `pwsh-sandbox`），用 `ui-primitives` 的共享 `SettingsFormModel` 在 `ShellCardController` 裡維護暫存表單，並透過 `ctx.configForms.whileServed` 把 `ShellCard` 註冊進外掛頁的 `plugins.item` slot：Host 服務任一執行器條目時註冊，停止服務時登出。頁面文案在本包的 `settings.shell` 字典裡；`SettingsForm` 框架的文案以 props 傳入。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [ui-plugin-manager](../ui-plugin-manager/README.zh.md)——外掛頁以及本頁註冊進去的 `plugins.item` slot。
- [ui-settings](../ui-settings/README.zh.md)——本頁依賴的設定 scope 與"名稱空間被服務期間"的監視。
- [ui-primitives](../ui-primitives/README.zh.md)——本頁渲染的設定表單模型與欄位。
- [bash-local](../../shell/bash-local/README.zh.md)——註冊 `shell` 名稱空間的執行器。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包是瀏覽器側的設定介面，不註冊任何模型面。

#### KV 快取影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **頁面跟隨組合進來的執行器**——POSIX 與 PowerShell 兩個執行器家族共用 `shell` 名稱空間，因為一臺主機只組合其中一個，所以服務出來的 schema 因平臺而異（PowerShell 多一個 `pwshPath`），而頁面在兩個平臺上編輯的都是同樣兩個欄位。
- **執行時不變數：**不釋出伴生。本頁沒有自己擁有的關係：它顯示的內容派生自設定映像，它寫入的內容由 Host 驗證。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
