---
description: "計算機操作提供者註冊：供每次啟用一個桌面驅動的部署使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-computer-use

[English](README.md) | 中文

## 概述

部署每次可啟用一個計算機操作提供者。載入另一個提供者時會失敗，並報告已註冊的提供者名稱。各提供者提供自己的工具和桌面操作。本包不新增模型可見工具，也不協調並行 Session。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Cordis 組合中，將服務與選定的提供者一起掛載一次：

```yaml
- name: '@deepseek-ai/dsh-computer-use'
```

服務沒有設定項。提供者外掛注入 `computerUse` 並呼叫 `ctx.computerUse.register(ComputerUseProviderName(name))`；該品牌型別從 `@deepseek-ai/dsh-computer-use/brand` 匯出。返回的 effect 清理函式釋放此次註冊。

提供者先停止接收工具呼叫、關閉資源並等待自有工作結束，再釋放註冊。釋放前，`ctx.computerUse.providerName` 始終報告已註冊的名稱。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

一個私有名稱佔用註冊位置。Cordis effect 在外掛解除安裝時移除貢獻；重複呼叫清理函式不會移除後續註冊。[原始碼](src/index.ts)不包含驅動物件、操作介面或提供者選擇器。

不釋出 `./invariant` 伴隨入口：註冊表只有一個權威欄位，沒有可能與之分歧的獨立維護觀測值。所屬測試覆蓋重複註冊拒絕和外掛解除安裝。

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [計算機操作](../../../docs/subsystems/computer-use.zh.md) — 提供者選擇和共享桌面限制。
- [Cua Driver MCP 提供者](../../experimental/computer-use-cua-driver-mcp/README.zh.md) — 使用已安裝的驅動。
- [Cua Driver 原生提供者](../../experimental/computer-use-cua-driver-native/README.zh.md) — 使用 npm 執行時。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為此註冊表只記錄提供者名稱。

#### KV 快取影響

註冊不改變模型請求。提供者擁有的工具和指導文字決定各自對請求字首的影響。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

服務在其 Cordis 服務實例內限制註冊。

- **共享桌面** — 並行 Session 和獨立 DSH 程序可以操作同一桌面；呼叫方協調完整的計算機操作流程。
- **提供者選擇** — 由設定選擇提供者；模型不能在執行時切換已註冊的驅動。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作背景 — 點選展開</summary>

無。

</details>
