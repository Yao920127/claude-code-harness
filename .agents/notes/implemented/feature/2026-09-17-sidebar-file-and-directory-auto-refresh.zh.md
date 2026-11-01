# Agent Note: Sidebar 檔案預覽與目錄樹按需監聽並自動重新整理

Status: implemented

[English](2026-09-17-sidebar-file-and-directory-auto-refresh.md) | 中文

## 問題

Sidebar 的 Document Preview 和 Files 面板都需要反映磁碟上的最新狀態。變化來源包括 Harness 檔案工具、Shell 命令、使用者編輯器，以及其他程序；只監聽 Harness 自己的檔案操作不夠。

起始實作已有兩條讀取路徑，但缺少完整的自動重新整理鏈結。

| 物件 | 起點行為 | 缺口 |
|---|---|---|
| 檔案 Resource | `ResourceProvider.open()` 提供初始中繼資料和後續變化，`ResourceRegistry` 管理訂閱及持有期，元件透過 `useResource` 讀取 | 檔案變化源不是系統級 watch |
| Document Preview | `TextPreview` 已比較 Resource 版本與正文版本，並提供三種載入模式的 reload | 檢測到變化後僅提示使用者點選重新載入 |
| Workspace 檔案事件 | `WorkspaceFiles.changes()` 轉發目前 Session 的 `fs/observed`，用戶端按檔案過濾 | Host 不知道具體關注哪些路徑；外部編輯器和 Shell 修改不會產生這類事件 |
| Files 面板 | `filesFace` 讀取目錄，`createFilesStore` 儲存已載入層級及展開狀態 | 新增、刪除、重新命名後需要手動重新整理；展開過的目錄再次開啟可能直接展示舊快取 |

`Resource` 目前承載檔案中繼資料，不持有預覽正文。正文由 Document Preview 或它選擇的渲染器讀取。因此，“中繼資料更新”和“重新載入正文”應保持各自的職責，不把正文快取搬進通用 Resource，也不要求每個渲染器直接接觸檔案系統監聽。

## 決策

按需監聽連線現有 FS、Workspace 檔案流、Resource 和 Sidebar 元件。檔案與目錄共用系統監聽能力和現有 Remote 流傳輸，但消費方式不同。

- Document Preview：監聽目前檔案，Resource 釋出新中繼資料，預覽自動呼叫已有 reload。HTML 的根檔案和引用的 CSS／JS 都加入同一個 `ResourceGroup`，任一成員變化都使整個 HTML 預覽失效。
- Files 面板：以目錄節點樹管理讀取和監聽。每個已開啟的目錄節點只載入並監聽自己的直接子項；Client 開啟多少層子樹，就逐層載入並訂閱多少層，不提前遍歷未開啟的後代。
- 摺疊目錄時釋放該目錄及其不可見後代的監聽；再次展開時重新訂閱並讀取，不能把摺疊前快取當作最新結果。
- 監聽只傳中繼資料或失效通知；正文仍走現有檔案讀取介面，目錄內容仍走 `list()`。
- 使用本地 Chokidar 系統監聽，不定時輪詢整個 Workspace，不預設遞迴掃描所有後代。
- 保留兩個面板的手動重新整理入口和自動重新整理開關功能，但暫時隱藏開關的 icon 按鈕。開關狀態及切換邏輯不變，新 Tab 預設開啟；隱藏入口不關閉監控或自動重新整理。

變化通知觸發現有 reload／list；重新整理失敗後不保留舊預覽內容。下面說明實作物件的職責、資料流及驗證。

## 實作物件與職責

### FS 與 Host

