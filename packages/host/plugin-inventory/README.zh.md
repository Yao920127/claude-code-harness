---
description: "目前 Cordis Loader 外掛狀態的只讀投影，並附帶每個 agent preset（智慧代理預設）的組合：面向 web GUI 主機用戶端的 pluginInventory 服務及其 pluginInventory/list Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | 中文

## 概述

用戶端可以呼叫 `pluginInventory/list`，按載入順序展示主機的目前外掛，包括每個條目的識別符號、模組標識、有效啟用狀態、存活階段與可用的展示文字。部署組合了 agent preset roster 時，還會報告各預設的中繼資料、健康狀態與壓平後的外掛組合；沒有 roster 時，預設資料缺席。每次回應都是供展示和診斷使用的只讀即時快照：它不能修改外掛，也不提供歷史或變更訂閱。

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

當用戶端或設定頁需要展示主機目前組合了什麼——哪些外掛已載入、已啟用、是否存活，以及每個 agent preset 會給工作階段什麼——時呼叫 `pluginInventory/list`。Remote 是唯一入口：該服務僅供 Remote 使用，刻意不宣告同程序 Cordis `Context` 合併。

### 快照包含什麼

每一行是一個非組 Loader 條目：其條目 id、精確模組標識、有效啟用狀態（含被停用的祖先組）與目前根 Fiber 階段。`pending` 表示條目等待載入，`loading` 表示正在讀取，`active` 表示正在執行，`failed` 表示其 fiber 被拒絕，`unloading` 表示正在拆除；`null` 表示完全不存在存活的根 Fiber。結構性的 group 行會被跳過。

Loader 行與預設行可以攜帶可選的 `meta`，其中包含標題、描述或元資訊診斷。Host 返回可用翻譯與字面退回文字，由 Client 選擇語言。元資訊診斷不改變啟停狀態或 fiber 階段。

### 每個預設的組合

組合了 roster 時，`agentPresets` 按 roster 順序攜帶每個預設一組：其 id、隨部署內建還是使用者自建（`trust`，用戶端據此在地化內建預設名）、釋出的顯示名、未指名預設的工作階段是否組合它，以及壓平後的外掛行——條目 id（檔案行未宣告時為 null）、模組標識、有效啟用狀態、行自帶的 `!!js` disabled 表示式（如有），以及組合存活時的根 Fiber 階段。已有工作階段組合過的預設由其最新仍存續的世代作答——即使其檔案事後損壞也是如此，因為掛載才是這些工作階段實際執行的組合；開機以來從未被組合的預設由其組合檔案作答，disabled 門用 Loader 上下文求值，且讀取從不掛載預設。`conditional` 表示主機無法求值的門；無人組合的壞預設保留在列表中，攜帶原因且沒有行。沒有 roster 時該欄位缺席。

### 你能用它做什麼、不能做什麼

該清單是供展示與診斷的快照：用戶端可以渲染名單、標出失敗條目，並透過比較快照檢測變化。它不能啟用、停用、新增或移除外掛，也不攜帶歷史——已經失敗並被移除的 fiber 缺席。由於服務每次呼叫都讀取 Loader，答案總是反映目前組合，而不是快取檢視。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計理念

閘道是一層沒有第二個生命週期真源的直接投影：每次 `list()` 呼叫都讀取 `ctx.loader.entries()`，並把每個非組條目對映為公共行。Cordis 內部的 `plugin/status` 事件已經維護了 `Entry.fiber` 與 `Fiber.state`，因此再加快取只會多出一個需要同步的生命週期真源。agent preset roster 是每次呼叫經 `ctx.get('agentPresets')` 解析的可選夥伴：預設組合讀取由它的 `compositionInventory()` 負責，本包把根 Fiber 狀態對映到公共階段。

展示元資訊來自可選的 `pluginPackages` 服務：Loader 行使用其所屬樹的解析基準，預設行使用閘道上下文的基準。服務或對應基準不存在時，`meta` 缺席。讀取元資訊不會載入或啟用外掛。

### 階段對映

Fiber 狀態對映到公共階段詞彙，其中 `disposed` 摺疊為 `null`——fiber 已消失的條目沒有可報告的存活根。因此階段從不區分為什麼沒有存活根：條目可能從未啟動，也可能其 fiber 已被釋放。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `PluginInventoryGateway`：`pluginInventory` Remote 服務與 Loader 投影 |
| [`src/types.ts`](src/types.ts) | 公共 payload 型別：`PluginInventoryEntry`、`PluginInventorySnapshot`、`PluginFiberPhase` |
| — | 不釋出執行時不變式配套項；每個快照都投影 Loader 持有的狀態。 |

Typert 生成由 `./typert` 與 `./remote` 匯出的 Host 和 Client Remote 產物。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當清單約定不夠用時閱讀以下內容：先看 Remote 如何到達用戶端，再看它所投影的 Loader 與渲染它的介面。

- [Remote 組合](../../api/remotes/README.zh.md)——用戶端如何在不匯入 Host 實作的情況下消費 `pluginInventory/list`。
- [Cordis 外掛 loader](../../../vendor/loader/README.md)——本包所投影條目的那個 Loader。
- [外掛清單設定介面](../../client/ui-settings-plugin-inventory/README.zh.md)——渲染該清單的瀏覽器側投影。

-----

<a id="model-experience"></a>
## 模型體驗

無。這個僅限 Host 的只讀 Loader 投影不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明即時清單無法向用戶端提供哪些資訊。它們是目前包約束，不是任務積壓。

- **僅表示呼叫當下**——結果不包含持久的失敗歷史或訂閱；只要不存在存活的根 Fiber，就會報告 `null`，而不區分其原因。
- **不標識引入層，也不修改外掛**——服務不識別條目由哪個 bundle、profile 或 override 引入，也不能在任一平面啟用、停用、新增或移除外掛。
- **預設僅隨 roster 出現**——未裝 `dsh-agent-preset-registry` 的部署只提供 Loader 條目；`agentPresets` 欄位缺席而非為空。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
