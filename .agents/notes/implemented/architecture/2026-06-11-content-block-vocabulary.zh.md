# Agent Note: 由 dsh-llm 擁有的提供者無關內容塊詞彙

Status: implemented

[English](2026-06-11-content-block-vocabulary.md) | 中文

## 問題

harness 需要一套統一的內部訊息語言，供 agent loop（智慧代理迴圈）、工作階段日誌和所有外掛共同使用。

## 決策

自主擁有詞彙：user、assistant 與 system 訊息是型別化內容塊的陣列（`text`、`reasoning`、`tool-call`），其聯合型別派生自可合併擴充功能的 `ContentBlockMap`，外掛透過宣告合併新增新的塊型別。Tool result 是一等 tool-role message，結果塊屬於該 message 自己的 content；已釋出的 Session format v3 仍將歷史 `tool-result` content block 儲存在 user-role 包裝中，鄰接的 V3 到 V4 邊會將該包裝提升為一等角色。同一可合併擴充功能對映模式為所有「字串化」欄位提供型別（`MessageSource`、`FinishReason`、`TurnTrigger`、`TurnEndReason`）。流式輸出採用原始分片協定；`BlockAssembler` 是唯一的共享組裝實作。介面卡負責轉換為提供者的協定格式（wire format）——對映成本留在介面卡中，正是它該在的地方。

工作階段內上下文注入（`context/message`）和輪次中途 steering（中途引導）最初渲染為帶標籤的 user-role 信封（system-reminder 模式），而非引入新角色，因此介面卡無需承擔額外負擔。如今兩者都投影為無包裝的普通使用者內容；見[注入內容信封 Agent Note](../simplification/2026-07-20-unwrap-injected-content-envelopes.zh.md)。實際介面卡驗證已確認此渲染方式符合目前 DeepSeek 的行為；如果未來某提供者出現不相容，應在該介面卡內處理，而非引入新的規範角色。

## 曾考慮的替代方案

- **映像 DeepSeek/OpenAI chat-completions 結構**：對第一個提供者零對映成本，但對富內容（推理、結構化塊形式的工具結果）處理不便。
- **原樣採用 Anthropic Messages 塊結構**：經過實戰檢驗，但規範型別將映像一個 harness 並非首要對接的第三方 API。

## 後果

- 推理（reasoning）在核心層有了歸屬，無需依賴提供者特有的結構。
- 多模態塊只有在介面卡、UI 和上下文壓縮（context compaction）三方協同支援後才會迴歸；見 [drop-image Agent Note](../../archived/simplification/2026-07-04-drop-image-content-block.md)。
- 快取提示與 assistant prefill 在有實際介面卡能兌現之前保持缺席；見[無生產者的詞彙變體](../../archived/simplification/2026-07-04-prune-producerless-vocabulary-variants.md)與[無端到端可用路徑的請求旋鈕](../../archived/simplification/2026-07-04-drop-inert-request-knobs.md) Agent Note。
- 每個介面卡都需承擔翻譯成本；首批真實介面卡已驗證了流式輸出協定，新介面卡應繼續在介面卡本地測試中驗證其提供者特有的對映。
- 跨包邊界的 ID 使用品牌型別（`ToolCallId`、agent 與工作階段共享的 `SessionId`）——零執行時開銷的名義型別。
