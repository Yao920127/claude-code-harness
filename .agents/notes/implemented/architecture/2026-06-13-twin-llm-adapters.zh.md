# Agent Note: 以兩個 LLM 介面卡作為設計驗證孿生體

Status: implemented

[English](2026-06-13-twin-llm-adapters.md) | 中文

## 問題

`dsh-llm` 擁有一套提供者無關的流式詞彙：`StreamChunk` 協定（`block-start`、`text-delta`、`reasoning-delta`、`tool-call-delta`、`block-end`、`usage`、`finish`）以及內容塊型別（[內容塊詞彙](2026-06-11-content-block-vocabulary.zh.md)）。如果詞彙僅針對單個介面卡定義，就有可能將該介面卡的特異行為固化到「中立」約定中：唯一實作碰巧做了什麼，什麼就成為事實上的規範；在第二個提供者到來之前，抽象層未經驗證——而屆時修復這種洩漏的代價已經很高。

## 決策

從一開始就針對同一份約定交付**兩個**介面卡，刻意基於不同的內部實作建置：

- `dsh-llm-deepseek`：直接 `fetch` + 儲存庫內翻譯邏輯對接 DeepSeek API；SSE（Server-Sent Events）分幀委託給 `eventsource-parser`（[已歸檔的 SSE 解析器替換](../../archived/simplification/2026-07-26-eventsource-parser-for-deepseek-sse.md)）。孿生身份在於自行持有 fetch/translate 內部實作而非委託給完整的提供者 SDK，不在於手寫傳輸層管道。
- `dsh-llm-pi-ai`：透過 `@earendil-works/pi-ai` 庫存取同一端點（該庫有自己的事件詞彙）。

二者共同執行的規則是：**凡 StreamChunk 詞彙無法為兩個實作同時表達的內容，都是核心詞彙的缺陷**——立即暴露，而非等到下一個提供者接入時才發現。這對孿生介面卡確立了現已記錄在 `dsh-llm/src/types.ts` 中 `StreamChunk` 上的約定：usage 在 finish 之前發出、finish 之後不再有任何事件、工具呼叫的 `arguments` 全程以原始 JSON 字串傳遞，以及消費方必須在兩側都處理的兩條合法錯誤路徑（`stream()` 拋異常，*或者*以 `finish {kind:'error'|'aborted'}` 結束）。這一分歧正是由基於庫的介面卡暴露出來的，單一直接 fetch 介面卡會將其隱藏。

## 曾考慮的替代方案

- **單一介面卡**：程式碼更少、e2e 成本減半，但「提供者無關」的宣告無從驗證；詞彙會默默編碼 DeepSeek-via-fetch 的假設。
- **mock 第二介面卡**：更便宜，但不會觸及真實提供者的協定格式（wire format）怪癖，因此證明力有限。孿生體是真實對真實的驗證。

## 後果

孿生體使介面卡和需要金鑰的 e2e 維護量翻倍——兩者都覆蓋 V4 Flash 和 Pro 在各代表性推理（reasoning）模式下的行為——換來的是持續的 seam 中立性驗證和第二份實作範例。兩個介面卡均使用 `apiKey`、`baseURL` 和 `models`；直接 fetch 介面卡暴露 `thinking`/`reasoningEffort`，pi-ai 介面卡暴露一個 `reasoning` 級別。未來如果有一致性測試套件，可以透過後續 Agent Note 論證退役其中一個介面卡。

[Messages 介面卡](../feature/2026-09-07-deepseek-messages-adapter.zh.md) 在 `llm-deepseek` 內增加 Anthropic 協定實作，並遵守相同的流約定。
