---
description: "面向模型的 lsp 工具：四種只讀程式碼導航操作、從 1 開始的 UTF-16 游標座標、有邊界的結果與懸停文字，供組合模型程式碼導航的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-lsp

[English](README.md) | 中文

## 概述

`dsh-tool-lsp` 讓模型透過單個只讀 `lsp` 工具導航程式碼：開啟符號定義、查詢引用與實作，或閱讀懸停文件。請求使用從 1 開始的 UTF-16 行列位置。導航結果數量有上限、按檔案分組，並在省略位置或截斷文字時顯示標記；懸停結果經過規範化，且會區分資訊缺失與錯誤。該包要求設定 LSP 提供者，並要求工作階段具有工作區根目錄。當文字搜尋有歧義，或修改需要精確的符號關係時選擇它；普通導航應繼續使用 `search` 與 `read`。

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

當文字匹配有歧義，或修改前需要精確的定義、實作或引用時，agent（智慧代理）使用 `lsp`；該工具的提示詞指引會告訴它，普通導航應優先使用 `search`／`read`。

### 工具

`lsp` 接受 `operation`（`goToDefinition`、`findReferences`、`goToImplementation` 或 `hover`）、`file_path`、`line` 與 `character`。`line` 與 `character` 是正的、從 1 開始的 UTF-16 游標座標；未落在符號上的位置可能返回空結果。`findReferences` 始終包含宣告，因此影響分析絕不會遺漏定義位置。提供者、language id、工作區根目錄、限制、超時與可執行檔案均不進入模型輸入。

### 模型得到什麼

導航返回按檔案分組的 `path:line:character` 位置行（從 1 開始）；懸停返回規範化文字或無可懸停提示。空位置與無懸停都是成功的無結果回應。結果先由 `maxLocations` 限制，再由 `maxResultChars` 限制，省略與截斷標記計入完整上限；這些上限隻影響呈現，不影響規範結果值。

### 設定

| 鍵 | 預設值 | 含義 |
|---|---|---|
| `maxLocations` | `100` | 出現省略標記前可渲染位置的最大數量 |
| `maxResultChars` | `16000` | 完整渲染結果的最大長度，包括截斷中繼資料 |
| `timeoutMs` | `60000` | 由 `dsh-tool-call-timeout-policy` 強制執行的工具呼叫超時預算；覆蓋完整的排隊開啟／查詢／關閉生命週期，且模型不可設定 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-lsp)是每個受支援欄位的窮盡式真源。

### 失敗與恢復

該工具要求工作階段工作區根目錄（`header.cwd`），沒有退回值；缺失時會在任何查詢前以 `LSP_WORKSPACE_REQUIRED` 失敗。當沒有提供者處理該副檔名時，查詢以 `LSP_UNAVAILABLE` 失敗；格式錯誤的提供者載荷仍保持為結構化 `LSP_MALFORMED_RESPONSE` 錯誤。這些會呈現為模型可讀、可路由的錯誤工具結果。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計說明

