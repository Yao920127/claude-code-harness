# Agent Note: 工作階段寫控制代碼佔用回饋

Status: implemented

[English](2026-09-16-session-writer-held-feedback.md) | 中文

## Problem

Agent 空閒時，Session 仍可能持有寫控制代碼。另一個 Host 無法恢復該工作階段，但通用內部錯誤 toast 沒有提供恢復指引。持有者也可能屬於同一個程序，因此僅憑佔用不能確定是另一個正在執行的應用。

## Decision

當恢復因 `SessionAlreadyOwnedError` 失敗且不存在可複用 Agent 時，Session Controller 返回 `session/writer-held`，攜帶 `{ sessionId }`。Client 遵循 [Remote 失敗詞彙](../architecture/2026-08-28-ctx-remote-failure-vocabulary.zh.md)，按 code 判別。Controller 按 Error 名稱識別持久化錯誤，與 Session Query 的可選依賴處理一致；載入 Controller 不需要持久化實作或錯誤類身份相同。

傳送和模型選擇失敗顯示在地化指引，說明可能有其他 DSH 實例佔用 Session，並建議退出其他實例後重試。模型選擇將原始 Remote 結果返回給兩個 UI 入口；錯誤分類不依賴稍後讀取共享目錄狀態。[寫租約決策](../feature/2026-08-31-cross-process-session-write-lease.zh.md) 繼續擁有鎖定和釋放語義；此回饋既不搶佔寫權限，也不自動重試寫入。

## Alternatives considered

**在 `session/agent-busy` 下使用自由文字 reason。** 第二個字串判別值失去 code 與 details 的型別關係，並將寫佔用與提示詞接納失敗混在一起。

**單獨的目錄標誌或必需的持久化 peer。** 標誌重複記錄操作失敗，且可能在目錄重新整理後過時。僅為識別錯誤而強制依賴持久化，會移除對無持久化部署的支援。

## Consequences

Wire 新增一個有型別的失敗碼，不改變已儲存的 Session 資料。恢復指引無法確定哪個程序持有控制代碼。Host 測試覆蓋錯誤名稱，以及有、無持久化時的普通失敗；Client 測試覆蓋兩種語言和隨模型操作返回的失敗。無金鑰的 `queue-actions` Web 情境透過隨附組合固定寫佔用 toast 和保留草稿的輸出。`verify-optional-dependency-imports` 防止可選依賴的值匯入破壞模組載入。
