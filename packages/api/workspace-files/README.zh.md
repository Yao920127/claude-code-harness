---
description: "面向 Web GUI 的工作區檔案服務：有界檔案讀取、按目標監聽檔案系統變化，以及 Session 工作區根內的目錄列舉。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-files

[English](README.md) | 中文

## 概述

使用本包可從 Web Client 預覽 Session 檔案系統允許讀取的檔案。它按頁讀取 UTF-8 文字、按有界視窗或完整檔案讀取原始位元組、從基檔案目錄解析關聯檔案，並報告檔案中繼資料。可以跟隨一個檔案或一個目錄直接子項的變化。檔案讀取和監聽可以指向工作區外路徑；目錄列舉和監聽仍限定於工作區。本服務不提供修改操作。

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

把本包與 `dsh-fs`、`dsh-sandbox-policy`、Session store 和 Typert Gateway 一起掛載；bundle 把它緊隨 Session Controller 之後掛載。每個方法都線上路上攜帶 Session 身份，Client 呼叫 `remote.workspaceFiles.read(sessionId, path, range, signal)`、`stat(sessionId, path, signal)`、`readBytes(sessionId, path, options, signal)`、`list(sessionId, path, signal)` 或 `changes(sessionId, path, signal)`，從不自己指定根。Host 讀取 live Session header，cold Session 則使用持久層 `stat`；它不會啟用 Agent、讀取事件正文或借用父 Session 的根。live 讀取不要求掛載 Session persistence；未掛載時 cold Session 無法解析，Gateway 返回 `gateway/lookup-not-found`。

| 方法 | 返回 | 用途 |
|---|---|---|
| `stat(path)` | `WorkspaceFileStat { absolutePath, version, bytes? }` | 一個普通檔案的身份、版本與大小，不含內容 |
| `read(path, { offset?, limit? })` | `WorkspaceFileText` = stat + `{ offset, text, lines, eof }` | UTF-8 文字檔案的一個行視窗；`lines` 計行數，使單個空行與越過檔案末尾的頁可區分 |
| `readBytes(path, { range?, baseFile? })` | `WorkspaceFileBytes` = stat + `{ offset, data, eof }` | 以 `Uint8Array` 返回完整檔案或有界位元組範圍；可從另一個檔案所在目錄解析目標 |
| `write(path, { text, version })` | 寫入後的 `WorkspaceFileStat` | 僅當工作區內已有的普通檔案仍處於 `version` 時，替換其完整 UTF-8 文字；否則返回 `workspace-file/changed` |
| `list(path)` | `WorkspaceDirectoryListing { path, entries, truncated }` | 一個目錄的直接子項 |
| `changes(path)` | `WorkspaceFileWatchFrame` 流 | 訂閱就緒確認，隨後為單個檔案或目錄直接子項的失效通知 |

### 定址與路徑

`read`、`readBytes` 與 `stat` 接受絕對路徑或相對於所選 Session 工作區根的路徑。組合檔案系統決定路徑是否可讀；本服務不額外要求檔案讀取限定於工作區。`readBytes` 攜帶 `options.baseFile` 時，從基準檔案所在目錄解析相對目標 `path`，基準檔案或目標檔案位於工作區外時同樣適用。基準檔案本身接受絕對路徑或工作區相對路徑。兩個檔案執行相同的普通檔案檢查；目標為空、絕對路徑、URL 或含 NUL 時拒絕。檔案結果報告檔案系統執行環境中的絕對路徑。`list` 仍限定於工作區，並以相對於該根的路徑報告被列舉目錄。`changes` 使用相同的路徑解析：檔案監聽沿用檔案讀取權限，目錄監聽仍限定於工作區。

### 分頁

