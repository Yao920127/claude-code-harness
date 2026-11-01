---
description: "ctx.web 的 Claude Code 搜尋提供者：已登入 Claude Code 的 Host 如何無需 API 金鑰回答網頁搜尋。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-claude-code

[English](README.md) | 中文

## 概述

藉助 `dsh-web-search-claude-code`，harness 透過 Claude Code 內建的 `WebSearch` 工具回答網頁搜尋，使用 Host 自己的 Claude Code 登入而不是 API 金鑰。每次搜尋執行一次 Claude Code 查詢，該查詢唯一可用的工具是 `WebSearch`，其回答是列出所用頁面的結構化輸出。Host 已安裝並登入 Claude Code 時選擇它；CCH bundle 預設選擇它。面向模型的 `web_search` 工具位於 `dsh-tool-web`。

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

在已載入 web 與 subprocess 服務的組合中掛載本提供者；它以 `claude-code` 搜尋提供者身份註冊。用 web 服務的 `searchProvider` 或外掛頁的**搜尋來源**頁面選擇它。

### 何時選擇

希望由 Host 的 Claude Code 登入承擔搜尋費用、且未設定廠商金鑰時選擇本提供者。部署持有廠商 API 金鑰，或執行環境中 Claude Code 未登入時，改用 [`dsh-web-search-vendors`](../web-search-vendors/README.zh.md) 中的提供者。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: claude-code
- name: '@deepseek-ai/dsh-web-search-claude-code'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `model` | 空 | Claude Code 模型；為空時使用 Host 的 Claude Code 設定所選的模型 |
| `maxTurns` | `4` | 一次搜尋的最大 agent 輪數 |
| `env` | `{}` | 給 Claude Code 程序的額外環境變數 |
| `disposeGraceMs` | `3000` | 釋放時強制結束程序樹前的寬限時間 |

### 搜尋返回什麼

回答成為 `content`，每個列出的頁面成為帶 URL、標題與支援片段的來源。URL 無法解析或重複的來源會被丟棄；web 服務施加請求的 `maxResults`，提示詞中也會寫明該數量。

### 失敗與恢復

非成功的結果、沒有結果就結束的查詢以及程序失敗都以 `WEB_PROVIDER_ERROR` 失敗；程序失敗的訊息會提示使用者用 Claude Code CLI 登入。不含任何有效來源的輸出同樣失敗。取消會停止查詢並以 `WEB_ABORTED` 失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節說明提供者背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **由官方產品執行搜尋。** 提供者經由 Agent SDK 啟動固定版本的 Claude Code CLI，而不是讀取其儲存的登入憑證，與 [Claude Code 模型路由](../../llm/llm-claude-code/README.zh.md)的立場相同。
- **只提供 `WebSearch`。** 查詢限制工具列表且只允許該工具，因此搜尋不能在 Host 的主目錄中編輯檔案或執行命令。
- **在程序邊界驗證。** 結構化輸出在成為結果前逐欄位檢查。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定 schema 與註冊提供者 |
| [`src/provider.ts`](src/provider.ts) | 提供者：查詢選項、程序所有權與結果驗證 |
| — | 不釋出執行時不變數伴隨包；每次搜尋自行擁有並釋放其程序，因此不存在可能分歧的獨立觀察。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Web 包地圖](../README.zh.md)——每個搜尋與抓取提供者及其職責。
- [dsh-subagent-claude-code](../../subagent/subagent-claude-code/README.zh.md)——本提供者複用的程序啟動與所有權。
- [多廠商搜尋決策](../../../.agents/notes/implemented/feature/2026-09-26-multi-vendor-web-search.zh.md)——為什麼在廠商提供者之外還有 Claude Code 搜尋。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，經由 `dsh-tool-web`：它保留本提供者受 `maxResults` 限制的回答文字、URL、標題與片段，或把 `Claude Code search failed: <error>. Sign in with the Claude Code CLI on the host, then retry.`、`Claude Code search ended without a result (<subtype>)`、`Claude Code search returned no web sources` 與 `Claude Code search aborted` 失敗包在消費方的錯誤包裝中。

#### KV Cache 影響

不直接造成失效；請求字首的變化由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **每次搜尋都會啟動一個 Claude Code 程序。** 搜尋比直接呼叫 API 慢，並計入已登入帳號的用量。
- **搜尋請求不是 Session 事件。** 模型傳送的查詢與收到的結果保留在工具呼叫與工具結果中；Claude Code 不保留搜尋的記錄。
- **向託管部署的其他使用者提供 Host 的登入需要 Anthropic 的批准**，與 Claude Code 模型路由相同。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作備註——點選展開</summary>

本開發備註是給維護者的工作背景：未決問題與尚未確定的方向。它明確不具權威性——已釋出的行為、限制與理由位於上面各節及所連結的 Agent Note。

#### 後續：複用程序

長期存活的 Claude Code 程序可以省去每次搜尋的啟動時間，但需要自己的空閒與失敗生命週期。

</details>
