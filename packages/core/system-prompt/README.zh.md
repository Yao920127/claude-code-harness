---
description: "面向使用者與維護者的系統提示片語裝說明，用於新增提示詞段、變數、工具 schema 來源或設定面向模型的提示詞。"
kind: "package-reference"
---

# @deepseek-ai/dsh-system-prompt

[English](README.md) | 中文

## 概述

`dsh-system-prompt` 讓 agent 在每個模型步驟收到一份有序系統提示詞與可用工具 schema。需要新增提示詞段、動態執行時事實、可複用變數或工具 schema，或者控制固定 harness 身份、部署 persona、執行時上下文和麵向模型的工具順序時，請使用本包。agent 作用域的貢獻會遮蔽同名全域預設值，而不影響其他 agent。無效的完整提示片語合與未解析變數會使組裝失敗，不會向模型傳送格式錯誤的提示詞。

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

在任何執行 agent 的地方掛載 `dsh-system-prompt`：它提供 `ctx.systemPrompt`，即每個提示詞貢獻所落入的註冊表。貢獻帶作用域——透過 `agent.ctx` 註冊隻影響該 agent，並遮蔽同名全域項。

<a id="configure-the-prompt"></a>
### 設定提示詞

設定擁有固定開場白、runtime 上下文、部署 persona 字首與字尾與工具順序；其餘一切來自已註冊的貢獻。

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
  config:
    includeHarnessIdentity: true
    includeRuntimeContext: true
    personaPrefix: 'You are the deployment assistant.'
    toolOrder: ['<unlisted-tools>']
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `includeHarnessIdentity` | `true` | 是否包含順序為 −1000 的第一方固定開場白 `You are an AI agent powered by DeepSeek Harness.`。僅當相容性部署擁有完整系統提示詞時設為 false。 |
| `includeRuntimeContext` | `true` | 是否在組裝中包含有序動態 runtime 上下文 |
| `personaPrefix` | `''` | 全域 persona 字首範本，順序為 `0`，位於第一方指導之前 |
| `personaSuffix` | `''` | 全域 `deployment:persona-suffix` 範本，順序為 `10200`，位於第一方指導之後 |
| `toolOrder` | — | 顯式面向模型工具順序，含一個 `'<unlisted-tools>'` 其餘項標記 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-system-prompt)是每個受支援欄位的窮盡式真源。沒有恰好一個其餘項或存在重複項的 `toolOrder` 列表會在載入時失敗；已列名稱沒有對應已註冊工具會使每次 `assemble()` 被拒絕。

### 貢獻提示詞段

段攜帶靜態或按上下文解析的文字與 `order`；它們先按順序值升序拼接，順序值相同時再按名稱的程式碼單元順序排列。儲存庫自帶貢獻方透過 `ctx.systemPrompt.getSectionOrder(name)` 解析集中分配的位置；runtime-context 貢獻方使用 `getContextOrder(name)`。外部貢獻可以使用任意有限的順序值。`complete: true` 段會在組裝後成為精確的完整提示詞；有效的 complete 段超過一個時，組裝會失敗。

```text
ctx.systemPrompt.section({
  name: 'tool:bash',
  order: 100,
  text: 'Prefer bash for file and process operations.',
})
```

在段上設定 `interpolate: false` 可原樣保留文字，包括生成的工具文件中的 `{{…}}` 組。其他段預設執行變數插值。

### 貢獻提示詞變數

變數在段文字中以 `{{name}}` 引用，並在每次組裝時解析；帶作用域變數會為該 agent 遮蔽同名全域變數。迴圈提供 `model` 與 `cwd`；任何外掛都可以註冊自己擁有的事實。

```text
ctx.systemPrompt.variable('cwd', ({ agent }) => agent?.session.header.cwd)
```

### 貢獻工具 schema

工具 schema 提供者在每次組裝時求值，並貢獻模型可見的 `ToolSchema` 集合；`ToolRuntime` 會自動註冊自身，因此大多數工具在此無需手動接線。提供者返回限制後的可見集合，外加 `toolOrder` 使用的限制前名稱全集。

### 抑制執行時上下文