- **只做消費方。** 工具執行時只注入 `tools`、`lsp` 與 `systemPrompt`，不匯入任何提供者，並且只把 `exec.signal` 傳給 seam。
- **座標轉換。** `parseLspArgs` 驗證 `line` 與 `character` 是正整數，並轉換為 seam 從零開始的位置；渲染出的位置再轉回從 1 開始的形式。
- **規範結果直接傳遞。** 工具返回 seam 的封閉聯合（`{ kind: 'locations', locations, resolvedWorkspaceUri }` 或 `{ kind: 'hover', hover }`），原生渲染器可以直接檢查每個已取得的位置與從零開始的範圍。
- **執行世界 URI 渲染。** `renderUri` 以提供者的規範工作區 URI 為基準解析 `file:` URI——在其內為工作區相對路徑，在其外為從 URI 派生的絕對路徑，格式錯誤或非 `file:` 時原樣保留——絕不把主機平臺路徑規則應用到工作階段 cwd。
- **渲染後再設限。** `maxLocations` 先限制條目數量，`maxResultChars` 再限制包含省略或截斷標記在內的完整渲染文字。
- **通用搜尋卡片呈現。** `presentLspCall` 渲染 `{ card: 'generic', kind: 'search', title, locations: [{ path, line }] }` 檢視；從 args 派生的標題攜帶操作與從 1 開始的游標，跟隨焦點對準查詢行，標題則保留列號。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定 schema、工具註冊、系統提示詞區段、執行 |
| [`src/render.ts`](src/render.ts) | 純格式化、座標轉換、URI 解析、結果上限、UI 呈現 |
| [`src/session-cwd.ts`](src/session-cwd.ts) | 從工作階段 `header.cwd` 取得工作區根目錄 |
| — | 不釋出執行時不變式伴生入口；該無狀態介面卡提供一個工具和一個提示詞區段，而查詢生命週期與結果關係仍由它所組合的工具 seam 和 LSP seam 負責。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從面向模型的表層逐步進入 seam 與提供者。

- [LSP 導航子系統](../../../docs/subsystems/lsp.zh.md)——操作、座標、請求與結果，以及 `LspError` 錯誤碼。
- [dsh-lsp](../lsp/README.zh.md)——本工具查詢的 seam。
- [dsh-lsp-stdio](../lsp-stdio/README.zh.md)——應答這些查詢的 stdio 提供者。
- [lsp 組地圖](../README.zh.md)——三個包的家族及其相關文件。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

一個系統提示詞區段（first-party 順序 2200）將 LSP 定位為精確輔助工具，文字如下：

##### 逐字指引

```markdown
Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous or before a change requires precise definitions, implementations, or references. Positions are one-based line and character (UTF-16) at the cursor; an off-symbol position may return no results. findReferences always includes the declaration.
```

#### Token 影響

外掛處於活躍狀態時，每次請求承擔固定指引成本。

#### KV Cache 影響

只要外掛 scope 與指引文字不變，字首就保持穩定；啟用或 dispose（資源釋放）可能使從該區段起的複用失效。

### 工具 schema

#### 模型看到什麼

模型會看到生成的 [`lsp` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-lsp)。

#### Token 影響

啟用期間，每次請求承擔固定 schema 成本；`timeoutMs` 預算絕不會發給模型。

#### KV Cache 影響

只要可見工具定義與順序不變，字首就保持穩定；註冊生命週期或 scope 限制可能使從第一個變化的 schema token 起的複用失效。

### 結果

#### 模型看到什麼

按檔案分組的 `path:line:character` 位置行或規範化懸停文字，先由 `maxLocations` 限制，再由 `maxResultChars` 限制；省略與截斷標記計入完整字元上限。這些上限隻影響原生／模型呈現，不影響規範值。空結果使用不同的 `No results.`／`No hover information.` 行。

#### Token 影響

每項工具結果以 `maxResultChars` 為上限，`maxLocations` 還會限制導航項數量。

#### KV Cache 影響

工具結果追加在已快取請求字首之後，不會直接使其失效。

### UI 呈現

#### 模型看到什麼

無。用戶端渲染通用搜尋卡片——`{ card: 'generic', kind: 'search', title, locations: [{ path, line }] }`——從 args 派生的標題攜帶操作與從 1 開始的游標；跟隨焦點對準查詢行，標題則保留列號。

#### Token 影響

直接 token 影響為零，因為渲染只發生在用戶端。

#### KV Cache 影響

無；UI 呈現位於模型請求之外。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該工具何時不太合適。它們是目前包約束，不是任務積壓。

- **UTF-16 游標座標**——列座標與協定精確一致，但模型難以在非 BMP 字元周圍計數；未落在符號上的位置可能返回空結果，因此提示詞解釋了該約定，但不鼓勵廣泛使用 LSP。
- **不承諾跨伺服器完整性**——受支援的伺服器仍可能根據索引就緒情況返回空或部分結果；該工具不承諾跨語言或伺服器的完整性。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
