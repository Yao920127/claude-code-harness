# Agent Note: 工作區檔案服務

Status: implemented

[English](2026-09-05-workspace-files-service.md) | 中文

## Problem

Web 用戶端需要從一個未必在 Host 機器上的瀏覽器檢視工作階段工作區裡的檔案：agent 產出的檔案、`read` 工具行點名的路徑，之後還有檔案樹，以及既不小也不是文字的檔案預覽。唯一一個經線路讀取工作區檔案的端點以 `workspace-file.ts` 住在 Session Controller 上，與它毫無關係的工作階段生命週期為鄰。它在一個總位元組上限之下返回整個檔案，因此大日誌連一部分都看不了、二進位制根本看不了；它沒有 `stat`、沒有列舉、沒有變更訊號，預覽不重讀就無法得知 agent 已改寫檔案；其結果還以 Host 的 `url` 命名檔案，而 Client 上沒有任何東西把這種拼法當地址用。

兩個約束框定了這項服務。經 `ctx.fs` 的檔案讀取使用 Session 組合後的檔案系統後端，其讀取權限可能延伸到工作區外，而目錄樹與變更流消費方以工作區為根。服務為普通檔案保留後端的讀取決策，同時執行檔案型別與有界緩衝檢查；`list` 與 `changes` 保留工作區包含限制。另外 `dsh-fs` 只暴露一種原始位元組讀取 `readBytes(target, signal, maxBytes)`，它拒絕任何比上限更長的檔案：對模型整體攝入的圖片是正確的，對大檔案的一個視窗則毫無用處。

## Decision

`packages/api/workspace-files`（`@deepseek-ai/dsh-api-workspace-files`）同時擁有 Host 服務 `ctx.workspaceFiles`、`workspaceFiles` Remote 名稱空間，以及將 `stat` 與 `changes` 轉成[資源模型](2026-09-05-client-resource-model.zh.md)即時中繼資料的 Client `file` 提供者；包組織方式由[雙面包組織](2026-09-07-workspace-files-dual-face-package.zh.md)規定。檔案方法從工作區根解析相對路徑，但繼承 Session 檔案系統後端的讀取權限；`list` 與 `changes` 仍限於工作區。[工作區檔案讀取權限](2026-09-09-workspace-file-read-authority.zh.md)擁有這一分層及其安全後果。結果以檔案在檔案系統執行環境中的絕對路徑命名檔案，內容則受頁、位元組視窗或整檔案上限約束。位元組視窗依託 `dsh-fs` 新增的 seam `FileSystem.readByteRange`，由每個提供者實作。Session Controller 不再攜帶任何工作區檔案程式碼。

### 包拓撲

[雙面包組織](2026-09-07-workspace-files-dual-face-package.zh.md)取代本記錄中把 Host 與 Client 分成兩個包的組織選擇；這裡的檔案服務、分頁和變更流約定保持不變。[工作區檔案讀取權限](2026-09-09-workspace-file-read-authority.zh.md)取代檔案方法原有的工作區包含選擇。Host 與 Client 分別編譯在兩個葉設定中，共享線路型別，Client 不匯入 Host 執行時入口。

| 面 | 包 | 檔案 | 依賴 |
|---|---|---|---|
| Host | `api/workspace-files/tsconfig.host.json` | `src/index.ts`（`WorkspaceFiles`、`Config`、圍欄、切頁器）、`src/changes.ts`（`WorkspaceChangeFeed`）、`src/types.ts`（線路型別、錯誤碼） | `dsh-fs`、`dsh-sandbox-policy`、`dsh-typert-protocol`、`dsh-session`、`dsh-session-persistence` |
| Client | `api/workspace-files/tsconfig.client.json` | `src/client/index.ts`（外掛體）、`provider.ts`、`change-feed.ts`、`remote.ts`、`types.ts`，以及共享的 `src/types.ts` | `dsh-api-gateway/client`、`dsh-session/types`、`dsh-client-resources`、`dsh-client-ui-slots`、`dsh-util-workspace-path`、`dsh-typert-protocol`，以及本包生成的 `./remote` |

`api/remotes` 和兩個根聚合分別引用匹配的 Host/Client 葉子。包匯出 `.`、`./client`、`./types`、`./typert` 和 `./remote`，web-app 中單個 `workspace-files` 條目供應兩面。Client 外掛注入 `['resources', 'remote', 'remote.workspaceFiles']`；資源模型直接從協定包取結果型別，Sidebar 參數宣告歸文字預覽，因此 Client 編譯圖不再反向依賴 Remote 裝配或右欄 UI。