`read` 返回一個行視窗，絕不返回整個檔案。`range.offset` 是 1 起算的首行，預設為 1；`range.limit` 是該頁最多的行數，預設為 `maxLines` 且不得超過它——更大的 limit，或不是正整數的 offset / limit，都是 `gateway/bad-request`。行以 `\n` 結束，末尾的 `\n` 是最後一行的終止符而不是再起一空行，所以兩行檔案就是兩行。頁的 `text` 以 `\n` 連線各行，最後一行之後不帶終止符；`eof` 在該頁含檔案最後一行時為 true，offset 越過末尾則返回空頁且 `eof` 為 true。每頁還帶上前置 stat 得到的檔案 `version`，消費方據此分辨新頁與舊頁，以及 `bytes`——後端能報告時的整檔案大小。服務只把檔案讀到該頁之後的第一個字元為止，所以再大的檔案每次請求也只佔一頁記憶體。

### 二進位制讀取

`read` 按行分頁，絕不按位元組；位元組視窗走 `readBytes(path, { range: { offset?, length? } })`。`options.range.offset` 是 0 起算的首位元組，預設為 0；`options.range.length` 是視窗最多的位元組數，預設為 `maxBytes` 且不得超過它——更長的視窗以 `too-large` 失敗而不是被截短，不是整數或越界的 offset / length 則是 `gateway/bad-request`。視窗以 `Uint8Array` 型別的 `data` 返回，到檔案末尾時短於 `length`，位於或越過末尾時為空；視窗含檔案最後一個位元組時 `eof` 為 true。不做任何解碼，也不按二進位制拒絕，因此圖片或含 NUL 的檔案在 `read` 以 `not-text` 失敗之處仍可讀出。與頁一樣附帶同一 `version` 與 `bytes`。

必填的選項物件傳 `{}` 時，在 `maxFileBytes` 上限內讀取完整檔案；傳 `{ range: {} }` 時，在 `maxBytes` 上限內讀取預設位元組視窗。超大完整檔案失敗，不截斷。`baseFile` 與 `range` 可以組合，視窗始終不受完整檔案上限約束。二進位制 Remote 使用 Connection 的 multipart 回應傳遞 JSON 中繼資料與原始位元組；生成的 Client 直接返回 `Uint8Array<ArrayBuffer>`，無需 base64 解碼。呼叫方取消會傳到檔案系統。端點返回資料，不提供可導航的文件。

### 檔案讀取與目錄檢查

每項操作都先透過 `lstat` 拒絕不存在的路徑或錯誤的檔案型別；讀取檔案的操作還拒絕末端符號連結，包括指回工作區內的連結。`list` 改為跟隨末端連結——任何平臺上的目錄符號連結，包括 Windows 目錄聯接——要求它解析為工作區內的目錄，因此被連結的目錄與其目標一樣可列舉；`changes` 也以同樣方式把被監聽的目錄限制在工作區內。檔案操作隨後透過組合檔案系統解析和讀取，不做額外的工作區包含檢查。設定的分頁、視窗、完整檔案和目錄列舉上限仍然適用。文字頁還拒絕無效 UTF-8 與 NUL 位元組；位元組讀取不解碼內容。讀取或列舉的空路徑是 `gateway/bad-request`。

### 變更流

