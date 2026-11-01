---
description: "面向使用者與維護者的全訊息 LLM（大語言模型）工作階段標題提供者說明，用於選擇標題策略或排查自動標題生成。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title-all-prompts-llm

[English](README.md) | 中文

## 概述

`dsh-session-title-all-prompts-llm` 作為可選的 `ctx.sessionTitle` 提供者，透過 `ctx.llm` 總結所有符合條件的使用者訊息。它註冊 `all-prompts` 節奏，並在每條新使用者提示詞後啟動新修訂，使用預置歷史與子工作階段提示詞。較新的修訂會中止並取代舊工作，即使提供者忽略取消，也無法提交陳舊輸出。它使用 `dsh-session-title-llm` 的完整必填共享 LLM 設定，因此路由、提示詞、預算與取消行為不會漂移。本文優先介紹自動行為與設定；實作只是基於共享策略進行的輕量註冊。

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

當工作階段應隨其增長而重新生成標題、使標題持續代表整個對話時，在標題服務旁掛載此外掛。它要求完整的[共享 LLM 設定](../session-title-llm/README.zh.md#configuration)，且無預設值。

### 標題生成時機

每條新的符合條件使用者提示詞之後都會啟動新修訂，包括子工作階段中的提示詞；生成會摺疊截至目前修訂的所有符合條件訊息，預置歷史也包含在內。較新的修訂會中止並取代舊工作，因此陳舊的完成結果永遠無法提交。自動失敗——包括輸入超過 `maxInputBytes`（此時請求失敗而非截斷歷史）——會發出警告並保留先前標題；`ctx.sessionTitle.refresh()` 是顯式重試。

### 設定

外掛接受完整必填的[共享 LLM 設定](../session-title-llm/README.zh.md#configuration)：`targetWords`、`targetCjkCharacters`、`maxInputBytes`、`maxOutputTokens`、`timeoutMs`，以及可選成對的 `provider`/`model` 路由。同時省略二者，會繼承每個目前已記錄主請求的確切路由；同時設定二者，則讓標題生成使用獨立路由。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-title-all-prompts-llm)是每個受支援欄位的窮盡式真源。

### 失敗與恢復

如果最終封裝的聚合提示詞超過 `maxInputBytes`，請求會失敗而不是截斷歷史；自動使用時會發出警告並保留先前標題，只有顯式 `refresh()` 會重試。自動工作不會為主 agent 請求增加 token 或延遲。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋外掛形態；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一個薄提供者外掛：它註冊 `all-prompts` 節奏，用恆等選擇器選取所有符合條件訊息，其餘全部委託給[共享 LLM 策略](../session-title-llm/README.zh.md)。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：共享設定 schema、以全訊息選擇器註冊提供者 |

### 排程

標題服務負責排程自動工作：對 `all-prompts` 節奏，每條新的符合條件使用者訊息都會啟動一個修訂，較新的修訂會取代舊工作；提供者呼叫在確切主請求路由被記錄後才開始。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供者約定不夠用時閱讀以下頁面。它們從共享策略逐步進入替代節奏與它所插入的服務。

- [共享 LLM 標題策略](../session-title-llm/README.zh.md)——此提供者使用的生成輔助模組。
- [首訊息標題提供者](../session-title-first-prompt-llm/README.zh.md)——只根據首條提示詞為工作階段生成一次標題的節奏。
- [工作階段標題服務](../session-title/README.zh.md)——退回行為、重新命名、重新整理與提供者註冊。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 全訊息標題請求

#### 模型看到什麼

標題模型會收到共享標題指令，以及一個 JSON 陣列，其中按日誌順序包含截至目前修訂的所有符合條件使用者訊息和確切 seq。預置歷史也包含在內。

#### Token 影響

每條符合條件的新提示詞之後都可能發出一次輔助請求，每次請求受 `maxInputBytes` 與 `maxOutputTokens` 約束；顯式重新整理可能增加呼叫。主 agent（智慧代理）請求不會增加 token。

#### KV Cache 影響

不會使主請求的 KV Cache 失效。每條提示詞後，輔助輸入都會增長或變化，因此提供者專用快取複用會在第一個變化的 JSON token 處結束。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供者如何對待長工作階段與異構工作階段。它們是目前包約束。

- **沒有基於摘要繼續生成摘要的機制**——輸入溢位時保留先前標題；對於很長的工作階段，此提供者沒有基於摘要繼續生成摘要的機制或保留策略。
- **訊息被平等對待**——它平等對待所有符合條件的使用者訊息，不提供權重、過濾或手動標題優先順序。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個輕量提供者將請求與結果驗證委託給共享標題服務和 LLM 輔助模組，並且不保留獨立的可變狀態。
