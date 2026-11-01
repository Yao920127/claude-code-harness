# Agent Note：用預設應用開啟 Sidebar 預覽的檔案

Status: implemented

[English](2026-09-16-open-in-default-app-for-sidebar-files.md) | 中文

## 問題

用 Host 預設應用開啟檔案、或在檔案管理器中顯示檔案，此前只存在於交付卡片上，走的是 `ui-deliverables` 私有的路由與 fetch 控制器，按 Session、宣告事件序號和檔案下標定位。右側 Sidebar 的文件預覽沒有任何本地交接：影片、壓縮包、office 文件、被讀取器判為非文字的檔案、過大的檔案，都停在一行說明上，唯一的控制元件是重試，哪怕再讀一次也無濟於事（issue #3932）。這些檔案沒有交付事件可供定位，所以現有管線無法服務第二個介面。第一版實作（PR #4120，作者 Yifffan）新增了 `ui-open-locally` 包，自帶 Host 路由，並把交付卡片也遷了過去；產品評審要求改為把檔案開啟放進現有的 open-in-app 功能，並接受本期先落一箇中間態。

## 決定

[ui-open-in-app](../../../../packages/client/ui-open-in-app/README.zh.md) 擁有瀏覽器側的控制元件。[ui-sidebar-documentpreview](../../../../packages/client/ui-sidebar-documentpreview/README.zh.md) 的文件預覽宣告兩個 Session 作用域的 list 子 slot，owner props 攜帶檔案在執行環境中的絕對路徑，只在檔案中繼資料報出該路徑後渲染：`sidebar.right.tab.document.actions` 在每個顯示頭部的狀態裡跟在頭部自有控制元件之後，`sidebar.right.tab.document.unpreviewable` 佔據原本放重試的位置。預覽對空態的讀取失敗分類：`not-text` 與 `too-large` 是可讀但預覽無法渲染的檔案，提供 unpreviewable slot；`not-found` 與 `not-regular-file` 只給說明；其餘失敗保留重試，因為再讀一次可能解決。不支援字尾的空態不發起讀取，提供同一個 slot。

ui-open-in-app 填滿這兩個 slot：一個「開啟 ▾」分體按鈕，主按鈕用預設應用開啟檔案，選單再加檔案管理器定位；一個空態的「用預設應用開啟」按鈕。Host 回答有桌面之前，兩個控制元件都不渲染。控制元件呼叫 Host 早已釋出的 Session Remote：每頁呼叫一次 `session.canOpenWorkspacePath`，每個手勢呼叫一次 `session.openWorkspacePath`，帶上絕對路徑，定位時再帶 `action: 'reveal'`；沒有新增任何 Host 路由。兩個控制元件共用一個手勢 hook：只有使用者按下的那個控制元件在呼叫結算期間停用，失敗的呼叫解析為一個失敗種類，由該控制元件透過短暫 toast 提示一次，控制元件上不殘留失敗狀態。

## 考慮過的備選

**新建自帶 Host 路由的 `ui-open-locally` 包**（PR #4120）是這對 slot、失敗分類、分體按鈕設計和 toast 規則的來源。放棄它是因為儲存庫已經有 open-in-app 功能，再來一個負責本地開啟的包屬於重複；共享的 Session Remote 負責透過目前檔案系統驗證 Host 路徑。

**在 `dsh-host-open-in-app` 里加 Host 路由**提供桌面資訊和按路徑開啟，能讓 Host 報出檔案管理器的名字，並區分檔案不存在和啟動失敗。但這會讓 Host 半邊為了 Session Remote 已經發布的兩個呼叫而依賴 `sessionController`、`workspaceFiles` 與 `fs`，所以直接使用 Remote，定位標籤保持通用說法。

**現在就把交付卡片遷到這些控制元件上**會重做 PR #4120 裡最大的那部分，包括評審否決的跨外掛執行時匯入，以及它不得不遷移的交付錄製情境。本期卡片保留自己的路由。

## 後果

每個有經過驗證的 Host 對映的預覽檔案都能從 Sidebar 本地開啟，包括從未交付過的檔案。沒有這種對映的路徑會在原生開啟前被拒絕。交付卡片和預覽在同一項 Host 能力上跑著兩套開啟器；把它們統一起來，並按介面決定展示完整應用列表還是隻展示預設應用，是產品方向點名的下一步。定位選單項在所有平臺都寫「顯示檔案位置」，因為 Session Remote 不報告檔案管理器。用預設應用開啟帶有 Host 檔案關聯的執行語義；護欄是使用者對 Session 已可讀檔案的明確手勢，沒有授予任何新的 Host 權限。

單元測試覆蓋失敗分類、預覽對每種出路的渲染以及在 Host 路徑未知時對座位的保留、路徑控制器的桌面讀取與手勢結果、兩個控制元件的可見性、忙碌隔離與 toast，以及外掛的註冊與 fiber 釋放時的移除。無金鑰的 Web 文件預覽情境在 POSIX 主機上用樁開啟器驅動不支援字尾的控制元件，seeded-history 的檔案預覽 golden 固定住頭部控制元件。