### `workspaceFiles` 檔案操作

每個 Host 方法首參都是 `WorkspaceFileScope`。`workspaceFileScope` Gateway lookup 解析 Session 身份。它優先讀取 live Session header，cold Session 則只呼叫 `SessionPersistence.stat`；不會啟用 Agent、讀取事件正文或退回到父 Session。scope 攜帶所選 Session id 及其 `cwd`，僅當該 header 沒有 `cwd` 時才使用沙箱策略的部署根。Client 傳入 Session id，從不自行命名根。五個簽名照 `src/index.ts` 的宣告：

```ts ignore-check
@Remote async read(workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceFileRange, signal: AbortSignal): Promise<WorkspaceFileText>
@Remote async readBytes(workspaceFileScope: WorkspaceFileScope, path: string, options: WorkspaceByteReadOptions, signal: AbortSignal): Promise<WorkspaceFileBytes>
@Remote async stat(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileStat>
@Remote async list(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceDirectoryListing>
@Remote({ mode: 'stream' }) changes(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame>
```

- **`stat`** 返回 `WorkspaceFileStat { absolutePath, version, bytes? }`：檔案身份、不透明的新鮮度權杖，以及後端報得出時的大小。它只接受普通檔案。
- **`read`** 返回一個行視窗 `WorkspaceFileText = WorkspaceFileStat & { offset, text, lines, eof }`；`lines` 計頁內行數，使只含一個空行的頁（`text: ''`、`lines: 1`）與越過檔案末尾的頁（`lines: 0`）可區分。`range.offset` 是 1 起算的首行，預設 1；`range.limit` 是最多行數，預設 `maxLines` 且不得超過。行以 `\n` 結束，末尾的 `\n` 終止最後一行而不是開啟一空行；`text` 以 `\n` 連線本頁各行且不帶終止符；頁含最後一行時 `eof` 為 true，越過末尾的 offset 返回 `eof` 為 true 的空頁。切頁器沿 `streamText` 前進，數過視窗前的行而不保留，把每個窗內片段先按 `maxBytes` 核准再緩衝，並在越過視窗的第一個字元處返回，因此任意大小的檔案只花一頁記憶體。頁上的 `version` 與 `bytes` 來自流之前的那次 stat。
- **`readBytes`** 返回原生位元組、檔案中繼資料、偏移量和 EOF。必填選項物件未傳 `range` 時，在 `maxFileBytes` 上限內完整讀取；傳入時，在 `maxBytes` 上限內讀取有界視窗。`range: {}` 使用零偏移和設定的視窗上限；視窗可讀取超過完整檔案上限的檔案。[二進位制傳輸決議](2026-09-17-workspace-file-binary-transfer.zh.md)負責 Remote 回應編碼。
- **`baseFile`** 獨立於 `range` 選擇目標解析方式：目標 `path` 必須為相對路徑，從基準檔案所在目錄解析。Host 對兩個檔案執行普通檔案檢查，並保留後端讀取權限。[Document Preview](2026-09-08-document-preview-operations.zh.md)負責內容載入與地址語義。
- **`list`** 返回 `WorkspaceDirectoryListing { path, entries, truncated }`：被列目錄相對根的工作區路徑（根為空串）、其直接子項按後端的穩定名序以 `{ name, type, size? }` 給出，以及 `maxEntries` 是否截斷了列表。`type` 為 `file`、`directory` 或 `other`；符號連結子項報告其指向目標的型別，懸空者為 `other`。列表報告為目錄的子項經其解析目標開啟，Windows 目錄聯接亦然，此時列表以該目標命名；[目錄連結列舉](../bug-fix/2026-09-18-windows-directory-junction-listing.zh.md)擁有該規則。dotfile 照常列出，不做任何過濾。
- **`changes`** 產出 `WorkspaceFileWatchFrame`：在觀察佇列註冊且工作區根解析完成後先發 `{ kind: 'ready' }`，隨後為 `{ kind: 'change', change }`。載荷 `WorkspaceFileChange` 對存在的檔案為 `{ absolutePath, version }`，對消失的檔案為 `{ absolutePath, absent: true }`。來源是工作區根內的 `fs/observed`，不監視作業系統。首次拉取後的觀察都會排隊，包括根解析期間的觀察；取消或外掛釋放會結束該代流。

### 線路上的路徑

