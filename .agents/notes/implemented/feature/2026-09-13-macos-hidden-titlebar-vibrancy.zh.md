# Agent Note: macOS hidden titlebar with vibrancy sidebar

Status: implemented

[English](2026-09-13-macos-hidden-titlebar-vibrancy.md) | 中文

## Problem

桌面應用此前使用 macOS 原生標題欄：Web UI 上方一條不透明的橫條，重複頁面已有的視窗裝飾、佔用縱向空間，並讓側邊欄無法觸及視窗頂邊。視窗看起來像瀏覽器標籤頁而非 macOS 應用，且不存在任何按平臺差異化呈現的機制——macOS、Windows 與純 Web 上每個畫素都完全一致。

## Decision

Electron 主程序在 darwin 上以 `titleBarStyle: 'hiddenInset'`、`trafficLightPosition: { x: 16, y: 18 }`、`vibrancy: 'sidebar'`、`visualEffectState: 'active'` 與透明 `backgroundColor` 開啟主視窗。`'active'` 讓視窗失焦時材質保持穩定；`'followWindow'` 會在失焦時把側邊欄沖淡。

所有 macOS Web 側調整均以 `html[data-platform='darwin']` 為開關，該屬性僅由桌面 preload 設定（`document.documentElement.dataset.platform = process.platform`）。這些規則不適用於純 Web 或其他桌面平臺。[Windows 頂欄決策](2026-09-16-windows-desktop-titlebar.zh.md)負責其獨立呈現。

**透明鏈。** 毛玻璃只透過透明畫素顯現：darwin 上 `html`/`body`（ui-web base.css）與 AppFrame 透明，中間列鋪不透明的 `--dsw-alias-bg-base`，側邊欄列鋪側邊欄底色的半透明 `color-mix`，讓材質透出。SidebarRoot 自身的不透明底色出於同一原因移到框架列。

**原生主題同步。** 毛玻璃材質跟隨 `nativeTheme.themeSource`，後者預設跟蹤系統外觀，會與應用自身的主題偏好背離。ui-theme 引導腳本與 ui-layout 的 `ThemePresenter` 釋出 `html[data-ds-theme-source]`（`light`、`dark` 或 `system`；固定偏好——包括註冊主題 id——釋出其解析後的配色）。應用 preload 觀察該屬性並經 `dsh-desktop:native-theme-set` 轉發；主程序驗證取值與傳送者（主視窗的 WebContents，包括其本地靜態 Web 文件）後賦給 `nativeTheme.themeSource`。釋出偏好而非解析值，可在偏好為 `system` 時保留跟隨系統。

**側邊欄頂部條與收起。** darwin 上側邊欄展開時有一條 52px 的頂部條，避開紅綠燈並承載收起按鈕；頂部條自己打上 `data-window-drag`，於是它自身那 52px 盒子就是視窗的拖拽區（唯一的 darwin drag 規則由 ui-web base.css 宣告），按鈕經 base.css 互動規則自行減除。本文最初讓 darwin 上收起的列整列隱藏；[收起側欄軌道決策](2026-10-07-desktop-collapsed-sidebar-rail.zh.md)取代了這一部分，現在 darwin 上收起的側邊欄保留 56px rail，其控制元件位於紅綠燈下方。

**視窗全螢幕標記。** macOS 全螢幕隱藏紅綠燈，圍繞它們建置的佈局必須放鬆。主程序在 `enter-full-screen`、`leave-full-screen` 與每次 `did-finish-load` 時經 `dsh-desktop:window-fullscreen` 轉發 `isFullScreen()`；應用 preload 的 `syncWindowFullscreen()` 把它映像到 `html[data-fullscreen]`。消費者：AppFrame 把 `--dsh-frame-leading-clearance` 降到 84px 並把座移到 `left: 12px`，側邊欄 `.topStrip` 把收起按鈕移到條帶左端，右側邊欄全螢幕面板把首格 pane 的 dockkit strip 內邊距重置回常規 10px。

