---
description: "`ctx.fs` 的主機檔案系統後端：面向選擇或排查本地檔案存取的部署方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-local

[English](README.md) | 中文

## 概述

使用 `dsh-fs-local` 可在主機檔案系統上讀取、列出、監聽、原子寫入和編輯檔案。相對路徑從可設定的基準目錄解析，而絕對路徑和父目錄遍歷不受限制。到達同一檔案的路徑和符號連結共享一個身份。寫入保留檔案權限，可選版本防護會拒絕陳舊覆蓋。直接存取主機檔案時選擇本包；需要約束變更時使用 `fs-sandbox`。

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

當組合需要由真實主機檔案系統支撐的 `ctx.fs`、且可以接受程序本地實作時，掛載此後端。常用路徑是顯式的：載入後端、給出基準目錄，然後面向模型的工具（`dsh-tool-fs`）或你自己的外掛即可讀取、寫入和編輯檔案。

### 何時選擇

在單個程序中進行普通主機檔案存取時，請選擇 `fs-local`。工作階段的寫入與編輯必須限制在工作區與臨時根目錄內時，選擇 [`fs-sandbox`](../fs-sandbox/README.zh.md)——它擴充功能此後端，只增加模式圍欄。`config.cwd` 只是解析預設值，不是約束邊界：絕對路徑與 `..` 都可以逃逸它。

### 最小設定

用一個基礎目錄載入後端；相對路徑基於它解析，絕對路徑則忽略它。相對基礎目錄以提供者程序工作目錄為起點，展示路徑始終保持絕對路徑。在 POSIX 上，解析先遵循檔案系統語義，再進行詞法規範化：`symlink/..` 到達連結目標的父目錄，即使最終檔案尚不存在也如此。目錄列表中的子項展示路徑保留同樣的物理遍歷語義。Windows 保留原生的驅動器相對路徑規範化行為。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
  config:
    cwd: /absolute/path/to/workspace
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `cwd` | `process.cwd()` | 相對路徑的基準目錄 |
| `diffBasisMaxBytes` | `10 MiB` | 每次覆寫 diff 一側的 UTF-8 位元組上限；更大的覆寫返回 `before: null` |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-fs-local)完整列出了所有受支援欄位及其 JSDoc。

### 你能做什麼

完整或流式讀取任意普通 UTF-8 文字檔案，按你選擇的上限或按位元組視窗讀取原始位元組，並按穩定名稱順序列出一層目錄。原子地建立或替換檔案，並原子地應用字面量文字編輯；兩個變更操作都按檔案序列化，並行寫入方絕不會交錯。版本防護是可選的：省略它即無條件建立或覆蓋，提供它則在檔案自上次觀察以來發生變化時失敗。

讀取、列出與變更操作的失敗是攜帶穩定錯誤碼的型別化 `FsError`——`FS_NOT_FOUND`、`FS_NOT_TEXT`（二進位制內容）、`FS_STALE_VERSION`（自觀察以來已變化）、`FS_EDIT_NOT_FOUND` 或 `FS_AMBIGUOUS_EDIT`（無唯一字面量匹配）等——因此呼叫方依據錯誤碼分支，絕不解析訊息文字。編輯遇到缺失目標時，無論是否提供版本防護，都報告 `FS_STALE_VERSION`。

Chokidar 透過 OS 事件觀察單個檔案或目錄的直接子項，不使用輪詢或遞迴監聽。檔案使用篩選到目標的父目錄監聽，因此就緒時也能接收起初缺失檔案的建立事件。父目錄保持存在時，檔案監聽覆蓋原地寫入、原子替換、刪除和同路徑重建。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋本地後端背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

後端建立在三個想法之上：

- **Realpath 身份。** `targetKey` 是檔案的 `realpath`，因此經符號連結到達同一檔案的兩個輸入路徑共享一個身份，寫入落在連結目標上，同時保留連結。
- **原子釋出。** 寫入先寫入目標旁私有暫存目錄內的獨佔臨時檔案，執行 fsync 後釋出；現有檔案的 mode 會保留，Windows 上的 DACL 在替換後也會保留。
- **單一變更臨界區。** 每目標 FIFO 鎖序列化讀取→防護→寫入視窗，並行寫入與編輯因此被確定性排序——一方勝出，其餘操作看到新版本後因版本陳舊而被拒絕。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務接線：`LocalFileSystem`、`Config`、每目標變更鎖 |
| [`src/fsio.ts`](src/fsio.ts) | 不依賴 Cordis 的原始 I/O：探測、讀取、原子寫入、字面量編輯、行尾處理 |
| [`src/win32.ts`](src/win32.ts) | 原子替換的 Windows 專屬 DACL 保留 |