| 類或型別 | 所在檔案 | 職責 |
|---|---|---|
| `FileSystem` | [fs/src/index.ts](../../../../packages/fs/fs/src/index.ts) | 宣告單目標 `watch(target, changed, signal)` 方法；檔案觀察自身，目錄觀察直接子項；就緒後返回非同步關閉函式，基類以 `FS_IO_ERROR` 拒絕，不支援監聽的提供者無需覆寫，也不新增 FS 錯誤碼 |
| `FsTarget` | [fs/src/types.ts](../../../../packages/fs/fs/src/types.ts) | 沿用現有目標型別，不單獨增加 FS 監聽事件體系，也不讓上層解析 `targetKey` |
| `LocalFileSystem` | [fs-local/src/index.ts](../../../../packages/fs/fs-local/src/index.ts) | 檔案監聽其父目錄並過濾到目標，目錄監聽自身；等待 Chokidar 就緒和關閉；依賴宣告在 `fs-local` |
| `SandboxedFileSystem` | [fs-sandbox/src/index.ts](../../../../packages/fs/fs-sandbox/src/index.ts) | 繼承本地只讀監聽能力，不複製 watcher 實作；保留自身對寫入、編輯的策略檢查 |
| `SshFileSystem` | [fs-ssh/src/index.ts](../../../../packages/ssh/fs-ssh/src/index.ts) | 繼承基類的 `FS_IO_ERROR` 拒絕；Host 將其轉換為 `workspace-file/watch-unsupported` 的 `RemoteError`，不跨包匯入或判斷 `FsError` 實體，也不把遠端 `processPath()` 傳給本機 Chokidar |
| `WorkspaceFiles` | [workspace-files/src/index.ts](../../../../packages/api/workspace-files/src/index.ts) | 使用僅攜帶目標路徑的 `changes(scope, path, signal)`；Host stat 決定是否執行目錄包含檢查，目標型別變化後也檢查，普通檔案沿用檔案讀取權限 |
| `WorkspaceChangeFeed` | [workspace-files/src/changes.ts](../../../../packages/api/workspace-files/src/changes.ts) | 在現有 follow 中建立目標 watch，傳送就緒和變化；保留原佇列與操作觀察入口，出流前過濾目標，不重寫整套分發邏輯 |
| `ChangeFollower` | [workspace-files/src/changes.ts](../../../../packages/api/workspace-files/src/changes.ts) | 接收操作觀察與 OS 通知，處理監聽錯誤；關閉獨立於生成器拉取進度，並等待 watcher 關閉完成 |
| `WorkspaceFileWatchFrame` | [workspace-files/src/types.ts](../../../../packages/api/workspace-files/src/types.ts) | 僅傳路徑的請求沿用 `ready`／`change` 幀，不增加請求 kind 或獨立目錄幀格式 |

### Client 與 Sidebar

| 類、函式或型別 | 所在檔案 | 職責 |
|---|---|---|
| `ChangeFeed`、`SessionFeed`、`Follower` | [workspace-files/src/client/change-feed.ts](../../../../packages/api/workspace-files/src/client/change-feed.ts) | 將流的鍵改為 Session 加目標路徑，繼續複用既有就緒、路徑繫結、取消和重連邏輯；此版不為了命名重排類結構 |
| `createFileResourceProvider` | [workspace-files/src/client/provider.ts](../../../../packages/api/workspace-files/src/client/provider.ts) | 將檔案地址中的 Session 與路徑傳給目標流；首次讀取及後續通知都發布完整中繼資料，不能只換 `version` 而繼續沿用舊 `bytes` |
| `ResourceRegistry`、`ResourceProvider`、`UseResource` | [Resource 定義](../../../../packages/client/resources/src/client/contract.ts)、[ResourceRegistry](../../../../packages/client/resources/src/client/resources.ts) | 保持現有流、持有計數和訂閱模型；不新增第二套 `onChange`，不為此增加通用正文 reload API |
| `TextPreview` | [TextPreview.tsx](../../../../packages/client/ui-sidebar-documentpreview/src/client/TextPreview.tsx) | Resource 或 group 變化且開關開啟時自動觸發現有 reload；保留錯誤狀態與手動重新整理，獨立自動重新整理按鈕暫時隱藏 |
| `textFace`、`TabReads`、`createTextStore` | [預覽 face](../../../../packages/client/ui-sidebar-documentpreview/src/client/face.ts)、[預覽儲存](../../../../packages/client/ui-sidebar-documentpreview/src/client/store.ts) | 每個 Tab 持有一個 group，補充預設開啟的 `autoRefresh` 和表示待重新整理的 `resourcesDirty`；複用正文讀取代次與 `loadRevision` |
| 包內 `ResourceGroup` | [resource-group.ts](../../../../packages/client/ui-sidebar-documentpreview/src/client/document/resource-group.ts) | 透過現有 `resources.source(address)` 觀察成員；`add` 加入資源，`set` 更新完整成員列表，`close` 釋放全部成員，不改變通用 Resource 服務 |
| `DocumentBodyOwner`、`HtmlBody`、`createReadHtmlRelative` | [渲染器輸入](../../../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts)、[HTML body](../../../../packages/client/ui-sidebar-documentpreview/src/client/html/HtmlBody.tsx)、[關聯檔案讀取](../../../../packages/client/ui-sidebar-documentpreview/src/client/html/read-relative.ts) | 渲染器透過 `addResource` 宣告讀取到的成員，透過 `setResources` 提交本次依賴列表；HTML 在每次讀取返回後按 Host 報告的路徑加入 CSS／JS 資源，解析結束後釋放不再引用的成員 |
| 各文件渲染器 | [DocumentContent](../../../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts) 及同包各渲染器目錄 | 不接 watch；繼續消費文字、位元組或 renderer revision；`failed()` 結束渲染器載入但不記錄成功版本。檢查重新整理時取消舊任務、釋放舊物件及保留現有檢視偏好 |
| `filesFace`、`FilesInjected` | [Files face](../../../../packages/client/ui-sidebar-files/src/client/face.ts) | 繼續作為已有業務入口，直接持有各 Tab 根節點；繫結目錄讀取和變化流，轉發展開、摺疊、重新整理及自動重新整理開關，不新增 `FilesController` |
| 包內 `DirectoryNode` | [directory-node.ts](../../../../packages/client/ui-sidebar-files/src/client/directory-node.ts) | 表示一個已開啟的目錄，擁有本目錄變化流、讀取狀態和已開啟子節點；負責區域性重新整理、展開、遞迴關閉，以及向子節點傳遞自動重新整理狀態；`setExpanded` 按最新展開偏好更新待恢復節點 |
| `createFilesStore`、`FilesTabState`、`LevelState` | [Files store](../../../../packages/client/ui-sidebar-files/src/client/store.ts) | 保留展開、滾動和目錄顯示資料；區分首次載入與已有內容上的重新整理，避免每次後臺重讀都把子樹解除安裝；不儲存 watcher 或 AbortController |
| `FilesBody`、`Level`、`Entry` | [FilesBody.tsx](../../../../packages/client/ui-sidebar-files/src/client/FilesBody.tsx) | 將展開、摺疊、重新整理和麵板解除安裝交給注入回呼；按節點展示結果渲染，不掃描整棵樹生成監聽集合，展示仍只讀已有框架掛鉤與儲存 |
| Files 註冊入口 | [Files client/index.ts](../../../../packages/client/ui-sidebar-files/src/client/index.ts) | 給現有 `filesFace` 增加目錄變化流回呼；非同步副作用留在注入實作，不引入另一個功能外掛的執行時匯出 |

