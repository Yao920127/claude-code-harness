---
description: "在 Web 對話中，把 Codex、Antigravity、Grok Build 與 OpenCode 在自身回合內執行的工具呼叫顯示為工具卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-coding-cli-tools

[English](README.md) | 中文

## 概述

看見 coding CLI 在回答時做了什麼。當 Session 透過 [`dsh-llm-coding-cli`](../../llm/llm-coding-cli/README.zh.md) 與 Codex、Antigravity、Grok Build 或 OpenCode 對話時，CLI 執行的每個工具呼叫都會在對話中顯示為與 harness 工具相同的工具卡片：shell 命令顯示為附輸出的終端機卡片，檔案讀取、寫入或編輯會顯示該檔案，搜尋或網路呼叫則顯示其查詢。

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

`dsh-llm-coding-cli` Bundle 會插入本外掛，因此 CCH Profile 無需設定即可顯示卡片。CLI 一開始呼叫就會出現卡片，並在 CLI 回報結果時完成；CLI 回報失敗的呼叫，或在其步驟結束時仍在執行的呼叫，會以錯誤結束。卡片會與該回合的其他過程列一起分組與計數。沒有 harness 對應工具的 CLI 工具（例如 MCP 工具）會以通用卡片顯示其原本的名稱與參數。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

路由把每個回報的工具狀態記錄為 `coding-cli/tool` Session 事件，其名稱與參數已轉成 harness 用語。本外掛註冊一個 Conversation Definition，依 `callId` 比對這些事件，並為每個呼叫建立一個 Chat `tool-call` 節點：執行中時是已開始的呼叫，完成或失敗後是附輸出文字的已結束結果，而在其 Step 或 Turn 先結束時則是被中斷的結果。渲染、分組與計數沿用 [ui-chat](../ui-chat/README.zh.md) 與 [ui-tool](../ui-tool/README.zh.md) 對 harness 工具呼叫的處理。

</details>

<a id="further-exploration"></a>
## 進一步探索

- [Coding CLI 模型路由](../../llm/llm-coding-cli/README.zh.md)
- [對話](../ui-chat/README.zh.md)

<a id="model-experience"></a>
## 模型體驗

無，因為本包只顯示僅記錄於日誌的 `coding-cli/tool` 事件，不加入任何模型輸入。

#### KV Cache 影響

無；這些事件從不進入模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 卡片依 CLI 回報呼叫的順序出現，並排在同一步驟的回答文字之前，因為該步驟的回答在 CLI 回合結束時才記錄。
- 卡片的輸出上限為 20,000 個字元。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作背景——點選展開</summary>

不釋出執行時不變數配套模組。卡片投影的是單一事件串流；沒有第二個觀察可與之比較。

</details>
