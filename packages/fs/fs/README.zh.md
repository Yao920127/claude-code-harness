---
description: "`ctx.fs` 檔案系統服務約定：面向選擇或掛載檔案系統後端的部署方，以及實作後端的開發者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs

[English](README.md) | 中文

## 概述

應用需要在主機、受限或遠端執行環境中使用一致的檔案系統操作時，選擇 `dsh-fs`。消費方可以解析穩定的檔案身份、在受支援時對映共享主機檔案、執行有界的文字與位元組讀取、列出目錄、監聽目標，並原子地寫入文字及執行字面量編輯。版本防護是可選的，因此後端無需策略強制也能工作；呼叫方可以提供防護，在檔案變化後拒絕變更。在主機執行時選擇 `fs-local` 或 `fs-sandbox`。面向模型的檔案系統工具由 `dsh-tool-fs` 單獨提供。

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

你很少直接載入 `dsh-fs`：你掛載一個註冊為 `ctx.fs` 的後端，然後從自己的外掛呼叫該服務，或讓 `dsh-tool-fs` 工具替你呼叫。本頁服務於確實接觸它的兩類讀者——選擇後端的部署方，以及實作或消費該約定的開發者。

### 選擇並掛載後端

普通主機檔案選擇 [`fs-local`](../fs-local/README.zh.md)，工作階段變更必須限制在工作區與臨時根目錄內時選擇 [`fs-sandbox`](../fs-sandbox/README.zh.md)。掛載任一後端都會填充 `ctx.fs`；更換後端不會改變策略外掛、工具或工具 schema。未掛載任何後端的組合就沒有 `ctx.fs`，工具會在註冊時失敗。

### 服務能做什麼

透過 `ctx.fs`，你可以把任意路徑解析為穩定的目標身份、完整讀取或分片流式讀取文字檔案、按顯式上限讀取原始位元組、列出一層目錄、原子地建立或替換檔案，並原子地應用字面量文字編輯。兩個變更操作上的版本防護都是可選的：省略它即無條件建立或覆蓋，提供它則在檔案自上次觀察以來發生變化時失敗。讀取、列出與變更操作的失敗使用攜帶穩定錯誤碼（如 `FS_NOT_FOUND`、`FS_STALE_VERSION`、`FS_AMBIGUOUS_EDIT`）的型別化 `FsError`，呼叫方依據錯誤碼分支，絕不解析訊息文字。

`watch(target, changed, signal)` 報告單個檔案或目錄直接子項的失效通知。觀察就緒後，它返回呼用方必須等待完成的非同步關閉函式。signal 取消初始化；不支援監聽的提供者直接拒絕，不使用輪詢。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋約定背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該約定建立在一個分離與三項承諾之上：

- **約定高於機制。** 服務只命名儲存層能做什麼——解析、stat、讀取、列出、監聽、寫入、編輯——絕不規定如何儲存位元組。後端擁有目標身份、執行世界座標、解碼、二進位制拒絕與原子性。
- **策略不放在基類上。** 已觀察狀態、編輯前讀取與版本防護的變更是外掛（`dsh-fs-observation-policy`）的職責，透過提供可選防護來新增——因此沙箱化或遠端後端不會繼承任何面向模型的觀察策略。
- **`editText` 留在 seam 上。** 版本驗證、字面量匹配與原子重寫共享同一個臨界區，錯誤歸因與一方勝出/一方陳舊的並行語義因此保持正確；遠端後端也可以將其實作為原生比較並編輯操作。
- **界限制在此 seam 上。** `readBytes` 要求 `maxBytes`，並以 `FS_TOO_LARGE` 失敗而不是截斷，因此任何後端都不會無界緩衝檔案。`readByteRange` 則以視窗為界：後端最多傳輸所請求的 `length` 位元組（外加為到達 `offset` 而跳過的字首），因此由呼叫方對 `length` 的上限承擔防護。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務定義：抽象 `FileSystem` 類、`ctx.fs` 宣告與 `fs/*` 事件詞彙 |
| [`src/types.ts`](src/types.ts) | 詞彙：`FsTarget`/`FsTargetKey`、`FsVersion`、`FsObservation`、`FsWriteIntent`、`FsError` 及其錯誤碼 |

