# Agent Note: Desktop 關閉快捷鍵跟隨頁面焦點

Status: implemented

[English](2026-09-21-desktop-page-close-shortcuts.md) | 中文

## 問題

[快捷鍵 PRD](https://trtgsjkv6r.feishu.cn/wiki/APvtwgbztiBLzvk9DM4cQbccnhf) 為關閉命令規定了兩類目標：獲得焦點的右側欄頁面，或沒有可關閉頁面時的 Desktop 視窗。Electron 原生 close role 繞過頁面 owner。Windows 關閉最後一個視窗還會退出 Desktop 實例並停止其 Host 任務，因此該退回屬於生命週期選擇，不只是選單標籤變更。

## 決策

側欄頁面 owner 根據即時焦點解析關閉操作，並捕捉目標的 Session、窗格、tab occurrence 和導航 revision。它透過資源清理處理器關閉該頁面，或收起唯一的停靠引導頁。過期側欄目標不會退回到其他頁面或視窗。沒有可關閉頁面時，Desktop 請求原生視窗關閉；Web 沒有視窗退回。

macOS File 選單透過同一個 owner 路由“關閉頁面或視窗”，並顯示已接受的單鍵繫結。原生關閉要求設定 revision 仍為目前值、產品視窗已聚焦且啟用，並且沒有在錄製快捷鍵。現有視窗生命週期直接生效，不增加快捷鍵專用確認：macOS 最後一個視窗關閉後保留應用；Windows 和 Linux 退出並停止 Host。

本決策接管[標準 macOS 選單記錄](../bug-fix/2026-09-16-desktop-window-menus.zh.md)中 close role 選擇所涉及的 File 選單和關閉行為。該記錄保留原生 Window 與應用隱藏命令的理由。[快捷鍵偏好持久化](2026-09-20-device-local-shortcut-preferences.zh.md)負責已接受繫結及 revision 釋出。

## 考慮過的替代方案

**使用 Electron 原生 close role。** 它不詢問獲得焦點的頁面 owner 就關閉視窗，無法保留頁面清理和已接受自定義繫結的路由。

**停用 Windows 視窗退回。** 這能避免關閉快捷鍵停止任務，但會遺漏 PRD 明確要求的 Desktop 退回。產品保留原生關窗語義；需要應用繼續執行時，使用者可以最小化視窗。

## 影響

快捷鍵與 macOS File 選單的關閉行為一致。在 Windows 和 Linux 上，焦點不在可關閉側欄頁面時按下該快捷鍵，可能因退出實例而停止活動任務。該命令不增加後臺 Host 生命週期或感知任務狀態的退出確認。Desktop 鍵盤測試覆蓋 revision 和焦點保護；側欄焦點測試覆蓋捕捉的頁面身份和過期目標；啟動測試覆蓋各平臺選單宣告。