`suppressRuntimeContext()` 移除呼叫作用域的所有動態執行時上下文貢獻，但不停用擁有底層事實的服務；多個抑制器獨立組合，當不再存在抑制器時該 effect 會恢復上下文。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該包如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包是一個註冊表加一條協作式組裝流水線。一次 `assemble()` 呼叫把全域層與所請求作用域的層合併，分離工具參數，先按數值再按名稱規範化段順序，執行按作用域篩選的 `system-prompt/assemble` waterfall，把有效的 complete 段恢復為唯一的提示詞段，並實施任何目前生效的執行時上下文抑制器。段與動態上下文是獨立的輸入：段成為提示詞文字，而上下文在迴圈下成為模型歷史中帶來源的 user 角色快照。工具 schema 按設計屬於組裝結果——「模型獲知自己能做什麼」是一個連貫整體，儘管介面卡把 schema 作為獨立 wire 欄位傳輸。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SystemPrompt` 服務、設定、組裝流水線、`renderPrompt` |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套 |

### 組裝與渲染

組裝分兩階段完成求值與渲染：`assemble()` 返回文字已求值但尚未插值的段、有序工具 schema，以及每個已註冊變數按目前上下文求得的值；`renderPrompt()` 對未設定 `interpolate: false` 的段插值 `{{variable}}` 引用、刪除空段並用空行連線——嚴格規則：未知引用、已註冊但無值的引用或格式錯誤的完整組都會丟擲，因為格式錯誤的提示詞比明確失敗更糟。`toolOrder` 在 waterfall 分發前規範化收集到的工具（註冊順序只是外掛載入產物）；修改列表的 waterfall 監聽器對其輸出的確定性負責。

### 作用域

帶作用域的段、變數與工具提供者會為單個 agent 遮蔽全域項，組裝 waterfall 按作用域篩選分發。註冊表變更通知（`system-prompt/change`）刻意不經過篩選，因為全域變更影響每個作用域。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [系統提示詞子系統](../../../docs/subsystems/system-prompt.zh.md)——確切的跨包型別與生成的服務 API。
- [tools 包](../tools/README.zh.md)——其 schema 流入組裝的工具註冊表。
- [提示詞變數 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.zh.md)——哪些提示詞事實歸誰所有。
- [第一方提示詞順序 Agent Note](../../../.agents/notes/archived/architecture/2026-08-25-sparse-first-party-prompt-section-orders.md)——稀疏具名順序分配。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

第一方段落依次渲染 harness 身份、部署 persona 字首（含模型名稱介紹）、可複用指令（包括生成的工具 SDK 和結構化輸出指導），最後是攜帶環境資訊的字尾：harness 原始碼（`10000`）、Web 表層（`10100`）和部署 persona 字尾（`10200`）。外部段落的順序與組裝監聽器仍決定其最終結果。`includeHarnessIdentity: false` 僅省略這個固定開場白。空段會消失；帶作用域的段與變數可以為一個 agent 遮蔽全域項。`system-prompt/assemble` waterfall 決定交付的提示詞與工具 schema，除非一個有效段宣告自身為 complete——此時該確切段會成為完整的系統提示詞，而 waterfall 得到的上下文、工具與變數保持不變。渲染後的提示詞作為派生歷史中的 system 角色訊息——surface 第 0 號節點，或歷史內更新之後最新的系統節點——到達模型；迴圈請求與 `request/header` 均不含單獨的 `system` 欄位。完整渲染結果為空時，迴圈透過有日誌記錄的空內容替換清除所有生效的系統節點，模型歷史不再保留任何舊提示詞。有序動態上下文與段分離，只在存在時才會成為帶來源的 user 角色快照；`includeRuntimeContext: false` 或帶作用域的抑制器會移除全部這類上下文。

##### harness 身份

```markdown
You are an AI agent powered by DeepSeek Harness.
```

#### Token 影響

啟用時，身份是每次請求的固定成本。Persona 字首、字尾與外掛文字在每次請求中重複，成本隨渲染內容增長。

#### KV Cache 影響

只要身份、persona、變數、段文字與順序的渲染完全相同，字首就保持穩定：渲染未變時系統節點保持不動，除非不支援該能力的路由或新請求序列必須歸併保留的歷史內提示詞。沒有 `systemPromptUpdate` 時，非空提示詞文字透過有日誌記錄的逐節點替換歸併到首個系統節點，因此頭節點重寫會從首個變化的 token 起失去字首複用；當已準備呼叫宣告 `systemPromptUpdate: 'in-history'` 時，agent loop（智慧代理迴圈）會在同一請求序列延續期間把變化後的非空提示詞追加到已快取歷史之後，因此直到該歷史末尾的字首仍可複用（[決策規則](../agent-loop/README.zh.md#understand-the-implementation)）。模型、persona 字首、工具與前置指令一致時，不同原始碼路徑、本地 Web URL 或 persona 字尾值不會改變可複用的第一方字首。persona 字首變化可能改變靠前的字首。任何變更都可能從第一個變化的 token 起使複用失效；不保證提供者共享快取或實際命中率。

### 工具 schema

#### 模型看到什麼

對於已交付工具，模型會收到[生成工具 schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tools)中對每個 agent 可見的子集；限制與組裝攔截完成後，按設定或字典序排列。擴充功能可以透過同一註冊表貢獻其他定義。段與 schema 提供者是獨立的組裝輸入。限制不會移除段落註冊：工具指導外掛透過 `text({ scope })` 與 `ctx.tools.get(name, scope)` 返回空文字或選擇適用片段。任意靜態段落不會被自動改寫。

#### Token 影響

schema token 在每次請求中重複。限制工具會為該 agent 移除其全部 schema 成本，但不會移除獨立提示詞段；重排序會改變快取形狀，但不改變語義內容。

#### KV Cache 影響

只要可見 schema 集合、渲染與順序不變，字首就保持穩定。註冊、限制或重排序可能從第一個變化的 schema token 起使複用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提示片語裝何時需要特別留意。它們是目前包約束，不是待辦事項清單。

- **部署方編寫的提示詞文字只來自設定／組合**：此外掛擁有全域 persona 字首與字尾預設值；建立方外掛可以註冊 agent 作用域的遮蔽項；其他段來自擁有相應事實的外掛。不存在終端使用者提示詞編輯 API。
- **插值文字不支援行內轉義語法**：整段需要保留字面花括號時，使用 `interpolate: false`。
- **`toolOrder` 設定錯誤在提示片語裝（首輪）時出現，而不是啟動時**：只有形狀違規會在設定載入時丟擲。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
