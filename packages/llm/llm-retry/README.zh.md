---
description: "面向使用者與維護者的重試執行器說明：在持久 agent（智慧代理）步驟邊界上設定按提供者路由的模型請求恢復。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-retry

[English](README.md) | 中文

## 概述

掛載 `@deepseek-ai/dsh-llm-retry`，可在持久 agent 步驟邊界重試失敗的模型請求。提供者的 `retryPolicy` 設定可選擇有界的 normal mode 重試或無上限的 always mode 重試；計劃的嘗試會在退避前寫入工作階段日誌，取消後歷史仍保持一致。重試會在同一個開啟的輪次內重跑失敗步驟，而直接 `ctx.llm.stream()` 呼叫仍只嘗試一次。每次重試都會產生另一次提供者請求計費，always mode 會持續到成功、取消或釋放。

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

當 agent 執行應從暫時性模型請求失敗——速率限制、伺服器端錯誤、超時、傳輸錯誤——中恢復而不是結束輪次時，掛載本外掛。它是執行器：重試策略本身位於各提供者介面卡的設定上，本包沒有任何自己的設定。

### 何時選擇

當組合執行 agent loop（智慧代理迴圈）並需要持久請求恢復時選擇它。本外掛是無設定的函式外掛；`dsh-llm-deepseek` 與 `dsh-llm-pi-ai` 等提供者介面卡擁有各自路由的 `retryPolicy`，多提供者介面卡把它放進每個 provider profile。當呼叫不經 agent loop、直接走 `ctx.llm.stream()` 時跳過它：這些消費方仍是單次嘗試，因為原始流無法持久地區分已發出的分片。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    retryPolicy:
      mode: always
      backoff:
        initialDelayMs: 1000
        maxDelayMs: 30000
        jitterRatio: 0.2

