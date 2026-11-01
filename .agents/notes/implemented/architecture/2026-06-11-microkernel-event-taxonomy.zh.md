# Agent Note: 微核心——透過 Cordis 事件分類體系實作擴充功能，唯一具體迴圈

Status: implemented

[English](2026-06-11-microkernel-event-taxonomy.md) | 中文

## 問題

產品原則是「一切皆外掛」：掛鉤、/goal、/loop、動態工作流、壓縮（compaction）、沙箱、權限、UI、持久化、MCP、skill（技能）都必須能以外掛形式編寫，無需修改核心。

## 決策

純 Cordis 事件分類體系。agent loop（智慧代理迴圈）的擴充功能點是帶型別的事件，具有明確的分發模式：

- **waterfall（瀑布式事件）**（around-middleware）：外掛可變換、短路、恢復或包裝：`agent/pre-step`、`agent/request`、`agent/request-error`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`、`llm/stream`、`system-prompt/assemble`。
- **serial**（按監聽器順序依次 await）：用於 `agent/turn-stopping` 等有序檢查點。
- **parallel**（await 扇出）：每個監聽器都必須獲得獨立執行的機會：`session/flush` 永續性檢查點。
- **emit**（同步 fire-and-forget）：用於通知：inbox 轉換、生命週期、錯誤，以及受錯誤隔離的 `tools/result` 觀測；該觀測接收不可變的最終結果。輪次與步驟邊界由持久工作階段事件擁有。

事件詞彙定義在約定包中（`dsh-agent` 宣告 `agent/*` 事件）；`@deepseek-ai/dsh-agent-loop` 是唯一的具體迴圈外掛，且自身可替換——外部不得依賴它。

## 曾考慮的替代方案

**專用中介軟體棧（koa-compose 風格）**與**顯式階段狀態機（外掛向其中插入階段）**：兩者都需要重新實作 Cordis 原生事件系統已提供的分發、dispose（資源釋放）與過載語義；作為 Cordis effect，監聽器天然獲得 HMR（熱模組替換）與 dispose 能力。

## 後果

- 每個 MVP 功能都對映到一個監聽器（[功能→機制對映](../../../../docs/cookbook/extension-cookbook.zh.md#the-feature--mechanism-map)是證明義務，保持更新）。
- HMR 與 dispose 無需額外工作：監聽器和註冊均為 Cordis effect。
- waterfall 語義（呼叫 `next()` 或短路）不直觀，需要教學——在 AGENTS.md 中記錄，並由組合測試覆蓋。
- 迴圈必須具備防禦性：外掛異常在輪次級別被隔離，來自任何擴充功能點的 steering（中途引導）永遠不會被擱置（有迴歸測試保障）。