**拖拽區。** Electron 按 DOM 順序以視窗幾何計算拖拽區，不看層疊，因此外殼只宣告一次 `-webkit-app-region: drag`，作用於 chrome 行打在自身盒子上的標記，行自身的盒子就是它的可拖幾何；哪些行必須帶這個標記由 ui-theme app-region 門禁的 `CHROME_ROWS` 清單擁有，本 note 只保留機制。框架不再宣告任何 drag——Windows 標題欄行是那個平臺自己的 chrome——因此沒有一條固定帶子需要匹配某一行的高度。所有可互動內容透過 ui-web base.css 的兩條全域規則自行減除：一條 `:is(...)` 選擇器讓每個互動元素（按鈕、連結、輸入框、role、`[tabindex]`）退出拖拽，一條 `body > :not(#root)` 規則覆蓋所有 portal 到 `#root` 之外的浮層。這兩條規則依賴的順序約定：覆蓋視窗且必須可點的表面 portal 到 `#root` 之外（settings 浮層即如此），從而在文件順序上晚於所有 drag 行；內容容器永不宣告 drag——那會覆蓋更早掛載的浮層。清單、瀏覽器車道與人工狀態矩陣歸 [覆蓋契約 note](../architecture/2026-09-19-window-drag-coverage-contract.zh.md)。

**全螢幕避開紅綠燈。** ui-dockkit 把 tab 條起始內邊距釋出為 `--dsh-dockkit-strip-inline-start`（退回為設計自身的 10px）。右側邊欄全螢幕形態在 darwin 上對面板主體設 88px，並對每個非首格 split 單元的子樹重置為 10px，使得任意分屏深度下恰好只有觸及視窗左上角的 pane 避開紅綠燈。

## Alternatives considered

**`titleBarStyle: 'hidden'` + 自繪視窗控制元件。** 重造紅綠燈會失去原生行為（懸停圖形、全螢幕過渡）且無收益；`hiddenInset` 保留原生控制元件，只要求頁面繞行。

**darwin 上保留 56px rail。** 浮動紅綠燈下的 rail 讓視窗角落裝飾翻倍，也浪費了收起本要回收的寬度；完全隱藏 + 頭部承載重開控制元件符合 macOS 側邊欄慣例。

**同步解析後的主題而非偏好。** 偏好為 `system` 時轉發 `light`/`dark` 會把視窗材質凍結在傳送時刻的解析值；轉發 `system` 讓 macOS 原生持續跟隨系統外觀。

**在 ui-dockkit 內部處理紅綠燈避讓。** kit 與主機無關，不可能知道哪個主機角落貼著視窗裝飾；釋出內邊距變數把策略留在擁有佈局位置的主機（ui-sidebar-right），kit 只付出一個自定義屬性。

**向頭部控制元件加收起狀態 prop 管道。** AppFrame 已釋出 `data-sidebar-collapsed`；用 CSS 對其判斷顯隱，避免了可能與框架過渡時間線不一致的第二條狀態路徑。

## Consequences

- macOS 視窗獲得半透明側邊欄與隱藏標題欄，對其他平臺零成本：所有規則限定在 `[data-platform='darwin']` 下，該屬性僅由 Electron preload 設定。
- 毛玻璃材質跟隨應用主題，含第三方註冊主題（取其解析配色）。截圖與錄屏與純 Web 的平面渲染不同。
- darwin 上收起的側邊欄保留 56px rail，其展開按鈕與新工作階段按鈕可在每個主面板中重新開啟側邊欄並開始工作階段（[收起側欄軌道決策](2026-10-07-desktop-collapsed-sidebar-rail.zh.md)）。
- 拖拽區歸屬是視窗級全域不變數：`-webkit-app-region: drag` 只出現在 ui-web `base.css`（作用於 `data-window-drag` 的唯一 darwin 規則）與 ui-layout `AppFrame.module.css`（Windows 頂欄 `.frame::before`）內；其他包依賴 base.css 的退出規則或新增限定範圍的 `no-drag`，永不新增拖拽面。ui-theme 的 app-region 門禁把每個 chrome 行的 markup 標記與它的樣式表、選擇器和寫死高度配成一條，並拒絕別處的標記。
- 接受透明視窗 + 毛玻璃在螢幕共享中呈現不同、啟動可能閃爍；透明 `backgroundColor` 緩解閃爍。

## Testing

ui-theme 引導與 ui-layout presenter 測試釘住 `data-ds-theme-source` 的釋出與清除。ui-layout 的 app-frame 測試釘住 darwin 收起後的 56px rail。desktop main-startup 測試釘住全螢幕轉發（狀態切換、過載、已銷燬視窗守衛、僅 darwin 註冊），preload-platform 測試釘住 `html[data-fullscreen]` 映像。ui-theme 的 corner-shape 與 full-round 樣式門覆蓋新樣式表，其 app-region 門禁釘住唯一那條 darwin drag 規則與每個 chrome 行的 markup 標記。