離開服務的路徑詞彙有兩套，每個方法只用其中一套。`read`、`readBytes`、`stat` 與 `changes` 以 `absolutePath` 命名檔案：它在檔案系統執行環境中、符號連結已解析的絕對路徑（`ctx.fs.processPath(target)`），因此 Client 提供者按絕對路徑把變更幀匹配到已開啟的地址：Client 把地址路徑原樣交給 Host，並只按成功的 `stat.absolutePath` 繫結跟隨者，不讀取工作階段摘要的 cwd。`list` 說工作區路徑——與其 `path` 參數相同的語法，絕對或相對根——因為其消費方是一棵以根為起點的樹。該欄位叫 `absolutePath` 而不叫 `url`，因為它不是資源地址；地址語法歸 `dsh-util-workspace-path` 所有，與資源模型一併描述。`read`、`readBytes`、`stat` 與 `list` 的輸入路徑是絕對路徑或相對工作階段工作區根的路徑，從不相對後端自己的 cwd；帶 `baseFile` 的 `readBytes` 從基準檔案所在目錄解析目標。

`version` 是消費者只比較是否相等、從不解析的不透明字串：本地後端由裝置、inode、大小及納秒級 mtime 與 ctime 匯出，因此內容不變的重寫也會改變它。`offset` 在 `read` 上指行、在 `readBytes` 上指位元組；兩套單位從不混用，二者的 `eof` 都表示視窗到達了檔案末尾。

### 檔案檢查與工作區包含

`read`、`readBytes` 與 `stat` 共享普通檔案檢查，之後依賴檔案系統後端的讀取權限。`list` 共享路徑檢查，但還會檢查工作區包含關係；`changes` 則把觀察過濾到工作區根內。服務執行以下檢查：

1. **路徑本身。** `lstat` 在跟隨任何東西之前檢查路徑：缺失路徑為 `not-found`；符號連結——不論指向哪裡，包括指回工作區內——對檔案方法為 `not-regular-file`（kind 為 `symlink`）。`list` 改為跟隨末端連結並判定解析後的目標：目標經 stat 必須為目錄，指向檔案的連結或目標已消失的連結為 `not-directory`（kind 為 `symlink`）。空路徑是 `gateway/bad-request`。
2. **`list` 的工作區包含。** 目錄解析為目標，由 `ctx.fs.contains(root, target)` 判定，其中 `root` 是從所選 Session header 解析出的 `WorkspaceFileScope.workspaceRoot`。`..` 爬出或根外絕對目錄為 `outside-workspace`。`changes` 對觀察到的目標使用相同的後端包含判定。
3. **上限。** 超過 `maxBytes` 的頁或視窗，或 `read` 索要超過 `maxLines` 的行數，一律拒絕、絕不截短，因為悄悄截短的頁讀起來就像整頁；超過 `maxEntries` 的列表被截斷並如實報告。全文及關聯檔案讀取超過 `maxFileBytes` 時被拒絕。
4. **文字。** 僅限 `read`：到頁末為止不是 UTF-8 的內容、後端 8 KiB 開頭樣本里的 NUL 位元組，或頁內任何位置的 NUL 位元組，都是 `not-text`；頁之後的位元組不檢查。

路徑檢查之後，檔案方法再對解析出的目標 `stat` 一次，因為檔案可能在讀取前已消失或換了種類：消失者為 `not-found`，被替換者為帶新種類的 `not-regular-file`。對 `list` 而言，根外條目若型別本身已不合格，會先報告其種類而不是位置；末端連結先解析並透過包含檢查，再讀取其目標種類。

### 失敗

每種失敗都是一個帶型別化 details 的 `RemoteError` 程式碼，宣告在丟擲它的程式碼旁，按程式碼而非訊息區分。

| 程式碼 | 何時 | Details |
|---|---|---|
| `workspace-file/not-found` | 路徑處無條目，或檔案在過關後消失 | `{ path }` |
| `workspace-file/outside-workspace` | `list` 的目標不在工作區根內 | `{ path }` |
| `workspace-file/too-large` | 一頁文字或位元組視窗超過 `maxBytes`，或全文讀取超過 `maxFileBytes` | `{ path, limit }` |
| `workspace-file/not-text` | 到頁末為止的非法 UTF-8，或樣本或頁內的 NUL 位元組（僅 `read`） | `{ path }` |
| `workspace-file/not-regular-file` | 對非普通檔案執行 `read`、`readBytes` 或 `stat` | `{ path, kind: 'directory' \| 'symlink' \| 'other' }` |
| `workspace-file/not-directory` | 對非目錄執行 `list` | `{ path, kind: 'file' \| 'symlink' \| 'other' }` |
| `workspace-file/unsupported-address` | Client 鑄出：本提供者無法服務的資源地址 | `{ address }` |
| `workspace-file/unknown-workspace` | Client 鑄出：不攜帶 Session 的 `absolute` 地址 | `{ address }` |
| `gateway/bad-request` | 空路徑，或不是範圍內整數的 `offset`、`limit`、`length` | `{}` |

