---
description: "面向把已認證 JSON 事件路由到 webhook 執行時的部署，說明帶簽名的 GitHub webhook 介面卡。"
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook-github

[English](README.md) | 中文

## 概述

`dsh-webhook-github` 會在注入的 `ctx.webServer` 上註冊一條精確 HTTP 路由。它限制並驗證 GitHub 原始 JSON body，投影提供者無關的交付，呼叫 `ctx.webhookRuntime.dispatch()`，並在不等待規則或工作階段的情況下返回 `202`。部署需要為通用 webhook 執行時提供經過身份驗證的 GitHub 入口時，請使用它。

## 目錄

- [設定](#configuration)
- [HTTP 約定](#http-contract)
- [專用監聽器組合](#dedicated-listener-composition)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="configuration"></a>
## 設定

| Key | 含義 |
|---|---|
| `source` | 攜帶給規則的非空介面卡實例，例如 `primary-github`。 |
| `path` | 不帶尾隨斜槓、查詢或片段的精確非根路徑。 |
| `secretEnv` | 包含 GitHub webhook 金鑰的憑證引用。 |
| `maxBodyBytes` | 未改動請求 body 的正安全整數上限。 |

所有欄位均為必填。每次請求都會重新解析金鑰引用，因此輪換會在下一次交付生效，而無需重新載入外掛。

<a id="http-contract"></a>
## HTTP 約定

只接受 `POST application/json`。介面卡讀取有界 UTF-8 body，要求 `X-Hub-Signature-256`、`X-GitHub-Delivery` 與 `X-GitHub-Event`，解析金鑰，在 JSON 解析前驗證 HMAC，並要求頂層是無損 JSON 物件。它絕不記錄金鑰、簽名或 payload。

| 狀態 | 含義 |
|---|---|
| `202` | 已驗證 JSON 已在記憶體中分發。 |
| `400` | 必需 header、UTF-8、JSON 或頂層物件無效。 |
| `401` | 簽名無效。 |
| `405` | 方法不是 `POST`。 |
| `413` | 宣告或流式 body 超過 `maxBodyBytes`。 |
| `415` | media type 不是 `application/json`。 |
| `503` | 憑證或 webhook 執行時不可用。 |

`202` 不表示任何規則已經匹配，也不表示已建立工作階段。GitHub 事件特定欄位的驗證屬於各規則；介面卡只保證透過身份驗證的通用 JSON。

<a id="dedicated-listener-composition"></a>
## 專用監聽器組合

普通 Web profile 已經擁有 `ctx.webServer`。把另一個 `dsh-host-webserver` 和此介面卡掛載到僅隔離 `webServer` 的 group 內；介面卡仍會繼承憑證與 `webhookRuntime`。[GitHub 評審指南](../../../docs/user/guide/github-review.zh.md)在 TLS 反向代理後使用 `127.0.0.1:3081/github`，而 UI 繼續位於埠 3080。

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-webhook` 間接產生影響：此介面卡不貢獻提示詞或工具 schema；匹配規則擁有工作階段請求與模型可見文字。

#### KV Cache 影響

相互獨立。身份驗證與 HTTP 分發不觸碰模型請求；任何新工作階段字首都屬於消費它的規則與執行時。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **無 TLS**：注入的開發 WebServer 通常只監聽 loopback，並位於 TLS 反向代理或 tunnel 後。
- **僅通用 payload 驗證**：規則負責驗證自己消費的 GitHub 事件欄位。
- **不向提供者確認下游工作**：`202` 先於任意規則呼叫與工作階段建立。
- **不支援表單編碼**：GitHub 必須傳送 `application/json`；`application/x-www-form-urlencoded` 會被拒絕。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。authentication 與 input validation 在對應 HTTP 操作中完成；route/disposer 對稱性由 `dsh-host-webserver` 負責。
