---
description: "preset 掛載的可組裝人設行，讓單個 agent 擁有自己的系統提示詞人設，供設定或排查它的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-persona

[English](README.md) | 中文

## 概述

`dsh-persona` 讓單個 agent（智慧代理）擁有自己的人設：preset 掛載這一可組裝的行來註冊人設字首與字尾段落，為該工作階段遮蔽部署級預設值。它還可以把字首變成該工作階段的完整系統提示詞、抑制所有其他段落，並可為該工作階段關閉動態 runtime-context 快照。請把它掛在 preset 組裝內部——全域掛載會與提示詞註冊表自身的人設註冊相撞並明確報錯。沒有這一行，preset 能改變 agent 的工具，卻永遠改不了它的身份。

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

在 preset 組裝內部掛載本行，讓該 preset 的工作階段擁有自己的人設。本行需要 agent scope：在 scope 之外掛載會與提示詞註冊表自身的 `deployment:persona-prefix` 註冊相撞並明確報錯——部署級人設已經有歸屬，而本行存在的意義正是為某一個 agent 遮蔽它。

### 設定

```yaml
- name: '@deepseek-ai/dsh-persona'
  config:
    prefix: You are a terse systems engineer who answers in short commands.
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `prefix` | 必填 | 作為 `deployment:persona-prefix` 段落渲染的人設文字 |
| `suffix` | `''` | `deployment:persona-suffix` 範本；省略或空文字會遮蔽掉全域字尾 |
| `complete` | `false` | 僅將渲染後的字首用作系統提示詞；忽略字尾 |
| `includeRuntimeContext` | `true` | 是否為此 agent 作用域包含動態 runtime-context 快照；false 會抑制所有上下文貢獻，但不停用擁有它們的服務 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-persona)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 人設行為

人設 `prefix` 與 `suffix` 都是範本：完整的 `{{…}}` 組在提示詞**渲染**時（而非組裝時）嚴格解析為已註冊的提示詞變數。每個空範本仍會遮蔽對應的部署級段落，然後在渲染時消失。省略 `suffix` 時預設為空，不繼承全域字尾。啟用 `complete: true` 時，組裝仍會解析上下文、工具、變數與協作式監聽器，但提示詞註冊表會把這確切字首恢復為唯一段落；身份、字尾、工具引導或監聽器都無法追加提示詞文字。啟用 `includeRuntimeContext: false` 時，此作用域的上下文提供者不會被求值，組裝監聽器新增的上下文也會被丟棄。

### 何時使用

當 preset 必須改變 agent 的身份、而不只是工具時，使用本行。部署級人設本身設定在 `dsh-system-prompt` 行上，不在這裡；本行只用於為某一個 agent 遮蔽或替換它。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 本行如何註冊

本行使用註冊表共享的名稱與具名順序來註冊帶作用域的人設字首與字尾段落。兩者分別遮蔽對應的部署預設值，而不是出現在其旁邊；排序、插值與完整提示詞執行歸註冊表所有。`includeRuntimeContext: false` 會呼叫 `ctx.systemPrompt.suppressRuntimeContext()`。

### 本行為何僅限 scope 內使用

`dsh-system-prompt` 以自身設定持有全域人設並無條件註冊 `deployment:persona-prefix`，因此一個程序只有一份。本行在 agent scope 之外與該項註冊相撞，這是刻意的：本行的存在是因為 preset 無法自行掛載提示詞註冊表。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、人設段落註冊、runtime-context 抑制 |
| — | 不釋出執行時不變式伴生入口；本行不擁有事件流或可變執行時資料，而是註冊提示詞段落；身份、完整提示詞強制執行、遮蔽與資源釋放均歸提示詞註冊表。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從 preset 組裝逐步進入本行所供給的提示詞註冊表。

- [agent-presets 包](../agent-preset-registry/README.zh.md)——本行掛載進的 preset 組裝。
- [系統提示詞子系統](../../../docs/subsystems/system-prompt.zh.md)——段落、組裝，以及本行所遮蔽的人設槽位。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-persona)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 人設段落

#### 模型看到什麼

位於 order `0` 的 `deployment:persona-prefix` 段落攜帶本行的 `prefix`；位於 order `10200` 的 `deployment:persona-suffix` 在第一方指導之後攜帶其 `suffix`。兩者分別替換對應的部署預設值，並解析提示詞變數。在完整模式下，模型只會看到渲染後的字首段落作為系統提示詞。Runtime context 預設保持啟用；停用後，新建 agent 不會收到來自沙箱策略、批准策略、委派或其他 system-prompt 上下文提供者的 runtime-context 快照。

#### Token 影響

對給定 preset 而言是固定的：該 agent 的每次請求都攜帶人設字首與字尾的 token，其他 agent 一個都不帶。空文字不貢獻任何 token。完整模式會移除該 agent 的其他所有系統提示詞 token。

#### KV Cache 影響

渲染後的範本變數與文字不變時，字首保持穩定。模型、字首與工具一致時，字尾變化不改變前置指令。字首變化會影響靠前的字首；不保證提供者共享快取。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本行何時不合適。它們是目前包約束，不是任務積壓。

- **不支援全域掛載**——提示詞註冊表擁有未加 scope 的人設槽位，因此本行只能從帶 scope 的組裝中使用。要改變部署級人設，應在 `system-prompt` 行自身的設定中修改。
- **runtime-context 抑制是全有或全無**——`includeRuntimeContext: false` 會關閉該作用域的所有上下文貢獻，包括沙箱策略、批准策略與委派；沒有按提供者過濾的選項。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
