# Agent Note: 透過合成的 Alt 按鍵讓 Win32 選擇器獲得前臺啟用

Status: implemented

[English](2026-09-07-win32-picker-foreground-alt-key.md) | 中文

## Problem

web GUI 主機透過原生 Win32 資料夾對話方塊選擇工作區目錄，對話方塊執行在主機 spawn 的子程序中（issue #3543）。Windows 只把前臺授予前臺程序、由前臺程序啟動的程序或最近收到輸入的程序；後臺伺服器程序的子程序三者都不滿足，因此 `Show` 開啟的對話方塊即使屬於子程序的首個視窗，也會落在所有可見視窗之後。spawn 設計背後的"首視窗即啟用"假設（[歸檔功能記錄](../../archived/feature/2026-08-02-win32-in-process-folder-dialog.md)）只在 spawn 鏈持有控制檯前臺時成立，例如控制檯啟動的 CLI。

## Decision

`runFolderDialog` 在 `showing` 通知與阻塞式 `Show` 之間呼叫新增的 `pressAltForForeground` 繫結。該繫結在對話方塊執行緒上合成一次 Alt 按鍵（`keybd_event` 攜帶 `VK_MENU`，先按下後抬起），使 Windows 把該程序計為最近的輸入所有者——文件記載的允許前臺啟用的理由之一——於是 `Show` 建立的對話方塊視窗以前臺方式啟用。bindings 模組已經載入 koffi 的 `user32`，因此改動只增加一次函式取得與兩次呼叫。該按鍵在 Windows 上無條件執行。當程序已經持有前臺權利（控制檯啟動的 CLI）時，對話方塊本來就會啟用，按鍵不起作用；此刻獲得焦點的視窗仍會收到這一次單獨的 Alt，可能短暫高亮其選單欄。在合成輸入被抑制的環境（安全桌面、受限遠端工作階段、提權前臺視窗）中，對話方塊仍會落在其他視窗後面，包 README 記錄了該限制。

## Alternatives considered

**自定義 URL 協定加瀏覽器點選手勢。** 草稿 PR #3544 透過讓前臺瀏覽器導航到已註冊的 `dsh-picker://` URL 來授予前臺，使 shell 把對話方塊程序作為前臺程序的後代啟動。該授權按設計具有確定性，但機制橫跨註冊表與 VBS 啟動器檔案、協定入口點、攜帶每次啟動權杖的 picker-result HTTP 路由，以及首次使用時的瀏覽器確認，還增加了一條瀏覽器可達的伺服器端路由。合成按鍵刪除了整個這一面。

**由點選方呼叫 AllowSetForegroundWindow。** 該 API 必須由目前前臺程序——瀏覽器——呼叫，並且只能點名一個被允許的程序；spawner 無法代替瀏覽器呼叫它。

**對聚焦執行緒 AttachThreadInput。** 把對話方塊執行緒附著到焦點視窗所屬執行緒同樣能繞過前臺限制且沒有按鍵副作用，但同樣沒有文件契約，需要在顯示時取得焦點視窗的執行緒 id，並在焦點視窗屬於更高完整性程序時失敗；未做原型驗證。

## Consequences

選擇器保持單一 spawn 子程序設計，並在後臺主機情境獲得前臺行為，代價是一次 koffi 呼叫對。bindings spec 在假 COM 世界上固定了 Alt 按下/抬起序列及其緊鄰 `Show` 之前的位置；logic spec 固定完整的 showing → press → `Show` 順序。Windows CI lane 仍會真實開啟並中止關閉一個對話方塊（按鍵存在），但不斷言啟用。在一臺把前臺鎖強制到最大值的 Windows 11 機器上做了驗證：不加按鍵復現失敗（對話方塊在其他視窗後面），加上按鍵後對話方塊獲得前臺，五輪重複全部成功；Windows 10 尚未驗證。合成輸入由 raw input thread 非同步消費，因此啟用授權原則上存在競爭視窗；重複執行中未出現錯過，脆弱環境仍是記錄的包限制而非第二套機制，因為瀏覽後端仍是原生選擇不可信情境在組合層面的答案。
