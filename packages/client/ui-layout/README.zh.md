---
description: "Web GUI 的外殼佈局：三欄 AppFrame（右欄作為貼邊面板的軌道）、面板幾何服務與主題呈現；供視窗外殼的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的三欄 AppFrame、左右欄寬度與 `ctx.layout` 呈現控制。右欄先讓步以保護中欄空間，全螢幕由佔用方呈現，框架保留寬屏底層軌道。主題呈現器負責配色、別名 token、正文字號與 document 中繼資料；佈局狀態在重新整理後重置。

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

桌面 Mod+B 透過與控制元件共用的佈局操作切換左側欄。模態彈出視窗開啟時此快捷鍵不可用；終端輸入優先。

本外掛在 root slot 中組合側邊欄、主內容和右欄。側邊欄寬度為 264～420px，預設為 280px，收起後保留 56px 控制欄；視窗寬度低於 1024px 時自動收起，開啟右側面板也會收起手動展開的側邊欄。右側面板首次開啟時使用視口寬度的 45%，之後保留使用者的畫素寬度偏好，上限為 70%。為給中欄保留 400px，框架先將右側面板縮減至 300px，再報告空間不足，使佔用方將其關閉，最後才進一步壓縮中欄。拖曳沒有過渡延遲；右側手柄在關閉或全螢幕時不顯示。

全域面板佔據 root 作用域的 `main` keyed slot；`conversation` 是為工作階段介面保留的 key。`ctx.layout.selectPanel(id)` 選中已註冊面板，`null` 則選中工作階段介面，但不改變目前工作階段。預設組合不註冊任何全域面板。

<a id="bottom-seat"></a>
### 底部座

root 作用域的 `shell.bottom` 座是中央列與右側列下方的第二個網格行。它橫跨這兩列，從左側欄邊緣延伸到框架右邊緣，高度由佔用者決定：佔用者不渲染內容時兩列保持全高，渲染內容時兩列都縮短其自身的高度。側欄列橫跨兩行。該座疊在列寬拖曳把手之上。右側面板全螢幕時，側欄列只佔第一行，該座橫跨整個框架寬度，疊在全螢幕面板之上、浮動面板之下。ui-terminal-panel 以終端面板佔用它。

### 視窗 chrome 座

在 macOS 桌面（`html[data-platform='darwin']`，僅由桌面 preload 設定）下，收起的側邊欄與其他平臺一樣保留 56px 控制欄；ui-sidebar 把控制欄的控制元件排在 hiddenInset 紅綠燈下方。框架始終在根元素上釋出 `--dsh-frame-top-clearance`（48px）：視窗頂帶之下的固定下沉量；主面板中的入口型頁面（外掛管理器等類似頁面，非對話）以它做頂部內邊距，浮層原語（portal 選單、底部錨定浮層、設定面板）以它做視口頂部安全邊距——放在根元素上讓 portal 到 document.body 的浮層也能讀到。框架自己不宣告任何 darwin drag：每個 chrome 行給自身打上 `data-window-drag`，ui-web base.css 把該標記變成唯一那條 darwin drag 規則，於是行自己的盒子就是視窗的可拖幾何——行的空白段可拖，控制元件保持可點。框架僅剩的那條 drag 規則屬於 Windows 標題欄行。

Windows Electron 的 `data-windows-titlebar` 標記在所有列上方預留頂欄高度，並在其下方保留收起後的 56px 側欄軌道。內容區僅左上角保留 16px 圓角，其餘角和內部交界處保持直角。框架釋出 `--dsh-windows-content-radius` 和 `--dsh-windows-sidebar-width`，供 ui-sidebar-right 的全螢幕圓角及側欄避讓使用。普通 Web 文件不會獲得該標記；macOS 保留其獨立佈局。

### 主題呈現

呈現器消費解析後的主題快照，並投影到 document：`html { color-scheme }` 驅動原生 UA 控制元件，依據目前配色方案設定 `body[data-ds-dark-theme]`，把主題的別名 token 與 `--dsh-content-font-size` 設為 body 上的內聯變數，並持有一個 `<meta name="theme-color">`，其內容隨計算後的 body 背景色更新。對呈現器執行 dispose（資源釋放）時，它會連同其他全域寫入一起移除自己的中繼資料節點。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

