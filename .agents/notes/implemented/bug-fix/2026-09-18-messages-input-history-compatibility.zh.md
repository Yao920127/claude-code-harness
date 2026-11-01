# Agent Note: 回放 Messages 使用者輸入中的助手塊

Status: implemented

[English](2026-09-18-messages-input-history-compatibility.md) | 中文

## 問題

已儲存的子 Agent 結算通知可能在父級使用者訊息中包含子級推理和工具呼叫。Chat Completions 與 pi-ai 會在使用者輸入中省略這些塊，而 Messages 拒絕它們會阻斷包含相同歷史的所有後續請求。[僅生成文字的結算通知生產方](../feature/2026-08-06-manager-owned-subagent-settlement-delivery.zh.md)可以避免新通知攜帶這些塊，但無法修復已經記錄的訊息。

## 決策

[Messages 序列化器](../../../../packages/llm/llm-deepseek/src/serialize.ts)省略使用者與工具結果輸入中的 `reasoning` 和 `tool-call` 塊。這兩類塊的處理與 Chat Completions、pi-ai 一致，不改變 Session 記錄，也不把子級推理轉換成父級使用者文字。[提供者 README](../../../../packages/llm/llm-deepseek/README.zh.md#model-experience)統一說明輸入規則，包括空使用者訊息、空工具結果，以及對其他不支援塊的拒絕。

這部分取代了結算決策對序列化器容錯的拒絕，以及 [Messages 介面卡決策](../feature/2026-09-07-deepseek-messages-adapter.zh.md)中的輸入拒絕規則。通知建置仍為每種父級提供者投影子級的非空文字。子級的規範輸出以及普通助手推理和工具呼叫仍可供現有消費者使用。省略依據是輸入角色和塊型別，而不是通知來源或建立日期，因此也適用於新提供的使用者和工具結果內容。

## 考慮過的替代方案

**只修復生產方。** 新通知可以表示，但已儲存的通知仍會阻斷協定切換和工作階段續接。

**改寫 Session 歷史或把推理壓平為使用者文字。** 改寫會移除原始證據；壓平會把子級推理作為父級輸入傳送。只在請求中省略可以保留持久化記錄和現有輸入語義。

**忽略所有不支援的塊。** 此處沒有定義未知外掛內容的 Messages 表示方式。相容兩種已知助手塊型別並不意味著其他型別也有對應表示。

**把 system 更新移到更早保留的使用者輪次。** 對應使用者輸入被省略時，將更新移到更早的 assistant 之前，會改變它在對話中的位置，並改寫已傳送的字首。保留明確記錄的[歷史內更新限制](../../../../packages/llm/llm-deepseek/README.zh.md#known-limitations-and-deferred-work)，不編造使用者訊息或移動更新位置。

## 後果

保留文字的已儲存通知可以透過 Messages 繼續工作階段。提供者不再將這兩種塊型別診斷為使用者輸入生產方錯誤；結算通知生產方仍負責僅生成文字通知。這不保證提供者輸入無損，也不保證相容所有歷史訊息序列。

驗證覆蓋使用者與工具結果過濾、持久化內容不變、HTTP 續接，以及 [headless Session 回放](../../../../snapshots/session/deepseek-messages-input-history/snapshot.yml)。序列化測試固定了歷史內更新在對應使用者輸入被完全省略時的拒絕行為，覆蓋下一個 assistant 之前和請求結束兩種位置；文字或工具結果保留對應輪次時則可以透過。
