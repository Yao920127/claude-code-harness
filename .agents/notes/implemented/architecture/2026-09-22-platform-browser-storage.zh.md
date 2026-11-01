# Agent Note: 按帳號隔離的 Platform 瀏覽器儲存

Status: implemented

[English](2026-09-22-platform-browser-storage.md) | 中文

## Problem

內嵌 Platform 通知將關閉狀態寫入 localStorage。一次性瀏覽器分割槽會在每次關閉檢視後丟失該偏好。

## Decision

Desktop 使用 Platform 來源和穩定帳號 ID 的 SHA-256 雜湊劃分瀏覽器儲存。持久分割槽跨檢視和應用生命週期保留 localStorage 頁面偏好，包括退出登入後再次登入同一帳號。分割槽名不包含原始帳號 ID 或 token。在 Host 尚未從成功的資料讀取獲得帳號 ID 期間，檢視使用一次性分割槽，因此準備 Platform 工作階段不會等待資料請求。同一憑證下帳號 ID 遲到時，已掛載的一次性文件保持不變；下次開啟使用帳號分割槽。

持久分割槽只保留 localStorage；開啟持久分割槽會先清理 Cookie、檔案系統、IndexedDB、Cache Storage、HTTP 與著色器快取、Service Worker 及 HTTP 認證狀態，而一次性分割槽會清理其全部儲存。關閉檢視會銷燬文件、移除攜帶憑證的請求攔截器並安排相同的清理，因此異常退出遺留的認證會在下一個文件載入前被清除。下次開啟和應用退出都會等待該清理完成，更新安裝也會在安裝器接管退出前等待；退出流程上報清理失敗，而不阻塞退出。清理失敗會使該次開啟失敗，並在後續清理成功前阻止同一帳號再次開啟，其他帳號不受影響。僅限 Host 的憑證仍透過現有 preload 傳入受信任頁面，bridge 不會將其寫入瀏覽器儲存。

## Alternatives considered

共享分割槽會混用帳號偏好。以 token 命名會在憑證變化時丟失偏好。專用於通知的原生 API 會重複承擔 Platform 偏好管理職責，並要求前端同步修改。只在關閉檢視時清理，會讓異常退出遺留的認證被下一個文件讀取。

## Consequences

偏好僅儲存在此 Desktop 瀏覽器資料目錄中，不跨裝置同步。Platform 腳本仍須可信地處理收到的憑證；持久站點儲存不是憑證保險庫。已退出帳號的儲存會保留在磁碟上，直到該帳號再次登入或瀏覽器資料目錄被刪除。真實 Electron 迴歸測試驗證檢視重建、帳號切換和程序重新啟動後的通知關閉狀態，並斷言 Cookie、Cache Storage 和 IndexedDB 已清理、頁面 beforeunload 處理函式不會阻止關閉、一次性工作階段既不繼承也不保留偏好，以及上一程序遺留的 Cookie 已清除。
