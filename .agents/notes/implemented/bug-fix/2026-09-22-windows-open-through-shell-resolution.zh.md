# Agent Note: Windows 開啟經 explorer.exe 完成

Status: implemented

[English](2026-09-22-windows-open-through-shell-resolution.md) | 中文

## 問題

Windows 桌面用戶端設定頁的「開啟設定檔」會準備目前 profile 的 `cordis.patch.yml`，並把該路徑交給原生文字編輯器開啟器（issue #4428）。在報告者機器上，這個動作既沒有開啟視窗，也沒有任何提示。開啟器執行的是 `powershell.exe -NoProfile -Command "Invoke-Item -LiteralPath '<path>'"`，因此由主機程序內的關聯解析決定結果，而 `Invoke-Item` 在解析不到應用時同樣以結束代碼 0 結束。

該機器的 `.yml` 預設值只記錄在 `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.yml\UserChoiceLatest`（progid 為 `VSCode.yml`），既沒有 `UserChoice` 記錄，也沒有 `HKCU\Software\Classes\.yml` 預設值。對同一個檔案雙擊，資源管理器會開啟 VS Code。而在主機程序中執行時，`Invoke-Item`、`cmd /c start`、`Shell.Application` 的預設動詞和 `AssocQueryString` 都報告該副檔名沒有應用，`cmd /c start` 則彈出 shell 自己的應用選擇框而不是開啟某個應用。`Invoke-Item` 仍然返回 0，於是 `SettingsController.openSettingsDocument` 回答 `{ opened: true }`，設定頁不渲染任何錯誤。

## 決策

`openWindowsPath` 將路徑作為**一個** argv 元素交給 `explorer.exe`，`revealNativePath` 經共享的 `runExplorer` 幫助函式走到同一個 shell。兩者都把目標編碼成檔案 URI 並對**逗號與等號**做百分號編碼，因為資源管理器自己解析命令列並以這兩個字元分段——含其中任一字元的原始路徑都會開啟另一個目標且不作任何提示。其餘字元不做轉義：資源管理器會拒絕 file URI 裡百分號編碼的非 ASCII 並回落到「文件」，因此這些字元以字面形式交給它。資源管理器執行的是雙擊所執行的預設應用解析，因此由 shell 的答案選擇應用——包括只記錄在較新的按使用者記錄裡的預設值；而完全沒有處理程式的機器會得到資源管理器自己的「你要如何開啟這個檔案?」選擇框，而不是毫無反應。

`runExplorer` 為兩種操作持有唯一一條 Explorer 呼叫規則：結束代碼 1 是 Explorer 把請求轉交給已在執行的桌面程序後返回的交接碼，它照常兌現呼叫方的 Promise；其餘失敗和取消仍然報錯。該幫助函式取代了 PowerShell 命令字串，同時刪掉了 `powershellLiteral` 及其單引號翻倍邏輯：路徑以 argv 元素跨程序邊界，去掉的是 shell 層轉義，而不是資源管理器自身解析所需的編碼；該編碼由 `explorerTarget` 為兩種意圖統一持有。

Windows 對 HTML 與 SVG 仍然無法命名瀏覽器，因此 `openInBrowser` 繼續拒絕該平臺，預設意圖、關聯意圖與文字編輯器意圖都走同一個 Explorer 交接。

## 考慮過的替代方案

**繼續使用 `Invoke-Item`。** 已否決。它詢問的解析器與 shell 不同，因此即使某個使用者的預設值能被資源管理器識別，仍會得到靜默的無效操作；而且它的零結束代碼正好抹掉了設定頁本應渲染的錯誤。

**在主機程序內自行解析預設值。** 已否決。依次讀取 `UserChoiceLatest`、`UserChoice` 和 classes 預設值，再啟動勝出 progid 的 `shell\open\command`，等於重新實作一套 Windows 自己擁有的順序，其中還包括 Windows 會驗證的 `UserChoice` 雜湊；而雙擊所用應用的定義就是 shell 自己的答案。

**使用 `cmd /c start <path>`。** 已否決。它為資源管理器本已執行的同一套解析引入一個命令 shell，並且在復現該缺陷的機器上同樣報告沒有應用。

**解析不到應用時退回到固定編輯器。** 已否決。Windows 安裝總是帶有可用的編輯器，但在開啟器裡選擇它等於覆蓋使用者的關聯，並把「缺少關聯」變成「靜默地開啟錯誤應用」。

## 後果

設定頁的開啟動作與產物、工作區的開啟動作共享同一個 Windows 行為：雙擊會啟動的那個應用。對於「資源管理器認、`AssocQueryString` 不認」這一被報告的狀態，現在會開啟已設定的編輯器。

開啟器再也無法區分「shell 開啟了」與「shell 拒絕了」：兩種情況 Explorer 都返回 0 或 1，因此 Remote 依舊回答 `{ opened: true }`，完全沒有處理程式的機器只能看到 shell 的選擇框。此處不驗證視窗是否真的出現。

互動桌面工作階段現在是前提。在非互動 Windows 工作階段（服務，或沒有互動登入的計劃任務）中，`explorer.exe` 不呼叫任何關聯，且同樣以結束代碼 1 返回，因此該結束代碼無法與「已委派」區分：Windows 11 ARM64 build 26200 的 SSH session 0 實測約 1 秒後返退回出碼 1，而同一工作階段裡 `Invoke-Item` 命令能在程序內解析關聯。這樣啟動的 Host 會失去能力且要付出等待，只有呼叫方的 abort 訊號能給這段等待封頂。該工作階段下的後備尚未實作。

目錄走同一條路徑。[open-in-app 記錄](../feature/2026-08-25-promote-open-anywhere-plugin.zh.md)中被否決的方案是 detached 且經過憑證清洗的 `explorer.exe <dir>` 派生程序，那不是本交接的做法：`explorer.exe` 子程序繼承主機環境，也不建立 detached 程序；而它轉交給桌面工作階段啟動的應用或資料夾視窗，繼承的是桌面工作階段環境而不是主機程序環境。

## 驗證

`path-opener.spec.ts` 固定兩種意圖交給 Explorer 的編碼檔案 URI、開啟與選中都可接受的交接結束代碼 1，以及仍然報錯的普通失敗與取消。`resolver.spec.ts` 固定 open-in-app 路由在 Windows 上的命令。按該包測試策略，原生桌面驗證留在 Windows。在 Windows 11 ARM64 build 26200 上，一次獨立驗證用 sha256 與原始碼一致的副本直接驅動模組自身的 `openNativeAssociatedPath`、`openNativePath`、`openNativeTextFile`，旁邊掛一個記錄 shell 實收參數的探針關聯：每個含逗號的目標都以 `%2C` 完整到達、普通檔案正常開啟、名為 `dir,comma` 的目錄開啟為根目錄正確的視窗。反證——同一個檔案以逗號未編碼的 file URI 交給 `explorer.exe`——沒有觸發任何關聯、開啟了使用者的「文件」，而且**同樣返退回出碼 1**。因此結束代碼 1 記錄的是委派而非結果，接受它不會把錯誤目標變成成功；真正保住路徑完整的是那段編碼。此處不觀測視窗是否出現。同一 build 的後續一輪改為直接讀取 shell 自己的視窗與選中狀態：編碼後的 `/select,` 目標選中了目標檔案；未編碼的 `=` 會開啟「文件」而不是檔案；非 ASCII 字元保持百分號編碼時同樣開啟「文件」，改為字面字元則正常開啟。
