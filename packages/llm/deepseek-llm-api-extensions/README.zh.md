---
description: "面向提供者外掛的官方 DeepSeek 請求擴充功能註冊表，用於貢獻具有生命週期歸屬的頂層 API 欄位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-deepseek-llm-api-extensions

[English](README.md) | 中文

## 概述

用於向 DeepSeek 官方 LLM（大語言模型）API 請求新增頂層欄位的提供者特定註冊表。`DeepSeekLlmApiExtensionRegistry` 註冊 `ctx.deepseekLlmApiExtensions`；貢獻外掛分別認領一個經宣告合併的欄位，`dsh-llm-deepseek` 則在序列化基礎請求後準備目前貢獻。當外掛必須新增經過驗證的提供者特定欄位且不能修改基礎介面卡時，請使用它。

## 目錄

- [服務](#service)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="service"></a>
## 服務

- `register(field, provider)` 為呼叫 fiber 保留一個欄位。重複或格式錯誤的名稱會同步失敗；dispose（資源釋放）該註冊後，後續提供者可以再次認領。
- `prepare(request)` 對已註冊提供者取快照，並行準備貢獻，克隆並凍結返回的 JSON 值，然後返回 `{ fields, accept }`。準備失敗會在 HTTP 分發前拒絕請求；請求取消後，即使某個提供者忽略訊號，註冊表也會停止等待。
- `accept()` 對每個捕捉的 2xx 後回呼只執行一次。並行呼叫會等待同一次結算，所有回呼都在報告失敗前完成，多個失敗會合併為一個 `AggregateError`。

每個提供者都會看到確切的已序列化 Messages 請求體、請求 `AbortSignal`，以及可選的 `sessionId` 與輔助呼叫 `purpose`。提供者必須在取消後迅速停止自身工作；欄位不適用於目前請求時返回 `undefined`。即使 HMR（熱模組替換）在 HTTP 接受前移除了註冊，已準備的操作仍會保留其捕捉的提供者。

註冊表擁有欄位新增與生命週期，不擁有欄位語義。`@deepseek-ai/dsh-session-log-deepseek` 擁有 `dsh_session_log`；`@deepseek-ai/dsh-plugin-package-inventory-deepseek` 擁有 `dsh_plugin_packages`。提供者無關的 LLM seam 與 `llm-pi-ai` 都不消費該註冊表。

<a id="model-experience"></a>
## 模型體驗

透過 `@deepseek-ai/dsh-llm-deepseek` 間接生效；該包在模型的 `messages`、系統提示詞與工具 schema 之外傳送已註冊欄位。

#### KV Cache 影響

無；註冊表欄位是模型不可見的提供者中繼資料，不改變已序列化的模型輸入字首。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **僅限 DeepSeek 官方請求**——該註冊表刻意不提供提供者無關的路由，也不整合 pi-ai 介面卡。
- **不約定欄位順序**——JSON 物件成員順序取決於註冊準備順序，但接收方按名稱定址欄位。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。重複所有權、detached output 與單次 acceptance settlement 都在擁有該決策的註冊表操作中強制。
