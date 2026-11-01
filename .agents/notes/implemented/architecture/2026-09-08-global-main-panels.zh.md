# Agent Note: 不增加預設介面的全域主面板

Status: implemented

[English](2026-09-08-global-main-panels.md) | 中文

## 問題

外掛需要不屬於任何工作階段的應用級檢視。工作階段作用域的 Conversation 檢視無法提供這種生命週期，而替換 Conversation 的 single slot 又會移除普通工作階段介面。增加此擴充功能不能在預設應用中增加導航控制元件或預留空間。

## 決策

佈局宣告 root 作用域的 keyed `main` slot。保留的 `conversation` key 屬於 Conversation。`ui-session` 根據 `uiWorkspace` 的 `mainView` 所有權標記得出根 Session binding；`main.conversation` 及其關聯右 Sidebar 繼承該 Provider binding。其他主面板條目不獲得隱式工作階段繫結。[Client 工作階段引用](2026-09-15-client-session-references.zh.md)擁有引用取得與來源中繼資料；本篇擁有全域面板選擇。

側欄擁有 root 作用域的 `sidebar.panellist` list。每個 list 條目提供圖示，以及與主面板條目匹配的 id；字串或隨語言變化的標籤提供普通可見文字、無障礙名稱和摺疊提示。本決定落實時預設組合不註冊面板條目，因此空列表沒有 DOM 或間距；現在 web bundle 的外掛管理器註冊了第一個條目（[外掛管理移到 Web 側欄](2026-09-09-plugin-management-in-the-web-sidebar.zh.md)）。選中操作檢查即時主面板條目，對缺失的 key 報錯而不替換目前面板。

渲染器與佈局控制器共享一個直接建立的 root 儲存。其 `panelInfo` 和 `layoutInfo` 物件保持獨立的引用。框架提供 `usePanelInfo`；各行和中央內容訂閱所需的選中態值，AppFrame 僅讀取佈局資訊。右側 Sidebar 的 root 控制器決定是否掛載其工作階段子樹，並把最終所需的列寬報告給框架。

`uiWorkspace.openSession(target)` 先取得顯式目標，再替換主引用並讓中央區域返回 Conversation。`openWorkspace` 和 `forkSession` 保留佈局既有的 `beginNavigation()` 訊號與服務生命週期。`openWorkspace` 在取得完成後、替換主引用前執行既有的同步準備動作。請求被替代會阻止遲到的 UI 提交，不阻止工作階段建立。直接開啟工作階段不增加全域導航取消。面板導航既不釋放所持主工作階段，也不寫入工作階段事件。

DOM 焦點不是導航選中態。搜尋和目錄選擇控制元件可以獲得焦點，同時保留全域面板及其側欄行的選中態；開啟工作階段才改變中央區域的選中態。

## 考慮過的替代方案

**工作階段作用域的主檢視。** 其生命週期和標準 props 會把應用級狀態繫結到恰好處於目前態的工作階段。

**另一套導航棧。** 新工作階段和工作區工作階段行已經提供明確目標，不需要返回按鈕或儲存返回目的地。

**React 標題 slot。** 導航條目的可見文字與無障礙名稱使用同一個普通標籤；獨立的標題註冊不屬於這一呈現方式。

**平鋪選中態和佈局狀態，再做淺比較。** 將兩者存為獨立物件可以直接保持引用相等，避免每次選擇面板都分配並比較新的佈局投影。

## 後果

預設側欄快照保持不變。擴充功能面板沒有右側 Sidebar，選擇另一個全域面板不會改變佈局偏好。在顯示右側 Sidebar 的 Conversation 與全域面板之間切換時，所需列寬仍會變化；這並不保證瀏覽器完全不計算佈局。

面板選中態是瞬時狀態，重新整理後重置。外掛 dispose（資源釋放）會移除其貢獻；移除目前選中的主面板條目會使中央區域回到 Conversation。測試註冊真實臨時面板，覆蓋行互動、焦點、儲存引用的獨立性、無效 id、過期非同步導航、宣告生命週期和預設空側欄。[Slots 參考](../../../../docs/subsystems/slots.zh.md)擁有組合 API 的說明。