`selectPanel(id)` 在改變選中態前檢查即時 `main` 註冊表；缺失的 key 會拋錯並保留目前面板。`beginNavigation()` 為非同步 UI 導航返回 abort signal。後續呼叫、有效面板選擇（包括重複選擇）或佈局釋放會中止該 signal，但不取消底層工作階段建立。消費方在提交導航或搬移草稿前檢查 signal。

一次註冊宣告五個子 slot，並繫結 `ctx.layout` 的 `selectPanel`、`toggleSidebar`、`openRightbar(track, fullscreen)` 與 `closeRightbar`。同一個 root 儲存把 `panelInfo` 選中態與 `layoutInfo` 測量、寬度偏好、呈現報告分開。`ctx.layout.panelInfo` 與標準 `usePanelInfo` hook 共用同一個選中態來源；AppFrame 訂閱引用穩定的佈局物件。`rightbar` owner 提供實際 `width`、`viewportWidth`，以及表示能否以普通模式呈現的 `canShow`；佔用方在空間不足時執行確定性的收起，變寬不自行重新展開。全螢幕隱藏寬度手柄，但不自行釋放佔用方要求保留的軌道。AppFrame 保持各列容器掛載。右欄的 root 控制器僅在選中工作階段介面時，經 `SessionProvider` 渲染 `rightbar.session`；內容解除安裝時的報告釋放軌道。獨立的標題元件僅在工作階段介面可見時使用所選工作階段標題，以建置設定的產品標題或在地化 `common.brand.localBuild` 為退回值；語言變化會更新該退回值。主題呈現器是第二個 effect：從解析後的快照做純 DOM 寫入——初始狀態經 getter 讀取一次，此後僅事件驅動，不經過 React。它先應用調色盤、字號與 token 變數，再把渲染出的背景測量為唯一的顏色依據。全螢幕呈現停用網格和手柄過渡；佔用方完全覆蓋框架後才報告新的列布局。退出全螢幕時，框架先保持無過渡並安裝目標佈局：關閉移除右軌道，恢復保留右軌道。後續普通幾何操作恢復正常過渡。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當佈局面不夠用時閱讀以下頁面。它們從框架進入它所渲染的欄與它所呈現的主題。

- [ui-sidebar](../ui-sidebar/README.zh.md)——佔據 `sidebar` 欄及其座位。
- [ui-conversation](../ui-conversation/README.zh.md)——佔據 `main` 中的 `conversation` key。
- [ui-sidebar-right](../ui-sidebar-right/README.zh.md)——以每工作階段一個停靠面佔據 `rightbar` 欄。
- [ui-theme](../ui-theme/README.zh.md)——呈現器消費其解析快照的主題 seam。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器外掛行如何載入並註冊槽位。

-----

<a id="model-experience"></a>
## 模型體驗

無。佈局外殼管理瀏覽器檢視狀態；這裡沒有任何內容進入模型請求。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前佈局行為。它們是目前包約束，不是通用視窗管理器對比或任務積壓。

- **面板幾何是瞬時狀態**——重新載入會恢復側欄預設值並隱藏右側面板；拖曳設定的寬度是整個框架共用的一份偏好，而非每個工作階段各自的屬性。
- **極窄視窗**——右側面板關閉後，中欄仍可能小於 400px；左側 56px 控制欄仍會保留。
- **軌道與面板僅在動畫期間沿同一條曲線運動**——離散開合時框架設定 `data-animating`，其軌道過渡和佔用方的滑入讀取同一組時長與緩動變數；佔用方若自用一套，擠壓時面板邊緣就會與工作階段介面的邊緣脫開。拖拽和即時呈現切換不帶過渡，因此該曲線不覆蓋它們。
- **擠壓重排期間無滾動錨定**——佈局變化可能移動讀者的視口。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外殼中 `ctx.layout` 背後的瀏覽狀態儲存不發出 Cordis 事件；clamp 與軌道的時序由本包各欄與服務規格直接斷言。
