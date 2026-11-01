---
description: "面向使用者與維護者的 agent（智慧代理）平面呈現選擇器說明，用於選擇、設定或除錯 agent preset 的模型看到其工具的哪種形態。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-tool-presentation

[English](README.md) | 中文

## 概述

在 [agent preset](../../preset/agent-preset-registry/README.zh.md) 中使用 `dsh-agent-tool-presentation`，可固定模型看到全部原生工具 schema、只有帶生成 SDK 的 `run_code`，還是同時看到兩種形態。每個 preset 可獨立選擇，因此 native 與 PTC agent 可以共享同一程序，而不共享工具目錄。選擇 `ptc` 或 `both` 需要相容的 PTC 執行時；沒有該執行時的部署會在掛載時拒絕 preset，不會等到收到第一條提示詞。使用本包時 `mode` 欄位為必填；省略本包則沿用部署預設值。

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

把這一行加入 agent preset，以固定每個加入該 preset 的 agent 看到其工具的方式。`native` 以函式定義的形式呈現每個可見工具 schema；`ptc` 只呈現 `run_code` 傳輸、一份生成的 SDK 以及「只有 `run_code` 可被直接呼叫」這條規則；`both` 同時呈現兩種形態。未作宣告的 agent 會拿到 [`dsh-tools`](../tools/README.zh.md) 那一行上的部署級 `mode`。

### 把這一行加入 preset

```yaml
- name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: ptc
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `mode` | 必填 | `native`——每個 schema；`ptc`——`run_code` 加生成 SDK；`both`——兩種形態 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-tool-presentation)是每個受支援欄位的窮盡式真源。`mode` 是必填而非有預設值，因為不帶這一行的 preset 會繼承部署預設值。

### PTC 模式需要什麼

選擇 `ptc` 或 `both` 需要已組合的 PTC 執行時（`ctx.ptcRuntime`），且其語言有已註冊的 SDK 渲染器——TypeScript 執行時經 [`dsh-ptc-runtime-node`](../../ptc-runtime/ptc-runtime-node/README.zh.md) 交付，TypeScript 與 Python 的 SDK 渲染器都內建在 `dsh-tools` 中。針對未組裝此類執行時的部署選擇 PTC 模式的 preset 會拒絕掛載並點名這一行，使失敗落在操作者可以行動的地方，而不是落在工作階段的第一次請求上。

### 每個 agent 只宣告一次呈現方式

一個 agent 只宣告一次呈現方式。同一份組裝裡的第二次宣告會被拒絕而不是合併：對「模型看到哪種形態」給出兩個答案是矛盾，不是覆蓋。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該包如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

工具註冊表搬不進 preset：它的消費方全在主機平面——agent loop（智慧代理迴圈）讀它的排程器，API proxy 讀它的展示轉換器，每個工具外掛都往裡註冊——而一個服務只有在所有消費方一起下沉時才能下沉。preset 能擁有的是這份註冊表的呈現方式。`ctx.tools.presentAs()` 為掛載作用域宣告它，而掛載作用域就是 preset 的常駐掛載，因此該宣告覆蓋每個加入該 preset 的 agent，一個 PTC mode preset 可以與多個 native preset 同程序並存。每個組合一行，而不是每個工作階段一行。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`mode` 設定、把 `ctx.tools.presentAs` 接到掛載作用域的 `apply` |
| — | 不釋出執行時不變式伴生入口；本包只對 `ctx.tools` 發起一次 scoped 呼叫，不持有自己的事件或快照；它建立的是「某個 agent 的組裝採用哪種呈現方式」這一關係，該關係由工具註冊表持有，`dsh-tools` 會在工具註冊表中觀察該關係。 |

### 行為說明

`native` 立即生效。PTC 模式則等待 `ctx.ptcRuntime`——這是一個主機平面服務：針對未組裝執行時的部署選擇 PTC mode 的 preset 會讓這一行停在 pending，`dsh-agent-preset-registry` 會指名此 id 拒絕掛載。`presentAs` 本身就是 effect，因此該宣告隨這一行撤銷，無需第二個包裝層擁有它。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [tools 包](../tools/README.zh.md)——工具呈現模式與 `presentAs` API。
- [agent-presets 包](../../preset/agent-preset-registry/README.zh.md)——preset 如何組合 agent 及其常駐掛載。
- [Node ptc-runtime 包](../../ptc-runtime/ptc-runtime-node/README.zh.md)——PTC 模式所需的 TypeScript 執行時。
- [PTC mode 執行器塌縮 note](../../../.agents/notes/implemented/bug-fix/2026-08-07-ptc-executor-collapse.zh.md)——通告面與可呼叫面為何保持一致。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

透過在 `dsh-tools` 中選擇的工具呈現方式間接影響——這一行只在 `dsh-tools` 擁有的兩種投影之間選擇，本身不註冊任何提示詞、schema 或結果。

#### KV Cache 影響

沒有直接的失效影響；呈現方式在 agent 組裝時即固定，因此其請求字首在該工作階段的整個生命週期內保持穩定。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明這一行何時需要特別留意。它們是目前包約束，不是任務積壓。

- **執行時仍在主機平面**——preset 可以選擇 PTC mode，卻無法自帶它所需的 TypeScript 執行時；未組裝執行時的部署也就無法組裝任何 PTC 模式的 preset。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
