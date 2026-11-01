# Agent Note: Sidebar 文字預覽與檔案樹

Status: implemented

[English](2026-09-05-sidebar-text-preview-and-file-tree.md) | 中文

## Problem

右側 Sidebar 的[停靠基礎設施](2026-09-04-right-sidebar-docking-infrastructure.zh.md)與[tab 型別註冊表](../architecture/2026-09-05-sidebar-tab-types-and-navigation.zh.md)給了外掛一個註冊 tab 型別的位置，但沒有型別的停靠面只是一根空列。三個問題必須先由隨包交付的程式碼答出來，別人才談得上註冊型別：一個新 pane 在承載內容之前顯示什麼；agent 產出或讀過的檔案如何不離開產品就能檢視；讀者如何找到工作階段從未提到的檔案。這些答案還要把型別作者模型完整演示一遍——靜態定義、keyed 坑位裡的體、型別自有狀態用的 Slot store 與 inject face、地址背後活資料用的 `useResource`——讓 `ui-sidebar-right` 之外寫的型別有一份可照抄的樣板，而不只有一份契約。

每個答案都帶著程式碼本身解釋不了的產品規則：文字檔案為什麼按頁讀而不是整讀，檔案變了為什麼只提示不重新整理，檔案樹為什麼是不認領任何地址的頁型別，引導頁為什麼交出自己的 tab 而不是在旁邊再開一個。本文為三個隨包交付的型別記下這些決定。

## Decision

Sidebar 隨包交付三個 tab 型別：**引導頁**（`ui-sidebar-right`）、**文件預覽**（`ui-sidebar-documentpreview`）與**檔案樹**（`ui-sidebar-files`）。每個型別都在自己的 `ctx.effect` 裡把靜態定義註冊進 `ctx.sidebarRightTabs`、把體註冊進 keyed 坑位 `sidebar.right.pane.tab`（鍵 = 定義的 `id`），因此型別的壽命恰等於其外掛。引導頁與檔案樹是按 kind 開啟的頁型別；文件預覽是以最低檔認領 Session 作用域 `file` 資源地址的檢視器。型別的控制元件住在自己的體裡；pane 的 tab 條只承載面板自身的動作。文案由各包的名稱空間（`sidebarRight`、`sidebarDocumentPreview`、`sidebarFiles`）以 locale 方式持有。

### 引導頁

[預設頁與關閉保護](../../../../packages/client/ui-sidebar-right/README.zh.md)取代本節的預設引導選擇；引導頁註冊、替換和唯一性保持不變。

引導頁是 pane 承載內容之前顯示的東西。它的註冊定義是 `{ id: '@deepseek-ai/dsh-client-ui-sidebar-right/guide', kind: 'guide', priority: 'builtin', title }`，沒有 `patterns`：引導頁不檢視任何東西，所以經 `openTab` 按 kind 開啟，並記在頁地址 `sidebar://guide` 之下——那是註冊表自己的記帳，呼叫方從不拼它。tab 標題是 `開始` / `Start`，在 pane 播種時捕捉進佈局記錄，於是之後切換語言只重標型別，不改已開著的 tab。

