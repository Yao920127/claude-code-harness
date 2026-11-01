# Agent Note: 透過一個組合包啟用 Agent Teams

Status: implemented

[English](2026-09-18-agent-teams-single-bundle.md) | 中文

## 問題

獨立的 Agent Teams 與 Agent Teams Web 開關要求使用者自行發現：工具與瀏覽器控制元件需要同時選中兩項。包的拆分把組合細節暴露在外掛頁上，卻沒有幫助使用者選擇不同的 Team 能力。

## 決策

`@deepseek-ai/dsh-experimental-agent-team-profile` 在一個可選組合包中攜帶 Team 服務、工具與瀏覽器 UI。其 patch 保留 `agent-team`、`tool-agent-team` 與 `ui-agent-team` 設定行 id，因此 profile patch 仍可單獨設定各行。UI 包的 Host 入口不執行邏輯；其瀏覽器入口只在 Web 用戶端中掛載，headless 不會啟動 Web 服務。

獨立的 `@deepseek-ai/dsh-experimental-agent-team-web-profile` 包不在 workspace 與釋出系列中。外掛頁提供一個 Team 選項，預設關閉。

本決策取代[包釋出記錄](2026-08-18-experimental-agent-teams-packages.zh.md)中的獨立 Host/Web 組合方式，以及[可選組合包記錄](../process/2026-09-15-shipped-optional-bundles.zh.md)中的兩個 Team 選項。兩條記錄仍負責釋出、依賴隔離、promotion 與安裝方所有權。[已歸檔的 Web 控制元件記錄](../../archived/feature/2026-08-06-agent-teams-web.md)記載原始拆分方式，其歷史文字保持凍結。

## 曾考慮的替代方案

**保留兩個開關並解釋依賴關係。** 使用者仍須為一個功能選中兩項，單獨選中任意一項都不能提供完整的瀏覽器體驗。

**在通用 profile loader 或外掛管理器中合併入口。** 在這些位置識別 Team 包名會讓共用的載入或展示程式碼負責功能特定的組合。組合包 patch 已能宣告所需設定行與依賴。

## 後果

使用者同時啟用工具與瀏覽器控制元件。安裝層面不再提供僅選擇 Team UI 組合包的入口；自定義 profile 仍能單獨控制 patch 設定行。headless 安裝檔含 UI 依賴圖，但不會掛載其瀏覽器入口。

選中了已移除 Web 組合包的已有 profile 存在升級相容性缺口：無法解析該包時，啟動會失敗。組合包本身不會自動改寫這些已儲存的選擇。相容性處理與本組合決策分開。

## 驗證

外掛管理器瀏覽器測試觀察一次開關後 Team 控制元件出現，透過 Remote 讀取成員列表與任務看板，並觀察關閉組合包後控制元件移除。Team 面板瀏覽器測試覆蓋只讀任務看板；建置後的 headless CLI 測試覆蓋無需 Web 服務的委派。這些情境不覆蓋仍選中已移除 Web 組合包的 profile 升級。
