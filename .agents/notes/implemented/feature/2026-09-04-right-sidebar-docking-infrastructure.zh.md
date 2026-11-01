# Agent Note: 右側 Sidebar 停靠基礎設施

Status: implemented

[English](2026-09-04-right-sidebar-docking-infrastructure.md) | 中文

## Problem

Web 用戶端的右列曾是單一用途的 Detail 面板：`ui-chat` 以 `DetailsPanel` 佔據 `details` 坑位，透過 `conversation.details.tool` 子坑位展示一個被選中 Tool 呼叫的原始載荷。其他任何內容都無法住在那裡。想要一個常駐側面的外掛——檔案預覽、任務清單、diff——沒有可註冊的坑位，沒有從工作階段流開啟自己內容的通道，也沒有可共享的佈局來與他人分享這一列。

Agent 產出的檔案是最尖銳的案例。產出檔案 chip 或 `read` 行的路徑連結會經 `session/openWorkspacePath` 把路徑交給作業系統，因此不在 Host 機器上的瀏覽器完全看不到該檔案，即便本機瀏覽器也要離開產品才能檢視。與此同時 Detail 面板以全高重複渲染工作階段行的卡片，成為每張卡片都必須保持同步的第二個展示面。

## Decision

右列是每工作階段一份的停靠面（分欄 pane、tab、浮動面板與可撤銷的操作序列），由 `ui-sidebar-right` 基於 `ui-dockkit` 引擎持有，取代原來的 Detail 面板。本篇只管這個面：引擎、框架的右列、面板的兩種呈現與控制元件、每工作階段的狀態。面裡放什麼由別處決定：外掛如何宣告 tab 型別、開啟內容、拿到 props 見[tab 型別與導航](../architecture/2026-09-05-sidebar-tab-types-and-navigation.zh.md)；地址背後的活資料見[用戶端資源模型](../architecture/2026-09-05-client-resource-model.zh.md)；讀工作區檔案見[工作區檔案服務](../architecture/2026-09-05-workspace-files-service.zh.md)；引導頁、文字預覽與檔案樹見[隨包型別](2026-09-05-sidebar-text-preview-and-file-tree.zh.md)。

### 包拓撲

[Sidebar 穩定掛載決策](../architecture/2026-09-20-sidebar-retained-tab-layout.zh.md)負責停靠、浮動與工作階段切換共用的一棵保活 Tab 內容樹。本文的引擎、佈局狀態與手勢所有權仍然適用。

| 包 | 形態 | 所有物 |
|---|---|---|
| `packages/client/ui-dockkit` | 靜態連結庫，零 DSH 依賴 | 佈局引擎與渲染/驅動它的 React 元件；消費方編譯其原始碼，且它只保留一張樣式表，因為消費方按檔名去重注入的樣式表 |
| `packages/client/ui-sidebar-right` | 動態外掛 | 共用一個 store 的 `rightbar` 面板坑位與 `conversation.session.header.corner` 展開按鈕、每工作階段一份 surface、兩種呈現模式、浮層主機、`ctx.sidebarRight`、`ctx.sidebarRightTabs`、tab 域（每條 tab 記錄一個 occurrence）、三個擴充功能坑位、引導 tab 型別與 `sidebarRight` 文案名稱空間 |

該庫的第一個嵌入方就是本產品，而庫對此一無所知：所有字串經 `DockLabels` 傳入，所有 tab 正文經按不透明 `kind` 分派的 `TabRenderer` 傳入，所有手勢經 `DockIntents` 傳出。整合包提供庫拒絕知曉的一切。

### 佈局引擎

引擎是歸一化的遞迴分裂樹：`nodes` 按 id 索引，`rootId` 指向停靠根，`floats` 自底向上排列。id 帶 brand（`PaneId`、`SplitId`、`TabId`；`NodeId` 是 pane 與 split 的並集），只由 `Mint` 鑄出，任何一種 id 都不能充當另一種或裸字串。懸浮面板是 `host` 為 `'float'`、容量為一的 pane，不繪製 tab 條。`applyOp(state, op)` 返回下一狀態以及撤銷它的操作，逆操作在執行時刻捕捉，因為到 undo 時操作前狀態已不存在。每個操作攜帶自己建立的 id，所以 `replay(initial, ops)` 從同一初態重現同一棵樹；引擎不讀時鐘也不讀隨機源。`Sequencer` 維護線性歷史，一個意圖一條帳——一次手勢或命令產生的全部操作一起撤銷與重做——連續的純焦點條目合併為一步，後退後的新條目丟棄前向分支。planner 是純意圖層——`(state, mint, args) → LayoutOp[]`——`DockController` 是其上的薄可觀察殼。`planSettle` 是可選的收尾 planner：合併掉意圖留下的每個空停靠 pane，並經嵌入方的工廠重新種上被清空的根 pane。

