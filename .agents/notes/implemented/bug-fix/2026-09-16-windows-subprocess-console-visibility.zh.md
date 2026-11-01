# Agent Note: 在建立時隱藏 Windows 子程序控制檯視窗

Status: implemented

[English](2026-09-16-windows-subprocess-console-visibility.md) | 中文

## 問題

PTC 執行時和 shell 呼叫共用 Windows 子程序提供者。其普通 Job runner 未設定視窗隱藏，原生目標只提供標準控制代碼而沒有啟動可見性標誌。因此，Desktop 執行短命令時可能閃現控制檯視窗。

## 決策

私有 Node Job runner 使用 `windowsHide: true`。普通和受限權杖原生程序建立在目的碼執行前，將 `STARTF_USESHOWWINDOW` 和 `SW_HIDE` 與標準控制代碼一起傳入。控制檯繼承、恢復執行緒前分配 Job 和管道歸屬保持不變。任何操作都不隱藏已有父控制檯，也不承諾抑制命令顯式開啟的視窗。

[ACL 沙箱決策](../feature/2026-08-08-windows-acl-restricted-token-sandbox.zh.md) 仍負責受限權杖策略和控制檯隔離限制。設定初始視窗可見性不需要向受限程序建立新增 `CREATE_NO_WINDOW` 或 `CREATE_NEW_CONSOLE`。

## 考慮過的替代方案

**僅隱藏外層 runner。** 原生目標建立獨立於 Node 啟動選項，因此也需要明確設定初始可見性。

**移除所有程序的控制檯。** 受限權杖配合控制檯隔離標誌存在已記錄的 DLL 初始化失敗。啟動可見性設定保留現有控制檯附著規則。

**PowerShell 啟動後再隱藏視窗。** 視窗可能在腳本執行前已經可見；建立時設定可避免這一間隔。

## 後果

普通子程序啟動抑制附帶控制檯視窗，不改變工具輸出或程序清理。原生 Windows 測試檢查後代程序和兩種 ACL 模式的控制檯可見性，並配合現有流、控制管道和 Job 生命週期測試。沒有控制檯也是有效狀態；測試不要求控制檯必須存在。啟動參數測試固定建立時的保證，單獨觀察最終可見性無法確認這一點。

工作階段錄製無法觀察原生控制檯視窗，轉錄內容也沒有變化。此迴歸由 Windows 原生測試負責；瀏覽器截圖無法確認桌面視窗不存在。
