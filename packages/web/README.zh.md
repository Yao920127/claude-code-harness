---
description: "web 存取能力家族的包對映：搜尋與抓取服務、其提供者後端，以及消費它們的面向模型工具。"
kind: "package-group"
---

# web/：web 存取能力家族

[English](README.md) | 中文

## 概述

`web/` 包讓模型透過 `web_search` 與 `web_fetch` 工具搜尋公共 web 和抓取 HTTP(S) 頁面。部署可為搜尋選擇 Claude Code、Claude API、OpenAI、xAI、Gemini、OpenRouter、Mistral、Z.AI、Exa、Perplexity 或 DeepSeek，並透過匿名 HTTP(S) 存取抓取頁面；可用性與資源上限取決於設定的提供者。該家族用於搜尋和頁面檢索，不用於互動式瀏覽、內容提取或逐 URL 策略執行。提供者變化時，模型仍能獲得一致的工具行為、取消與錯誤報告。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

八個包分別承擔 web 角色；完整詞彙與約定以子系統參考文件為準。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`web/`](web/README.zh.md) | 搜尋與抓取服務：透過可互換的後端搜尋與抓取 URL，統一選擇與錯誤策略 | `ctx.web` |
| [`web-search-exa/`](web-search-exa/README.zh.md) | 透過 Exa 搜尋 web | 註冊到 `ctx.web` |
| [`web-search-perplexity/`](web-search-perplexity/README.zh.md) | 透過 Perplexity 搜尋 web | 註冊到 `ctx.web` |
| [`web-search-deepseek/`](web-search-deepseek/README.zh.md) | 透過 DeepSeek 原生搜尋搜尋 web | 註冊到 `ctx.web` |
| [`web-search-vendors/`](web-search-vendors/README.zh.md) | 透過 Claude API、OpenAI、xAI、Gemini、OpenRouter、Mistral 或 Z.AI 搜尋 web | 註冊到 `ctx.web` |
| [`web-search-claude-code/`](web-search-claude-code/README.zh.md) | 用 Host 的登入透過 Claude Code 搜尋 web | 註冊到 `ctx.web` |
| [`web-fetch-http/`](web-fetch-http/README.zh.md) | 匿名抓取公共 HTTP(S) 頁面 | 註冊到 `ctx.web` |
| [`tool-web/`](tool-web/README.zh.md) | 向模型公開 `web_search` 與 `web_fetch` | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考文件瞭解共享詞彙，再看單一提供者選擇服務背後的設計決策。

- [web 子系統](../../docs/subsystems/web.zh.md)——搜尋與抓取的請求和結果、提供者可用性、`WebError` 與公開地址強制規則。
- [web 能力 seam 決策](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜尋與抓取為何共用一項提供者選擇服務。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
