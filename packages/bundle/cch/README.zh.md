---
description: "CCH（Claude Code Harness）profile bundle：以 Claude Code 作為預設模型路由，搭配 Claude 品牌與繁體中文，面向組合 CCH profile 的使用者與 CCH Desktop 建置的維護者。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-cch

[English](README.md) | 中文

## 概述

把 `dsh-cch` 疊加在 `dsh-base` 與 `dsh-web-app` 之後，即可讓 profile 成為 CCH profile：新 Session 以 Claude Code 模型路由開始，該路由使用主機本身的 Claude Code 登入，DeepSeek 模型路由、DeepSeek 帳號設定與 DeepSeek 官方品牌佔位者不會掛載。本 bundle 依賴 [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.zh.md) 與 [`dsh-client-ui-brand-claude`](../../client/ui-brand-claude/README.zh.md)；請把這些 bundle 列在它之前。CCH Desktop 建置會在每個新 Desktop profile 中列出全部三個；隨附的 `cch` CLI profile 組合同一列表，因此 `pnpm cch web` 提供的 Web 應用與 Desktop 顯示的相同。

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

按以下順序把四個 CCH bundle 安裝進 Profile，然後重新啟動：

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-claude-code @deepseek-ai/dsh-client-ui-brand-claude @deepseek-ai/dsh-cch
```

| 行 | 變更 |
|---|---|
| `agent-default-model` | 預設模型 `claude-code` / `default`，即你的 Claude Code 設定所選的模型 |
| `locale` | 介面語言 `zh`（繁體中文），直到在設定中選擇其他語言 |
| `llm-deepseek`、`llm-deepseek-account` | 停用，使模型選擇器只列出 Claude 模型 |
| `ui-brand-official` | 停用，使 Claude 品牌在官方建置中佔用側邊欄 |
| `ui-settings-account` | 停用，使設定中不提供 DeepSeek 帳號登入 |
| `command-feedback`、`message-feedback`、`ui-message-feedback`、`session-telemetry-otel`、`session-log-deepseek` | 已停用，因此不顯示回饋控制元件，也不會向 DeepSeek 的回饋、遙測或工作階段日誌端點傳送任何內容 |
| `ui-claude-code-usage`（插入） | 側欄底部顯示 Claude Code 登入帳號的五小時與每週方案用量（[詳情](../../client/ui-claude-code-usage/README.zh.md)） |
| `ui-git`（插入） | 右側欄「開始」頁提供原始碼管理：無需 Git 命令即可提交、拉取與推送，並支援 GitHub 登入、複製與釋出（[詳情](../../client/ui-git/README.zh.md)） |
| `web-search-claude-code`（插入）、`web` | 網頁搜尋使用同一登入執行 Claude Code 的 `WebSearch`；外掛頁的**搜尋來源**頁面可選擇其他提供者 |
| `ui-sidebar-browser` | 在每個 CCH profile 中啟用，與 Desktop 相同 |

Web 應用儲存到 profile 補丁中的個人設定會在本 bundle 之後生效，並覆蓋這些行。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

本包的實質內容是 [`cordis.patch.yml`](cordis.patch.yml)，即針對 `dsh-base` 與 `dsh-web-app` 所插入行、以 id 定位的補丁列表；[`src/index.ts`](src/index.ts) 不帶任何執行時 API。補丁會替換某行的完整設定，因此 `agent-default-model` 條目會重述完整的選擇。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [dsh-llm-claude-code](../../llm/llm-claude-code/README.zh.md)——本 bundle 預設選擇的 Claude Code 模型路由。
- [dsh-base](../base/README.zh.md)——本 bundle 所修補的核心行。

<a id="model-experience"></a>
## 模型體驗

間接地，透過其所選的 Claude Code 模型路由，該路由負責其面向模型的行為。

#### KV Cache 影響

bundle 本身不增加任何請求字首；所選路由負責任何快取影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **既有 Desktop profile 保留原有 bundle 列表**——只有由 CCH 建置建立的 Desktop profile 才會列出 CCH bundle；較早的 profile 需要手動新增。
- **DeepSeek 路由仍然安裝**——這些行只是被停用而非移除，因此在 profile 補丁中重新啟用某行即可恢復。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作背景——點選展開</summary>

無。

</details>

**執行時不變數：** 不釋出配套模組。本 bundle 是補丁列表，不擁有任何執行時關係。
