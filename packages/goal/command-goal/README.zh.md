---
description: "面向在 UI 命令平面中選擇、組合或排查 goal 控制的使用者與維護者的 /goal 斜槓命令說明。"
kind: "package-reference"
---

# @deepseek-ai/dsh-command-goal

[English](README.md) | 中文

## 概述

`dsh-command-goal` 為使用者提供 `/goal` 命令，以便直接在互動式 UI 中建立、編輯、暫停、恢復、清除並檢視目前 goal。命令及其直接輸出留在 UI 中，不進入模型請求。接受的變更會持久化；create 或 edit 攜帶的有序圖片或檔案附件會成為一條普通使用者訊息，供後續 Goal Round 讀取。此包適用於帶命令介面卡的互動式部署；沒有介面卡的無頭與自動化應用不需要它。

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

在掛載了命令介面卡的互動式部署中使用 `dsh-command-goal`——隨附的 Web 用戶端是參考實作。它讓使用者無需模型輪次即可直接控制 goal 生命週期：命令在 UI 命令平面執行，介面卡直接渲染其結果。

### 命令參考

每個子命令都針對呼叫 agent（智慧代理）的目前 goal 執行；沒有 goal 時，裸 `/goal` 顯示用法。

| 輸入 | 結果 |
|---|---|
| `/goal` | 顯示目前目標、持久 phase、Round 數量與上限、程序本地續行啟用狀態與有效的下一步命令；被阻塞的 goal 還會顯示其策略程式碼與說明 |
| `/goal <objective>` | 建立 goal 並啟用續行，或用全新身份替換已完成 goal |
| `/goal edit <objective>` | 編輯目前目標，不改變其 phase 或續行啟用狀態 |
| `/goal pause` | 暫停 active goal 並停用續行 |
| `/goal resume` | 恢復已停止 goal，或在工作階段 resume 或 fork 後重新啟用 active goal；仍受剩餘 Round 上限約束 |
| `/goal clear` | 清除目前 goal，同時保留其持久歷史 |

### 輸入語法

只有控制詞（`clear`、`pause`、`resume`、`edit`）佔據完整輸入時才被識別；其他任何非空字尾都是目標，因此 `/goal pause after verification` 會建立該字面目標。`edit` 內聯接收替換內容，並拒絕直接替換未完成的 goal。可預期的領域拒絕會變成穩定的直接命令錯誤，不暴露帶品牌型別的 id 或 revision；意外實作失敗仍會讓分發失敗，使介面卡能將其報告為命令失敗。

### 附件

`/goal` 宣告附件支援。附件只隨目標本身：create 或 edit 成功後，命令提交一條使用者 followup 訊息，按選擇順序攜帶已准入的圖片塊與檔案塊，再附加固定文字 `Reference attachments for the goal objective.`。後續 Goal Round 從普通工作階段歷史讀取這些內容，goal 領域不儲存附件狀態。其他任何子命令以及被拒絕的 create 或 edit，都會在領域變更前返回直接錯誤，並保留 composer 的草稿和附件卡。

### 組合方式

命令注入命令註冊表與 goal 服務。自定義應用會掛載它們的所有者與此外掛；自動續行仍是獨立選擇：

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: goal
  name: '@deepseek-ai/dsh-goal'
- id: command-goal
  name: '@deepseek-ai/dsh-command-goal'
```

隨附的 `dsh` 基礎設定啟用持久 goal 棧與此命令。Web bundle 把 goal 服務與 driver 保留在 Host，停用基礎命令 producer，並在 `standard`、`code` 和 `cordis` agent preset 中掛載 producer；`minimal` 會省略它。ACP（Agent Client Protocol）自動化應用啟用領域與模型工具，但不掛載命令介面卡。獨立的 `sdk-minimal` profile 省略完整 goal 棧，因此其結果 API 仍在一個關聯的物理輪次後結束。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋命令如何解析輸入並渲染輸出；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計

- **語法，而非自由文字。** 解析器只在控制詞（`clear`、`pause`、`resume`、`edit`）填滿整個輸入時識別它們；其他任何非空字尾都是目標。單獨的 `edit` 無效，且 `edit` 拒絕直接替換未完成的 goal。
- **領域拒絕變成穩定錯誤。** `GoalError` 結果會轉換為帶固定訊息的直接命令錯誤；意外失敗會重新丟擲，使介面卡報告命令失敗而非領域結果。渲染輸出絕不暴露帶品牌型別的 id 或 revision。
- **附件隨目標提交。** create 或 edit 成功時，命令提交一條使用者 followup 訊息，按選擇順序攜帶已准入的圖片塊與檔案塊，再附加固定文字 `Reference attachments for the goal objective.`。其他路徑不提交訊息，因此分發方 composer 保留草稿和附件卡。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：命令語法、狀態渲染、附件提交 |
| — | 不釋出執行時不變式伴生入口；此命令介面卡不擁有事件流或狀態投影；已接受的變更由 goal 領域檢查，命令分發行為由包測試覆蓋。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

該命令是 goal 領域的薄介面卡；需要了解它變更的狀態與它接入的註冊表時閱讀以下頁面。

- [goal 服務](../goal/README.zh.md)——命令變更的狀態與生命週期。
- [命令服務](../../interaction/commands/README.zh.md)——命令註冊表約定與分發。
- [Harness 層目標式執行 Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.zh.md)——使用者體驗與組合決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 使用者 `/goal` 控制

#### 模型看到的內容

斜槓輸入、變更以及直接狀態或錯誤輸出不會進入模型請求。goal 領域把變更記錄為 `goal/change`；已啟用的同工作階段驅動器可以在後續續行提示詞中暴露結果狀態。呈現文字不會記錄到日誌中。當 create 或 edit 攜帶附件時，模型會看到一條普通使用者訊息：有序的圖片塊與檔案塊後跟文字 `Reference attachments for the goal objective.`。它在工作階段歷史中位於下一個 Goal Round 之前。

#### Token 影響

讀取狀態、變更 goal 或收到直接命令錯誤不會增加模型 token。已啟用的同工作階段驅動器可能增加後續 Goal Round 提示詞。目標攜帶的附件會增加一條普通使用者訊息，產生常規文字、圖片和檔案控制代碼成本。

#### KV Cache 影響

命令發現、變更與直接輸出不會影響快取。後續續行提示詞遵循驅動器的普通請求歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明命令何時不合適或需要特別注意。它們是目前包約束，不是任務積壓。

- **僅純文字互動**——通用命令註冊表沒有模態編輯表單或替換確認回呼；內聯 edit 與顯式 clear 能在不同介面卡中保持明確且一致的破壞性意圖。
- **沒有逐命令 Round 上限參數**——`defaultMaxGoalRounds` 仍是部署設定；使用者直接請求時，可以要求模型透過另行授權的 goal 工具編輯 `max_goal_rounds`。
- **沒有持續狀態元件**——裸 `/goal` 是可移植的觀察介面；不提供介面卡專用徽標或重連後可恢復的命令輸出。
- **隨附應用中只有 Web 命令介面卡使用此命令**——無頭、ACP 自動化和 JSON-RPC 介面卡不消費 `ctx.commands`。如果組合中包含面向模型的 goal 工具，普通提示詞仍能授權它們。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性。開放且未決：持續狀態元件與逐命令 Round 上限輸入；兩者都是延後的 UI 與設定工作。

</details>
