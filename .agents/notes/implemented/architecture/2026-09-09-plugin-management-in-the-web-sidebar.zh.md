# Agent Note: 外掛管理移到 Web 側欄

Status: implemented

[English](2026-09-09-plugin-management-in-the-web-sidebar.md) | 中文

## 問題

已安裝的包屬於執行中的 profile，而設定是覆蓋在 Session 上的彈出視窗。管理頁面需要容納包詳情與安裝輸出。佈局的[全域主面板](2026-09-08-global-main-panels.zh.md)提供對應的生命週期與空間。

## 決定

**管理位於側欄。** `ui-plugin-manager` 在 `plugins` 下注冊 `sidebar.panellist` 入口與它開啟的 `main` 面板。頁面透過[外掛管理器](2026-09-14-current-profile-plugin-management.zh.md)的 Remote 管理 profile 的組合包及其行、展示安裝輸出，並確認解除安裝。它列出已安裝的組合包與安裝隨附的可選組合包。設定保留只讀外掛清單，包括隨安裝提供的組合包（`dsh-base`、`dsh-web-app`）；清單的兩個分組預設收起，且不帶管理控制元件。設定的位置遵循[外掛設定頁決策](2026-09-16-plugin-configuration-on-the-plugins-page.zh.md)。

**一個 store 跟隨 Host 狀態。** 管理器控制器把 `listBundles` 與 `listPlugins` 合成每個組合包一份檢視，按清單的 `managementAvailable` 判定可用性，在管理操作後、收到 `plugin-manager/changed` 時以及重連後重新整理，並按所屬 job 儲存安裝進度。設定表單使用原有全域 settings 繫結。

**安裝結果屬於一次請求。** 每次安裝或重試都生成新的請求 ID，對話方塊按該 ID 篩選 Host 進度、日誌和返回結果。取消確認可能先於原 add 回應到達，因此舊回應不能結束隨後的重試。取消採用管理器的明確清理確認；本地 RPC 取消和斷線均不表示 pnpm 已停止。進入設定應用階段後關閉取消視窗。

## 考慮過的替代方案

**用一個設定分割槽開啟管理頁。** 否決：對話方塊蓋住主列，這樣的入口必須先關掉設定才能顯示頁面。

**設定的位置。** 該選擇及其替代方案由[外掛設定頁決策](2026-09-16-plugin-configuration-on-the-plugins-page.zh.md)維護；側欄導航與安裝請求的歸屬獨立於它。

## 後果

web bundle 的**外掛**側欄入口開啟 profile 管理。設定提供只讀清單，外掛表單位於外掛頁。`apps/web/tests/plugin-manager.e2e.ts` 經側欄到達管理器；`plugin-config` 與 `settings-chrome` 分別驗證表單和只讀清單。

## 測試

`packages/client/ui-plugin-manager/tests` 釘住同一 id 下的兩處註冊與頁面的渲染；`packages/client/ui-settings-plugins/tests` 釘住沒有標籤條的單一貢獻；上述 web e2e 情境在腳手架上驅動面板與分割槽。
