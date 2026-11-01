---
description: "實驗組地圖：可公開安裝的預穩定原型。"
kind: "package-group"
---

# packages/experimental

[English](README.md) | 中文

## 概述

實驗組包含約定可能變更且不提供支援承諾的原型能力。所有目前包都以 `@deepseek-ai/dsh-experimental-*` 名稱釋出，包括顯式啟用的 Agent Teams 組合、Auto review、Cua Driver 提供者、瀏覽器操作後端、跨 realm Inspector、CPython PTC 後端與瀏覽器 worker 預覽庫。組外已釋出產品不得依賴實驗性包。dsh 安裝將 Agent Teams、語音輸入與 Auto review 包作為可選 bundle 一起釋出，可從 Web 側邊欄“外掛”頁啟用（[決策](../../.agents/notes/implemented/architecture/2026-09-21-experimental-capabilities-as-optional-bundles.zh.md)）；其餘包是庫或顯式組合。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`speech-to-text`](speech-to-text/README.zh.md) | 具名語音識別 Provider | `ctx.speechToText` |
| [`speech-to-text-sensevoice`](speech-to-text-sensevoice/README.zh.md) | 託管本地 SenseVoice 推理 | — |
| [`api-speech-to-text`](api-speech-to-text/README.zh.md) | 帶認證的臨時轉寫 Remote | `ctx.speechController` |
| [`client-ui-voice-input`](client-ui-voice-input/README.zh.md) | 麥克風錄音與版本檢查後的草稿插入 | — |
| [`voice-input-bundle`](voice-input-bundle/README.zh.md) | 預設停用的可選語音輸入組合 | — |
| [`agent-team-profile`](agent-team-profile/README.zh.md) | Agent Teams 協作、工具與 Web UI 組合包 | — |
| [`agent-team`](agent-team/README.zh.md) | 具名 teammate，成員之間持久訊息與共享任務板 | `ctx.agentTeams` |
| [`client-ui-agent-team`](client-ui-agent-team/README.zh.md) | Web Team roster、任務板與 teammate 導航 | — |
| [`auto-review`](auto-review/README.zh.md) | 顯式 Web 層，在每個原生或 PTC inner 工具呼叫前使用同一模型審查 | — |
| [`ptc-runtime-python`](ptc-runtime-python/README.zh.md) | PTC 執行 seam 的 CPython 子程序後端 | `ctx.ptcRuntime` |
| [`computer-use-cua-driver-mcp`](computer-use-cua-driver-mcp/README.zh.md) | 透過 MCP 使用已安裝的 Cua Driver | `ctx.computerUse` |
| [`computer-use-cua-driver-native`](computer-use-cua-driver-native/README.zh.md) | 嵌入 Cua Driver 原生 npm 執行時 | `ctx.computerUse` |
| [`browser-use-playwright-mcp`](browser-use-playwright-mcp/README.zh.md) | 透過 MCP 提供 Playwright 瀏覽器工具 | `ctx.browserUse` |
| [`browser-use-chrome-devtools-mcp`](browser-use-chrome-devtools-mcp/README.zh.md) | 透過 MCP 提供 Chrome DevTools 檢查與瀏覽器控制 | `ctx.browserUse` |
| [`browser-use-stagehand-native`](browser-use-stagehand-native/README.zh.md) | Stagehand 瀏覽器操作與顯式設定的原生模型 | `ctx.browserUse` |
| [`browser-use-runtime`](browser-use-runtime/README.zh.md) | 實驗性提供者共享的 Session 瀏覽器資源 | — |
| [`inspector`](inspector/README.zh.md) | 用於 Host 除錯、Client Runtime 檢查、網路採集與 Cordis 樹的跨 realm CDP hub | `ctx.inspector` |
| [`tool-agent-team`](tool-agent-team/README.zh.md) | 讓模型建立、發訊息與協調 teammate 的九個工具 | 按作用域註冊工具到 `ctx.tools` |
| [`webworker-packer`](webworker-packer/README.zh.md) | 建置瀏覽器 worker 預覽所消費的 gzip 壓縮虛擬檔案系統（VFS）映像 | 庫與 CLI（命令列介面），不使用 ctx key |
| [`webworker-runtime`](webworker-runtime/README.zh.md) | 在專用瀏覽器 worker 中執行 harness 外掛樹 | 庫與 worker 入口，不使用 ctx key |

-----

<a id="related-documentation"></a>
## 相關文件

- [實驗包釋出決策](../../.agents/notes/implemented/process/2026-09-12-experimental-publication-denylist.zh.md)——預設公開與私有例外。
- [計算機操作](../../docs/subsystems/computer-use.zh.md)——桌面提供者選擇。
- [瀏覽器操作](../../docs/subsystems/browser-use.zh.md)——瀏覽器提供者選擇與 Session 所有權。
- [Agent Teams 子系統](../../docs/subsystems/agent-team.zh.md)——持久 Team 型別與 `ctx.agentTeams` 服務 API。
- [實驗子樹規則](AGENTS.md)——實驗狀態放寬了什麼、不放寬什麼。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
