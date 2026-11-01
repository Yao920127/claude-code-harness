---
description: "LSP 能力 seam（ctx.lsp）：按副檔名選擇提供者、四種規範化的程式碼導航操作與結構化錯誤，供組合或擴充功能程式碼導航的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-lsp

[English](README.md) | 中文

## 概述

使用 `dsh-lsp` 為 agent（智慧代理）提供語言伺服器導航，包括定義、引用、實作與懸停文件。查詢按副檔名選擇已設定的提供者，並返回規範化結果與結構化錯誤，因此更換後端不會改變導航請求或模型可見的回應。導航只讀，並刻意排除通用 JSON-RPC 存取、重新命名、格式化、診斷與符號列表。本包必須與 `dsh-lsp-stdio` 等提供者及面向模型的 `dsh-tool-lsp` 組合；單獨使用時不提供導航。

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

掛載語言伺服器提供者與 `lsp` 工具，即可為 agent 提供文字搜尋無法可靠給出的、基於語義的程式碼導航——區分同名函式、跟隨匯入別名、把介面連線到其實作，或讀取推斷出的型別。本包就是這些包所註冊的服務；它自身不定義任何 UI、工具或提供者。

### 何時選擇

當部署希望模型可見的程式碼導航由語言伺服器支撐時，選擇此服務。它覆蓋只讀導航——定義、引用、實作與懸停——並刻意排除修改（重新命名、code action、格式化）、符號列表與診斷。該服務提供者無關：本地 stdio 伺服器、遠端伺服器與沙箱原生提供者都以相同方式註冊，因此更換後端不會改變模型看到的內容或請求方式。

### 組合導航棧

seam 需要提供者與消費方才能發揮作用。最小組合掛載服務、stdio 提供者與工具：

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-lsp'
- name: '@deepseek-ai/dsh-lsp-stdio'
- name: '@deepseek-ai/dsh-tool-lsp'
```

伺服器命令、副檔名對映與檔案系統／子程序配對在提供者與工具包中設定；見 [dsh-lsp-stdio](../lsp-stdio/README.zh.md) 與 [dsh-tool-lsp](../tool-lsp/README.zh.md)。

### 四種操作

每個查詢在原始檔的某個游標位置提出四個語義問題之一；結果是被規範化的位置或懸停內容，絕不是原始協定載荷。

| 操作 | agent 獲得的內容 |
|---|---|
| `goToDefinition` | 游標處符號的定義位置 |
| `findReferences` | 所有引用，始終包含宣告 |
| `goToImplementation` | 具體實作位置 |
| `hover` | 該符號的規範化文件，或沒有 |

`findReferences` 始終包含宣告，因此影響分析絕不會遺漏定義位置。協定上的位置是從零開始的 UTF-16；面向模型的工具接受從 1 開始的游標座標並自行轉換。

### 失敗與恢復

當沒有註冊的提供者處理該副檔名時，查詢會以結構化錯誤 `LSP_UNAVAILABLE` 失敗——為該副檔名新增提供者，或查詢受支援的檔案。無效或衝突的提供者註冊會在任何路由釋出前以 `LSP_INVALID_PROVIDER` 或 `LSP_CONFLICT` 失敗；對已釋放提供者的查詢以 `LSP_DISPOSED` 失敗。消費方捕捉 `LspError` 並按穩定的 `code` 路由；經由工具，這些會呈現為模型可讀的錯誤結果。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 seam 背後的設計決策並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **能力 seam，Service Definition 角色。** 本包擁有 `ctx.lsp` 與提供者註冊表；提供者註冊的是能力而非工具，`dsh-tool-lsp` 是面向模型表層的唯一 owner。
- **原子註冊。** `registerProvider()` 在變更前驗證並檢查全部衝突：無效或衝突的註冊不會發布任何內容，其 disposer 會一併釋放 id 與全部副檔名保留。
- **與順序無關的選擇。** `query()` 按檔案的最終副檔名（規範化為小寫、以點開頭的形式）路由；註冊與 HMR（熱模組替換）順序絕不會改變路由。language id 只用於同步臨時文件，絕不參與選擇。
- **封閉的詞彙。** 四種操作的聯合是封閉的——新增操作是跨 seam、提供者與工具的編譯期強制變更。沒有 JSON-RPC 逃生口，且每個請求欄位都必填，因此不存在 `resolve()` 步驟。
- **提供者擁有的工作區座標。** 位置結果攜帶提供者的規範工作區 URI，消費方據此在執行世界的名稱空間內相對化檔案 URI，而不是應用主機平臺路徑規則。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Lsp` 服務、`registerProvider`／`query`、`finalExtension`、`LspError` code |
| [`src/types.ts`](src/types.ts) | seam 詞彙：請求、結果、提供者與服務約定 |
| [`src/brand.ts`](src/brand.ts) | `LspProviderId` 品牌化 id 型別與工廠 |
| — | 不釋出執行時不變式伴生入口；提供者 id 與副檔名路由屬於以原子方式更新的私有狀態；該 seam 既不公開可列舉快照，也不公開可供獨立比較的生命週期事件。 |

### 註冊與選擇生命週期

註冊與釋放透過 `ctx.effect()` 執行，因此提供者路由隨註冊 fiber 一同存活與消亡。`finalExtension()` 按兩種路徑分隔符切分，對沒有副檔名的名稱或點開頭的 dotfile 返回 `''`，任何路由都不會匹配。`LspError` 擴充功能 `HarnessError`，攜帶穩定的 code（`LSP_INVALID_PROVIDER`、`LSP_CONFLICT`、`LSP_UNAVAILABLE`、`LSP_DISPOSED`、`LSP_UNSUPPORTED_OPERATION`、`LSP_MALFORMED_RESPONSE`），呼叫方據此路由，而不是解析 `message`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享的導航模型逐步進入提供者與工具。

- [LSP 導航子系統](../../../docs/subsystems/lsp.zh.md)——操作、座標、請求與結果，以及 `LspError` code。
- [dsh-lsp-stdio](../lsp-stdio/README.zh.md)——註冊到該 seam 的 stdio 提供者。
- [dsh-tool-lsp](../tool-lsp/README.zh.md)——基於該 seam 的面向模型工具。
- [lsp 組地圖](../README.zh.md)——三個包的家族及其相關文件。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-lsp` 間接影響；該工具擁有面向模型的 `lsp` schema、提示詞指引與渲染結果，本註冊表自身不貢獻提示詞或 schema。

#### KV Cache 影響

不會直接失效；請求字首變更由 `dsh-tool-lsp` 負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義 seam 目前的範圍。它們是包約束，不是任務積壓。

- **同一執行時內副檔名歸屬互斥**——兩個提供者不能同時宣告 `.ts`，即使 language id 不同；重疊會使註冊失敗。預期擴充功能是在註冊之上增加部署設定的 selector，它可以在不把提供者選擇加入模型輸入的前提下放寬互斥保留。
- **僅四種只讀操作**——symbol 與 call hierarchy 因需要不同 schema 而推遲；diagnostics 需要獨立的新鮮度與累積規則；修改（重新命名、code action、格式化）需要獨立工具，並整合預覽、權限與寫入策略。
- **沒有觀測表層**——可用性只能透過執行 `query()` 並按丟擲的 `LspError` code 路由來觀測；沒有提供者變更事件或能力狀態查詢。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
