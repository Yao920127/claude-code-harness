# Agent Note: User-terminal permissions

Status: implemented

[English](2026-09-16-user-terminal-permissions.md) | 中文

## 問題

使用者需要在限制 Agent（智慧代理）權限的同時親自執行命令。共享 Agent 的沙箱模式會迫使使用者為了手動操作而擴大 Agent 權限；保留互動式 shell 又會阻止後續模式切換，因為已有程序的沙箱限制無法跟隨新的 Session 設定改變。

## 決策

Web 側欄終端直接透過 Session 的 subprocess provider 執行，使用執行環境中系統使用者的權限。它不透過 Agent 沙箱限制 shell，也不請求 Agent 審批。作業系統權限、容器隔離和 provider 對環境憑證的清除仍然生效。Session 標識負責存取範圍、程序清理和初始目錄；sandbox policy 僅在 Session 沒有 cwd 時提供設定的預設目錄。

改變 Agent 權限時，使用者終端繼續執行。Agent 使用的 shell 和 terminal 工具保留各自的沙箱限制。使用者終端的輸入和輸出不產生模型輸入或 Session 事件。

本決策僅取代 [Web 側欄終端決策](../feature/2026-09-09-web-sidebar-terminal.zh.md)中的共享沙箱策略和模式切換限制。原記錄繼續負責程序所有權、傳輸、螢幕恢復和 shell 選擇。OpenCode 的 `packages/core/src/pty.ts` 和 `packages/core/src/pty/pty.node.ts` 提供相鄰實作依據：其互動式終端使用選定的 shell 和工作目錄直接建立 PTY。

## 考慮過的替代方案

**繼承 Agent 權限。** 一個 Session 模式可以描述兩類程序，但使用者必須同時授予 Agent 僅用於手動命令的權限。持久使用者 shell 隨之阻礙 Agent 權限切換。

**增加獨立的終端權限選擇器。** 產品將此終端視為使用者操作的系統 shell。另一個選擇器會增加策略狀態和程序重新啟動語義，目前沒有對應需求；部署和作業系統控制已經確定執行環境。

## 影響

存取 Web 終端即可作為 subprocess provider 的系統使用者執行命令，包括在該使用者有權限時寫入 Session 工作區之外的路徑。它不會授予 root 權限或逃逸容器。Session 所有權繼續用於分組和清理，不意味著 Agent 決定使用者操作的權限。

Controller 測試覆蓋全部 Agent 沙箱模式下的直接 shell 啟動，以及模式改變後的持續所有權。錄製的 Web 權限策略情境在只讀、完全存取和工作區寫入之間切換時保持同一個真實使用者 PTY，驗證工作區內外的寫入，並保留 Agent 的只讀拒絕和審批斷言。Bash 瀏覽器斷言在 macOS 和 Linux 執行；Windows 保留可移植的 controller 檢查和 Agent 策略回放。
