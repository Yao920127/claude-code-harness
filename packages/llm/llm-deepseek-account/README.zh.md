---
description: "DeepSeek 帳號 authentication and model discovery."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-deepseek-account

[English](README.md) | 中文

## 概述

為 `deepseek-account` 註冊獨立的授權驗證和模型發現外掛。透過 [llm-deepseek](../llm-deepseek/README.zh.md) 共用 Messages 請求實作；本包擁有憑證解析和目錄可用性判斷。

授權驗證解析返回 `x-dsh-auth-token` 和捕捉同一 token 的失敗回呼。HTTP 401 的分類和憑證失效處理由此提供者負責；被拒絕的舊請求不能清除替換後的登入。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

<a id="use-this-package"></a>
## 使用此包

帳號 token 僅由 `deepseekAccount.resolveToken(baseURL)` 提供，目標地址必須滿足帳號服務的來源驗證。未登入或目標不允許帳號授權驗證時，請求以 `ACCOUNT_SIGN_IN_REQUIRED` 失敗，目錄為空；不會退回到 API key。其他憑證查詢錯誤繼續向呼叫者報告。

```yaml
- id: llm-deepseek-account
  name: '@deepseek-ai/dsh-llm-deepseek-account'
  config:
    reasoningEffort: high
```

帳號請求的 HTTP 401 與回應正文無關：對映為 `ACCOUNT_TOKEN_INVALID`，並要求帳號服務僅在目前 token 仍與請求所用 token 相同時清除憑證。403 和其他錯誤不會觸發清除。帳號模組負責退登後打斷任務，本外掛不遍歷 Agent。

`models` 是該 provider 獨立的可設定目錄；預設值和協定能力來自共享傳輸包。目錄判斷不探測推理端點。設定名稱空間採用 Cordis entry id，沒有 entry 時採用外掛名。產品保留 official 的 `llm-deepseek` entry id，帳號使用 `llm-deepseek-account`。

<a id="understand-the-implementation"></a>
## 理解實作

註冊和監聽隨外掛生命週期釋放。共享 Host 繫結提供附件存取、請求擴充功能、匿名標識和重試策略的原子更新；本包只註冊自己的路由。無需 invariant companion：目錄直接由同一次設定和憑證讀取派生，不維護獨立副本。

共享傳輸判定為 `QUOTA` 的失敗請求離開本提供者前會被改寫為 `ACCOUNT_QUOTA`，HTTP 402 回應與流內 SSE 錯誤都適用。共享傳輸與 `deepseek-official` 路由保留 `QUOTA`，因此帳號路由的充值操作不會出現在 API Key 或第三方失敗上。

<a id="further-exploration"></a>
## 進一步探索

[LLM streaming](../../../docs/subsystems/llm-streaming.zh.md) · [Messages](../llm-deepseek/README.zh.md)

<a id="model-experience"></a>
## 模型體驗

### 已授權驗證的模型請求

#### What the model sees

`deepseek-account` 請求不包含本外掛新增的模型可見文字；請求由共享 Messages 傳輸序列化。

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
