---
description: "web GUI 瀏覽器側的包對映：外殼啟動、瀏覽器與主機通訊、共享用戶端服務、在地化、開發過載與 UI 功能外掛。"
kind: "package-group"
---

# client/ — Web GUI 瀏覽器側

[English](README.md) | 中文

## 概述

`client/` 組提供 dsh web GUI 的瀏覽器體驗，包括對話、導航、設定、批准、檔案存取及其他互動功能。新增瀏覽器中可見的行為時，請選擇本系列中的包；伺服器端頁面交付與主機整合則使用 [`host/`](../host/README.zh.md)。本系列同時涵蓋共享瀏覽器基礎與專門的 UI 功能，各子包 README 擁有其設定與行為說明。編寫規則見 [AGENTS.md](AGENTS.md)，下方相關文件解釋跨包組合方式。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

核心包負責啟動與服務於頁面，UI 功能包負責呈現頁面。各包的 README 擁有自己的約定與設定。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`web/`](web/README.zh.md) | 啟動瀏覽器外殼 | — |
| [`modules/`](modules/README.zh.md) | 載入瀏覽器側用戶端模組 | `ctx.clientModules` / `ctx.modules` |
| [`connection/`](connection/README.zh.md) | 維護瀏覽器與主機之間的 RPC 通訊與事件投遞 | `ctx.connection` |
| [`file-upload/`](file-upload/README.zh.md) | 在頁面執行緒之外傳送原始 Blob 與位元組流請求體 | `ctx.fileUpload` |
| [`shortcuts/`](shortcuts/README.zh.md) | 註冊應用鍵盤命令 | `ctx.shortcuts` |
| [`ui-shortcuts/`](ui-shortcuts/README.zh.md) | 展示快捷鍵速查 | — |
| [`store/`](store/README.zh.md) | 提供不依賴 React 的 observable 與快照儲存原語 | — |
| [`hmr/`](hmr/README.zh.md) | 在開發期間重新整理用戶端外掛 | — |
| [`locale/`](locale/README.zh.md) | 提供在地化偏好與訊息詞典 | `ctx.locale` |
| [`test-runtime/`](../test-support/client-runtime/README.zh.md) | 為用戶端功能包提供共享的儲存庫測試支援 | — |
| [`ui-renderer/`](ui-renderer/README.zh.md) | 將 slot 資料繫結到 React，並掛載組裝完成的應用 | `ctx.uiRenderer` |
| [`ui-slots/`](ui-slots/README.zh.md) | 定義型別化擴充功能 Slots 與可複用 Component Factory | — |
| [`ui-session/`](ui-session/README.zh.md) | 把工作階段控制器狀態適應為標準 Slot source 與掛鉤 | — |
| [`ui-theme/`](ui-theme/README.zh.md) | 應用所選顏色主題 | — |
| [`ui-primitives/`](ui-primitives/README.zh.md) | 提供共享 React 控制元件、圖示與內容渲染器 | — |
| [`ui-attachment/`](ui-attachment/README.zh.md) | 註冊輸入框與訊息圖片的附件呈現 | — |
| [`ui-layout/`](ui-layout/README.zh.md) | 排列應用的主要區域 | — |
| [`ui-dockkit/`](ui-dockkit/README.zh.md) | 提供停靠佈局操作與 React 元件 | — |
| [`ui-sidebar/`](ui-sidebar/README.zh.md) | 展示工作區與工作階段導航 | — |
| [`ui-sidebar-right/`](ui-sidebar-right/README.zh.md) | 管理右側 Sidebar 及其 tab 型別 | `ctx.sidebarRight`, `ctx.sidebarRightTabs` |
| [`ui-sidebar-documentpreview/`](ui-sidebar-documentpreview/README.zh.md) | 在右側 Sidebar 的 tab 中顯示文件 | `ctx.documentPreviews` |
| [`ui-sidebar-browser/`](ui-sidebar-browser/README.zh.md) | 在右側 Sidebar tab 中瀏覽 sandboxed HTTP(S) 頁面，包括 loopback 服務 | — |
| [`resources/`](resources/README.zh.md) | 統一資源模型：`useResource` 工作階段標準掛鉤背後的協定提供者 | `ctx.resources` |
| [`ui-sidebar-files/`](ui-sidebar-files/README.zh.md) | 右側 Sidebar 的工作區檔案樹 tab 型別 | — |
| [`ui-brand-claude/`](ui-brand-claude/README.zh.md) | 用 Claude 標記與名稱填充瀏覽器品牌 slot 和頁面圖示 | — |
| [`ui-brand-official/`](ui-brand-official/README.zh.md) | 用官方名稱與標記填充通用瀏覽器品牌 slot | — |
| [`ui-workspace/`](ui-workspace/README.zh.md) | 提供工作區選擇與建立介面 | — |
| [`ui-conversation/`](ui-conversation/README.zh.md) | 展示目前對話及其輸入介面 | — |
| [`ui-chat/`](ui-chat/README.zh.md) | 投影並渲染 Chat 對話 target | — |
| [`ui-approval/`](ui-approval/README.zh.md) | 展示批准請求並返回使用者決策 | — |
| [`ui-tool/`](ui-tool/README.zh.md) | 編排工具呼叫樹與按工具鍵控的檢視 | — |
| [`ui-workflow-run/`](ui-workflow-run/README.zh.md) | 把持久工作流執行回放為巢狀對話摺疊項 | — |
| [`ui-goal/`](ui-goal/README.zh.md) | 展示與管理目前目標 | — |
| [`ui-trajectory/`](ui-trajectory/README.zh.md) | 提供 agent（智慧代理）活動的其他檢視 | — |
| [`ui-commands/`](ui-commands/README.zh.md) | 提供工作階段感知的命令發現與分發 | — |
| [`ui-input-trigger/`](ui-input-trigger/README.zh.md) | 協調內聯命令與引用建議 | — |
| [`ui-skill/`](ui-skill/README.zh.md) | 向內聯建議新增 skill（技能）引用 | — |
| [`ui-reference/`](ui-reference/README.zh.md) | 統一的 Web `@file` / `@session` 引用 source | — |
| [`ui-subagent/`](ui-subagent/README.zh.md) | 提供 subagent 導航、子級 transcript（文字記錄）狀態與內聯引用 | — |
| [`ui-jobs/`](ui-jobs/README.zh.md) | 列出本工作階段的後臺任務，並提供按需展開的流式輸出面板 | — |
| [`ui-schedule/`](ui-schedule/README.zh.md) | 在只讀標題欄目錄中列出目前工作階段中生效的提醒 | — |
| [`ui-model-selection/`](ui-model-selection/README.zh.md) | 在對話介面中提供模型選擇 | — |
| [`ui-permission-presets/`](ui-permission-presets/README.zh.md) | 設定預設權限並切換目前工作階段的存取模式 | — |
| [`ui-plan/`](ui-plan/README.zh.md) | 展示生效中的 plan mode 狀態及其退出控制元件 | — |
| [`ui-settings-plugins/`](ui-settings-plugins/README.zh.md) | 負責「內建外掛」設定分割槽殼及其標籤頁擴充功能點 | — |
| [`ui-user-questions/`](ui-user-questions/README.zh.md) | 展示 agent 請求的互動式問題 | — |
| [`ui-agent-preset/`](ui-agent-preset/README.zh.md) | 選擇工作階段的 agent 預設並編寫預設組合 | — |
| [`ui-settings/`](ui-settings/README.zh.md) | 承載設定介面及其擴充功能區域 | — |
| [`ui-settings-general/`](ui-settings-general/README.zh.md) | 提供常規設定分割槽 | — |
| [`ui-settings-models/`](ui-settings-models/README.zh.md) | 提供模型提供者設定與 DeepSeek 引導 | — |
| [`ui-settings-shell/`](ui-settings-shell/README.zh.md) | 在外掛頁提供終端設定頁 | — |
| [`ui-settings-agent-loop/`](ui-settings-agent-loop/README.zh.md) | 在外掛頁提供 Agent 迴圈設定頁 | — |
| [`ui-settings-subagent/`](ui-settings-subagent/README.zh.md) | 在外掛頁提供子智慧代理設定頁 | — |
| [`ui-settings-web-search/`](ui-settings-web-search/README.zh.md) | 在外掛頁提供搜尋來源設定頁 | — |
| [`ui-plugin-manager/`](ui-plugin-manager/README.zh.md) | 貢獻側欄的“外掛”面板：安裝、啟用、停用、重試與組合已安裝的包 | — |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.zh.md) | 向「外掛」設定貢獻只讀的 Host Loader 清單標籤頁 | — |
| [`ui-deliverables/`](ui-deliverables/README.zh.md) | 生成改動檔案卡片及其對比 tab、交付檔案卡片與可點選的最終回應檔案引用 | — |
| [`ui-message-feedback/`](ui-message-feedback/README.zh.md) | 提供訊息贊踩，以及從贊踩、`/feedback` 或工作階段標題欄選單開啟的回饋彈出視窗 | `ctx.feedbackUi` |
| [`ui-directory-picker-browse/`](ui-directory-picker-browse/README.zh.md) | 面向工作區目錄流程的應用內目錄瀏覽介面 | — |
| [`ui-directory-picker-native/`](ui-directory-picker-native/README.zh.md) | 驅動本地 Desktop 或 Host OS 選擇器的原生目錄選擇介面 | — |
| [`ui-open-in-app/`](ui-open-in-app/README.zh.md) | 在已安裝應用中開啟工作區目錄的工作階段標題欄拆分按鈕，以及文件預覽裡用預設應用開啟單個檔案的控制元件 | — |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考與兩份擁有跨包組合決策的 Agent Note 讀起，再看服務於本頁的主機半側。

- [用戶端模組子系統](../../docs/subsystems/client-modules.zh.md)——web 外掛表：`dsh.client` 宣告、啟動圖協定與 bundle 路由。
- [slot 系統標準](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——權威 slot 模型：註冊、props 份額與儲存。
- [web 用戶端架構 Agent Note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——載入鏈、物件層與用戶端服務。
- [主機組地圖](../host/README.zh.md)——服務於本瀏覽器半側的主機半側。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
