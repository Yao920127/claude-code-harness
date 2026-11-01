# Agent Note: Desktop standard macOS window menus

Status: implemented

[English](2026-09-16-desktop-window-menus.md) | 中文

## 問題

Desktop shell 用自定義範本替換了 Electron 的預設應用選單，該範本此前只列出應用選單和 Edit 選單。Electron 只建置範本中宣告的 role，因此 macOS 失去了預設範本提供的 File、Window 選單和應用隱藏命令，包括 Close Window（⌘W）、Minimize（⌘M）和 Hide（⌘H）。這些快捷鍵在 Desktop 應用中都沒有任何效果，而同類的 macOS 應用都會回應它們（#4374）。

## 決策

macOS 上的範本在 Edit 選單之後宣告 `{ role: 'windowMenu' }`，並在應用子選單的 Quit 之前宣告由分隔符隔開的 `hide`、`hideOthers` 和 `unhide`。這些 role 只提供標準選單項；不宣告 Services 子選單、視窗列表或其他 macOS 預設項。Windows 和 Linux 保留應用選單和 Edit 選單。[頁面關閉決策](../architecture/2026-09-21-desktop-page-close-shortcuts.zh.md)負責自定義 File 選單和關閉行為。

Electron 為 Window 和 Edit role 提供英文預設標籤。顯式標籤會覆蓋 role 的預設標籤，同時保留原生命令和快捷鍵；在地化的應用命令見 [Desktop README](../../../../apps/desktop/README.zh.md)。最小化和隱藏透過 Electron 的 role 執行，沒有自定義處理器。 關閉與啟用行為已被[關閉時隱藏視窗](../architecture/2026-09-23-desktop-close-to-background-and-quit-confirmation.zh.md)部分取代；這裡的選單宣告仍然有效。

## 考慮過的替代方案

**把 ⌘W 繫結為最小化或隱藏視窗。** macOS 把最小化留給 ⌘M、把隱藏留給 ⌘H，同類應用都用 ⌘W 關閉最前視窗。給這個快捷鍵繫結其他命令會違背本改動所遵循的平臺慣例。

**只宣告 Window 選單。** 該選單提供 Minimize 和 Zoom，但不提供關閉，⌘W 仍然沒有繫結。

**在應用子選單裡直接加一個 `{ role: 'close' }` 項。** 這樣可以避免只有一個命令的 File 選單，但會把視窗命令放到 Plugins、Updates、Hide、Quit 這些應用級命令中間，沒有 macOS 應用這樣排布。

**在所有平臺都宣告 File 和 Window 選單。** 同一份範本在那些平臺會把 Ctrl+W 宣告為關閉；應用只有一個視窗，關閉它會觸發 `window-all-closed` 並退出應用。恢復選單的任務沒有要求這條退出路徑；頁面關閉決策明確規定了 Desktop 退回。

**讓 Dock 啟用時無論其他視窗是否存在都重建主視窗。** 外掛視窗可以比主視窗存活更久，因此把 `activate` 的判斷從 `BrowserWindow.getAllWindows()` 改為 `mainWindow` 能讓點選 Dock 總可以恢復主視窗。但這超出了恢復被壓掉的平臺命令，屬於視窗生命週期的行為變更，因此保留現有的 `activate` 判斷。

## 影響

macOS 透過四個選單 role 保留原生 Window 和應用隱藏命令。Window 和 Edit 保留 Electron 的預設英文標籤；應用命令使用 Desktop 的語言。

## 測試

`apps/desktop/tests/main-startup.spec.ts` 驗證各平臺宣告的選單 role，並記錄中英文應用標籤快照。基於 role 的選單項由本機執行，因此程式化的 `click()` 和 Vitest 的 Electron mock 都無法觸達這些快捷鍵。獨立 Electron 44 demo 確認顯式應用標籤會顯示在原生選單中；範本快照不能驗證原生快捷鍵的執行。
