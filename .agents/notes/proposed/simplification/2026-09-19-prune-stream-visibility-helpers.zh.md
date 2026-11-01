# Agent Note: 精簡未使用的流可見性輔助函式

Status: proposed

[English](2026-09-19-prune-stream-visibility-helpers.md) | 中文

## 問題

[緊湊 Assistant 流實作](../../../../packages/llm/llm/src/assistant-stream.ts)匯出五個可見性查詢：`isVisibleChunk`、`chunkHasVisibleText`、`runFirstVisibleTime`、`assistantStreamHasVisibleContent` 和 `assistantStreamHasVisibleText`。儲存庫搜尋未找到這組函式之外的生產呼叫方。其餘消費方是[單元測試](../../../../packages/llm/llm/tests/assistant-stream.spec.ts)、包文件和[記錄讀取器決策](../../implemented/architecture/2026-09-06-embedded-stream-record-readers.zh.md)。包根入口和釋出的 `./assistant-stream` 入口向外部呼叫方暴露這些函式；本次搜尋無法確定外部使用情況。

保留的首 token 讀取器已有 [Session Stats](../../../../packages/session/session-stats/src/projection.ts) 和 [Trajectory](../../../../packages/client/ui-trajectory/src/client/trajectory-assistant-definition.ts) 消費方。它們的計時要求不依賴單獨區分空白文字的可見性分類。

## 提案

移除這五個匯出的可見性查詢及其專用私有輔助函式 `hasNonWhitespace` 和 `blockIsVisible`。這會刪除約 77 行原始碼（含區域性文件），無需新增替代機制。保留所有首 token、原始分片、文字拼接和組裝讀取器，以及累加器和帶驗證的展開操作。保留直接實作和基於庫實作的兩個 LLM（大語言模型）介面卡及其擴充功能 API。

移除專門的可見性測試；混合讀取器測試只刪除過時斷言。保留驗證首 token 計時、提前退出、原始分片、文字拼接和組裝等價性的混合 fixture（測試前置資料）與斷言。

記錄讀取器決策只被部分替代：其分配開銷方面的理由和仍被使用的讀取器繼續有效。實施本提案時，更新該現行說明、[包 README](../../../../packages/llm/llm/README.zh.md) 和 [LLM 子系統頁面](../../../../docs/subsystems/llm-streaming.zh.md)及其雙語對側。新增本提案時不刪除所屬說明，也不修改歸檔記錄。

## 備選方案

**為外部消費方保留完整的讀取器組。** 這能保留方便且經過測試的可見性查詢，但也會在缺少已確認儲存庫消費方的情況下保留公共函式和專門測試。明確的外部需求可以成為保留或重新引入它們的理由。

**用流展開替代可見性查詢。** 目前沒有需要遷移的生產呼叫方。新增替代實作會繼續保留未使用的 API，並引入記錄讀取器原本避免的分配開銷。

## 驗收標準

- 原始碼匯出和現行 API 文件中不再包含這五個名稱；生產呼叫方不新增展開操作或替代可見性查詢。
- 針對流讀取器、Session Stats 和 Trajectory 計時的檢查透過；混合測試保留無關斷言。
- 型別檢查、受影響釋出入口的建置和文件檢查透過。Session 格式、模型輸入、transcript（文字記錄）內容和首 token 計時保持不變。

## 風險

這會有意收縮匯出的穩定前 API。即使儲存庫中沒有消費方，外部匯入仍可能失效。實施前重新核對消費方證據，並明確評估發現的外部需求；不得宣稱整個生態均未使用這些函式。