元件渲染快照並上報已落定的意圖，每個手勢一條：拖拽過程只在本地 state 預覽、手勢的事實住在它的閉包裡，鬆手把淨結果折成一條操作。手勢基於 pointer 事件與 pointer capture，而非 HTML5 拖放。chip 是膠囊形，只帶一個控制元件——關閉；右鍵開啟上下文選單（關閉加嵌入方的 `renderTabMenuItems`）。chip 之後是新增控制元件，經 `DockIntents.addTab` 請嵌入方種入它的種子 tab（`planAddTab`）。懸浮是把拖拽鬆手在面之外，複製則完全沒有庫控制元件——`DockIntents.duplicateTab` 留給嵌入方 API。分欄控制元件的圖示是被豎線一分為二的方框，與分欄本身一致。四條互動規則修復了真實瀏覽器中發現的缺陷並被有意保留：手勢開始即捕捉指標；tab 條絕不做滾動容器；焦點落在 click 而非 press；可拖 chip 內嵌的控制元件自行攔截按下。tab 的操作選單以 portal 渲染並對著它的按鈕定位，因為 tab 條刻意裁切溢位，畫在條內的選單會被一起切掉。庫不自帶 undo/redo 控制元件，也不自帶頭部：嵌入方的面級控制元件經 `DockSurface` 的 `chrome` prop 傳入，庫把它們放在右上 pane 的 tab 條末端（`topRightPaneId`：每個行分裂取最後一個子節點、每個列分裂取第一個）。通用工具包預設允許四個窗格；Sidebar 傳入產品的兩格上限。

### 框架的右列

[回應式 Sidebar 與標籤資訊](../architecture/2026-09-07-sidebar-responsive-tab-info.zh.md)取代本記錄中的無讓步佈局、覆蓋模式與產品窗格上限。`ui-layout` 仍擁有三列幾何與畫素寬度偏好，Sidebar 佔位項透過 `ctx.layout.openRightbar(track, fullscreen)` 和 `closeRightbar()` 報告呈現方式，框架不注入 Sidebar 包。具體寬度規則見 [ui-layout](../../../../packages/client/ui-layout/README.zh.md)。

右欄在普通與全螢幕模式下使用同一棵已掛載內容樹；隱藏保留已保活的標籤狀態，全螢幕覆蓋視口並保留底層列佔位。`DockLayout` 在同一棵樹中渲染穩定 Grid cell 與 fixed 定位的浮動 frame，前臺浮窗不隨右欄關閉。產品限制為兩個水平窗格與 20–80% 分割比例，通用引擎保留自己的預設值。

### 狀態

[預設頁選擇與最後一個 tab 的關閉規則](../../../../packages/client/ui-sidebar-right/README.zh.md)取代此處的預設補入引導頁與顯式關閉，移動 tab 仍會處理被清空的格。

`ui-sidebar-right` 為每個工作階段 id 儲存一份 `SurfaceState`——佈局、歷史與鑄造計數——住在坑位註冊時宣告的 store 裡。每個 action 先鑄造意圖所需的 id，向庫的 planner 索取操作，對結果跑一遍 settle planner，把整個意圖記為一條歷史帳，再把該工作階段的 surface 整體賦回；沒有 action 就地改佈局。settle 是產品規則：最後一個 tab 被關閉、拖走或懸浮出去的停靠 pane 會被合併掉；展開且為空的根 pane 會填入目前預設頁。摺疊的佈局可以保持為空，直到下次展開；沒有單獨的關閉 pane 手勢。[佈局持久化與 provider 恢復](../architecture/2026-09-14-sidebar-layout-provider-recovery.zh.md)負責 Session 作用域的瀏覽器儲存和重新整理。佈局是呈現狀態，永不進入工作階段日誌。

### 面之外

這個面渲染的 tab 正文它自己並不認識：每個 tab 帶一個 `kind`，面板向型別註冊表詢問該 kind 生效的實作，再派發到其 keyed 正文坑位。正文能依賴的一切——它的記錄、所在格、是否可見、如何被導航到、中止訊號、可做的動作——均透過框架注入的 `useTabInfo()` 從標籤域讀取。註冊表、導航面 `ctx.sidebarRight`、坑位與 標籤資訊 在[tab 型別與導航](../architecture/2026-09-05-sidebar-tab-types-and-navigation.zh.md)裡定；展示資料的正文經[用戶端資源模型](../architecture/2026-09-05-client-resource-model.zh.md)讀取。

