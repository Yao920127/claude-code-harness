# Agent Note: 透過 Messages 回放非法歷史工具輸入

Status: implemented

[English](2026-09-16-messages-historical-tool-input.md) | 中文

## 問題

Chat Completions 將工具參數保留為字串，其中可能包含失敗呼叫產生的非法 JSON。將這段歷史切換到 Messages 時，每個 `tool_use.input` 都必須是物件。拒絕一條歷史參數就會阻斷包含它的所有後續請求，即使工具重試已經成功；包含同一呼叫的摘要請求也會失敗。

## 決策

[Messages 序列化器](../../../../packages/llm/llm-deepseek/src/serialize.ts) 遵循 [pi-ai 歷史轉換](../../../../packages/llm/llm-pi-ai/src/replay.ts)的做法：只在發出的歷史工具輸入中，將非法 JSON 和非物件值替換為 `{}`。呼叫 ID、名稱、結果和原始 Session 記錄保持不變。原生回放中繼資料有效、缺失或不可用時均採用此規則，也不會重新執行歷史呼叫。

這取代了 [Messages 介面卡決策](../feature/2026-09-07-deepseek-messages-adapter.zh.md)中的歷史參數拒絕規則。新生成的 Messages 回應在成功完成前仍要求工具參數是有效物件；達到輸出上限時仍按現有規則裁剪。不改變 Session 事件、持久化型別或協定設定。

## 考慮過的替代方案

**拒絕非法歷史。** 失敗呼叫可以繼續作為相關證據保留，而不必阻斷所有後續模型請求。

**修復或覆蓋已存參數。** 猜測缺失的引號或保留部分解析結果可能改變請求的操作。只在請求中使用空輸入可以保留原始證據，也不需要遷移。

**刪除呼叫。** 對應結果仍引用呼叫 ID；同時保留呼叫和結果，可以保留工具互動而不編造參數。

## 後果

Messages 可以在省略不可用歷史參數的同時繼續工作階段，並保留呼叫身份和結果。模型看到的是 `{}`，而不是原始非法文字；該後備與 pi-ai 一樣不產生診斷。原始參數仍可在 Session 日誌中查閱；這不保證提供者輸入無損，也不修復新生成的非法呼叫。

驗證覆蓋僅接受物件的轉換、失敗結果後的使用者輸入、JSON 往返、有效與降級的回放中繼資料、透過已釋出 headless profile 和真實 Messages 序列化器執行的[錄製 Session](../../../../snapshots/session/deepseek-messages-invalid-tool-history/snapshot.yml)，以及需要憑證的真實 Messages 續接。