這個集合只增不改不刪：可以新增程式碼，但不重新命名、不移除任何一個，因為消費方跨線路按這些字串分支。

### 設定

四個欄位，都是可在 `cordis.yml` 中修改、經驗證的正整數，此外沒有其他可調項：`maxBytes`（預設 2,097,152，即 2 MiB）是單頁文字與單個位元組視窗的含上限；`maxLines`（預設 5,000）是頁的預設與最大行數；`maxEntries`（預設 2,000）是返回目錄條目數的上限；`maxFileBytes`（預設 33,554,432，即 32 MiB）限制全文及關聯檔案讀取。分頁和開窗讀取不限制整個檔案的大小。

### `dsh-fs` 中的 `readByteRange` seam

大檔案的位元組視窗需要一種以視窗為界的檔案系統讀取，而 `FileSystem` 只有以整檔案為界的 `readBytes(target, signal, maxBytes)`。因此 `dsh-fs` 新增第二個原始位元組原語：

```ts ignore-check
abstract readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array>
```

它返回 `[offset, offset + length)` 處的位元組，檔案在窗內結束則變短，`offset` 位於或越過末尾則為空。視窗即界：後端最多傳輸為到達 `offset` 而跳過的字首之外的 `length` 位元組，從不緩衝整個檔案，因此呼叫方對 `length` 的上限就是防無界緩衝的守衛，與 `readBytes` 的界並列而非取代它。參數順序遵循 `readText`、`streamText` 與 `listDir`——先目標，再操作自己的參數，最後可選 signal——而不是 `readBytes` 把 signal 放中間的形式，那是該類中唯一的例外。`offset` 與 `length` 按前置條件都是非負整數；seam 是型別化的同程序邊界，不做任何驗證，由 Remote 方法線上路處驗證。

`fs-local` 在與其他讀取相同的普通檔案 stat 之後開啟 `createReadStream(targetKey, { start: offset, end: offset + length - 1 })`，對 `length` 為 0 直接返回空陣列而不開流；`fs-sandbox` 繼承 `LocalFileSystem`，隨之繼承該方法。繼承 `FileSystem` 的四個測試替身也實作了該方法。

### Client `file` 提供者

Client 匯出向 `ctx.resources` 註冊一個 `ResourceProvider<'file'>`，存活期與外掛相同，並宣告 `ResourceProtocolMap.file`。Document Preview 包把本包匯出的 `WorkspaceFileParams` 註冊為 `SidebarRightResourceParamsMap.file`。

- **值是中繼資料**，`WorkspaceFileStat { absolutePath, version, bytes? }`；內容從不進入流，因為內容可以任意大，而流是用來推送變更而不是載荷的。消費者用 `read` 讀頁（或用 `readBytes` 開窗），並比較版本判斷它們是否過時；新鮮度判斷和重新整理屬於各消費方，不屬於共享觀察。
- **地址命名檔案，作用域決定讀取工作階段。** `session` 地址攜帶的相對或絕對路徑原樣交給 Host；工作區根為相對路徑提供基準，Session 檔案系統後端決定讀取權限。Client 不需要持有 cwd。`absolute` 地址不帶 Session，以 `workspace-file/unknown-workspace` 失敗，不借用目前或 tab 所屬 Session。不支援的語法產生 `workspace-file/unsupported-address`。這兩種 Client 錯誤會結束流。
- **幀。** 第一幀是 `stat`或其失敗的 `ok: false` 幀；提供者不拋也不接，因為 Remote 面從不 reject，而提供者流裡的拋錯只可能是程式設計錯誤，任其浮出。攜帶值尚未持有的版本的 Host 寫入產生該版本、保留位元組數、不做 stat；攜帶已持有版本的幀被丟棄。報告的消失會再 stat 一次——仍在則是新中繼資料，不在則是保留上一個值供展示的 `not-found` 幀。跟隨的是地址而不是檔案：stat 失敗後流繼續，因此 agent 建立該檔案會讓資源恢復正常。中止 signal 則流靜默結束。
- **每工作階段一條 `changes` 訂閱。** 首位跟隨者開啟 `remote.$stream`，最後一位離開時釋放，後繼流和外掛拆除等待關閉完成。Client 接受 Host 的 `ready` 後才開始首次 `stat`；本地發出 WebSocket 請求不是 Host 確認。跟隨者先按地址註冊，緩衝路徑未知期間的變更，成功 stat 後按返回的 `absolutePath` 過濾排隊與即時幀，反斜槓歸一為斜槓。尚未成功繫結時，Session 內任何寫入均可觸發重新 stat。載體掉線由 Gateway 監督器重連；Host 結束或終態失敗會結束跟隨者，並保留最近中繼資料，直到重新開啟。
- **導航參數。** `SidebarRightResourceParamsMap.file` 是 `WorkspaceFileParams { line?: number }`，即要顯露的 1 起算行號。行號作為導航參數而不是地址的一部分傳遞，因為不論從頂部還是第 400 行開啟，檔案都是同一份內容。

