# Agent Note: 刪除 Python SDK 未使用的反向 RPC

Status: proposed

[English](2026-09-19-python-sdk-directional-client.md) | 中文

## 問題

[Python 用戶端](../../../../python/sdk/src/deepseek_harness/client.py) 維護入站請求佇列、關閉時的喚醒，以及 `next_request`、`respond`、`respond_error` 和 `notify` 方法。[SDK 伺服器端](../../../../packages/sdk/server/src/server.ts) 接收請求併傳送通知，沒有定義伺服器端主動發起的請求或用戶端通知處理器。搜尋 Python 原始碼、範例和執行時 profile 後，僅在用戶端實作和[合成用戶端測試](../../../../python/sdk/tests/test_client.py) 中發現反向通訊。因此，匯出的 `IncomingRequest` 模型沒有受支援執行時的生產方。

這是[定向 JSON-RPC 提案](../../rejected/simplification/2026-07-19-make-jsonrpc-directional.zh.md) 的縮小範圍續案；該提案的否決原因明確允許單獨重提傳輸收縮。其完成語義重設計仍被否決。它對共享 TypeScript 傳輸的判斷已不適用：[Codex wire 介面卡](../../../../packages/subagent/subagent-codex/src/wire.ts) 在兩個方向上都使用請求和通知。

## 提案

從用戶端、模型和匯出中刪除四個 Python 方法、`_requests` 和 `IncomingRequest`。在匹配回應前，保留對同時含有 `id` 和 `method` 的意外幀的顯式保護，避免伺服器端請求完成無關的待處理用戶端請求。保持用戶端請求、回應驗證、入站通知訂閱和關閉行為。

刪除專門的合成反向請求測試。僅為觸發 fixture（測試前置資料）行為而傳送用戶端通知的測試改用請求和回應，同時保留過濾器異常與並行寫入斷言。該變更刪除一個佇列及其生命週期、四個公共方法、一個公共模型和約三十多行原始碼，不增加替代傳輸實作。

## 考慮過的替代方案

**保留通用 Python 對等端供外部外掛使用。** 自定義執行時可能使用這些方法，但沒有 SDK 方法規定其請求所有權、取消或交付協定。提案接受這一穩定前 API 損失；未來雙向 SDK 功能必須提供實際的方法與生命週期要求。

**同時收縮共享 TypeScript 傳輸。** 否決，因為 Codex 介面卡是目前雙向消費方。共享實作及其測試保留。

## 驗收標準

- Python 原始碼和範例不再包含反向 API 或請求佇列；文件和匯出描述保留的用戶端角色。
- 複用待處理用戶端 id 的意外伺服器端請求不能完成其等待方。通知過濾、同級交付、末尾排空、錯誤幀處理、序列寫入和關閉仍透過現有測試。
- 提交提示仍返回持久化入隊回執；不引入單條提示的完成承諾或基於回應的輪次結果。
- 執行 Python 用戶端測試、已安裝執行時的 SDK 冒煙與快照檢查，以及文件和 lint 檢查。保留 TypeScript 傳輸和已釋出 Session fixture。

## 風險

使用自定義執行時外掛的外部 Python 呼叫方會失去這些方法。忽略不支援的請求無法滿足假想伺服器端的回應期待；這是有意撤回該方向，而非保持協定等價。如果受支援的伺服器端主動請求方法先於實作落實，需要重新評估提案。
