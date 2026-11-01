---
description: "DeepSeek API key authentication and model discovery."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-deepseek-api-key

[English](README.md) | 中文

## 概述

為 `deepseek-official` 註冊獨立的授權驗證和模型發現外掛。透過 [llm-deepseek](../llm-deepseek/README.zh.md) 共用 Messages 請求實作；本包擁有憑證解析和目錄可用性判斷。

授權驗證解析將驗證後的 API key 放入 `x-api-key`，供 Messages 和 Files 請求共同使用。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

<a id="use-this-package"></a>
## 使用此包

`apiKeyEnv` 預設為 `DEEPSEEK_API_KEY`，在每次請求時解析憑證。已組合 credentials 服務時，按其優先順序解析；只有未組合該服務時才直接讀取啟動環境。請求時憑證缺失以 `MISSING_CREDENTIAL` 失敗；格式錯誤以 `INVALID_CREDENTIAL` 失敗。模型發現始終返回設定的目錄，不依賴憑證。

```yaml
- id: llm-deepseek
  name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config:
    reasoningEffort: high
    apiKeyEnv: DEEPSEEK_API_KEY
```

端點和憑證引用來自同一次設定解析；進行中的請求保留該快照，後續設定更新僅影響後續請求。帳號登入態不影響該路由使用的憑證。

`models` 是該 provider 獨立的可設定目錄；預設值和協定能力來自共享傳輸包。目錄判斷不探測推理端點。設定名稱空間採用 Cordis entry id，沒有 entry 時採用外掛名。產品保留 official 的 `llm-deepseek` entry id，帳號使用 `llm-deepseek-account`。

<a id="understand-the-implementation"></a>
## 理解實作

註冊和監聽隨外掛生命週期釋放。共享 Host 繫結提供附件存取、請求擴充功能、匿名標識和重試策略的原子更新；本包只註冊自己的路由。無需 invariant companion：目錄直接由設定派生，不維護獨立副本。

<a id="further-exploration"></a>
## 進一步探索

[LLM streaming](../../../docs/subsystems/llm-streaming.zh.md) · [Messages](../llm-deepseek/README.zh.md)

<a id="model-experience"></a>
## 模型體驗

### 已授權驗證的模型請求

#### What the model sees

`deepseek-official` 請求不包含本外掛新增的模型可見文字；請求由共享 Messages 傳輸序列化。

#### Token effect

授權驗證和目錄過濾不增加輸入 token；實際呼叫的 token 由所選模型與請求內容決定。

#### KV Cache effect

憑證與目錄可用性不進入模型輸入；協定傳輸擁有請求字首的序列化。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

- 目錄是設定中繼資料，不驗證遠端是否接受模型；實際呼叫仍可能失敗。

<a id="dev-note"></a>
### 開發備註

註冊與授權驗證的測試也覆蓋共享傳輸包中的 Loader 組合情境。