### 相關記錄

[資源模型](2026-09-05-client-resource-model.zh.md)擁有 `ctx.resources`、`useResource`、`dsh-resource://<type>/…` 地址語法以及"每個地址一份資源"的推理；[文字預覽與檔案樹](../feature/2026-09-05-sidebar-text-preview-and-file-tree.zh.md)是 `read`、`list` 與 `file` 提供者隨包交付的消費方；[右側 Sidebar 停靠基礎設施](../feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)是它們開啟進去的介面；[工作區檔案連結](../feature/2026-07-31-web-workspace-file-links.zh.md)是經 HTTP 供檔案被否決之處。任何在這套體系上擴充功能的人都經 `remote.workspaceFiles` 觸達同樣的五個方法、經 `useResource<'file'>` 觸達同樣的 `file` 資源；線路型別以 `@deepseek-ai/dsh-api-workspace-files/types` 釋出。[工作區檔案讀取權限](2026-09-09-workspace-file-read-authority.zh.md)負責 Host 讀取權限與 HTML 安全取捨；[Document Preview](2026-09-08-document-preview-operations.zh.md)負責內容載入和逐 tab 新鮮度。

## Alternatives considered

**把工作區檔案端點留在 Session Controller 上。** 最初形態：總位元組上限之下的一個 `read`，作為 Session Controller 的子外掛註冊，因為線路入口本來就在那裡。被否，因為 Workspace File 服務是自己的能力——讀取和 stat 檔案，並列舉和觀察工作區——這些查詢應歸於一處，而 Session Controller 關心的是工作階段生命週期。搬出也讓服務長到五個方法而不給 Controller 的檔案添第二重目的。

**帶有反向 UI 依賴的雙面包。** 拆包選擇源於 `api/remotes` 引用 Client 葉子後形成的兩條工程引用環：資源模型為了結果型別引用 Remote 裝配，檔案提供者為了 Sidebar 參數列引用右欄 UI。TypeScript 以 `TS6202` 拒絕這些環。[雙面包組織](2026-09-07-workspace-files-dual-face-package.zh.md)取代拆包選擇：結果型別直接取自協定包，Sidebar 參數註冊移至文字預覽；保留兩個根聚合中的顯式編譯入口。

**提供可導航的工作區文件。** 因源隔離問題不採用；[二進位制傳輸](2026-09-17-workspace-file-binary-transfer.zh.md)返回 multipart 資料，HTML 仍隔離在 Blob iframe 中。

**檔案讀取採用“日誌可達”或工作區包含授權。** 唯一把檔案內容送過線路的先例——命令附件——只授權出現在工作階段日誌裡的檔案，這會排除手輸路徑；工作區包含則會排除 Session 後端其他位置的可讀檔案。[工作區檔案讀取權限](2026-09-09-workspace-file-read-authority.zh.md)改為以後端讀取決策為準，只對工作區形態的操作保留包含限制。

**為位元組視窗整檔案讀取再切片。** `readBytes` 的臨時形態經 `readBytes(target, signal, offset + length)` 從檔案開頭讀到視窗末端再切片。它讀不了比該末端更長的檔案的視窗——seam 會以過大拒絕這樣的檔案——因此沒有任何視窗能報告 `eof: false`，與該方法存在的理由相悖。被否，改為以視窗為界的 `readByteRange` seam。