正文按 `order` 從每個已註冊型別的 `guide[]` 投影入口，並透過註冊表可觀察的 `guide()` 列表更新，因此後註冊的型別無需引導頁感知即可出現。[Sidebar README](../../../../packages/client/ui-sidebar-right/README.zh.md#the-guide)說明羅盤、可選描述、後備圖示和目前膠囊佈局。點選膠囊會呼叫 `tabActions.openTab(entry.kind, { replaceTab: true })`：被選的型別在引導頁自己的 tab 裡開啟，引導頁隨之消失。引導頁是一扇門，不是留在被開啟者旁邊的一頁。

體同時也是替換接縫。它渲染 `sidebar.right.tab.guide` 鏈，並以隨包交付的引導頁作為鏈的 fallback，於是註冊了自己入口的產品接管整個體，而沒有入口、或每個入口都拒絕時，隨包交付的引導頁照常繪製。因為隨包交付的引導頁是 fallback 而不是鏈上的一個入口，所以永遠恰有一個體，也不可能被意外投掉。

一個 pane 最多持有一個引導頁，停靠層把這條作為產品行為強制執行：有引導頁時 tab 條的新增控制元件隱藏，往這樣的 pane 開啟引導頁只是聚焦它，引導頁永不複製，被拖拽、落下或回塢進已有引導頁的 pane 的引導頁併入它（來者關閉）。展開且為空的根 pane 會填入目前預設頁。摺疊的佈局可以保持為空，展開時才選擇並建立預設頁。

### 文字預覽

[Document Preview 決議](../architecture/2026-09-08-document-preview-operations.zh.md)取代本節的渲染器、載入和資源觀察細節。後備 tab 註冊、分頁原始碼導航與正文自有控制元件仍然有效。

`text` 是 Session 作用域檔案的後備檢視器。它的註冊定義是 `{ id: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview', kind: 'text', patterns: ['dsh-resource://file/**'], priority: 'fallback', canOpen, title: basenameOf }`。`canOpen` 只接受解析後 scope 為 `session` 的地址。pattern 含 `:`，因此匹配整個地址；`fallback` 是最低檔，所以 `extension` 或 `builtin` 檔上一個 pattern 更窄的型別（比如 `*.png`）接走那些地址，其餘一切落到這裡，而 text 型別對任何檔案都留在候選列表中。`id` 是包名，兼作體坑位的 `key`，於是一個接管了 `text` kind 的擴充功能不可能讓坑位誤拿到這個體。標題是地址解碼後的最後一段：整個地址仍是內容身份——不同目錄下同名的兩個檔案、或同一路徑在兩個工作階段之下，是兩個 tab——只有 chip 上的文字被縮短。

tab 使用 `dsh-resource://file/session/<sessionId>/<path>`，其中路徑可以是相對路徑或絕對路徑（[Workspace Files](../architecture/2026-09-05-workspace-files-service.zh.md)負責該語法與 `fileAddressFor` / `parseFileAddress` 輔助函式）。`hostFileOf` 只接受這種 Session scope，並從地址取得 Session 與路徑；不認領不帶 Session 的 `absolute` 地址。被認領的地址若格式錯誤，則作為程式錯誤丟擲。

中繼資料與內容來自不同的地方。`useResource<'file'>(tab.contentId)`——[client 資源模型](../architecture/2026-09-05-client-resource-model.zh.md)提供的全域標準 hook——產生 `WorkspaceFileStat`；正文把其觀察版本與已載入內容版本比較。Preview face 透過 `remote.workspaceFiles.read` 讀取文字，透過帶 `{}` 選項的 `readBytes` 讀取完整位元組。後續文字頁若來自更新版本，則從第一頁重新開始；被過載或 tab 銷燬淘汰的請求不能再寫入。[Document Preview 決議](../architecture/2026-09-08-document-preview-operations.zh.md)負責各渲染器的載入方式。

store 是 Slot 標準件：每工作階段一個獨佔實例，按 tab id 分桶，持有 `{ version, pages, eof, loading, failure, scrollTop, wrap, revision }`。按 tab 而非按檔案分桶是有意的——同一檔案的兩個 tab 各自滾動。face（`loadPage`、`reloadPages`）是唯一的非同步半邊：它標記讀取進行中，等待 Remote 結果，再經 store 的 action 寫入一頁或一次失敗；若 owner 的 `signal` 已觸發則什麼也不寫。`signal` 同時終結這個桶：face 在 tab 首次讀取時掛一個 abort 監聽器，由它忘掉桶——不是體，體隨 tab 切換反覆掛載解除安裝；從未讀過的 tab 沒有桶也沒有監聽器，而 tab 記錄可能在其體被另一 tab 擋住而解除安裝時結束。因此滾動位置、換行與已答過的導航都活得比體久：tab 回來時停在讀者離開的地方，而不是重讀或再跳一次。重新整理頁面後什麼都不保留。

導航是一個 `line`。`read` 工具行把它 1 起的 `offset` 以 `openResource(address, { params: { line } })` 傳來，產物 chip 什麼都不傳；體把 `navigation.params` 收窄為 `SidebarRightResourceParamsMap['file']`（`{ line?: number }`，由 `file` 型別的擁有者宣告），不做執行時驗證，因為呼叫方與體相遇在同程序的型別化邊界上。已載入的頁夠不到該行時，體讀下一頁，再讀，直到覆蓋它或檔案結束——頁按順序載入，沒有 seek——然後把該行滾到體頂部並高亮，每個 `navigation.revision` 一次。store 記下已答過的 revision，於是同一 revision 下重新掛載的體恢復滾動位置而不再跳；對同一檔案再次 `openResource`（聚焦而非複製）以新 revision 到來並再跳一次。超出檔案末尾的行在 `eof` 處靜默停下；補頁途中失敗的頁終止補頁並顯示失敗行。

檔案變了只提示，不應用。正文把已載入版本及讀取開始時捕捉的觀察版本與後續 `WorkspaceFileStat.version` 比較；不同則顯示變更提示。重新載入只透過 Preview face 重讀目前 tab，不修改共享資源中繼資料或其他 tab。資源失敗佔用同一個提示位置，已載入內容仍保留在下方。

正文頭部為一行：左側顯示完整檔案路徑，右側放匹配渲染器選單、按條件出現的換行開關和重新載入按鈕。[Document Preview README](../../../../packages/client/ui-sidebar-documentpreview/README.zh.md)負責目前控制元件、渲染器行為與滾動方式。預覽佔滿 pane 正文的全部高度。

讀取失敗時保留已顯示的內容，並增加在地化失敗說明與重試操作。Preview 為可處理的檔案錯誤提供專用文案，其他程式碼使用載體訊息後備；`outside-workspace` 屬於目錄列舉，不是 Preview 專用失敗。

### 檔案樹

`files` 是頁型別，不是檢視器：它不認領任何地址。註冊定義是 `{ kind: 'files', id: '@deepseek-ai/dsh-client-ui-sidebar-files', priority: 'builtin', title, guide: [{ order: 10, title, description, icon: FolderSheetGlyph }] }`——沒有 `patterns`，因為沒有誰按地址導航*到*一棵檔案樹；引導頁的入口框開啟的是型別本身。`FolderSheetGlyph` 把共享的彩色資料夾頁適應到引導頁請求的圖示尺寸；[Sidebar README](../../../../packages/client/ui-sidebar-right/README.zh.md#the-guide)說明這項展示規則。`id` 是這個實作在 Tab 系統裡的唯一鍵，同時也是體坑位 `sidebar.right.pane.tab` 的 `key`，於是同一個串既命名型別也命名畫它的元件。`register()` 返回 disposer 並經 `ctx.effect` 註冊，與所有註冊一致。

根是 Host 在工作階段列表裡上報的工作階段工作目錄（`useSessions().byId[sessionId].cwd`），標籤由 `dsh-util-workspace-path` 的 `workspaceTitleOf` 給出——路徑最後一個非空段——路徑只有分隔符時用根串本身作標籤。沒有工作目錄的工作階段只顯示一行（`noWorkspace`），不發請求。沒有根選擇器，也不能往上瀏覽：Host 的 `list` 拒絕工作階段工作區根之外的路徑，所以用戶端能列的那一個目錄就是它顯示的目錄。

樹不是一個資源，這決定了它的狀態住在哪。逐層懶載入的目錄列表是型別自己擁有的檢視狀態，所以它住在 Slot 標準的獨佔 store（每工作階段一實例）裡、按 tab id 分桶：`{ root, levels, expanded }`，`levels` 以絕對路徑為鍵取 `loading | ready | failed`，`expanded` 是目前展開的絕對路徑集合，含根。資源有一個地址和一個目前值；一棵為每個展開層釘一個資源的樹，會讓資源模型背上「讀者展開了哪些目錄」，而那是型別的事。`useResource` 留給只有一個地址的內容。

face 是樹唯一的非同步半邊。`start(tabId, root, signal)` 以根展開態播種桶並列出根；`toggle(tabId, path, loaded, signal)` 翻轉展開集合並只在第一次列出該層；`load(tabId, path, signal)` 標 `loading`，調 `remote.workspaceFiles.list(sessionId, absolutePath, signal)`，寫 `ready` 或 `failed`。適應層保留列表的 `entries` 與 `truncated`、丟棄其工作區相對 `path`：樹裡每個鍵都是絕對路徑，子鍵 = 父路徑以 `/` 拼上條目名。摺疊保留該層，再展開直接從記憶體畫不再請求；失敗的層同樣保留、再展開不重試——重試靠重新讀取。owner 的 `signal` 終結一個桶：abort 時忘掉該 tab，其後才結算的列表什麼也不寫，已掛載的體也不會給 signal 已觸發的桶重新播種。

行序是讀者的序，不是端點的序：目錄在前，檔案與其他條目在後，組內按 `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`，於是 `file2` 排在 `file10` 前、大小寫不拆開列表。dotfiles 與其他名字一樣顯示；Host 返回的東西樹一個不過濾。三種條目型別畫法不同：`directory` 是帶 `aria-expanded` 的按鈕、開/閉資料夾圖示，子層每級縮排 14px；`file` 是帶文件圖示的按鈕，沒有大小列；`other`（符號連結、套接字、裝置）是灰色、不可聚焦的 span，帶 `aria-disabled` 與「不能開啟」的提示，這樣目錄被完整報告，又不提供一個註定失敗的點選。被 Host 按 `maxEntries` 上限截斷的層在條目末尾以 `truncated` 標記收尾；空層顯示 `empty`；進行中的列表在其目錄下顯示 `loading`。

點檔案即 `tabActions.openResource(fileAddressFor(sessionId, root, absolutePath))`：條目在樹根之下的絕對路徑成為每段百分號編碼的 `dsh-resource://file/session/<sessionId>/<相對根的路徑>` 地址。樹從不指名檢視器：由註冊表的認領決定誰畫這個地址（今天是 `fallback` 檔的 `text`），一個在其上認領 `dsh-resource://file/**` 的擴充功能接走點選而樹無需改動。開啟落在點選時檔案樹 tab 所在的那個 pane，同地址已開著的 tab 被聚焦而不複製——兩者都是導航控制器的預設。使用者明確拍過：從樹裡開啟的檔案不強制分格；它在樹所在處開一個新 tab。

重新讀取是樹唯一的控制元件，是根標題行右端的圖示按鈕（`reload`）。它重置所有層，並恰好重新列出 `expanded` 裡的那些路徑；曾列出後又摺疊的層被丟棄，下次展開時重新拉取。控制元件住在體內，因為型別的控制元件屬於它的體：pane 的 tab 條只承載佈局庫與面板自身的動作，不存在按型別的工具坑位。樹不監聽檔案系統；一層只在重新讀取或首次展開時變化，`changes` 流是文字檢視器的事。

文案是 `sidebarFiles` 名稱空間，十三個鍵。行狀態：`loading`「正在讀取…」/ "Reading…"，`empty`「空目錄」/ "Empty directory"，`truncated`「條目太多，只顯示了一部分。」/ "Too many entries; showing only some of them."，`noWorkspace`「這個工作階段沒有工作區目錄。」/ "This session has no workspace directory."，`entry.other`「這不是檔案或目錄，沒法開啟。」/ "Not a file or a directory, so it cannot be opened."，`reload`「重新讀取」/ "Reload"。失敗行按 Host 錯誤碼一碼一句、以目錄為主語：`workspace-file/not-found`「這個目錄不在了。可能已被移動或刪除。」/ "That directory is gone. It may have been moved or deleted."，`workspace-file/outside-workspace`「這個目錄在工作區之外，側欄不會讀取它。」/ "That directory is outside the workspace, so the sidebar will not read it."，`workspace-file/not-directory`「這不是一個目錄。」/ "That is not a directory."；其餘任何失敗，無論載體層還是未分類，顯示 `error.unavailable`「讀取失敗：{message}」/ "Read failed: {message}" 並帶上失敗自身的訊息，因為樹對傳輸級錯誤沒有什麼有用的可補充。

## Alternatives considered

**給活躍 tab 的控制元件開一個按 pane 的工具坑位（`sidebar.right.pane.tab.tools`）。** 為文字預覽的換行與重新讀取、檔案樹的重新讀取交付過一輪評審，隨後按使用者意見刪除：它把型別私有的按鈕放到面板 tab 條上、分欄與摺疊控制元件旁邊，讀起來像面板自身的 chrome。型別的控制元件屬於它自己的體；預覽的在其路徑行右端，樹的在其根行右端。

**保留 `Show in folder`。** 目錄在 Sidebar 裡沒有去處，而產品決定是不給桌面開啟器留次級入口。已刪除，能力損失如實陳述：`openFile('.')` 命名的是目錄，文字預覽以 `not-regular-file` 拒絕它，於是該行什麼都不提供，而不是給一個註定失敗的按鈕。

**把內容放進資源流。** 內容可以任意大，所以 `file` 資源只攜帶中繼資料（`version`、`bytes`、`changed`），預覽經 `workspaceFiles.read` 按頁讀內容；`changed` 是通知，不是載荷。

**重新載入重取所有已載入過的頁。** 相對於已交付規則（丟掉所有頁、重讀第 1 頁）的另一條路。未採納：重取已載入範圍意味著顯示任何東西之前要先做多次順序讀取，而 agent 編輯之後的已載入範圍也不再描述同樣的行；讀者保留滾動位置，在已載入文字末尾繼續要更多。先前視口在檔案深處時讀者的位置可能落到空白，這一點在 Consequences 裡如實陳述。

**檔案變了就在讀者眼前重新整理文字。** 否決：在讀者眼前過載會丟掉他的位置，而 agent 正在寫的檔案會反覆變化。提示條等點選。

**整檔案讀取，或可 seek 的頁。** 整檔案讀取沒有上界；可 seek 的頁需要 Host 不維護的行索引。頁從第 1 頁起按順序載入，導航到深處某行時逐頁補到覆蓋為止——代價在 Consequences 裡陳述，seek 推遲。

**在執行時驗證 `line`。** 第一版接受 `unknown` 參數，非正整數一律視為沒有請求。`params` 型別化之後否決：`file` 型別的擁有者在 `SidebarRightResourceParamsMap` 中宣告 `{ line?: number }`，呼叫方與體相遇在同程序的型別化邊界上，倉規是那裡不加執行時驗證。

**每種地址都從坑位取讀取的工作階段。** 第一版在體被掛載的工作階段下讀取。只對不命名工作階段的 `absolute` 作用域保留：`session` 地址帶著自己的工作階段，正是為了讓同一相對路徑在兩個工作階段裡是兩個檔案。

**換行預設關。** 第一版。使用者評審後反轉：預覽列很窄，長行橫向滾動會把文字藏起來；換行預設開直到讀者關掉，按 tab 記。

**靠改佈局庫的 `.paneBody` 來撐滿 pane。** pane 體是高度確定的塊級滾動容器，不是 flex 容器，所以預覽的 `flex: 1` 不起作用，pane 體滾動著一個 30,000px 高的預覽。否決，改為在預覽根上取 `height: 100%`：修復屬於型別自己，佈局庫對其體保持無知，檔案體成為唯一的滾動者，於是頭部不動、跳行滾動的也是正確的元素。

**store 按檔案而非按 tab 分鍵。** 否決：同一檔案的兩個 tab 是兩個閱讀位置；頁可以共享而檢視不能，省下的只是一次頁讀取。

**包內自造 `file:///` 地址，以及包內自寫 basename 作樹的根標籤。** 否決：檔案地址必須帶自己的作用域——以其根解析相對路徑的工作階段，或絕對路徑本身——因此用共享的 `fileAddressFor`；一個 `workspaceTitleOf` 服務所有工作區標籤面。

**把整棵樹建模為一個資源。** 否決：資源有一個地址和一個目前值，一棵為每個展開層釘一個資源的樹，會讓資源模型背上「讀者展開了哪些目錄」，而那是型別的事。

**引導頁作為鏈上的入口而非鏈的 fallback。** 否決：隨包交付的引導頁若是一個入口，產品的替換者與它會同為候選，勝者取決於註冊順序；作為 fallback 則永遠恰有一個體，且不可能被意外投掉。

**引導頁在自己旁邊開啟被選的型別。** 否決：引導頁是一扇門，一個同時持有引導頁與它所開啟內容的 pane 會顯示一扇不再通向別處的門；`openTab(kind, { replaceTab: true })` 把 tab 交出去。

## Consequences

- `ui-sidebar-right` 之外寫的型別有了一份完整樣板：`ui-sidebar-documentpreview` 演示一個檢視器——由地址推出的讀取、按 tab 分桶的獨佔 Slot store、inject face、型別化的導航參數與體內自有控制元件；`ui-sidebar-files` 演示一個帶引匯入口、懶填充 store 的頁型別；引導頁演示一個鏈 fallback。
- 按頁讀取讓每次請求都有界（`maxLines` 行、`maxBytes` 位元組），代價是一個 **載入更多** 控制元件、沒有總行數，以及到深處某行的順序補頁；導航到一個大檔案的第 40,000 行要先讀八頁。
- 只提示不應用，讓讀者在 agent 反覆寫入期間保住位置，代價是點選之前顯示的是舊文字；外部編輯永不提示。
- 重新載入只讀第 1 頁，所以身在檔案深處的讀者過載後回到檔案開頭再往後翻；滾動位置保留但可能指向已載入文字之外。
- 按 tab 的檢視狀態跨 tab 切換與重新掛載存活，隨 tab 或頁面一起消失；什麼都不持久化。
- 檔案樹渲染 Host 列出的一切，因此大目錄最多顯示 `maxEntries` 行加一個標記，沒有搜尋或過濾，讀者靠逐層展開找到深處的檔案。
- 三個型別面向使用者的每條文案都由 locale 持有並列在本文中，文案評審只需讀一處。

## Testing

文字預覽的 `tests/` 覆蓋：註冊表認領與讓位（經真實的 `SidebarRightTabRegistry`）、地址翻譯（`sessionFileOf` 接受 `session` 作用域、其他一律拋錯）、store 的頁、版本、reset、檢視與 forget 各 action、face 的進行中、失敗、abort 與過載路徑、頁算術（`linesOf`、`offsetsOf`、`lastLineLoaded`）、體的首讀、載入更多、重試、變更提示條、導航補頁、只跳一次、重新掛載、換行預設與切換、頭部控制元件與 abort 即忘、失敗行對映，以及外掛的各項註冊與 dispose 時的撤銷。針對已建置應用的 Chromium 探針記錄了撐滿與滾動的數字（`.artifacts/sidebar-tab-types/app-probe.log`，`ROUND3`）：短檔案的預覽高度等於 pane 體內容區高度，長檔案在預覽體內滾動，pane 體從不滾動。檔案樹的 `tests/` 覆蓋排序、懶載入、摺疊記憶、重新讀取、三種條目型別、截斷與失敗行，以及 abort 即忘。`apps/web/tests/sidebar-right.e2e.ts` 經真實 Remote 載體把工作階段裡的產物檔案開啟進預覽。`apps/web/tests/document-preview.e2e.ts` 覆蓋居中的固有尺寸圖片、雙軸圖片滾動和不可執行的 SVG 腳本。

## Deferred

- 虛擬化或可 seek 的分頁載入（頁按順序載入）、恢復已載入範圍的重新載入、節流的滾動位置持久化，以及 `ui-primitives` 裡的換行圖示。
- 搜尋、總行數與檔案末尾標記。
- 檔案樹的搜尋、產物過濾、拖拽、重新命名、右鍵選單、高亮目前檔案、檔案系統監聽，以及瀏覽到工作區根之上。
- 引導頁文案的產品評審，以及一個型別貢獻多個入口時引導頁的行為。

## Related

- [右側 Sidebar 停靠基礎設施](2026-09-04-right-sidebar-docking-infrastructure.zh.md)——面板、pane 與引導頁每 pane 一個的規則。
- [Sidebar tab 型別與導航](../architecture/2026-09-05-sidebar-tab-types-and-navigation.zh.md)——這些型別消費的註冊表、檔位、`id`、`openTab` / `openResource` 與 owner props。
- [Client 資源模型](../architecture/2026-09-05-client-resource-model.zh.md)——`useResource` 與 `file` 協定的中繼資料。
- [Workspace Files 服務](../architecture/2026-09-05-workspace-files-service.zh.md)——地址語法、`stat` / `read` / `list` / `changes`，以及失敗行所對映的錯誤碼。
