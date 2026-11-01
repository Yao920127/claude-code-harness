---
description: "dsh Web 用戶端的「內建外掛」設定分割槽：設定導航項與供功能外掛註冊標籤頁的標籤行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-plugins

[English](README.md) | 中文

## 概述

使用**內建外掛**設定分割槽檢視本部署隨附的外掛。該分割槽只是一個殼：它擁有導航項和標籤行，裡面的每個標籤頁都由其他外掛註冊——只讀清單註冊了一個。設定內建外掛在側欄的外掛頁上進行，每個官方外掛自己的伴生包把頁面註冊到那裡。

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

在設定裡開啟**內建外掛**。[ui-settings-plugin-inventory](../ui-settings-plugin-inventory/README.zh.md) 把清單作為分割槽唯一的標籤頁貢獻進來，直接顯示為頁面本身；註冊第二個標籤頁後這一行就變成標籤行。組合裡沒有任何標籤頁貢獻的部署會顯示分割槽的空提示。

要貢獻一個標籤頁，帶 `id`、`order` 和在地化的 `label` 註冊進 `settings.plugins.tab`；分割槽按序渲染條目，標籤頁在首次被選中時掛載。功能文案留在註冊方自己的字典裡。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

分割槽宣告 `settings.plugins.tab`，一個根級 list slot，其標籤成為有序的標籤頁；只有一個貢獻時直接渲染為頁面本身，標籤頁在首次被選中後保持掛載，搜尋詞和清單快照因此在切換間不丟失。分割槽的 `inject` 把 slot 帳本投影成按序排列、標籤隨目前語言的行，在帳本版本或語言修訂變化前保持快取。主機半側是一個空的 `apply`，只為讓本包占一條 Loader 行，用戶端模組系統據此送出瀏覽器半側。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [ui-settings-plugin-inventory](../ui-settings-plugin-inventory/README.zh.md)——只讀清單標籤頁。
- [ui-settings](../ui-settings/README.zh.md)——宣告 `settings.section` 的領域基座。
- [ui-plugin-manager](../ui-plugin-manager/README.zh.md)——設定官方外掛的外掛頁。
- [ui-settings-shell](../ui-settings-shell/README.zh.md)、[ui-settings-agent-loop](../ui-settings-agent-loop/README.zh.md)、[ui-settings-subagent](../ui-settings-subagent/README.zh.md)、[ui-settings-web-search](../ui-settings-web-search/README.zh.md)——官方設定頁，每個一個伴生包。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包是瀏覽器側的設定介面，不註冊任何模型面。

#### KV 快取影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **分割槽沒有自己的標籤頁**——在功能外掛註冊標籤頁之前它只顯示空提示；殼自己填不滿分割槽。
- **執行時不變數：**不釋出伴生。分割槽除了投影 slot 帳本之外不擁有任何關係。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
