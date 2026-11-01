# Agent Note: 模型相對工作階段引用預算

Status: implemented

[English](2026-09-05-session-reference-model-budget.md) | 中文

## Problem

固定的 64 KiB 引用預算會在大上下文模型上丟棄有用的來源上下文。目標工作階段頭描述上一次請求，而 agent options 為路由提供初始值；兩者都不一定標識目前進入步驟所選的模型。

## Decision

[Session-reference](../../../../packages/context/session-reference/README.zh.md) 透過本地 prepend 監聽器觀察已完成的 `system-prompt/assemble` 瀑布，並把 provider/model 對存入以 Agent 為鍵的 WeakMap。準備階段透過可選 LLM 服務解析該路由；首次組裝前直接準備則使用 agent options。不帶 Agent 的診斷不會更新對映。

每個來源獲得 `max(65536, floor(contextWindow × 4 × referenceContextFraction))` 位元組，預設比例為 `0.2`。每個 token 四位元組是容量估算。顯式 `maxReferenceBytes` 跳過模型查詢並保持精確值。缺少路由、服務、介面卡或容量時保留下限；其他查詢失敗和取消會傳播。缺少介面卡不妨礙流中介軟體處理該路由。

## Alternatives considered

**每步讀取工作階段頭或 options。** 即時切換後，兩者都可能選中舊模型。完成的組裝公開模型選擇所捕捉的路由。

**在 pre-step 中重新組裝或重新分派請求路由。** 這些操作會重複外掛效果，並可能捕捉不同的選擇。本地觀察器不需要修改迴圈或增加公共路由 API。

## Consequences

預算隨模型容量增長，不改變投影、保留或預覽策略。它仍按來源計算，而不是聚合 token 預留。監聽器由 effect 持有並可釋放；對映不會保留 agent。聚焦測試覆蓋下限、比例換算、顯式覆蓋、即時選擇、中繼資料缺失、取消、查詢錯誤與監聽器移除。
