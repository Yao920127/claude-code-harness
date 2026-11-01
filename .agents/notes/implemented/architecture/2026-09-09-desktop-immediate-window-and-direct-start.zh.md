# Agent Note: Show the Desktop window before starting the Host

Status: implemented

[English](2026-09-09-desktop-immediate-window-and-direct-start.md) | 中文

外掛管理和原生恢復遵循[共享 Web 薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)。

## 問題

等待後端就緒會讓使用者在準備 profile 和載入模組期間看不到視窗。完整的 staging 健康檢查程序會在應用啟動服務程序前重複啟動後端，而外掛在實際服務程序中仍然可能啟動失敗。

## 決策

Electron 在 profile 校準或 Host 啟動前建立帶打包 Web 載入頁的主視窗。Web 入口先顯示啟動頁，再等待 Host 就緒。自有 preload 交付結構化啟動注入，現有文件應用注入後啟用用戶端外掛；啟動失敗時顯示診斷和可用恢復操作。載入期間關閉視窗會取消後續啟動工作，並等待正在啟動的子程序退出。

致命錯誤展示遵循[原生 Desktop 恢復](2026-09-15-desktop-native-fatal-recovery.zh.md)。視窗展示時機、直接啟動 Host 和關閉所有權仍由本文規定。

Desktop 原位準備 profile 後，透過[共享 Web runner](2026-09-10-desktop-web-wrapper.zh.md)啟動實際 Host。就緒資訊提供認證後的 Host URL 和啟動注入。桌面殼用該 URL 換取 Host cookie，轉發應用 HTTP 請求，並僅為所屬應用源認證直接 WebSocket 請求。此承載適應保留 Web 路由和流語義，同時允許靜態 HTML 在 Host 就緒前顯示。

本決策部分取代[打包決策](2026-08-25-electron-desktop-packaging-and-updates.zh.md)和[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)中的 staging 後端探針與延遲建立主視窗。這兩份記錄仍保留髮布、簽名、傳輸與資源歸屬的理由。完整執行時檔案驗證仍屬於打包操作。

## 考慮過的替代方案

**保留完整 staging 健康檢查。** 它可以在啟用前拒絕部分啟動失敗，但會執行兩次外掛初始化，也不能保證服務程序能夠啟動。實際 Host 結果提供顯式恢復所需的診斷。

**在就緒前隱藏主視窗。** 這避免顯示載入頁，但後端載入期間使用者看不到進度，也無法互動。殼擁有的頁面可以在 Host 啟動失敗時繼續使用。

## 後果

使用者可以在產品 UI 可用前看到啟動進度並從失敗中恢復。視窗能夠回應不代表後端已經就緒，啟動延遲仍需透過已安裝產物測量。啟用失敗後，profile 修改保留在原位。

驗證覆蓋 Host 延遲時可見的載入頁、新 profile 僅啟動一次服務、同一視窗中的失敗與重試、原生恢復，以及子程序啟動時關閉。安裝後 GUI 證據補充生命週期測試。
