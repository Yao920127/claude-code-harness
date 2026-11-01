# Agent Note: pi-ai 升級相容性

Status: implemented

[English](2026-09-05-pi-ai-upgrade-compatibility.md) | 中文

## Problem

pi-ai 介面卡顯式分類上游相容欄位，並且只持久化後續請求需要的回放中繼資料。SDK 升級可能在不改變 Harness 提供者無關 API 的情況下為任一集合新增欄位。未分類的設定欄位會導致編譯失敗；遺漏回放中繼資料則可能靜默改變後續提供者請求。

## Decision

介面卡遵循 [pi-ai 0.85.1](https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/CHANGELOG.md)。`thinkingTokenBudgetField`、`vllmPriority` 和 `supportsMaxOutputTokens` 是顯式啟用的閘道控制；`thinking.budget` 加入現有範本預留位置。SDK 擁有預算解析和序列化。`supportsMidConvoEffort` 和 `allowedFallbackModels` 仍由目錄擁有，因為其正確性依賴確切的 Anthropic 傳輸、模型能力和退回定價。

可選的 `providerThinkingLevel` 儲存在介面卡 replay-v2 回應中繼資料中，讓 Anthropic 歷史保留提供者原生 effort。缺失仍然有效；回放版本與已釋出 Session 格式均不改變。回放來源保留請求模型，`responseModel` 則保留 Anthropic 別名解析或退回後的模型。重建會恢復該原生模型，讓 pi-ai 繼續應用其跨模型簽名規則。提供者無關的 LLM API 保持不變；[按提供者路由的回放歸屬規則](../architecture/2026-07-14-provider-routed-llm-adapters.zh.md) 仍然適用。0.84.2 Anthropic 介面卡[從請求初始化 `model`](https://github.com/earendil-works/pi/blob/v0.84.2/packages/ai/src/api/anthropic-messages.ts#L510-L515)，並且[在訊息開始時只記錄回應 ID 和用量](https://github.com/earendil-works/pi/blob/v0.84.2/packages/ai/src/api/anthropic-messages.ts#L589-L605)。它從不寫入 `responseModel`，因此其回放記錄保留請求模型，不攜帶原生模型中繼資料。

## Alternatives considered

**保留所有新增欄位為不可設定。** 這會把部署擁有的閘道控制誤分類為目錄事實：上游明確不在生成目錄中設定預算欄位選擇和 vLLM 優先順序。

**開放所有新增欄位。** 這會允許任意閘道在缺少目錄證據時宣告支援模型專屬的 Anthropic effort 與退回能力，而這些證據正是相關功能有效的依據。

## Consequences

編譯期覆蓋保留顯式欄位分類。[相容性測試](../../../../packages/llm/llm-pi-ai/tests/compat-upgrade.spec.ts) 覆蓋 schema 接受、無效值、協定適用範圍及物化，且不改變預設值。[回放轉換測試](../../../../packages/llm/llm-pi-ai/tests/convert.spec.ts) 覆蓋可選 effort 的保留。混合協定目錄測試使用已安裝的 OpenCode 目錄。提供者行為仍由上游擁有；真實提供者驗證與無需金鑰的介面卡測試分開。