- name: '@deepseek-ai/dsh-llm-retry'
```

省略 `retryPolicy` 時使用 normal mode：對 `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT` 與 `TRANSPORT` 最多重試五次，退避從 500 毫秒到 10 秒、帶 10% 抖動。normal mode 可以更改其有界預算、合格 code 與退避；always mode 先詢問下游恢復，然後無嘗試上限地重試每個模型請求失敗，只在成功、取消或外掛釋放時停止。

### 你可以觀察到什麼

每次計劃的重試在等待前就是持久的：外掛會先追加攜帶重試 id、提供者、模式、策略鍵、失敗與計劃延遲的非表層 `llm/retry` 事件，然後在重試開始前立即追加 `llm/retry-started` 事件。提供者給出且符合策略邊界的有效 `Retry-After` 會替換本地退避。等待完成後，loop 會在同一個開啟的輪次內重跑失敗步驟，仍基於同一份持久歷史，因此重試請求與原始請求一樣可以從工作階段日誌重建。取消或外掛釋放會中止進行中的退避、等待活躍的委派恢復結算，並使釋放前捕捉的回呼只能以失敗結束。

### 失敗與恢復

在任何最終介面卡被選中之前發生的失敗沒有提供者策略，原樣委派下游。normal mode 中，不在合格集合內的失敗 code 或已耗盡的預算會委派；always mode 中，超上限的提供者延遲使用設定的本地退避，因此策略不會因該指令終止。這裡沒有任何模型可見內容：重試事件、延遲、提供者錯誤或失敗的部分輸出都不會到達模型或派生訊息。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋執行器背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

執行器建立在一條規定之上：**先持久、後等待，開啟步驟邊界。** 任何定時器啟動之前，重試就已透過工作階段日誌計劃，因此崩潰或取消永遠不會留下不可見的待處理重試。恢復執行在 agent loop 的 `agent/request-error` waterfall（瀑布式事件），即開啟步驟擴充功能點上，而不是包裝 `ctx.llm.stream()`——原始流無法持久地區分已發出的分片，而 loop 可以在同一個開啟的輪次內重跑失敗步驟。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 函式外掛：waterfall 監聽器、策略查詢、退避、持久事件追加 |
| [`src/history.ts`](src/history.ts) | 從工作階段日誌查詢持久重試歷史 |
| [`src/types.ts`](src/types.ts) | 瀏覽器安全的 `llm/retry` 與 `llm/retry-started` 事件載荷型別 |
| [`src/brand.ts`](src/brand.ts) | 事件載荷共享的 `RetryId` 品牌 |

### 恢復流程

失敗步驟連同其提供者與解析後的策略一起到達 waterfall。always mode 先結算下游恢復，並遵循下游的 `retry` 決定；normal mode 先檢查失敗 code 是否合格、預算是否未耗盡。外掛計算延遲——有效且在邊界內的提供者 `Retry-After`，否則帶對稱抖動的本地有界指數退避——追加 `llm/retry` 事件，在可取消定時器上等待，追加 `llm/retry-started`，然後返回 `{ kind: 'retry' }`。loop 隨後在同一個開啟的輪次內重跑失敗步驟（仍基於同一份持久歷史）。

### Waterfall 組合

本外掛是 `agent/request-error` waterfall 中的一個監聽器。always mode 的"下游優先"姿態意味著，之後忽略取消且永不結算的策略也會阻止退回、輪次完全停穩與外掛釋放完成；成功、取消或釋放會在活動委派恢復達到完全停穩後停止 always mode。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從服務約定逐步進入擁有重試策略的介面卡。

- [dsh-llm 服務](../llm/README.zh.md)——其介面卡擁有 `retryPolicy` 的提供者無關服務。
- [llm-deepseek 介面卡](../llm-deepseek/README.zh.md)——帶路由級 `retryPolicy` 的提供者介面卡。
- [llm-pi-ai 介面卡](../llm-pi-ai/README.zh.md)——帶逐 profile `retryPolicy` 的多提供者介面卡。
- [LLM 流終止失敗](../../../.agents/notes/implemented/architecture/2026-07-29-terminal-llm-stream-failures.zh.md)——失敗如何以終止分片到達服務邊界。
- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——`StreamChunk` 協定與介面卡約定（adapter contract）。

-----

<a id="model-experience"></a>
## 模型體驗

### 模型請求恢復

#### 模型看到什麼

重試事件、延遲、提供者錯誤或失敗的部分輸出都不會對模型可見。除非下游恢復策略刻意改變該表層，重試步驟會從持久表層歷史中重建相同的顯式提供者／模型請求；失敗分片絕不進入派生訊息。

#### Token 影響

每次重試都是一次新的提供者請求，可能重複輸入 token 計費。normal mode 有有界預算；always mode 在成功或取消前可能消耗無上限請求。`llm/retry` 本身不貢獻任何 token。

#### KV Cache 影響

重建的請求保留此前字首，有資格按該提供者規則複用提供者快取。非表層重試事件不改變快取標識。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明執行器在哪裡停止、由未來工作接續。它們是目前包約束，不是通用重試對比或任務積壓。

- **agent 輪次是唯一重試邊界**——直接 `ctx.llm.stream()` 消費方仍是單次嘗試，因為原始流無法持久地區分已發出的分片。
- **always mode 會重試永久性失敗**——認證、配額、無效請求、協定與不可恢復的上下文錯誤會持續到成功、取消或釋放；部署方負責提供者專屬的成本與延遲控制。
- **有界外掛預算相加**——normal mode 只統計其設定的 code 與精確提供者策略，而上下文溢位壓縮（compaction）擁有獨立預算。任何重疊策略都必須定義註冊順序行為。
- **恢復策略按 waterfall 順序組合**——always mode 先接受下游重試，再應用其退回。之後忽略取消且永不結算的策略也會阻止退回、輪次完全停穩與外掛釋放完成。
- **`llm/retry` 記錄排程，而非完成**——後續步驟與輪次事件才確立成功、耗盡或取消。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是不具權威性的工作上下文：維護者備註與開放問題。已交付的行為與既定理由以上文、包程式碼和相關 Agent Note 為準。

- 重試編號只在同一提供者與完整策略鍵的事件間延續，因此限額、code 成員或退避不同的路由替換會開啟自己的歷史；該鍵包含每個影響行為的欄位，並因資格判斷使用集合成員而對 normal mode code 排序。
- 單獨釋出的 `./invariant` 伴生外掛會對照工作階段日誌驗證每次計劃的重試——點名目前開啟輪次與最新閉合步驟、匹配失敗請求的持久提供者，並要求每個 `llm/retry-started` 事件點名一次帶相同重試 id、輪次、步驟與重試編號的先前計劃嘗試。

</details>
