---
description: "在普通 Cordis YAML 中定義 Agent 的子外掛列表。可同時宣告多個 preset，由工作階段選擇。宣告會提前載入，修改隻影響之後建立的 Agent。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-preset

[English](README.md) | 中文

## 概述

在普通 Cordis YAML 中定義 Agent 的子外掛列表。可同時宣告多個 preset，由工作階段選擇。宣告會提前載入，修改隻影響之後建立的 Agent。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與待辦](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    plugins: []
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `id` | 必填 | 穩定的 preset 識別符號 |
| `plugins` | 必填 | 子外掛行列表 |
| `name` | 未設定 | 展示名稱 |
| `description` | 未設定 | 展示說明 |
| `order` | 未設定 | 列表排序 |

宣告行的 `id` 是 Loader 編輯地址；`config.id` 是工作階段儲存的 preset 識別符號。子外掛可省略行 ID，由 Loader 分配。

本包還隨包出貨創造模式透過 `skill-filesystem` 掛載的 `skills/` 目錄：`cordis-plugin-development`（簡短流程，配合按需讀取的 `references/` 與可複製的 `templates/` 組合包）、`editing-cordis-compositions`，以及 `cordis-composition-reference`，後者的 `references/packages.md` 由 `scripts/gen-plugin-packages.ts` 生成並在 `doc-sync` 中做新鮮度門禁。兩個流程 skill 讓 agent 先讀檢查結果，再讀 `Config.listConfigs` 報告的 `packageDir` 下的包 README，最後讀建置後的 `lib/` 或 checkout 原始碼。每個出貨的 `SKILL.md` 作為 `skill` 工具結果渲染後都保持在 8192 字元閾值之下，標準 preset 的工具結果修剪器超過該閾值才會裁剪。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

[index.ts](src/index.ts) 註冊定義並把清理函式交給 Cordis。外掛的 group 標記保留子設定中的 `!!js`，直到對應子外掛載入時才求值。代際持有與釋放由 [註冊表](../agent-preset-registry/README.zh.md) 管理。

</details>

<a id="further-exploration"></a>
## 延伸閱讀

- [Scope](../../core/scope/README.zh.md) — 註冊隔離。
- [Agent](../../core/agent/README.zh.md) — 工作階段執行時。
- [Cordis](../../../docs/cordis-primer.zh.md) — 外掛設定與生命週期。

<a id="model-experience"></a>
## 模型體驗

透過宣告的外掛間接影響模型，這些外掛擁有模型可見工具和提示詞。

#### KV Cache effect

同一 Agent 的組合保持穩定；新 Agent 可使用更新後的定義。

## 已知限制與待辦

<a id="known-limitations-and-deferred-work"></a>

- 需要 `agentPresets` 服務。重複的 preset ID 會導致宣告載入失敗。宣告不提供目錄、檔案複製或檔案刪除操作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>

**執行時不變數：** 不釋出 companion；本外掛僅提交由註冊表管理的定義，沒有可獨立偏離的執行時狀態。