`changes` 是 `stream` 模式的 Remote，只接受目標路徑。Host 從 `stat` 取得實際目標型別；只要目前型別是目錄，就要求位於工作區內，目標型別變化後也執行該檢查。一代流先註冊觀察佇列、解析目標並建立 `fs.watch`，然後產出 `{ kind: 'ready' }`。隨後產出 `{ kind: 'change', change }`，其中 `change` 為目前 stat 中繼資料 `{ absolutePath, version }` 或 `{ absolutePath, absent: true }`。本地提供者使用 Chokidar，目錄僅監聽直接子項。匹配目標的 `fs/observed` 也觸發失效。流在初始化期間排隊變化。取消會獨立於消費方拉取幀的進度關閉 watcher，流或外掛拆除等待關閉完成。父目錄保持存在時，缺失檔案仍可監聽同一路徑的重建。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxBytes` | `2097152`（2 MiB） | 單頁文字與單個位元組視窗的位元組上限（含）；更大的頁或視窗失敗 |
| `maxFileBytes` | `33554432`（32 MiB） | `readBytes` 未傳 `range` 時的完整檔案位元組上限（含），也是 `write` 儲存文字的上限；更大檔案以 `too-large` 失敗 |
| `maxLines` | `5000` | 頁大小的預設值與上限（行）；更大的 `limit` 被拒絕 |
| `maxEntries` | `2000` | 返回目錄條目數上限；其餘丟棄並報告截斷 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-workspace-files)是每個可接受欄位及其 JSDoc 的完備來源。

### 失敗

每種失敗都是一個帶型別化 details 的 `RemoteError` 程式碼，宣告於 [`src/types.ts`](src/types.ts)：`workspace-file/not-found`、`workspace-file/outside-workspace`（目錄列舉或監聽）、`workspace-file/watch-unsupported`（監聽初始化失敗）、`workspace-file/too-large`（帶 `limit`，即適用的頁、視窗或完整檔案上限）、`workspace-file/not-text`、`workspace-file/not-regular-file`（`kind` 為 `directory`、`symlink` 或 `other`）以及 `workspace-file/not-directory`（`kind` 為 `file`、`symlink` 或 `other`）。呼叫方按程式碼分支，絕不按訊息文字。

### Client 檔案資源

瀏覽器匯出向 `ctx.resources` 註冊 `file` 提供者，要求 `resources`、`remote` 和 `remote.workspaceFiles` 在場。bundle 中單個 `workspace-files` 條目供應兩面；Client 沒有單獨設定。元件透過 `useResource<'file'>(address)` 讀取 `WorkspaceFileStat { absolutePath, version, bytes? }` 中繼資料，文字與位元組內容另經對應 Remote 讀取。任何 UI（包括 Global）存取同一完整地址都共享觀察。

`session/<sessionId>/<path>` 地址攜帶授權 Session，以及相對或絕對路徑；前導斜槓保留，例如 `dsh-resource://file/session/s//etc/hosts`。Host 原樣接收路徑，負責解析與權限檢查；Client 不需要 Session `cwd`。`absolute/<path>` 仍可解析，但沒有授權 Session，以 `workspace-file/unknown-workspace` 失敗，不借用目前或 Tab Session。不支援的地址以 `workspace-file/unsupported-address` 失敗。語法由 [workspace-path](../../util/workspace-path/README.zh.md) 定義；Resource 泛型層只認地址和 `signal`。

提供者等到 Host 的 `ready` 幀後才發首次 `stat`，讀取期間將變更排隊，隨後將跟隨者繫結到 `stat.absolutePath`。排隊與即時變更都按該 Host 返回路徑匹配。新版本或消失通知會重新 stat，同時更新路徑、版本和位元組大小；重複版本被忽略。stat 失敗後仍跟隨地址，後續目標變化可使其恢復。如果監聽在 ready 前結束，包括 `watch-unsupported`，未取消的提供者仍執行一次 stat 併產出結果。幀是 `RemoteResult` 值，程式設計異常不被捕捉。

每個 Session 加請求路徑對應一條受監督的 `changes` 流，同一目標的消費方共享該流。跟隨者按反斜槓歸一為斜槓的絕對路徑匹配。載體掉線由 Gateway 監督器重連，新 ready 幀觸發重新 stat；Host 結束或終態失敗的流會結束其跟隨者，最後的中繼資料仍可讀取，直到重新開啟。最後一個跟隨者離開時釋放流，後繼流等待該釋放完成，外掛拆除等待所有在途關閉。提供者宣告 `ResourceProtocolMap.file`；文字預覽宣告其 Sidebar 行號導航參數。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內幕——點選展開</summary>

### 設計概念

經 `ctx.fs` 的讀取使用後端的讀取權限；沙箱後端限制寫與編輯，而不限制讀取。Typert lookup 從 live Session header 或持久層的 header-only `stat` 匯出 `WorkspaceFileScope`，所以 cold subagent Session 不需要啟用 Agent 或讀取事件正文。本服務增加普通檔案檢查與有界傳輸，工作區包含要求只屬於目錄列舉與目錄監聽。頁從 `streamText` 切出，後者逐塊解碼並拒絕非 UTF-8：切頁器對視窗之前的行只計數不保留，對視窗內的每個片段先按位元組上限驗收再緩衝，並在視窗之後的第一個字元處返回。流之前的一次 `stat` 給出頁所報告的版本與大小。