## 監聽介面與事件內容

### 一條流對應一個明確目標

每個請求指定一個目標路徑；Host 透過 `stat` 確定目前實際型別，Client 不傳檔案／目錄 kind。

```text
changes(sessionId, path, signal)
changes(scope, path, signal)
```

Host 方法仍透過 `WorkspaceFileScope` 接收解析後的 Session 上下文。Client 傳 Session id，不能自行偽造 Host 的工作目錄或權限。

目前目標是目錄時，Host 就檢查 Workspace 包含關係；原本缺失或為普通檔案的目標變成目錄後也執行檢查。Workspace 外的普通檔案仍可透過所選 FS 讀取與監聽。

| 通知 | 內容 | 消費方動作 |
|---|---|---|
| 就緒 | 目前一代目標監聽已經建立 | 執行首次或重連後的 `stat()`／`list()`，接收讀取期間排隊的變化 |
| 檔案存在或更新 | 沿用路徑和版本通知；Client 收到後重新 stat | 用完整結果更新 Resource 的路徑、版本和大小；自動重新整理開啟時重新讀取正文 |
| 檔案缺失 | 目標路徑和缺失狀態 | Resource 報告不可用，預覽保留已載入內容並顯示錯誤 |
| 目錄失效 | 目錄目標流中的 `change` 幀 | 只重新呼叫這個目錄的 `list()`，不按目錄版本去重，也不重新整理整棵樹 |
| 監聽失敗 | 初始化失敗報告 `workspace-file/watch-unsupported`；執行期錯誤結束監聽 | 用戶端在監聽接入處處理失敗，普通讀取與手動重新整理仍可用；不偽裝成檔案刪除 |

不用把檔案正文、完整目錄列表或每個變化的補丁塞進通知。檔名由路徑表達；檔案大小來自目前 stat；修改時間若只為判斷變化，繼續由後端版本 token 表達，不要求 UI 解析 token 或另外引入時間戳比較。

Resource 釋出的路徑、版本和大小來自同一次 stat。先沿用現有小通知，再由 Client stat，避免為了減少一次請求擴大事件協定。目錄變化不應只比較目錄自身 mtime：直接子檔案的大小或型別變化也可能影響 `list()` 回傳值，應按相關子項事件使目錄列表失效。

### 系統監聽與存取範圍

