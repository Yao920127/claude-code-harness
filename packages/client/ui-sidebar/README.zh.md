---
description: "dsh Web 用戶端的側邊欄外殼外掛：品牌行、New Session 操作、摺疊控制元件、可感知滾動的區域席位與底部固定的 Settings 席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

## 概述

dsh Web 用戶端的側邊欄讓使用者識別目前建置、啟動新工作階段、將導航摺疊為 56px 軌道、瀏覽 Workspace 與 Session，以及開啟 Settings。它會將 Settings 入口固定在底部，並在隱藏空閒捲軸時避免瀏覽器行發生位移。New Session 優先使用顯式選擇的 Workspace，其次使用目前 Session 所屬的 Workspace，再其次使用最近活躍的 Workspace；如果都不存在，則開啟空白的 New Session 頁面。部署可以替換品牌標記或名稱，同時保留導航控制元件和軌道幾何。

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

側邊欄是導航外殼：使用者看到品牌、啟動新工作階段、摺疊軌道併到達 Settings。功能外掛填充它的席位——ui-workspace 填充 `sidebar.workspaces`，ui-settings 在 `sidebar.settings` 註冊觸發行與設定面板。

### 品牌與 New Session

展開的品牌行把 `sidebar.brand.mark` 與 `sidebar.brand.name` 渲染為兩個獨立的 single slot；收起軌道則渲染同一個 mark slot。沒有佔位者時，外殼使用魚形標記和在地化的本地建置標籤。完整建置會在標籤下方顯示程式碼徽標；該徽標使用 `DSH_CLIENT_VERSION`、可選的 7 位 `DSH_CLIENT_COMMIT_HASH` 與 `DSH_CLIENT_GIT_DIRTY=true` 組裝成 `version[-commit][-dirty]`；缺少版本中繼資料時不顯示徽標。New Session 優先使用作用域操作明確指定的 Workspace，否則使用目前 Session 所屬 Workspace，再否則使用最近活躍 Workspace；一個 Workspace 都沒有時則清空選擇，進入空白 New Session 頁面。 展開態的新建工作階段按鈕在懸停或鍵盤聚焦時於右側以灰色文字顯示目前有效繫結。快捷鍵可見且空間較窄時，居中的圖示與文字在快捷鍵之前漸隱；CSS 為快捷鍵保留寬度，無需測量按鈕。純圖示控制元件保留使用平臺鍵位樣式的 tooltip，側欄隱藏時常駐的 macOS 頭部控制元件也保持一致。所有控制元件均提供 `aria-keyshortcuts`。

### 全域面板入口

外掛在 root 作用域的 `sidebar.panellist` list 中註冊圖示元件，提供 `id`、可選 `order`，以及字串或 locale-aware 的 `label`。同一個 id 定址佈局中 root 作用域 `main` keyed slot 的元件；選擇不存在的主面板條目會拋錯，並保留目前選中態。標籤提供普通可見文字、無障礙名稱和摺疊提示。每一行透過 `usePanelInfo` 讀取自己的選中態；DOM 焦點移到搜尋框或目錄選擇器時，顯示的面板及其列表項選中態不變。沒有註冊項時，列表及其間距均不渲染。產品隨附的組合不註冊範例面板。

### 摺疊行為

側欄及工作階段頭部的開關從命令目錄讀取目前有效快捷鍵，用於懸停、鍵盤聚焦提示和 `aria-keyshortcuts`。未繫結的命令只顯示操作名稱。

側欄收起時，頂部展開按鈕承載可選、不可互動的 `sidebar.toggle.badge` slot。佔用方提供狀態和提示內容，不增加操作，也不改變按鈕的導航行為。

即時收起時，展開內容在目前寬度淡出，上方控制元件共用同一段透明度漸變，並向左平移進入 56px 軌道，由佈局的欄滑動結束整段動畫。頁面初始即為收起狀態時會靜態渲染軌道；減少動態效果模式會停用兩段過渡。固定在底部的 `sidebar.settings` 控制元件共用相同的透明度漸變時序，但不發生橫向位移。

