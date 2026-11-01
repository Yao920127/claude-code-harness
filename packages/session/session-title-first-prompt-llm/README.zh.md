---
description: "面向使用者與維護者的首訊息 LLM（大語言模型）工作階段標題提供者說明，用於選擇標題策略或排查自動標題生成。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title-first-prompt-llm

[English](README.md) | 中文

## 概述

`dsh-session-title-first-prompt-llm` 作為可選的 `ctx.sessionTitle` 提供者，透過 `ctx.llm` 總結第一條符合條件的使用者訊息。它註冊 `first-prompt` 節奏，只在全新非 fork 工作階段首次建立退回時自動執行，並把結果歸因於該訊息的確切 seq。自動失敗會保留退回，之後只能透過 `ctx.sessionTitle.refresh()` 重試。它使用 `dsh-session-title-llm` 的完整必填共享 LLM 設定，因此路由、提示詞、預算與取消行為不會漂移。自動行為與設定優先；實作僅在共享策略之上進行輕量註冊。

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

當工作階段應從第一條符合條件使用者訊息生成標題時，在標題服務旁掛載此外掛。它要求完整的[共享 LLM 設定](../session-title-llm/README.zh.md#configuration)，且無預設值。

### 標題生成時機

自動生成只對無父工作階段、也無先前標題的全新工作階段執行：在其第一條符合條件使用者訊息之後，建立退回並行出一次輔助請求來總結該訊息。後續提示詞、顯式使用者重新命名與繼承的 fork 歷史都不會觸發再次自動呼叫。自動失敗會保留退回；`ctx.sessionTitle.refresh()` 是顯式重試。fork 會保留繼承的標題，絕不會自動執行此提供者，即使其預置的首訊息來自父工作階段。

### 設定

外掛接受完整必填的[共享 LLM 設定](../session-title-llm/README.zh.md#configuration)：`targetWords`、`targetCjkCharacters`、`maxInputBytes`、`maxOutputTokens`、`timeoutMs`，以及可選成對的 `provider`/`model` 路由。同時省略二者，會繼承目前已記錄主請求的確切路由；同時設定二者，則讓標題生成使用獨立路由。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-title-first-prompt-llm)是每個受支援欄位的窮盡式真源。

### 失敗與恢復

失敗的生成——主請求之前缺少路由、輸入超過 `maxInputBytes`、超時、取消或無效模型輸出——會發出警告並保留目前標題；只有顯式 `refresh()` 會重試。自動工作不會為主 agent（智慧代理）請求增加 token 或延遲。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋外掛形態；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一個薄提供者外掛：它註冊 `first-prompt` 節奏，用選擇器取第一條符合條件訊息，其餘全部委託給[共享 LLM 策略](../session-title-llm/README.zh.md)。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：共享設定 schema、以首訊息選擇器註冊提供者 |

### 排程

標題服務負責排程自動工作：對 `first-prompt` 節奏，只有當工作階段無父工作階段、恰好擁有一條符合條件訊息且尚無標題時才啟動修訂；提供者呼叫在確切主請求路由被記錄後才開始，較新的修訂會取代舊工作。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供者約定不夠用時閱讀以下頁面。它們從共享策略逐步進入替代節奏與它所插入的服務。

- [共享 LLM 標題策略](../session-title-llm/README.zh.md)——此提供者使用的生成輔助模組。
- [全訊息標題提供者](../session-title-all-prompts-llm/README.zh.md)——在每條新提示詞後重新生成標題的節奏。
- [工作階段標題服務](../session-title/README.zh.md)——退回行為、重新命名、重新整理與提供者註冊。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 首訊息標題請求

#### 模型看到什麼

標題模型會收到共享標題指令，以及一個只包含第一條符合條件使用者訊息的 JSON 陣列。後續提示詞與繼承的 fork 歷史不會觸發再次自動呼叫。

#### Token 影響

全新工作階段最多自動發出一次輔助請求，並受 `maxInputBytes` 與 `maxOutputTokens` 約束；顯式重新整理可能發出額外呼叫。主 agent 請求不會增加 token。

#### KV Cache 影響

不會使主請求的 KV Cache 失效。輔助請求使用已設定或已記錄路由，其快取行為由提供者決定。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明此提供者何時不再代表工作階段。它們是目前包約束。

- **首訊息可能過時**——對於長期工作階段，第一條訊息可能不再具有代表性；如果後續提示詞應觸發重新生成標題，請使用全訊息提供者。
- **fork 絕不自動重新生成標題**——fork 會保留繼承的標題，絕不會自動執行此提供者，即使其預置的首訊息來自父工作階段。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個輕量提供者將請求與結果驗證委託給共享標題服務和 LLM 輔助模組，不保留獨立的可變狀態。
