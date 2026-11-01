# Agent Note：Cordis 執行時檢查與 runner 隔離

Status: implemented

[English](2026-07-08-self-referential-cordis-toolset.md) | 中文

## Problem

執行時 API 發現必須描述外掛實際能呼叫的 API。程序內生成定義還需要註冊總和檢查碼完整的 effect 釋放；僅隔離 JavaScript 全域變數並不能限制注入服務的權限。

## Decision

`cordis_inspect_list` 和 `cordis_inspect_query` 提供只讀執行時發現。生成目錄保留原始碼中的宣告和 JSDoc，並按存活 provider 篩選。目錄生成器拒絕過期產物；精確查詢避免每次請求都承擔完整 API 宣告的 token 成本。

Host 和 Client runner 保留程式側生命週期和瀏覽器消費者。Host 定義在新的 vm realm 中求值，並接收 context façade：服務存取需要宣告注入，框架內部結構不可見，註冊歸定義的 fiber 所有。工具輸出先回到 Host realm 進行歸一化，再接受驗證。釋放會等待 fiber 所有的 effect。vm 防止意外汙染全域變數；注入的檔案系統、shell 和網路服務仍有真實權限，因此它不是安全邊界。

定義僅存在於程序中。重新啟動和工作階段恢復不會從歷史呼叫重建它們。[Creator 持久化外掛決策](../architecture/2026-09-16-creator-persistent-plugin-management.zh.md)負責 agent 安裝、審批和 profile 持久化。內建模型工具不建立或修改 runner 定義。

## Alternatives considered

**手寫 API 表。** 拒絕，因為它會獨立於服務宣告漂移；生成目錄與新鮮度檢查共享同一原始碼。

**將 vm 視為安全沙箱。** 拒絕，因為 façade 暴露的服務可以存取 Host 的真實資源。受限全域變數改善生命週期正確性，不執行權限控制。

**從工作階段日誌重建定義。** 拒絕，因為重放原始碼會執行歷史副作用。歷史卡片展示持久化原始碼和結果，不恢復執行中的定義。

## Consequences

檢查能力不依賴 Creator 或 Plugin Manager。Runner 生命週期測試覆蓋受保護註冊、啟動失敗清理和等待釋放。現有瀏覽器消費者保留生命週期 API；移除其寫入註冊表與啟用機制，需要協調替換這些消費者，不能刪除歷史渲染或假定工作階段資料會重建執行狀態。
