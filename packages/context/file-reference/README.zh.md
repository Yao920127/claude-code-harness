---
description: "面向主機驅動 UI 的檔案引用發現與 @file mention 語法，供選擇該 seam 或為其搭配提供者的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-file-reference

[English](README.md) | 中文

## 概述

主機驅動 UI 使用 `dsh-file-reference` 提供 `@file` 補全：UI 為指定 agent（智慧代理）請求路徑候選，模型輸入 `@path` 或 `@"path with spaces"`，選中候選後，匹配的 mention 作為普通提示詞文字插入。seam 本身不擁有檔案系統存取——具體提供者（如 `@deepseek-ai/dsh-file-reference-local`）負責提供候選、排序、快取與失效。選中候選絕不讀取或附帶檔案內容；模型必須呼叫檔案系統工具才能檢視檔案。Session Controller 透過 `fileReferences/list` Remote 向瀏覽器消費方暴露同一發現能力。

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

當主機驅動 UI（Web 或終端）需要提供 `@file` 補全時選擇本包，並搭配一個名稱空間與 agent 實際生效的 `read` 工具一致的提供者。單獨掛載該 seam 而沒有提供者時，UI 只能得到空的補全列表。

### mention 語法

輸入開頭或空白後的 `@path` token 會觸發補全；其他 token 內部的 `@`（如電子郵件地址）不會。`@"path with spaces"` 開啟帶引號的 mention，目錄候選在其尾斜槓後保持引號開啟，使補全可以繼續深入下一層。格式化器會拒絕含有語法無法安全表示的控制字元或內嵌引號的路徑。 已完成的目錄 chip 在末尾斜槓之後閉合引號。相對引用從工作區根目錄解析，絕對引用保留主機路徑。

### 取得候選

`ctx.fileReferences.list(agent, query, signal)` 返回指定 agent 工作目錄中僅含路徑的檔案與目錄候選，由提供者確定性地排序。目錄 mention 呈現時帶尾隨 `/`，使補全可以繼續深入下一層。瀏覽器消費方透過 Session Controller 介面卡的 `ctx.remote.fileReferences.list` 呼叫同一發現能力；末位 signal 參數可取消慢速自動補全。

### 搭配提供者

本地檔案系統請掛載 `@deepseek-ai/dsh-file-reference-local`；其他名稱空間（遠端或虛擬檔案系統）需要發現能力與生效工具一致的提供者。當指定 agent 可以呼叫 `read` 時，提供者可以安裝穩定的 `FILE_REFERENCE_PROMPT` 指引，告訴模型先讀取被引用檔案、再聲稱檢查過它。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該 seam 的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

本包把抽象發現服務與共享、瀏覽器安全的 mention 語法分開，由提供者負責名稱空間存取、排序、快取與失效。該服務保持 wire 中立；`dsh-api-session-controller` 持有 `fileReferences/list` Remote 介面卡，並在解析 Agent 後委派給目前提供者。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 抽象 `FileReferenceService` 與 `FILE_REFERENCE_PROMPT` |
| [`src/grammar.ts`](src/grammar.ts) | `activeAtToken` 識別與 `formatFileMention` 渲染 |
| [`src/types.ts`](src/types.ts) | 僅含路徑的結果型別 `FileReferenceCandidate` |
| — | 不釋出執行時不變式伴生入口；介面不保留 candidate 或 lifecycle 狀態；具體提供者負責自己的 cache 與 invalidation 關係。 |

### 主要流程

UI 透過 `activeAtToken` 識別活動 `@` token，用查詢文字呼叫 `list`，再渲染排序後的候選。選中後，`formatFileMention` 發出匹配的提示詞寫法（`@path`、`@"path with spaces"`，或帶引號目錄的開放形式 `@"dir/`）。任何環節都不讀取檔案內容；當指定 agent 擁有 `read` 工具時，提供者還可以安裝穩定的 `FILE_REFERENCE_PROMPT` 提示詞段。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從隨附提供者進入共享引用表面，以及候選所指向的工具。

- [本地檔案引用提供者](../file-reference-local/README.zh.md)——本 seam 的隨附本地工作區實作。
- [工作階段引用子系統](../../../docs/subsystems/session-reference.zh.md)——主機 UI 背後的共享檔案引用與工作階段引用約定。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [檔案系統工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs)——被引用路徑所對應的 `read` 工具。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響模型體驗：本包的發現 seam 與語法把檔案引用指引委託給組合的提供者，由它負責呈現。

#### KV Cache 影響

介面與語法本身不增加請求 token；提供者擁有的提示詞段決定可複用字首是否改變。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適。它們是目前包約束。

- **路徑候選僅供參考**：該 seam 不保證後續面向模型的檔案系統工具能夠存取同一名稱空間；部署時必須讓提供者與實際生效的 `read` 實作對齊。
- **沒有檔案內容引用物件**：所選檔案仍是普通提示詞文字，其內容必須經過模型顯式呼叫工具後才對模型可見。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