- `FileSystem.watch()` 接受本提供者解析出的目標；本機或遠端路徑的含義由 FS 提供者負責。
- 檔案監聽保持檔案讀取的存取規則。現有預覽允許透過所選 FS 讀取部分 Workspace 外的路徑，不能把目錄樹的範圍限制順手強加給這些檔案。
- 目錄監聽保持 `list()` 的 Workspace 範圍及路徑檢查，目標型別變化後也執行檢查，不因新增 watch 擴大目錄瀏覽權限。
- 父目錄保持存在時，檔案監聽覆蓋原地寫入、臨時檔案替換、刪除和同一路徑重建。本地提供者直接監聽父目錄，將條目和事件過濾到目標檔案，等待父目錄 watcher 就緒後才報告就緒，目標檔案尚不存在時也適用。
- 目錄監聽只關注該目錄自身和直接子項，不遞迴開啟尚未展開的子目錄；直接子項的建立、刪除、重新命名、型別或可見中繼資料變化都使這一層失效。
- 本地實作採用系統事件模式；若需要調整寫入穩定時間、事件合併視窗等部署參數，應由擁有它們的設定宣告，不散落在元件裡。
- 系統 watch 只驅動 UI 重新整理，不把外部磁碟變化偽裝成某個 agent 已讀取檔案的 `fs/observed`，不改變檔案編輯的已觀察版本策略。

## 檔案預覽的完整資料流

```text
Files.openResource / file.link
  → Sidebar.openTab
  → TabDomain → Resource.pin
  → ResourceRegistry → createFileResourceProvider.open
  → changes(sessionId, path)
  → WorkspaceFiles → FsTarget
  → WorkspaceChangeFeed → FileSystem.watch
  → LocalFileSystem → Chokidar
  → ready → Client.stat → ResourceSnapshot

Editor / Shell / file tool → disk
  → Chokidar → LocalFileSystem
  → WorkspaceChangeFeed → FileSystem.stat
  → Remote.change
  → Client.stat → ResourceSnapshot
  → ResourceGroup → TextPreview
  → reloadPages / reloadAll / prepareRenderer
  → DocumentContent / renderer revision
  → renderer
```

預覽正文可以與中繼資料初始化並行讀取。ResourceGroup 以各成員首次中繼資料為基線，只轉發後續變化，不做首讀版本對帳。

| 載入模式 | 已有重新整理入口 | 重新整理結果 |
|---|---|---|
| `text-pages` | `reloadPages()` | 廢棄舊正文代次，重新讀取文字頁；不能混合不同版本的頁 |
| `bytes-complete` | `reloadAll()` | 重新讀取完整位元組，PDF、HTML、圖片等消費新位元組 |
| `renderer` | `prepareRenderer(..., reload = true)` | 增加 `loadRevision`，渲染器取消舊載入並重新請求；Office 失敗透過 `failed()` 結束載入，後續檔案變化可重試 |

普通渲染器不需要新增 `watch()` 或新的 reload 介面。已有 `DocumentContent` 中的文字、位元組和 revision 變化已經能驅動重新載入。

## HTML 的 ResourceGroup

一個 HTML 預覽的 group 包含 HTML 根檔案，以及現有 HTML 打包器實際讀取的 CSS／JS 檔案。成員都是普通檔案 Resource，不為依賴另建 watcher 或額外檔案型別。group 是預覽包內物件，複用 Resource 已有的訂閱和持有計數。

```text
index.html Resource ─┐
theme.css Resource ──┼→ ResourceGroup → resourcesDirty → autoRefresh → HTML reload
page.js Resource ───┘
```

- `addResource(address)` 在 `readRelated` 返回 Host 解析的 `absolutePath` 後將依賴加入 group；已有成員不重複訂閱，不傳遞或儲存正文讀取版本。
- `setResources(addresses)` 提交本次解析出的依賴列表；預覽擁有者始終保留根檔案，其餘未再出現的成員釋放訂閱。
- CSS／JS 引用使用 HTML 所屬 Session，由 Host 解析路徑。讀取失敗時也保留 Host 提供的字串 `error.details.path`；沒有該路徑時，Client 不自行猜測。
- HTML 本身沒有改變，但 CSS 或 JS 改變時，也重新載入整個 HTML，生成新的 iframe 內容。
- 缺失依賴有 Host 報告的路徑時仍保留為成員；解析失敗時保留已經發現的依賴，後續成員變化可以再次觸發載入。
- 新成員的首次中繼資料僅建立基線，不使預覽失效；只有後續中繼資料變化才通知，首次讀取不另做版本對帳。
- group 變化只把 `resourcesDirty` 置為 `true`；開始重新整理時清除，讀取期間再次變化則重新置位。不累計次數，也不增加另一套讀取代次。
- 關閉預覽 Tab 時釋放整個 group。關閉自動重新整理僅停止自動重讀，group 繼續觀察並記錄陳舊狀態。

