---
description: "抽象 PTC 執行 seam（`ctx.ptcRuntime`），供使用者與維護者組合、消費或建置後端，以針對主機提供的繫結執行一段模型編寫的程式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ptc-runtime

[English](README.md) | 中文

## 概述

使用 `dsh-ptc-runtime`，可透過已設定的後端，針對主機提供的非同步函式執行一段模型編寫的程式。請求返回無損 JSON 值、通道內有序的日誌或結構化錯誤；程式失敗在結果中 resolve，而 Promise reject 表示呼叫方誤用。每次執行都與先前執行隔離，且執行時不瞭解工具或工作階段。執行後端需另行選擇；其語言與隔離描述符標明所需的源語言和執行基底，但這些描述符本身不承諾安全邊界。

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

當你要組合一個執行模型程式的部署、直接消費 `ctx.ptcRuntime`，或建置執行程式的後端時，選擇本包。`dsh-tools` 中的 PTC mode 用它執行工具程式，`dsh-workflow-ptc` 用它編排工作流。每個消費方負責返回給模型的內容。

### 執行一個程式

向執行時提供程式與繫結名稱空間，然後依次呼叫 `resolve(request)` 和 `run(spec)`。解析根據提供者能力驗證可選 cwd、timeout 與沙箱策略，並填入部署預設值。程式作為非同步函式體執行，支援頂層 `await` 與 `return`；無損 JSON 完成值成為 `result.value`，捕捉文字成為 `result.logs`，程式失敗成為 `result.error`。每個輸出通道保持自身順序，跨通道交錯由後端決定。

```text
const spec = ctx.ptcRuntime.resolve({
  program: 'return await tools.add({ a: 1, b: 2 })',
  bindings: [{ global: 'tools', functions: { add: async (args) => args.a + args.b } }],
})
const result = await ctx.ptcRuntime.run(spec)
// result.value === 3
```

### 選擇後端

後端以 `language` 與 `isolation` 提供診斷描述符；兩者都不授予權限或證明約束。[`dsh-ptc-runtime-node`](../ptc-runtime-node/README.zh.md) 在全新的受管 Node 程序中按已解析沙箱策略執行可擦除 TypeScript。私有的 [`dsh-experimental-ptc-runtime-python`](../../experimental/ptc-runtime-python/README.zh.md) 提供者在全新 CPython 子程序中執行 Python，不提供檔案約束。`sandboxMode` 宣告提供者的部署檔案策略模式；不支援該能力時則預設。

### 可移植地命名繫結

binding-global 與 error-class 名稱是語言可移植的：必須匹配 `[A-Za-z_][A-Za-z0-9_]*`，避開每個可移植目標語言的保留字，並避開後端擁有的槽位，因此同一份名稱空間列表對每個後端都有效。`$tools`、`lambda` 或 `console` 之類的名稱會在執行開始前失敗；確切的排除集是 seam 約定的一部分。

### 可能出什麼問題

失敗以 `result.error` 返回，帶正交的 `kind`：`exception`、`timeout`、`abort`、`worker-exit`、`invalid-output`、`output-limit`、`protocol` 或 `sandbox-unavailable`。提供者在成功或失敗之外，單獨返回適用的 `result.sandbox` 事實。無效或不支援的執行選項在 `resolve` 期間失敗；`run` 拒絕呼叫方誤用，例如未解析輸入、無效繫結名或資源釋放後的呼叫。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 seam 背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包是 PTC 執行能力 seam 的 Service Definition 角色（[能力 seam](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)）：一個註冊為 `ctx.ptcRuntime` 的抽象 `PtcRuntime extends Service`，加上提供者與消費方共享的詞彙。提供者繼承 `PtcRuntime`、實作 `resolve` 和 `run` 並註冊服務。`dsh-tools` 中的 PTC mode 負責工具繫結，`dsh-workflow-ptc` 負責工作流掛鉤與子 agent。按約定，執行時不瞭解工具與工作階段：它接收程式、具名非同步繫結和已解析執行選項，然後返回捕捉輸出、執行結果與適用的沙箱事實。

### 服務 API

只讀 `timeout` 描述符公開數值型 `{ defaultMs, maxMs }`，供消費方呈現；描述符預設表示不支援數值覆蓋。省略 `timeoutMs` 使用提供者預設值；數值請求經過驗證和封頂的經過時間預算；顯式 `null` 請求不設經過時間截止。提供者拒絕不支援的選擇。Node 工作流介面卡請求 `null`，而面向模型的 `run_code` 工具只接受正數覆蓋值。

`executionInstructions` 提供由執行時擁有的使用說明；不需要說明時返回空字串。消費方可將其納入程式呈現，無需根據語言或隔離描述符識別提供者；PTC 將它納入已記錄的 `run_code` schema。