### 呼叫流程

每個普通操作都以 `resolve(path, { cwd })` 開始，它產生穩定的 `FsTarget`（不透明 `targetKey` 加用於模型/UI 輸出的 `displayPath`）；經不同路徑到達同一檔案會產生相同 key。`processPathFromHostPath(hostPath)` 在後端共享或顯式對映主機檔案時，單獨把絕對主機檔案對映進此執行世界，否則返回 `undefined`。讀取隨後執行 `stat` → `readText`/`streamText`/`readBytes`/`readByteRange`，列出執行 `listDir`，變更則經過每個目標一個臨界區：先檢查可選防護，應用新內容，再原子釋出結果。

### `fs/*` 策略事件

本包宣告三個事件，使發出方（`dsh-tool-fs`）與策略監聽器（`dsh-fs-observation-policy`）共享詞彙，而無需讓發出方依賴策略外掛。`fs/write-intent` 與 `fs/edit-intent` 是單槽決策 waterfall（瀑布式事件）：第一個監聽器直接決策，絕不呼叫 `next()`。`fs/observed` 是發後即忘的記錄事件，攜帶 `FsObservation`——存在並帶版本，或確認缺失。事件只攜帶 `dsh-fs` 詞彙和一個不透明 `object` 參與者。

### 不變式

- `targetKey` 與 `version` 是帶品牌的不透明 id：消費方不得解析或解釋它們；只有 `displayPath` 用於模型/UI 輸出。
- 讀取、列出與變更操作的失敗是攜帶穩定錯誤碼的型別化 `FsError`，絕不是臨時拼寫的訊息字串；監聽初始化可以用普通異常拒絕。
- 該 seam 不設 I/O deadline；取消是每個原語上可選的 `AbortSignal`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從窮盡式約定逐步進入建置於其上的後端與消費方。

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供者約定、策略事件與錯誤分類體系。
- [fs-local](../fs-local/README.zh.md)——實作該約定的主機檔案系統後端。
- [fs-sandbox](../fs-sandbox/README.zh.md)——實作該約定的沙箱強制後端。
- [tool-fs](../tool-fs/README.zh.md)——消費 `ctx.fs` 的面向模型工具。
- [fs-observation-policy](../fs-observation-policy/README.zh.md)——透過 `fs/*` 事件防護變更的策略外掛。
- [能力 seam 筆記](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)——檔案系統棧為何拆分為約定、提供者、策略與工具。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-fs` 間接產生影響；該消費方把提供者文字和錯誤渲染為有界且保留的檔案系統工具結果。

#### KV Cache 影響

不會直接使快取失效；具名消費方負責請求字首的任何變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該約定何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用檔案系統對比或任務積壓。

- **變更操作約定只支援文字**：文字讀取和兩個變更操作都以 `FS_NOT_TEXT` 拒絕二進位制/非 UTF-8 內容；`readBytes` 與 `readByteRange` 是原始位元組原語，二進位制安全的變更操作仍延期。
- **沒有刪除、重新命名或複製**：`listDir` 只列出一層，遞迴、glob、分頁與搜尋不在範圍內（見[目錄列出筆記](../../../.agents/notes/archived/architecture/2026-07-03-filesystem-directory-listing-seam.md)）。
- **沒有 I/O deadline**：該 seam 不啟動超時；取消只是每個原語上盡力而為的可選 `AbortSignal`（見[fs 能力族立場](../README.zh.md)）。
- **先解析後操作使遠端後端每次工具呼叫需要兩次往返**：摺疊或快取解析由這種後端自行決定。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