### 寫入路徑

每次寫入先探測目標、執行可選防護（`createIfAbsent` 或 `replaceIfVersion`）、在兩側都足夠小時捕捉有界的 `before` diff 基礎、把新內容暫存到目標旁、fsync，然後原子釋出。帶防護的建立使用絕不替換並行建立者的硬連結釋出，並以 `FS_NOT_OBSERVED` 拒絕它。

### 編輯路徑

每次編輯先探測、在字面量匹配前驗證版本防護（陳舊編輯因此報告 `FS_STALE_VERSION`，絕不會給出誤導性的無匹配）、讀取檔案、以 LF 規範化執行字面量替換、恢復檔案主要的行尾風格，然後重新發布——全部在每目標鎖內完成。

### 歸屬與不變式

原始 I/O 不依賴 Cordis，在 `src/fsio.ts` 中獨立單元測試；`src/index.ts` 保持為輕量接線。`config.cwd` 只是解析預設值——約束是 `fs-sandbox` 或 `tools/execute` 權限外掛的工作。取消是盡力而為的 `AbortSignal`，在每次非同步探測前後檢查。對於監聽，signal 取消初始化；就緒後，呼叫方必須等待返回的關閉函式完成。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從約定逐步進入相鄰的後端、工具與策略。

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供者約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——本後端實作的 `ctx.fs` 約定。
- [fs-sandbox](../fs-sandbox/README.zh.md)——擴充功能本後端的沙箱強制後端。
- [tool-fs](../tool-fs/README.zh.md)——消費 `ctx.fs` 的面向模型工具。
- [fs-observation-policy](../fs-observation-policy/README.zh.md)——透過 `fs/*` 事件防護變更的策略外掛。
- [Windows DACL 保留筆記](../../../.agents/notes/archived/bug-fix/2026-07-19-windows-atomic-write-dacl-preservation.md)——原子替換為何複製目標的存取策略。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-fs` 間接產生影響；該消費方把本提供者帶行視窗的 UTF-8 內容、變更確認與提供者訊息原文渲染為有保留上限的結果，而版本、原子寫入機制與目錄中繼資料仍屬內部細節。

#### KV Cache 影響

不會直接使快取失效；具名消費方負責請求字首的任何變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本地後端何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用檔案系統對比或任務積壓。

- **`config.cwd` 不是沙箱**：它是解析預設值，而非約束；絕對路徑和 `..` 可以逃逸。請使用更嚴格的 `ctx.fs` 後端或 `tools/execute` waterfall（瀑布式事件）上的權限外掛實施約束。
- **Linux 父目錄重建**：父目錄刪除並重建後的監聽恢復仍延期；父目錄保持存在時，同路徑檔案重建仍受支援。
- **版本 token 依賴檔案系統中繼資料**：它們組合裝置、inode、大小、納秒級 mtime 與納秒級 ctime；如果儲存層在重寫時無法更新其中任何一項事實，仍可能繞過陳舊防護。
- **`editText` 會把整個檔案及編輯後的副本儲存在記憶體中**：只有讀取路徑支援流式處理。
- **低於上限的覆寫仍會緩衝上下文基礎**：`writeText` 除呼叫方持有的替換內容外，最多還會保留略低於 `config.diffBasisMaxBytes` 的舊文字；該上限不限制返回的 `after` 值，也不限制整檔案展示退回。
- **二進位制檢測不對稱**：讀取只對前 8192 位元組執行 NUL 取樣，編輯則掃描整個 buffer，因此 NUL 出現在後部的檔案可以讀取，但編輯會被拒絕。
- **每目標變更鎖僅限程序內**：即使跨程序，帶防護的建立仍採用原子且不替換的釋出方式；但只有當可選版本防護觀察到中繼資料變化時，系統才能發現其他程序中的替換寫入方，且絕不會將其序列化。
- **帶防護的建立要求支援硬連結**：拒絕硬連結釋出的檔案系統或掛載點無法支援 `createIfAbsent`；後端會使目標保持缺失狀態並報告 `FS_IO_ERROR`。
- **提交後清理採用盡力而為語義**：如果移除僅所有者可存取的暫存目錄失敗，成功釋出仍視為成功，並留下私有殘留供運維人員後續清理。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包沒有獨立事件序列或可變資料關係，相關約定在所屬 seam 強制執行。
