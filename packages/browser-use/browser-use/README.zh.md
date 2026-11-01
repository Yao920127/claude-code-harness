---
description: "瀏覽器操作 提供者 註冊服務，供一次啟用一個瀏覽器後端的部署使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-browser-use

[English](README.md) | 中文

## 概述

部署可以一次啟用一個瀏覽器操作 提供者。載入另一個 提供者 時會報錯並指出已註冊的 提供者 名稱。各 提供者 提供自己的工具並擁有瀏覽器工作階段。本包不新增模型可見工具或瀏覽器操作。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Cordis 組合中，將服務與所選 提供者 一起掛載一次：

```yaml
- name: '@deepseek-ai/dsh-browser-use'
```

服務沒有設定。提供者 外掛注入 `browserUse` 並呼叫 `ctx.browserUse.register(BrowserUseProviderName(name))`；品牌型別從 `@deepseek-ai/dsh-browser-use/brand` 匯出。返回的 effect 清理器釋放該註冊。

提供者 在釋放註冊前停止接收工具呼叫、關閉資源並等待自己擁有的工作結束。`ctx.browserUse.providerName` 在釋放之前持續報告已註冊名稱。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部機制 — 點選展開</summary>

一個私有名稱擁有該註冊位。Cordis effect 在外掛解除安裝時移除貢獻；重複呼叫清理器不能移除後續註冊。[原始碼](src/index.ts) 不包含瀏覽器物件、操作介面、資源生命週期或 提供者 選擇器。

不釋出執行時不變數伴隨入口：註冊表只有一個權威欄位，不暴露可能與之偏離的獨立維護觀測值。所屬測試覆蓋重複註冊拒絕與外掛清理。

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [瀏覽器操作](../../../docs/subsystems/browser-use.zh.md) — 提供者 選擇與 Session 所有權。
- [Playwright MCP 提供者](../../experimental/browser-use-playwright-mcp/README.zh.md) — Playwright 瀏覽器工具。
- [Chrome DevTools MCP 提供者](../../experimental/browser-use-chrome-devtools-mcp/README.zh.md) — Chromium 檢查與控制。
- [Stagehand 提供者](../../experimental/browser-use-stagehand-native/README.zh.md) — 支援 AI（人工智慧）輔助的原生瀏覽器操作。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為此註冊表只記錄 提供者 名稱。

#### KV Cache 影響

註冊不改變模型請求。提供者 擁有的工具與指導決定各自對請求字首的影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

服務在其 Cordis 服務實例內限制註冊。

- **瀏覽器所有權** — 提供者 擁有瀏覽器資源並實施 Session 隔離；此服務不儲存瀏覽器狀態。
- **提供者 選擇** — 設定選擇 提供者；模型不能在執行時切換已註冊後端。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