此版覆蓋互動式 HTML 打包器現有支援的直接 stylesheet 連結和普通 JS 腳本，不順手增加 CSS `@import`、ES module 圖或執行時網路請求的依賴發現。新開啟的靜態安全預覽不讀取關聯檔案，只觀察根檔案。從互動式 HTML 切換到靜態預覽時釋放依賴監聽，只保留根 Resource。

## 自動重新整理開關

Document Preview 和 Files 各自保留原 reload 按鈕。獨立自動重新整理開關的 icon 入口暫時隱藏，狀態、切換邏輯、文案和樣式保留；新 Tab 仍預設 `autoRefresh: true`。隱藏不改變開關狀態，也不停止觀察。

| 狀態或操作 | 行為 |
|---|---|
| 自動重新整理開啟 | 開關高亮，使用已有暫停圖示，提示“關閉自動重新整理”；變化自動重新整理對應預覽或目錄節點 |
| 點選關閉 | 開關顯示播放圖示，提示“開啟自動重新整理”；繼續觀察變化，但不自動替換目前內容 |
| 點選重新開啟 | 若暫停期間已有變化，立即補一次重新整理；之後繼續自動重新整理 |
| 點選原 reload | 無論開關狀態如何，都主動讀取一次，不改變開關狀態 |
| 自動重新整理關閉時展開新目錄 | 新目錄仍正常首次載入並訂閱；開關只控制後續變化引起的自動重讀 |

暫停／播放使用現有圖示，手動 reload 保留環形箭頭，不新增圖示系統。按鈕透過 `aria-pressed` 表達狀態，名稱和提示走現有 locale 字典。

## Files 面板的完整資料流

```text
Files.open
  → FilesBody → Session.cwd + Tab
  → filesFace.start → DirectoryNode.open
  → changes(sessionId, path)
  → Host.watch(depth: 0) → ready
  → DirectoryNode → list(sessionId, path)
  → createFilesStore.levels[path]
  → Level / Entry

Entry.expand
  → filesFace.toggle
  → DirectoryNode.expand → child.open
  → child.watch → ready → child.list
  → createFilesStore.expanded + levels[path]

Process → create / remove / rename
  → Host.change(directory)
  → DirectoryNode.refresh → list(path)
  → createFilesStore.levels[path]
  → DirectoryNode.children ↔ list.entries
  → DirectoryNode.collapse → child.close
```

檔案預覽和目錄樹是兩條獨立的消費路徑。預覽檔案可以在 Files 面板沒有開啟時自動重新整理；Files 也可以在沒有任何檔案預覽時自動更新目錄項。無需把整棵目錄樹包裝為一個 Resource，也不為此新增目錄 Resource 協定。

目錄面板直接透過注入的 Remote 業務回呼取得失效通知和列表結果，顯示值統一寫回自己的儲存；不繞過元件現有的讀取方式，不讓元件直接持有 Chokidar、Remote 迭代器或底層觀察物件。

## 目錄節點樹與生命週期

Files 的執行時物件本身就是一棵按需開啟的目錄樹，不先建立整棵 Workspace 樹，也不另算一個扁平的 watcher 集合。現有 `filesFace` 持有各 Tab 根節點，讀取、監聽和釋放逐層交給 `DirectoryNode`，不另抽控制器類。

| 節點職責 | 具體行為 |
|---|---|
| 本目錄身份 | 持有該目錄路徑和所屬 Session／Tab，檔案系統根與 Windows 盤根均可作為樹根，列表只包含直接子項 |
| 本目錄監聽 | 一個開啟的節點持有一個目標變化流；收到通知只使本節點列表失效 |
| 本目錄讀取 | 持有有效 list 請求的代次，待補讀狀態持續到讀取收尾後，結果透過儲存 actions 釋出 |
| 已開啟子目錄 | 按直接子目錄路徑持有子 `DirectoryNode`；未展開目錄只是列表中的目錄項，不建立活動子節點 |
| 展開 | 目錄行觸發展開時建立或複用對應子節點，再由子節點建立自己的監聽與讀取；恢復展開偏好時只開啟列表中仍存在的目錄 |
| 摺疊 | 關閉並移除對應活動子節點；子節點遞迴關閉後代，然後釋放自己的監聽和請求 |
| 列表更新 | 保留仍存在的已開啟子節點，關閉已刪除、重新命名或變為檔案的分支；不重新開啟所有節點 |
| 整樹關閉 | 對根節點執行關閉，自然遞迴釋放整棵活動子樹，不另遍歷全域監聽註冊表 |

