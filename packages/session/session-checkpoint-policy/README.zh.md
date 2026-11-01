---
description: "面向使用者與維護者的語義工作階段永續性檢查點說明，用於部署不會在崩潰時丟失模型請求或工具副作用的持久化 agent（智慧代理）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-checkpoint-policy

[English](README.md) | 中文

## 概述

將本包與工作階段持久化後端配合使用，可在模型請求之前、頂層工具可能產生外部副作用之前以及下一 agent 步驟開始之前持久記錄工作。每個檢查點之後，即使發生崩潰，系統也能從已儲存的請求、工具呼叫、回應與結果恢復工作，而不會丟失這些工作。檢查點失敗按失敗即阻止原則處理：持久寫入成功前，模型介面卡或頂層工具正文不會執行。本包沒有設定，也不新增提示詞或工具 schema；未完成的 Assistant 流保持瞬態，而中斷的工具呼叫會以未知結果恢復，不會自動重試。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在持久化工作階段、且必須在崩潰時不重做或丟失工作的任何組合中掛載本外掛。持久化與檢查點排程是獨立外掛：後端儲存事件日誌，本策略決定何時必須重新整理儲存。

### 何時選擇

為每個可能被中斷的持久化 agent 選擇它——已記錄工具呼叫與其結果之間、或模型請求與其回應之間的崩潰，正是本策略遏制的那類故障。不帶它載入後端是有效的但更弱：仍位於後端批處理視窗內或尚未完成的寫入可能丟失。當沒有任何元件持久化工作階段，或專用部署刻意替換檢查點排程時，跳過本策略。

### 最小設定

不存在設定欄位；外掛只需與一個持久化後端一起載入：

```yaml
- id: session-persistence
  name: '@deepseek-ai/dsh-session-persistence-jsonl'

- id: session-checkpoints
  name: '@deepseek-ai/dsh-session-checkpoint-policy'
```

### 什麼會變得持久

三個屏障會被檢查點化。模型請求在介面卡流建構前被重新整理，因此回應前的崩潰不會重放未持久化的請求。頂層工具呼叫在工具正文執行前被重新整理，因此已記錄呼叫在任何外部副作用前已持久；巢狀工具分派複用外層呼叫的檢查點。在每個 `agent/pre-step` 邊界，前一步驟提交的一切——其回應與有序工具結果——在派生下一個請求前被重新整理。

### 可觀察行為與失敗

檢查點之後，被檢查點化的工作即已持久：恢復像任何持久化工作階段一樣從儲存還原它。如果取消在工具檢查點 flush 等待期間到達，包裝層會返回規範的 `ABORTED_BEFORE_DISPATCH` 結果，絕不進入工具正文。檢查點拒絕在兩個邊界都按失敗即阻止處理——介面卡或頂層工具正文不執行——步驟邊界的拒絕會在另一個請求開始前使輪次失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節說明該策略如何接入 loop 與持久化 seam；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計理念

該外掛只是對三個 seam 的純監聽組合，自身沒有狀態：它包裝 `llm/stream`，使下游流只在活動工作階段中緩衝的請求事件已持久後建構；在預執行策略與防護之後包裝 `tools/execute`，使頂層工具正文只在已記錄呼叫已持久後執行；並監聽 `agent/pre-step`，在派生請求前持久化前一回應/結果批次。工作階段儲存的 flush 是共享永續性屏障；並行工具檢查點經它序列化，不會產生重複序列號。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`apply` 安裝三個檢查點監聽器 |
| — | 不釋出執行時不變式伴生入口；順序由被攔截的 seam 強制。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從永續性模型逐步進入它所加入的 seam 與隨產品交付的後端。

- [工作階段持久化子系統](../../../docs/subsystems/persistence.zh.md)——每個後端共享的 flush 檢查點、批處理視窗與崩潰恢復。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。
- [工作階段持久化 seam](../session-persistence/README.zh.md)——本策略經由其重新整理的 `ctx.sessionPersistence` 服務。
- [JSONL 持久化後端](../session-persistence-jsonl/README.zh.md)——本策略通常與之一起載入的隨產品交付後端。

-----

<a id="model-experience"></a>
## 模型體驗

### 中斷呼叫

#### 模型看到什麼

外掛不新增提示詞或工具 schema。工具檢查點後、結果前的硬崩潰會留下持久的未匹配呼叫；工作階段恢復提供由 `dsh-session` 負責的模型可見 `TOOL_OUTCOME_UNKNOWN` 結果。該訊息允許重試只讀或冪等工作，並要求對可能有副作用的呼叫驗證狀態或請求使用者確認。

#### Token 影響

成功檢查點不新增 token，也不改變請求。恢復會新增一條短工具結果訊息，以平衡中斷的 transcript（文字記錄）。

#### KV Cache 影響

修復結果追加在可重用字首之後，因此不會使較早的快取條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定本策略永續性保證的終點。它們是目前包約束，不是任務積壓。

- **持久記錄執行意圖，而非恰好一次副作用**——策略記錄的是呼叫已分派，而非其外部副作用已完成。當提供者支援時，有副作用的工具應將 `exec.callId` 作為冪等鍵轉發。
- **活躍模型 attempt 內沒有檢查點**——硬崩潰可能丟失尚未進入持久 `assistant/message` 或 `assistant/attempt` settlement 的瞬態 Assistant frame。
- **記錄未知結果，而非自動重試**——沒有結果的持久呼叫無法證明其外部副作用是否完成，因此恢復記錄未知結果，而不是自動重試。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
