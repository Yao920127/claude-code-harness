---
description: "目錄選擇 seam 的應用內瀏覽後端：為 web GUI 主機提供單層目錄列舉與子目錄建立，也能服務於遠端用戶端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-browse

[English](README.md) | 中文

## 概述

無法觸達 OS 選擇器的使用者仍能透過 `dsh-host-directory-picker-browse` 選擇工作區目錄：它基於 Node 標準庫提供單層目錄列舉與子目錄建立，主機螢幕上不渲染任何東西——因此它能服務原生後端無法觸及的遠端用戶端。列舉只返回目錄、按名稱排序，跟隨指向目錄的符號連結，並攜帶主機判定的 `hidden` 標誌；建立不遞迴，且把名稱驗證為單個路徑段。一行組合設定還會用應用內**選擇工作區目錄**對話方塊填滿工作區流程的目錄擴充功能位。

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

在遠端瀏覽器、SSH 轉發工作階段或無人值守主機等無法使用 OS 選擇器的情境中，如果必須選擇工作區目錄，請組合此後端。工作區流程驅動 `directoryPicker/list` 與 `directoryPicker/createDirectory`；兩個原語都基於主機檔案系統返回結果。

### 列舉目錄

`list(path?)` 返回一個目錄層級：按名稱排序的子目錄及其絕對路徑、`hidden` 標誌（POSIX 上為點字首）、`home` 錨點，以及 `crumbs`——從根到目標的祖先鏈，其中每個 crumb 都是跳轉目標，根以完整路徑標註。不帶路徑時列舉主機帳戶的家目錄。單次呼叫至多返回 `maxEntries` 行（設定項，預設 1,000——GitHub 網頁端對目錄列舉採用的同一上限），被截斷的層級會報告 `truncated: true`，供用戶端提示層級不完整。指向目錄的符號連結會被跟隨；斷鏈與迴圈連結被跳過。

### 建立目錄

`createDirectory(path, name)` 在既有父目錄下建立一個子目錄。它不遞迴——父目錄缺失是真實失敗，不是要補造的層級——並且拒絕任何非單個非空白路徑段的內容（`name` 不得包含分隔符，也不得為 `.` 或 `..`）。

### 可觀察的失敗

兩個原語都拒絕非完全限定的路徑——相對形態，以及 Windows 上 `isAbsolute` 會放行的無磁碟機代號有根形態（`\foo`、`/foo`）與不完整的 UNC 字首——報 `directory-unreadable` 或 `directory-create-failed`，而不是把它解析到主機程序工作目錄之下。建立已存在的子目錄時返回 `directory-exists`。呼叫方的 `AbortSignal` 會停止進行中的掃描，因此斷連或超時不會讓掃描比呼叫方活得更久。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxEntries` | `1,000` | 單個列舉層級的完整結果上限；隱藏行計入該上限 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-directory-picker-browse)是每個受支援欄位及其 JSDoc 的窮盡式真源。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計理念

後端把單個目錄層級流式送入一個有界、按名排序的視窗，因此無論目錄有多少子項，記憶體都保持 O(maxEntries)：被截斷的層級保留按名排序的頭部、隱藏行計入上限、只探測視窗內候選，並報告 `truncated: true`。視窗插入為二分查詢、滿窗尾部單次比較即拒絕，因此超大型層級在頭部之後的每個候選都只需 O(1)，而不是視窗掃描。

### 完全限定柵欄

`fullyQualified` 拒絕任何不指向一個與程序狀態無關的固定檔案系統位置的路徑：POSIX 上要求 POSIX 絕對路徑；Windows 上只接受磁碟機代號限定（`C:\…`）或完整 UNC（`\\server\share…`）形態。無磁碟機代號有根形態與不完整 UNC 字首能透過 `isAbsolute`，卻仍會解析到程序的目前磁碟機代號，因此後端會拒絕它們，而不是重新定位協定傳入的值。

### 中止與探測

每次等待檔案系統操作時，都會透過 `raceAbort` 與呼叫方的訊號競爭，因此停滯的網路檔案系統無法讓已離開的呼叫方請求繼續存活；已放棄的讀取操作即使稍後結束，其結果也會被忽略。符號連結的可進入性由 `stat` 探測決定——失敗即不可進入——視窗內的斷鏈符號連結不會從視窗外回填，因為發生過驅逐本身已把層級標記為截斷。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `BrowseDirectoryPicker` 服務：列舉、建立、有界視窗、錯誤對映 |
| — | 不釋出執行時不變式伴生入口；每次列舉或建立都是一次無狀態的檔案系統往返；檔案系統本身儲存的狀態具有權威性。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當後端約定不夠用時閱讀以下內容：先看 seam 定義，再看決策記錄與原生替代方案。

- [目錄選擇 seam](../directory-picker/README.zh.md)——`browse` 能力約定與型別化錯誤詞彙。
- [目錄選擇能力 seam 決策](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md)——列舉與建立背後的策略裁決。
- [原生後端](../directory-picker-native/README.zh.md)——面向本地操作者的 OS 選擇器替代方案。
- [自適應選擇器](../directory-picker-auto/README.zh.md)——兩個後端之間的啟動時判定。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-directory-picker-browse)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

無。GUI 主機的目錄選擇後端不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明瀏覽互動在何處不完整或有意不限定範圍。它們是目前包約束，不是任務積壓。

- **不讀取 Windows 隱藏屬性**——Node 的 dirent 不暴露 `FILE_ATTRIBUTE_HIDDEN`，因此在所有平臺上 `hidden` 都意味著點字首，直到原生探測值得付出相應成本為止。
- **不列舉磁碟機代號根**——Windows 上祖先鏈止於磁碟機代號根；跨盤依賴瀏覽器 UI 的路徑輸入入口，而不是這裡的列舉原語。
- **全盤可瀏覽**——沒有按部署限定的瀏覽根；`workspace.create` 接受任意路徑，因此這裡的根會限定 UX 範圍，而不是安全邊界。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