`createFilesStore.expanded` 儲存使用者的展開偏好，但不是另一份監聽註冊表。父目錄關閉後，即使儲存保留了後代展開偏好，也不能繼續持有這些後代的活動節點。重新開啟時先讀取父目錄，再對仍存在且需要恢復的子目錄逐層建立節點。即使父節點尚未建立，展開和摺疊也會更新儲存與待恢復狀態；後代恢復時遵循最新偏好，不會重新開啟已摺疊的分支。

```text
workspace/                  watch
├── src/          open      watch
│   ├── components/ open    watch
│   └── internal/ closed    -
└── assets/       closed    -

collapse(src/):
workspace/                  watch
├── src/                    close(src/, components/)
└── assets/                 -
```

父目錄的監聽仍能發現摺疊目錄自身被刪除、重新命名或替換，但不負責發現其深層內容變化。再次展開時重新 list，補上未監聽期間的變化。

| 使用者操作或生命週期事件 | 檔案預覽 | Files 面板 |
|---|---|---|
| 首次開啟 | 開啟檔案 Resource 監聽並讀取正文 | 開啟根節點，由根節點建立監聽並讀取列表 |
| 展開子目錄 | 無影響 | 父節點開啟對應子節點；子節點監聽並讀取直接子項，按偏好逐層恢復仍存在的後代 |
| 摺疊子目錄 | 已開啟的檔案預覽繼續監聽 | 釋放該目錄及其目前不可見後代的監聽；可保留展開偏好和顯示快取 |
| 切走 Tab 或面板解除安裝 | Tab pin 繼續持有檔案中繼資料流；正文元件不在時不主動重讀，切回來按待處理 Resource 變化與開關狀態補重新整理 | 此版沿用 Tab 生命週期，保留已展開目錄節點和監聽；不另外引入面板顯隱生命週期 |
| 手動重新整理 | 重用目前預覽 reload，不重建整套 Resource | 從根節點遞迴重新整理已開啟子節點，不進入摺疊目錄，也不重建全部 watcher |
| 關閉最後一個持有者 | Resource abort，檔案流結束，Host 等待 watcher 關閉 | Tab 關閉時終止全部目錄流、取消讀取並刪除 Tab 狀態 |
| 連線恢復 | 新流 ready 後重新 stat，即使斷線期間沒有可回放事件也能發現變化 | 新流 ready 後重新 list 所有仍需觀察的目錄 |

Files 監聽跟隨 Tab 生命週期；摺疊關閉對應子樹，關閉 Tab 則釋放根節點與整棵活動樹。暫時隱藏面板不額外拆除和重建節點，這使改動集中在現有入口和目錄物件。儲存保留展開偏好，節點只在重新展開時用這份偏好逐層恢復，不維護第二份全域展開集合。

同一個完整檔案 Resource 地址的共享繼續由 `ResourceRegistry` 完成。目錄節點的父子所有權保證一個 Tab 內同一分支不會重複開啟；第一版不增加跨 Session、跨視窗或路徑別名的全域 watcher 去重系統。目錄下的普通檔案項不各自訂閱檔案 watch，只有真正開啟為預覽 Resource 的檔案才取得獨立檔案監聽。

## 使用者可見動線

### 編輯已預覽的檔案

1. 使用者從 Files 開啟 Markdown、程式碼、圖片、PDF、HTML 或 Office 檔案。
2. 使用者在外部編輯器儲存，或 Shell 命令改寫該檔案。
3. 自動重新整理預設開啟，Document Preview 自動顯示新內容；使用者關閉開關後可保持目前內容，手動 reload 或重新開啟時再讀取。
4. 目前渲染器選擇和換行偏好保留；文字滾動位置按現有機制恢復，內容縮短時只能落在新內容允許的位置。
5. PDF、HTML 和圖片的精確閱讀位置恢復不是本方案額外承諾；沿用各渲染器現有能力，避免為自動重新整理加入一套跨格式定位系統。

### 瀏覽正在變化的目錄

1. 使用者開啟 Files，根目錄列表載入並開始監聽。
2. 使用者展開 `src` 和 `src/components`，兩個子目錄分別開始監聽。
3. 外部工具在 `src/components` 建立檔案，只有這一層列表重新整理，其他目錄不折疊、不重新載入。
4. 使用者摺疊 `src`，其自身和 `components` 的監聽關閉，根目錄繼續監聽。
5. 摺疊期間外部工具繼續修改內容；使用者再次展開 `src` 時重新讀取，依次恢復仍有效的子目錄展開狀態，不停留在舊快取。

### 刪除、重新命名和失敗