完整檔案讀取將大小上限檢查交給 `fs.readBytes`，並透過二進位制 Remote 返回原始位元組。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `WorkspaceFiles`：`workspaceFiles` 服務與 Remote 名稱空間、`Config`、四道關、切頁器、`read`、`readBytes`、`stat`、`list` |
| [`src/changes.ts`](src/changes.ts) | `WorkspaceChangeFeed`：目標監聽、匹配的 `fs/observed` 通知與每代流各自的佇列 |
| [`src/types.ts`](src/types.ts) | 線路型別與 `RemoteErrorDetailsMap` 錯誤碼，以 `./types` 釋出給 Client 包 |
| [`src/client/index.ts`](src/client/index.ts)、[`provider.ts`](src/client/provider.ts)、[`change-feed.ts`](src/client/change-feed.ts) | 瀏覽器外掛、檔案中繼資料與按目標建立的變更流 |
| [`src/client/types.ts`](src/client/types.ts)、[`remote.ts`](src/client/remote.ts) | 資源值、參數、Client 錯誤碼與生成的 Remote 型別 |
| — | 不釋出執行時 invariant 伴生件；每個 Host 答案都在呼叫時由 `ctx.fs` 與沙箱策略推導。 |

Typert 生成 `./typert` 與 `./remote` 暴露的 Host 與 Client Remote 產物。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [檔案系統能力](../../fs/fs/README.zh.md)——本服務經由讀取的 `ctx.fs` 約定，含 `fs/observed` 與 `readByteRange`。
- [沙箱策略](../../sandbox/sandbox-policy/README.zh.md)——Session 工作區根的來源。
- [Remote 裝配](../../api/remotes/README.zh.md)——Client 包如何觸達 `workspaceFiles` 名稱空間。
- [Client 資源](../../client/resources/README.zh.md)——資源模型、`useResource`、pin 與提供者生命週期。
- [工作區路徑輔助](../../util/workspace-path/README.zh.md)——`fileAddressFor` 與 `parseFileAddress`，兩端共享的 `dsh-resource://file/…` 地址語法。
- [Sidebar 文字預覽](../../client/ui-sidebar-documentpreview/README.zh.md)——經 `file` 提供者跟隨檔案並讀取其頁的 tab 型別。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包不註冊任何工具、不貢獻提示詞章節、不追加任何工作階段事件。

#### KV Cache 影響

無；本包既不裝配也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **提供者監聽支援**——包括 SSH 在內的不支援後端報告 `watch-unsupported`；普通讀取與手動重新整理仍可用，不輪詢外部變化。
- **Linux 父目錄重建**——父目錄刪除並重建後的自動監聽恢復仍延期，見 [fs-local](../../fs/fs-local/README.zh.md)。
- **僅目錄受限**——目錄列舉與監聽限定在 Session 工作區內；檔案讀取與監聽沿用檔案系統後端的讀取權限。
- **沒有總行數**——頁只報告 `eof`，不報告後面還有多少行；需要總數的消費方要翻到末尾或按 `bytes` 估算。
- **超長單行沒有頁**——超過 `maxBytes` 的單行在包含它的每個視窗都以 `too-large` 失敗，因為頁按行而非按位元組切。
- **讀取不具備事務性**——結果中繼資料來自內容讀取之前的 stat；並行寫入可能使報告版本與返回內容不一致。
- **generation 佇列無界**——一個 `changes` generation 會緩衝操作觀察與目標失效通知直到消費方 pull；停滯的消費方會在流的生命期內持續增長 Host 記憶體。
- **`maxEntries` 限制的是答案，不是列舉**——`list` 讓 `ctx.fs.listDir` 列出全部子項後再截斷陣列，遠超上限的目錄仍讓 Host 付出整個列舉的代價（`fs-local` 上每個子項一次 stat）；要限制這份工作，需要檔案系統 seam 的 `listDir` 支援上限。
- **失效流保留中繼資料**——Host 結束 `changes` 或流終態失敗後，已開啟的值保持最後已知狀態，直到重新開啟。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
