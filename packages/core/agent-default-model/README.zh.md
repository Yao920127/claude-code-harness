---
description: "面向使用者與維護者的部署預設模型選擇說明，用於選擇、設定或除錯新建立的 agent（智慧代理）初始使用哪個模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-default-model

[English](README.md) | 中文

## 概述

為工作階段未指定模型的新 agent 提供共享預設 provider 和模型。Provider、模型和推理強度都是即時 Config 欄位。儲存的選擇更新目前 profile patch，並用於後續讀取；工作階段級選擇仍由入口負責。

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

在建立 agent 且未顯式給出模型路由的任何地方掛載本包。該服務回答一個問題——新 agent 應該使用哪個模型？——因此建立 agent 的入口查詢它，而不必重新實作預設值。

### 設定預設值

組合要求提供 provider 和模型。即使沒有掛載設定編輯器，消費者也可讀取即時引用。

```yaml
- name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek
    model: deepseek-chat
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `provider` | 必填 | 新 agent 使用的已註冊提供者路由 |
| `model` | 必填 | 新 agent 使用的、由提供者持有的模型 id |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-default-model) 列出所有接受的欄位。`reasoningEffort` 是可選的；儲存不含此欄位的選擇，會從 profile 的完整設定覆蓋中移除此欄位。

### 讀取與更改預設值

`currentSelection()` 為新建立的 agent 返回一份獨立的 `{ provider, model, reasoningEffort? }`；`saveSelection()` 為後續 agent 儲存完整選擇。

```text
const selection = ctx.agentDefaultModel.currentSelection()
await ctx.agentDefaultModel.saveSelection({ provider, model, reasoningEffort: 'high' })
```

沒有設定編輯器時，`saveSelection()` 不執行寫入。此服務不驗證目錄成員資格；發起模型請求的消費者負責可用性診斷。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該服務如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

此服務保留已驗證的 Config 引用，並在 `currentSelection()` 中讀取。`saveSelection()` 捕捉提交值，並按提交順序序列寫入 profile，包括呼叫重疊的情況。每個呼叫方收到各自的寫入失敗；一次寫入被拒絕不會阻止後續儲存。消費者優先使用工作階段級選擇。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 即時預設選擇與 profile 寫入 |
| — | 不釋出 invariant 配套模組，因為 Config 引用是唯一由此包維護的值。 |

### 行為說明

`currentSelection()` 返回分離的選擇值。已捕捉的選擇保持穩定，後續操作則讀取更新後的 Config 引用。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [Core 子系統](../../../docs/subsystems/core.zh.md)——`Agent` 控制代碼與 `AgentOptions` 路由選擇。
- [agent-loop 包](../agent-loop/README.zh.md)——agent 在請求時如何解析提供者與模型。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-default-model)——每個受支援設定欄位及其源宣告。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

透過該服務提供給入口的 `ModelSelection` 間接影響；模型可見請求由請求組裝與提供者介面卡負責。

#### KV Cache 影響

更改預設值隻影響之後從它解析選擇的 agent。請求日誌已經指明選擇的現有工作階段仍沿用該選擇，因此本服務不會使其已建立的字首失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定該服務的範圍。它們是目前包約束，不是任務積壓。

- **單一的程序級預設值**——該服務只擁有一個預設值；按工作階段的模型選擇仍由入口負責。
- **持久化需要 profile 設定編輯器**——沒有編輯器時，儲存預設值不會保留選擇。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