- 檔案刪除後，已有預覽內容保留並顯示不可用提示；父目錄保持存在時，原路徑重建後自動恢復讀取。重新命名視為舊路徑消失和新路徑出現，不根據 inode 自動改寫預覽地址。
- 目錄刪除或重新命名後，父目錄重新整理移除舊行，並釋放舊子樹監聽。新目錄按新名稱顯示，不擅自轉移舊路徑的展開偏好。
- 自動重新整理和手動重新整理呼叫同一套已有 reload，沿用清空舊結果、載入及錯誤展示行為；不增加保留舊位元組或舊 iframe 的分支。目錄重新整理保留現有列表快取，避免重建活動子樹。
- 後端不支援 watch 時，Host 把初始化異常轉成 `workspace-file/watch-unsupported` 的 `RemoteError`；用戶端結束監聽，繼續普通讀取與手動重新整理，不增加輪詢。SSH 的外部磁碟變化不會自動更新預覽。

## 就緒、競態與重新整理合併

監聽、讀取與展示只需要處理少數明確的順序問題，不擴充功能成磁碟事務或操作日誌。

- 先建立 watch，再傳送 ready，然後取得初始 stat／list。讀取過程中到達的變化不能丟棄；必要時再讀一次，使最終結果收斂到最新狀態。
- 事件表示“目標可能變化”，不是一次使用者操作的精確回放。Chokidar 的重複通知和連續寫入可以合併；檔案按版本去重，目錄按待重新整理狀態合併。
- 同一目錄最多有一次有效 list 在途；在途或讀取收尾期間再次失效，只記錄需要補讀，隨後讀取最新狀態，不累計任意長度的重新整理任務佇列。
- 檔案自動重新整理複用讀取代次和 renderer revision。連續通知不能讓舊請求覆蓋新內容，也不能因同一已處理版本而無限 reload。
- 目錄後臺重新整理保留目前列表，不另存沒有顯示用途的 `refreshing` 標記；只有沒有可顯示列表時才進入 `loading`，避免子樹閃爍和監聽反覆重建。
- 目錄摺疊、刪除或 Tab 關閉後，已取消讀取的晚到結果不得重新建立狀態或恢復監聽。即使生成器停在已產出的幀上，取消也會關閉 Host watcher；流與外掛拆除等待關閉完成。
- 父目錄保持存在時，檔案短暫消失不結束監聽；正常檔案變化與監聽自身失敗分別處理。同路徑檔案監聽覆蓋原子儲存與刪除重建。
- 原有檔案讀取並非事務快照，stat 與正文讀取之間仍可能發生寫入；後續通知觸發重新整理，自動重新整理不保證每次讀取都獲得原子快照。

## 不採用的替代方案

**在 Resource 上再加一套 `onChange` 和正文 reload。** 現有 `open()`、`source()`、`useResource` 已經表達變化，正文又不歸通用 Resource 所有。重複介面會使中繼資料、正文和渲染器分別維護重新整理狀態。

**整個 Workspace 遞迴 watch。** 開啟一個檔案或一個根目錄不應導致監聽所有深層目錄。按目前檔案和展開目錄取得監聽，資源使用量與使用者實際開啟的內容相關。

**保留 Session 廣播流，再增加路徑註冊／退訂協定。** Host 需要知道具體目標，但不必再維護一個由額外命令修改的路徑集合。一目標一流可以直接複用現有取消、重連和結束語義。

**直接下發正文或完整目錄列表。** 這會混合監聽與內容讀取，還要重複分頁、位元組限制、檔案格式和目錄條目限制。小通知配合現有 `read()`／`list()` 更直接。

**根據變化事件在用戶端增刪目錄行。** 檔案系統通知可能合併或重複，目錄列表還有排序、型別和條目上限。重新 list 受影響的一層即可保持現有語義，不需要維護目錄增量合併演算法。

**在 Workspace API 中直接呼叫 Chokidar。** API 不擁有執行世界，SSH 路徑可能只在遠端存在。watch 必須由實際 FS 提供者實作。

## 驗證

FS、Workspace API、預覽和 Files 各自的測試覆蓋監聽生命週期、中繼資料更新和自動重新整理。[Web 文件預覽測試](../../../../apps/web/tests/document-preview.e2e.ts) 從正式 Web 組合驗證檔案預覽。工作階段事件日誌、持久化格式和模型輸入均不變。