**把檔案欄位命名為 `url`（或 `hostUrl`）。** Session Controller 的 `WorkspaceFileText.url` 是 Host 側檔案的 `file:` URL。資源地址出現後即被否：線路上的 URL 讀起來像地址，而這個不是——它只是地址所攜同一路徑的另一種編碼拼法，Client 必須解碼才能匹配變更幀。線路欄位按其所是命名，因此欄位為 `absolutePath`，`changes` 幀攜帶同一欄位。

**在 `FileSystem` 基類裡給 `readByteRange` 一個預設實作。** 基於 `readBytes` 的非抽象預設能免去測試替身一個方法，但只能靠把檔案從頭讀到視窗末端來實作——正是上文否決的行為——或者傳一個無界上限。改為抽象方法，由每個提供者與替身實作。

**工作區操作使用字串字首包含判定。** 把解析後的路徑字串與根比較比 `fs.contains` 簡單，但 `resolve` 會取 realpath，離開根的符號連結解析到根外路徑，而對未解析拼法的字首測試會放行；對已解析拼法的字首測試也仍需後端對"同一檔案"的定義。`list` 與 `changes` 由檔案系統判定包含關係。

## Consequences

- 工作區檔案存取由 `api/workspace-files` 的 Host/Client 兩面共同承擔；Session Controller 不攜帶其中任何實作，兩面的編譯與執行時入口保持獨立。header-only Session scope 讓普通、subagent、live 與 cold Session 都能解析自己的相對路徑，不需要 Agent 生命週期，也不退回父 Session。
- 任意大小的檔案都能開啟：文字按行頁、任何檔案按位元組視窗，在 Host 上各自只花一頁或一窗記憶體；全文讀取則受 `maxFileBytes` 約束；代價是消費者自己拼裝頁面，且單行超過 `maxBytes` 的行沒有任何頁，因為頁按行切。
- 每個檔案系統提供者都提供開窗的原始讀取；`fs-local` 直接定位到所請求的偏移量。
- 線路上的路徑是規範的：`absolutePath` 與變更幀以符號連結已解析的拼法命名檔案。跟隨者繫結到成功的 `stat.absolutePath`，因此同一檔案的另一種拼法——經符號連結到達的工作區根——也使用該規範變更鍵。
- 變更幀只報告 agent 自己的操作。使用者編輯器、shell 或子程序改動的檔案不產生幀；agent 僅僅讀取一個被別處改動的檔案卻會產生幀，因為讀取觀察到了新版本。
- 檔案型別檢查先於後端讀取，`list` 也先報種類再報根外位置。頁的 `version` 可能落後內容一次寫入，停滯的 `changes` 消費者會讓 Host 記憶體增長，因為一代流的佇列無界；每一條都是包 README 記錄在冊的已知取捨。
- `file` 資源推送變更而非內容，因此預覽不靠載荷就得知檔案已更新並讀取它想要的頁；失敗的開啟繼續跟隨地址，因此 agent 建立該檔案時 tab 無需使用者動作即恢復正常。
- Office 授權探測使用帶單位元組 `range` 的 `readBytes`；Document Preview 對整檔案格式使用同一方法並省略 `range`。

## Testing

`packages/api/workspace-files/tests` 中的 Host spec 覆蓋 live 與 cold subagent Session 的 header-only scope 解析、部署 fallback、缺失身份與 lookup 釋放；分頁讀取（整檔案、巢狀路徑、空檔案、多位元組 UTF-8、行視窗邊界、預設與拒絕的 limit、保留回車）；位元組視窗（預設、中段與尾窗、越界與空檔案、`Uint8Array` 往返、版本、上限、壞範圍以及無大小時的 `eof`）；`stat`；工作區外讀取及後端拒絕；`list` 的包含、截斷、目錄連結、目標已消失的連結與 `not-directory`；以及由 `fs/observed` 驅動並按根過濾的 `changes`。Client spec 覆蓋提供者幀、變更流、不支援地址及註冊與釋放。`fs/fs` 與 `fs-local` spec 釘住 `readByteRange`；`dsh-util-workspace-path` spec 釘住檔案地址語法。connection fixture 為 web e2e 套件提供 `stat`、分頁 `read`、`list` 與一幀可選啟用的 `changes`。

## Deferred

- 給 `changes` 一代流的佇列加上限。
- 寫入和搜尋操作；本服務只讀。
- 檔案地址中 `session` 之外的作用域；語法留有餘地，提供者只服務一個。
