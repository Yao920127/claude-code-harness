---
description: "LLM（大語言模型）能力包組：一個提供者無關的模型呼叫服務、DeepSeek、pi-ai、Claude Code 與 coding CLI 提供者介面卡、請求重試執行，以及具備回放感知的 token 計量。"
kind: "package-group"
---

# llm/ — LLM 能力家族

[English](README.md) | 中文

## 概述

llm 組提供 harness 的模型呼叫能力：一個提供者無關的服務，任何組合都可以透過它向模型提供者發起流式請求，外加介面卡、提供者專用請求中繼資料、重試執行與計量。核心 `llm` 包定義所有外掛與工作階段日誌使用的訊息、內容塊與流式分片詞彙；提供者介面卡把某個提供者的協定格式（wire format）翻譯為該詞彙；DeepSeek 請求擴充功能外掛在模型輸入之外貢獻具有生命週期歸屬的中繼資料；`llm-retry` 在持久化的 agent（智慧代理）步驟邊界上重跑失敗的請求；`token-meter` 從持久化日誌測量請求與上下文壓力。本頁列出該包組的組成；每個包 README 負責各自的包級約定。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`llm/`](llm/README.zh.md) | 透過已註冊的提供者介面卡流式發起一次模型呼叫，並共享 harness 的訊息、塊與分片詞彙 | `ctx.llm` |
| [`llm-deepseek/`](llm-deepseek/README.zh.md) | 共享 Messages 協定、請求設定與模型能力 | — |
| [`llm-deepseek-api-key/`](llm-deepseek-api-key/README.zh.md) | API key 授權驗證與 official 模型發現 | `ctx.llm` |
| [`llm-deepseek-account/`](llm-deepseek-account/README.zh.md) | 帳號 token 授權驗證、失效處理與模型發現 | `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.zh.md) | 透過 pi-ai 目錄與協定格式服務設定的提供者路由，包括手工宣告的閘道 | 註冊到 `ctx.llm` |
| [`llm-claude-code/`](llm-claude-code/README.zh.md) | 以主機自己的 Claude Code 登入，把每次模型呼叫作為一個 Claude Code 回合執行，並提供 `claude-code` preset | 註冊到 `ctx.llm` |
| [`llm-coding-cli/`](llm-coding-cli/README.zh.md) | 以各 CLI 自己的登入，把每次模型呼叫作為一個 Codex、Antigravity、Grok Build 或 OpenCode 的 headless 回合執行 | 註冊到 `ctx.llm` |
| [`deepseek-llm-api-extensions/`](deepseek-llm-api-extensions/README.zh.md) | 在官方 DeepSeek 請求上註冊具有生命週期歸屬的頂層欄位 | `ctx.deepseekLlmApiExtensions` |
| [`plugin-package-inventory-deepseek/`](plugin-package-inventory-deepseek/README.zh.md) | 為官方 DeepSeek 請求貢獻目前啟用的 Loader 包清單 | 貢獻 `dsh_plugin_packages` |
| [`llm-retry/`](llm-retry/README.zh.md) | 在持久 agent 步驟邊界上按各提供者策略重試失敗的模型請求 | 監聽 `agent/request-error` |
| [`token-meter/`](token-meter/README.zh.md) | 用固定啟發式規則從持久工作階段日誌測量請求與上下文壓力 | `ctx.tokenMeter` |

-----

<a id="related-documentation"></a>
## 相關文件

- [LLM 流式子系統](../../docs/subsystems/llm-streaming.zh.md)——訊息與塊型別、組裝後的模型請求、`StreamChunk` 協定與介面卡約定（adapter contract）。
- [Token 計量子系統](../../docs/subsystems/token-meter.zh.md)——`ctx.tokenMeter` 背後的測量語義。
- [孿生 LLM 介面卡](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什麼 DeepSeek 路由交付兩個結構不同的介面卡。
- [按路由的模型上下文](../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.zh.md)——loop 如何路由模型請求並壓縮上下文。

<a id="dev-note"></a>
## 開發備註

無。