| 情境 | 已驗證行為 |
|---|---|
| 外部原地寫入、原子替換、Shell 寫入 | 開啟的檔案預覽自動更新，不依賴 `fs/observed` |
| 文字、完整位元組、自主載入渲染器 | 三種模式都重新整理，舊請求不能覆蓋新結果，Office 失敗後允許後續檔案變化重試 |
| 成員首次中繼資料 | 僅建立基線，不額外 reload，也不做首讀版本對帳 |
| HTML 根檔案不變，僅 CSS／JS 改變 | group 觸發整個 HTML 重新載入 |
| HTML 刪除一條依賴引用 | 本次 group 更新後釋放不再引用的成員 |
| 關閉自動重新整理後修改，再手動重新整理或重新開啟 | 暫停期間保持內容，手動操作或重新開啟後補重新整理；按鈕職責獨立 |
| 根目錄直接子項新增、刪除、重新命名 | Files 根層自動更新，工作區為檔案系統根或 Windows 盤根時也適用 |
| 已展開子目錄變化 | 只重新整理對應目錄層，保留其他層與展開偏好 |
| 未展開的深層目錄 | 不建立深層 watcher，不遞迴遍歷 |
| 摺疊父目錄 | 釋放它和不可見後代的監聽；檔案預覽若仍開啟則獨立繼續監聽 |
| 祖先恢復期間摺疊或重新展開深層後代 | 立即記錄最新偏好，恢復時只開啟仍需展開的分支 |
| 重新展開、切回 Files、連線恢復 | 重新讀取目前列表，不依賴錯過事件的回放 |
| 檔案刪除後重建，或子目錄替換為檔案 | 父目錄保持存在時，檔案監聽在同一路徑恢復；目錄列表釋放失效子樹 |
| 快速寫入、重複通知、讀取中或收尾時再修改 | 有限次補讀並收斂到最新狀態，不無限重新整理 |
| 關閉 Tab、解除安裝外掛、取消初始化 | 即使不再拉取下一幀，所屬監聽也完全關閉；晚到通知和讀取不再寫入狀態 |
| 不支援監聽的提供者、越界目錄請求 | 明確報告支援狀態或存取錯誤，不觀察錯誤執行世界或擴大目錄權限 |

可控事件源和延遲讀取驗證就緒、取消及恢復期間的展開操作。真實本地 watch 測試使用臨時目錄，等待 watcher 就緒後再操作，透過觀察到的狀態結束，不靠固定 sleep 猜測事件時機。Web 預覽測試和包內 UI 測試覆蓋使用者可見行為；命令執行結果記錄在 PR 中。

## 影響

- Linux 上父目錄刪除並重建後的自動監聽恢復仍延期；父目錄保持存在時，同路徑檔案重建仍受支援。
- OS 檔案事件不是持久訊息，斷線或程序重新啟動可能丟通知，因此每一代流就緒後都要重新取得目前狀態。
- 多個已開啟檔案和展開目錄會增加 watcher 與流數量；第一版用按需生命週期控制數量，不提前加入複雜的跨消費者去重服務。
- 自動重新整理可能打斷閱讀，尤其是 HTML 內部互動和 Office 轉換。保留檢視偏好、合併連續變化，但不承諾儲存任意嵌入文件的執行狀態。
- HTML 的 CSS／JS 透過現有解析器進入 group；更深依賴、圖片依賴和執行時動態載入不作為這次修改的額外解析工程。
- SSH 遠端系統監聽需要獨立的遠端實作策略；這裡要求介面如實表達不支援，不使用本機 watcher 或隱式輪詢冒充遠端能力。

## 與已有 Agent Note 的關係

自動重新整理和系統監聽保留已有 Resource 模型、檔案讀取授權和渲染器職責。以下記錄仍有獨立的設計理由；本文負責目標級監聽、自動 reload 和目錄監聽生命週期。

- [Client Resource 模型](../../implemented/architecture/2026-09-05-client-resource-model.zh.md)：保留地址、提供者、訂閱和持有期；新增行為由已有流承載。
- [Workspace 檔案服務](../../implemented/architecture/2026-09-05-workspace-files-service.zh.md)：讀取與列表介面職責不變；目標級系統監聽替代僅轉發操作觀察的 Session 流。
- [文件預覽操作](../../implemented/architecture/2026-09-08-document-preview-operations.zh.md)：正文載入所有權和三種載入方式不變；自動重新整理使用其現有 reload 路徑。
- [Workspace 檔案讀取授權](../../implemented/architecture/2026-09-09-workspace-file-read-authority.zh.md)：保留檔案讀取與目錄瀏覽的不同存取範圍；目標 watch 分別遵循對應規則。
- [Sidebar 文字預覽與檔案樹](../../implemented/feature/2026-09-05-sidebar-text-preview-and-file-tree.zh.md)：按 Tab 的展開、導航和滾動狀態不變；已開啟節點負責目錄自動失效與監聽。