### 入口與刪除

`ui-chat` 的 `openFile(path, { line? })`——工具行路徑連結、產出檔案 chip 與收尾訊息提及都經由它——現在經導航面把檔案開進 Sidebar（見[tab 型別與導航](../architecture/2026-09-05-sidebar-tab-types-and-navigation.zh.md)）。`Show in folder` 動作及其 `canOpenWorkspacePath` 探針從 `ui-deliverables` 移除：Sidebar 沒有目錄形態，產品也不保留次級入口。`DetailsPanel`、`ToolDetails`、tool-node reader、chat store 的 selection、`ToolDetailsProps` 與 `CENTER_MIN` 一併刪除。`session/openWorkspacePath` 留在 Host 上，已無 web 呼叫方。

## Alternatives considered

**採用停靠庫。** 六個引擎按產品的狀態所有權要求（佈局是產品擁有的、可記錄可回放的序列）評估。dockview 非受控，唯一外部入口是破壞性的 `fromJSON`，undo 劃入付費層；react-mosaic 沒有浮層，拖拽底座多年未維護；rc-dock、golden-layout、Lumino 在狀態所有權上不可用。FlexLayout 0.10.x 是唯一可行候選——外接 Model、可否決的 `onAction`、保內容的 `fromJson`——被保留為已驗證的降級預案，切換判定點是原型的五區 dock 與多浮層測試。兩項自研均透過、無切換訊號，且其 0.x minor 攜帶 breaking change，故未採用。

**分層複用：`react-resizable-panels` 管尺寸、Pragmatic drag-and-drop 管手勢。** 原型之前的規劃主線。原型自己的尺寸層與手勢層在真實瀏覽器中透過後即否決：計劃要省下的兩層已經寫完並驗證，剩餘價值只在長尾邊界處理。若將來需要 snap 或 priority 尺寸語義，它仍是可替換的一層。

**掛在 `shell.overlay` 上的抽屜，或雙層外殼（root rail、session 內容）。** 原型以抽屜形態交付以避免觸碰框架。產品層面否決：抽屜不是一列，永不擠壓工作階段區；雙層外殼撞上 slot core 的 one-handle-one-scope 規則，會讓摺疊不可撤銷。框架擁有一條真實的列；內容與狀態仍繫結工作階段。

**框架自有的 32px rail 作為摺疊態、面板住在帶動畫的 grid 軌道里、覆蓋態另走 portal。** 第一版交付形態。評審後否決：實體 rail 軌道為一條只在摺疊態存在的條帶把工作階段區捲軸向內擠；住在動畫軌道里的面板被每次軌道過渡拉伸重排，Sidebar 自己在動而它本不該動；一個面板兩條程式碼路徑意味著切換呈現模式要重掛載它。現在面板是一個錨在邊緣的盒子做平移，軌道只負責佔位。

**工作階段列內一條 40px 的 rail，帶自己的 `sidebar.right.rail.item` 坑位。** 隨後一試，好讓 rail 能隨面板離場。評審否決：為一個按鈕加一個佔位畫一整條豎帶，視覺太重。展開入口現在是頭部的單個按鈕，摺疊態坑位推遲到有真實需求時再宣告。

**面板自帶頭部行。** 第一版在 tab 條上方有一條 40px 的標題加控制元件行。刪除：tab 條本來就是面板的頂邊，控制元件經庫的 chrome 坑位坐到右上 pane 的條末端，標題說的也不比 tab 多。

**展開按鈕作為 `conversation.session.header.utilities` 的一個 list 條目。** rail 之後的一試。評審否決：作為 list 條目它坐在工具區行內，不在頭部真正的角落，而且它的出現與消失會挪動旁邊的 Session log 控制元件。專設一個保留佔位寬度的角落坑位同時解決兩點。

**每個 chip 一個帶複製與懸浮項的"更多"控制元件。** 第一版給每個 chip 一個 `⋯` 選單，裝關閉、複製、懸浮。評審否決：chip 現在只帶關閉，選單挪到右鍵且只剩關閉（加嵌入方條目），複製與懸浮整體離開面板——複製仍是 API（`open` 帶 `duplicate: true`），懸浮仍是拖拽。庫的 `duplicateTab` / `floatTab` 意圖與 planner 不變。

**面板頭部的 undo 與 redo 按鈕。** 先上後撤：序列是架構事實，步進它現在還不是產品動作。API 以 `@internal` 方法保留給測試與將來的導航控制器。

