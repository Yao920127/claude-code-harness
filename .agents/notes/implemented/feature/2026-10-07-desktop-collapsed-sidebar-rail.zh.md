# Agent Note：所有桌面平臺都保留收起後的側欄軌道

Status: implemented

[English](2026-10-07-desktop-collapsed-sidebar-rail.md) | 中文

## Problem

在 macOS 與 Windows 桌面上，收起左側邊欄會留下一個零寬度的列。外掛、任務、Workspace、用量與設定入口隨之消失，使用者在重新開啟側邊欄之前無法得知這些功能存在；只有普通 Web 建置保留 56px 圖示軌道。macOS 還需要一個單獨的視窗 chrome 座來放置重新開啟與 New Session 控制元件，使 darwin 的收起成為第三套需要維護的佈局。

## Decision

所有平臺在側邊欄收起時都保留 56px 軌道。`computeColumns`（ui-layout `columns.ts`）對收起的側邊欄總是預留 `SIDEBAR_COLLAPSED`，不再接收收起寬度參數。

- **macOS。** hiddenInset 紅綠燈橫跨 x 12–68，比軌道更寬，因此軌道的控制元件從紅綠燈下方開始。ui-sidebar 的 darwin 規則以 `--dsh-sidebar-rail-chrome`（44px；視窗全螢幕隱藏紅綠燈時為 18px）為收起的根元素加上頂部內邊距，把頂部條向上延伸覆蓋該帶狀區域，作為承載展開按鈕的軌道 `data-window-drag` 行，並把空的 logo 行摺疊掉。對話標題行從中間列起始 20px 處開始，已越過紅綠燈，無需額外的行內避讓。
- **Windows。** 展開按鈕與 New Session 固定在標題欄行中；標題欄下方收起的軌道保留面板、瀏覽與底部控制元件。
- **移除框架視窗 chrome 座。** 刪除 `shell.leading` root slot、其 `HeaderLeadingControls` 佔用者、`--dsh-frame-leading-clearance` 變數，以及對話標題行依據它的內邊距（預穩定 API：更新所有消費方，不保留相容層）。軌道自身的展開按鈕與 New Session 按鈕服務於所有主面板。

### 被取代的設計

[macOS 隱藏標題欄決策](2026-09-13-macos-hidden-titlebar-vibrancy.zh.md)讓 darwin 的列整列隱藏，並拒絕保留軌道，理由是懸浮紅綠燈下方的軌道會讓視窗角落的 chrome 加倍，並佔用收起本來要騰出的寬度。隨後的一項架構決策加入了框架持有的 `shell.leading` 座。其動機是：重新開啟控制元件最初位於只有 Conversation 才有的標題座中，因此選中其他任何主面板（外掛管理器、未來的全域面板）時，收起的視窗完全沒有重新開啟控制元件，而每個面板都要重複座位標記、拖拽區域扣除與紅綠燈幾何。一個只在 darwin 列隱藏時掛載的框架座讓這一保證成為結構性的。它為對話標題行釋出 `--dsh-frame-leading-clearance`（160px，全螢幕時 84px），讓內容避開紅綠燈與座上的兩個控制元件。該設計還拒絕了用 CSS 控制可見性（在所有平臺上留下無用 DOM 與 no-drag 扣除），也拒絕了讓每個消費方硬編碼避讓值（會與座的真實頻寬脫節）。

現在軌道為每個主面板提供同樣的重新開啟與 New Session 控制元件，因此既不存在逐面板的問題，也不再需要解決該問題的座。

## Alternatives considered

**保留整列隱藏，並加一個懸停才顯示的軌道。** 平時入口仍然不可見，而這正是本次變更要解決的可發現性問題。

**在軌道旁保留 `shell.leading`。** 該座會在視窗角落重複軌道的展開按鈕與 New Session 按鈕。

**保留 Windows 的零寬度收起。** Windows 會成為唯一一個收起後隱藏所有側邊欄入口的桌面平臺。

## Consequences

收起後的視窗在所有平臺上都為軌道佔用 56px；macOS 的全寬收起不復存在。在 macOS 上，紅綠燈覆蓋軌道頂部 44px 的帶狀區域，該區域是視窗拖拽行而非控制元件。今後若某個平臺需要整列隱藏，出於上述理由，必須為所有主面板重新提供一個框架持有的重新開啟座。

`shell.leading` 已不存在於 ui-layout 的 slot 宣告、ui-sidebar 的註冊與生成的用戶端 slot 目錄中。ui-layout app-frame 規格測試確認 darwin 與 Windows 標題欄下都保留 56px 軌道且不渲染 leading 座，其 apply 規格測試確認 `shell.leading` 未被宣告。Web e2e 視窗拖拽規格測試確認 darwin 軌道的展開按鈕位於 56px 列內且在紅綠燈下方、其上方的軌道條可拖拽、按鈕可點選；sessionless-header 規格測試在所有平臺上都從軌道重新開啟。這些規格測試並未執行真實的 macOS 與 Windows 視窗 chrome。