`resolve(request)` 負責支援選項的驗證與部署預設值。`run(spec)` 執行完整輸入，並在清理後返回程式結果。語言和執行基底描述符指導呈現；`sandboxMode` 表示消費方能否傳入已解析檔案策略。描述符與程式成功結果都不能代替後端報告的強制能力事實。

窮盡式語義見[PTC 執行時子系統參考](../../../docs/subsystems/ptc-runtime.zh.md)；確切簽名見 [`src/index.ts`](src/index.ts)。

### 詞彙

`PtcRunRequest` 攜帶程式、Host 繫結、取消和可選執行選擇。`PtcRunSpec` 要求已解析的 cwd 和明確的數值或 null 截止選擇。`PtcBindingNamespace` 宣告程式全域物件與可選的型別化拒絕建構器。`PtcRunResult` 將日誌／值、失敗與 `PtcRunSandbox` 事實分開；確切欄位與提供者義務見 [`src/types.ts`](src/types.ts)。

### 可移植識別符號

binding-global 與 error-class 名稱是語言可移植的：必須匹配識別符號子集 `[A-Za-z_][A-Za-z0-9_]*`（不含 JS 專有的 `$`）並透過 seam 匯出的排除集，因此同一份 `bindings` 列表對每個後端都有效。本包匯出每個後端都執行的約定——`PORTABLE_RESERVED_WORDS`（ECMAScript ∪ Python 保留字）、`RESERVED_BINDING_GLOBALS`（如 `console`、`__dsh_main__` 等後端擁有的 global）、`RESERVED_ERROR_MEMBERS` 與 `DUNDER_MEMBER`（error-member 排除）——因此 `$tools`、`lambda` 或 `__dsh_main__` 之類的名稱會讓 `run()` 在任何後端上作為 seam 誤用而 reject。確切集合見 `src/index.ts`。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：抽象 `PtcRuntime` 服務與可移植識別符號排除集 |
| [`src/types.ts`](src/types.ts) | 詞彙：`PtcRunRequest`、`PtcRunSpec`、繫結、結果、失敗與沙箱事實 |
| — | 不釋出執行時不變式伴生入口；本包不公開任何獨立的事件序列或可變資料關係，相關約束僅由其所屬 seam 的約定實施。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下內容。它們從 PTC mode 消費方進入後端與能力 seam 模型。

- [PTC mode Agent Note](../../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——工具註冊表如何消費 `ctx.ptcRuntime` 並把 `run_code` 呈現給模型。
- [Node 程序後端](../ptc-runtime-node/README.zh.md)——已釋出的 TypeScript 執行後端。
- [實驗性 Python 後端](../../experimental/ptc-runtime-python/README.zh.md)——私有的 CPython 子程序提供者及其 fd-3 協定。
- [PTC 執行時子系統參考](../../../docs/subsystems/ptc-runtime.zh.md)——請求／結果詞彙、繫結與 `ctx.ptcRuntime` 的 cordis 介面面。
- [能力 seam](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)——Service Definition / Service Provider / Consumer 拆分。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tools` 中的 PTC mode 與工作流介面卡間接提供；它們透過各自的工具結果呈現程式結果。

#### KV Cache 影響

不會直接失效；由上述消費方負責請求字首變更。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 seam 不能做什麼；它們是目前包約束，不是任務積壓。

- **`run()` 是一次性的**——`logs` 只有在 `PtcRunResult` resolve 後才能獲得；seam 不提供正在執行的程式所產生輸出的流式日誌或進度介面。
- **執行之間不保留狀態**——每次請求都在全新環境中執行；持久 REPL 風格核心在某個後端帶來自己的日誌方案之前保持延期。
- **提供者的約束能力不同**——已釋出 Node 提供者強制執行已解析檔案策略，私有實驗性 Python 提供者拒絕顯式策略。不提供容器提供者。
- **提供者之間沒有統一的繫結位元組上限**——各提供者負責自己的傳輸限制；繫結仍可能在結果到達這些限制前分配記憶體。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：尚未決定的方向與開放問題。它明確不具權威性——已交付的行為與限制以上文和包程式碼為準。

#### 未來：持久核心後端

跨 `run_code` 呼叫保留狀態的 REPL 風格核心仍未決定；它需要自己的日誌方案，因為「執行之間不保留狀態」的約定正是讓每次請求僅憑工作階段日誌即可重建的原因。

#### 未來：容器後端

容器級後端將為程式碼與 shell 執行都提供硬性的多租戶邊界；除已知的 `isolation` 值外，暫無任何決定。

</details>