**空 pane 作為一種持久狀態。** 第一版允許 pane 在最後一個 tab 離開後帶佔位留下。否決，因為沒有任何方式關掉這樣的 pane；每個意圖都會整理 surface，被清空的側 pane 合併掉。空根 pane 只在該列展開時填入目前預設頁。

**經 `packages/util` 與 `INLINE_SAFE` 清單內聯庫。** 建置探針證明可行，但 util 建置鏈沒有 CSS 管線而庫帶樣式表；在知曉改庫須重建殼並重新整理頁面的前提下，選擇靜態連結的 client 包（`ui-primitives` 先例）。

## Consequences

- 停靠面自身不再溢位面板：`.surface` 與 `.pane` 收在列內（`min-width: 0`、`overflow: hidden`），長的不換行行在正文內滾動，tab 條控制元件在任何分欄下都可見。
- 佈局可撤銷、可持久化且按 Session 隔離。undo 只能經 `@internal` 服務方法觸達；產品不顯示歷史控制元件。
- 展開的佈局不保留空 pane。空側 pane 被合併，空根 pane 只在展開時填入目前預設頁。新工作階段以及關閉最後一個 tab 後收起的佈局保持為空，直到下次展開。
- 一個 pane 最多持有一個引導 tab：第二個不能被新增、開啟、複製或搬入；唯一性按 pane 算，所以分欄仍給新 pane 種引導。
- pane 只有在等分後的兩半都仍能容下不可收縮部分時才可分欄：tab 條的固定控制元件（條寬減去 chip 盒與填充，因此右上 pane 的面板控制元件只計在承載它的那一半）加一個最小寬度的 chip，由元件層在每次提交與尺寸變化後測量。否則分欄控制元件保留但停用並帶自己的文案，對應的邊緣落區不再提供，使用者拖窄的 pane 保持原尺寸；產品最多兩個水平窗格，不因拉寬或拖分隔條而提高上限。
- 切換呈現模式時 Sidebar 面板一動不動，兩種模式的平移一模一樣；切換時只有工作階段區在動。隱藏的面板保持 tab 掛載，預覽在摺疊後仍在。
- 摺疊時 Sidebar 只是頭部角落的一個按鈕：工作階段區保持全寬、捲軸停在自己的邊緣，面板展開時按鈕離場但佔位保留，頭部其餘內容不動。
- tab 從 chip 上關閉；複製與懸浮在面板上沒有控制元件（複製僅 API、懸浮靠拖拽）。上下文選單經右鍵開啟，含關閉與嵌入方條目。
- Detail 面板及其重複的卡片展示消失（淨刪約 1,400 行）；卡片就地閱讀，`inspect` 開啟 trajectory 檢視。
- 框架沒有中列下限：視口窄於兩側列之和時工作階段區被擠向零，而不是關掉某一列。
- 庫由消費方編譯，改庫須重建殼並重新整理頁面；它沒有 HMR。
- 停靠 cell、浮動 cell 和 portal 選單使用固定層級，浮動 cell 在所屬層內透過 CSS 繪製順序排序；用戶端仍沒有全域 z-index token 層。

## Testing

`ui-dockkit` 的規格釘住引擎不變數——每個操作的逆操作往返恆等、歷史任意字首的 `replay` 等於記錄狀態、一個複合意圖作為一條帳步進、焦點段對稱合併、格數上限與寬度規則拒絕且零記帳——並僅以 props 驅動元件，不用 scaffold。`ui-sidebar-right` 的規格覆蓋 per-session store、座位的兩種呈現與控制元件、按格唯一的引導、寬度感知分欄。Web e2e 套件在 Chromium 裡經真實外掛圖驅動隨包交付的 Sidebar：展開與收起、分到上限與置灰控制元件、浮窗、回塢、引導頁。兩套均無需金鑰。

## Deferred

- z-index token 層，隨後替換面板、浮層主機與選單的硬編碼值。
- 組合層的切換工作階段案例，受阻於 fixture 組合預設開啟設定面。
- 新包 README 與本次改動的英文文件的中文對。
- snap 或 priority 面板尺寸語義、觸屏調優，以及分欄/移動/懸浮的鍵盤路徑。
- 佈局持久化、popout 視窗，以及內容導航棧（條目以 pane 與內容為鍵、相鄰重複替換、`navigating` 守衛、已關 tab 留在棧中）。
- 不可關閉的 tab（`TabRecord` 上的 `closable` 標誌，畫成固定的前置標記而非膠囊），等到有 tab 型別需要時再做。