在 Windows Electron 中，`html[data-windows-titlebar]` 將兩種狀態下的側欄開關固定在頂欄左上角，僅在展開態與新建工作階段按鈕左邊緣對齊。展開態品牌位於頂欄下方、新建工作階段按鈕上方，按鈕上方額外留出 8px。收起後，品牌和側欄內容隱藏，新建工作階段按鈕排在側欄開關與 Desktop 選單之間。側欄在收起態將根元素的 `--dsh-windows-menu-start` 設為 84px；Desktop preload 使用它將選單放在新建工作階段之後，展開態預設為 48px。頂欄圖示按鈕採用 28px 圓形控制元件中的居中 16px 圖示，並從視窗拖拽區域中排除。側欄開關與新建工作階段的懸停提示在頂欄下方展開，Desktop 選單文字不會蓋住它們；佔用 `sidebar.toggle.badge` 的控制元件自行決定氣泡展開方向。

### macOS 桌面

在 `html[data-platform='darwin']`（僅由桌面 preload 設定）下，展開的側邊欄列頂部有一條 52px 的頂部條：避開 hiddenInset 紅綠燈並承載收起按鈕；頂部條與其下的 logo 行各自打上 `data-window-drag`，於是每行自己的盒子就是視窗的拖拽區（唯一的 darwin drag 規則由 ui-web base.css 宣告），因此品牌 wordmark 在 macOS 上不再是 New Session 快捷入口——專用的 New Session 按鈕保留該操作。收起時保留 56px 軌道；軌道的控制元件從紅綠燈下方開始，頂部條向上延伸覆蓋紅綠燈所在的帶狀區域，作為軌道的視窗拖拽行並承載展開按鈕。在 Windows 標題欄下，展開按鈕與 New Session 固定在標題欄行中，下方收起的軌道保留面板、瀏覽與底部控制元件。設計依據與視窗整合約定見 [macOS 隱藏標題欄 Agent Note](../../../.agents/notes/implemented/feature/2026-09-13-macos-hidden-titlebar-vibrancy.zh.md)。

### 捲軸

欄內的捲軸是一種指標可供性：只要指標不在欄內，外殼就把捲軸間接層重新繫結為 `transparent`；指標離開後滑塊再保留 2 秒，因此沒人指向的列表不會帶著捲軸。避免行位移的空間預留屬於滾動區域本身（ui-workspace），所以顯示滑塊不會引起重排。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

外殼是純組合：`SidebarRootComponentProps` 組合佈局 owner share、全域 `useSessions` 與 `useWorkspaces` 掛鉤、已宣告的品牌、`sidebar.workspaces` 與 `sidebar.settings` 子 slot，以及注入的導航回呼。面板入口及其可選標題使用相同的組合方式。面板中繼資料由列表註冊和 locale 變化派生；選中態屬於佈局儲存。

### slot 紀律

宣告感知的 `slots.inject()` 讓替換包無論先於還是後於側邊欄啟用都能生效。頁尾承載 `sidebar.settings` 席位：側邊欄只渲染固定在底部的佈局 slot，並共享其欄狀態（`wide`）。`/client` 匯出介面只包含外掛主體（`apply`/`inject`）及約定型別；SidebarRoot、行元件與樹派生仍由 slot 註冊封裝在包內。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋填充外殼席位的各個介面與組合模型。

- [ui-workspace](../ui-workspace/README.zh.md)——渲染到 `sidebar.workspaces` 的 Workspace 與 Session 瀏覽器。
- [ui-settings](../ui-settings/README.zh.md)——在 `sidebar.settings` 註冊觸發行與設定面板的設定領域底座。
- [ui-layout](../ui-layout/README.zh.md)——摺疊所使用軌道與欄狀態的佈局 owner。
- [ui-theme](../ui-theme/README.zh.md)——外殼所重新繫結的捲軸 token 間接層。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——席位背後的組合模型。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義外殼擁有什麼、其佔位方擁有什麼；它們是目前包約束。

- **Session 狀態點渲染由 ui-workspace 持有**：本外殼沒有可用的 done/error 通知資料來源。
- **Workspace 瀏覽行為由組合持有**：分組、排序、搜尋與行狀態都屬於 ui-workspace，不屬於此外殼。
- **「New task completed」未讀標記是本地檢視狀態**：完成時間 > 上次檢視時間這一事實永遠不會到達主機。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。面板中繼資料是 Slot 註冊表與 locale 的只讀呈現投影，沒有獨立寫入 API。註冊表負責條目身份與資源釋放；本包的裝配測試在註冊和 locale 通知完成後斷言該投影。外殼沒有需要與這些來源協調的獨立導航狀態。
