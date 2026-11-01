---
description: "面向快照測試的無金鑰 LLM（大語言模型）回放外掛，供測試作者針對已記錄模型 transcript（文字記錄）啟動真實 agent（智慧代理）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-replay

[English](README.md) | 中文

## 概述

`dsh-llm-replay` 從已記錄的 Session JSONL fixture（測試前置資料）回放模型流，讓快照測試無需 API 金鑰即可執行真實 agent。每個 parent 與 subagent 工作階段按首次呼叫順序取得各自的已記錄腳本，而同一工作階段內的呼叫會獨立推進。`replay.override.json` 伴隨檔案表示持久 settlement 無法重建的分片前失敗、取消、掛起與注入重試。需要以固定模型輸出確定性測試真實 loop 行為時，可在 ACP（Agent Client Protocol）、headless 與 Web 瀏覽器情境中使用本包。

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

本包讓無金鑰測試擁有帶固定模型 transcript 的真實 agent：把它掛載到真實 LLM 介面卡的位置，指向已記錄的 fixture，然後就像模型真的產生了已記錄輸出那樣執行情境。

### 掛載它

設定 `providers` 後，外掛會註冊僅用於回放的介面卡，其模型目錄可供測試模型發現功能的情境使用；未設定 `providers` 時，它安裝無需模型發現功能的測試所用的 catch-all `llm/stream` waterfall（瀑布式事件）：

```yaml
- id: llm-replay
  name: '@deepseek-ai/dsh-llm-replay'
  config:
    providers:
      - id: deepseek-official
        name: DeepSeek
        retryPolicy:
          mode: normal
          backoff:
            initialDelayMs: 1
            maxDelayMs: 1
            jitterRatio: 0
        models:
          - id: deepseek-v4-flash
            contextWindow: 128000
          - id: deepseek-v4-pro
  # file/overrideFile/childFiles default to $DSH_SNAPSHOT_FILE /
  # $DSH_SNAPSHOT_OVERRIDE / $DSH_SNAPSHOT_CHILD_FILES, set by the snapshot
  # harness per scenario.
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `file` | `$DSH_SNAPSHOT_FILE` | 選定 primary fixture 路徑：v0 為 `session.jsonl`，正 generation 為 `session.vN.jsonl`；必需（config 或 env） |
| `overrideFile` | `$DSH_SNAPSHOT_OVERRIDE` | 主工作階段的可選 `ReplayOverrideDoc` 伴隨檔案 |
| `childFiles` | `$DSH_SNAPSHOT_CHILD_FILES` | 巢狀情境中已記錄的 subagent 子工作階段日誌 |
| `providers` | 無 | 可選的僅回放提供者與模型目錄；模型可宣告 `contextWindow`、文字／圖片模態、圖片模型使用的正整數 `imageRequestTokens`，以及讓無金鑰情境演練歷史內系統提示詞替換的 `systemPromptUpdate: in-history`；非法值會在載入時失敗（`llm-replay: provider "…" model "…" systemPromptUpdate must be "in-history" when present`），路由絕不執行提供者 I/O |
| `paceMs` | 無（突發） | 可選的每分片延遲（毫秒），用於真正的增量投遞 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-replay)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### fixture 的工作方式

fixture 是執行一次真實 agent 所產生的一份選定持久化 Session generation 投影，本外掛不錄製。快照 harness 會提供數值最高的規範 parent 路徑（v0 為 `<scenario>/session.jsonl`，正 generation 為 `<scenario>/session.vN.jsonl`），並在回放前驗證檔名與 header 一致。fixture 保留 header 與每個事件 payload，但省略正文的 `seq`/`time` envelope（歷史 packed row 使用 `seq0`/`time0`）。回放會補充連續序號與確定性時間戳，恢復被快照 token 替換的型別化值，拒絕不完整或混合 envelope，透過建置期靜態 Session 格式 catalog 解碼完整物理產物，並在公開事件或繼承 cut 前於記憶體中遷移歷史輸入；目前輸入直接 restore。僅對投影 v0 header，缺失的 `delegationDepth` 表示 `0`。parser 從不重寫或重新命名 fixture。執行時持久化繼續寫入完整日誌。回放會展開目前檢視中每個 `assistant/message` 或 `assistant/attempt` 的緊湊流，因此已記錄 fixture 會回放出與線上模型產生的相同邏輯流。fixture 的 `request/header` 內容可能 token 化為 `{{system}}`/`{{tools}}`；回放會物化僅用於驗證的值，而派生只讀取 Assistant settlement、帶標記的 summary 事件與 Session metadata。每個回放 fixture 與比較 fixture 都必須透過同一個只基於內容的 catalog 驗證；回放絕不修覆被拒絕的產物。比較編碼保留已接受的 catalog 輸出，包括擴充功能 request-header 欄位；目前版本的 `header.system` 會被拒絕。協定通知的預期輸出直接與目前寫入器輸出比較，保留事件順序、插入的系統訊息、包裝層欄位，以及不透明的交付和捕捉代際值；只有完整 Session 產物使用格式遷移 catalog。

### 巢狀 agent

parent agent 委託給程序內 subagent 的情境會為每個 Session 記錄一個角色：parent 為 `session[.vN].jsonl`，隨後是連續 child `session.<ordinal>[.vN].jsonl`。snapshot harness 只提供每個角色的最高 generation。live Session id 每次執行都會重新隨機生成，因此 replay 按首次呼叫順序把每個 live Session 繫結到已記錄腳本：第一個發起模型呼叫的 live Session 取得 parent 腳本，下一個新 Session 取得下一條 child 腳本，依此類推，每個 Session 分別推進自己的 cursor。不同 live Session 數量超過已記錄腳本數時會明確報錯。

### 失敗模式與覆蓋

當回放在帶有 `ctx.deepseekLlmApiExtensions` 的組合中服務 `deepseek-official` 時，它會在選擇有效腳本條目後、產生首個分片前準備並接受這些欄位。這與即時介面卡的 2xx 後提交點一致，因此持久接受水位與 SDK 事件通知在錄製和回放中行為相同。回放提供合成 `{ messages: [] }` 基礎 body：它證明接受副作用，而非準備後的欄位位元組。

有兩種失敗模式無法僅根據持久 Assistant settlement 重建：任何 chunk 之前的純 throw 沒有攜帶異常的 stream member，而 cancel/hang 需要的是不終止語義，不能用有限字首回放。需要這些行為的情境可提供可選伴隨檔案（`<scenario>/replay.override.json`）：它用裸 `ReplayEntry[]` 替換派生腳本，或用 `{ patches: [{ at, entry }] }` 增補——保留所有派生呼叫，只替換指定的從 0 開始計數的呼叫索引；當 `at` 等於派生長度時，則在注入瞬態異常後的重試位置追加。有字首分片的 `throw` 條目會接受 DeepSeek 請求擴充功能；零分片 throw 預設表示 2xx 前未接受，也可設 `accepted: true` 表示 2xx 後無分片失敗。`hang` 條目可以指定 `readyFile`，回放在等待取消前寫入它，使外部 driver 可以確定性取消。

### 可能出什麼問題

- **fixture 未被完全消費**——在測試中直接安裝回放時呼叫 `assertConsumed()`，它會把情境靜默驅動的模型呼叫少於記錄數轉換為明確診斷。
- **未記錄的工作階段發起呼叫**——回放會明確報錯，並提示你重新錄製情境。
- **腳本預留位置匹配不到內容**——`{{fromRequest:<regex>}}` 解析會驗證模式與請求語料，匹配不到、模式非法或預留位置未閉合都會明確報錯。

獨立轉錄提取向 V3→V4 顯式提供空的子 Session 事實集合；保留已有目錄記錄，但不發現關聯檔案。完整的歷史父目錄遷移由 JSONL 持久化負責。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋回放外掛的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

回放把選定的投影 Session generation 視為 fixture。一個 parser 補全投影 envelope，透過 `sessionFormatCatalog` 驗證並遷移完整產物，再以一個結果返回目前 header、繼承 cut 與事件列表。`deriveReplayScript` 按日誌順序展開每個 `assistant/message` 或 `assistant/attempt` 流，因此每個持久 settlement 都成為一條 `chunks` 條目；非空流缺少 `finish` 分片是 `stream()` 丟擲異常的指紋，必須透過 override 伴隨檔案表達。攜帶 `llmStreamCall: true` 與完整 `rawOutput` 的 `compaction/summary` 會在該事件位置回放為一條規範成功流。腳本字串可以內嵌 `{{fromRequest:<regex>}}`；流輸出時每個 placeholder 針對 live request 的 string leaf 解析，取該 pattern 的最後一次 match，用其第一個 capture group（無 capture group 時用整個 match）原位替換。

[已提交語料測試](tests/session-format-corpus.spec.ts) 透過真實 catalog 還原 `snapshots/`、`packages/` 與 `scripts/snapshots/python-sdk-single-exe/` 下每個帶版本的 `session*.jsonl`，且不改變源位元組。其[清單](tests/session-format-corpus-inventory.ts) 按路徑、源代際、錯誤型別與精確原因固定有意拒絕的歷史轉換；拒絕消失或變化都會使測試失敗。目前代際產物不能獲得例外。不含 header 的快照 harness 協定範例具有獨立的顯式豁免。其他所有還原錯誤都攜帶產物路徑並使測試失敗；歷史檔案保持不變，原生目前 fixture 則由 owner 修正。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 型別、fixture 派生、override 驗證、預留位置解析、工作階段繫結、`installLlmReplay` 與外掛匯出 |
| [`tests/session-format-corpus.spec.ts`](tests/session-format-corpus.spec.ts) | 已提交代際還原與精確歷史拒絕檢查 |
| — | 不釋出執行時不變式伴生入口；該僅測試介面卡消費固定的回放腳本；其流語法由 LLM 伴生外掛與 fixture 派生測試檢驗。 |

### 繫結與流式流程

`installLlmReplay` 載入有序腳本，然後安裝路由回放介面卡（`providers` 非空時）或 catch-all `llm/stream` waterfall 監聽器。每次即時 `stream()` 呼叫以其呼叫工作階段 id 為鍵：新工作階段認領下一個未認領腳本（父工作階段在前，因為它必須先開始流式輸出才能委託），沒有 `sessionId` 的呼叫共享一個繫結主腳本的匿名工作階段。返回的 `ReplayHandle` 攜帶用於 HMR（熱模組替換）安全的 disposer，以及 `assertConsumed()`——除非每個已記錄腳本都繫結到即時工作階段且每個已繫結遊標都已耗盡，否則它會丟擲異常。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從回放介面卡逐步進入錄製 fixture 的 harness 與消費流的 loop。

- [session-snapshot](../session-snapshot/README.zh.md)——錄製 fixture 並驅動回放、錄製與重新整理模式的快照支援。
- [LLM 包](../../llm/llm/README.zh.md)——回放實作的提供者流約定與介面卡註冊表。
- [測試策略](../../../docs/testing.zh.md)——無金鑰快照層及其適用時機。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支援包。

-----

<a id="model-experience"></a>
## 模型體驗

無。該無金鑰測試介面卡不向提供者模型傳送請求，只將已記錄 assistant 分片回放到測試 loop 中。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時回放無法代替線上模型。它們是目前包約束，不是任務積壓。

- **首次呼叫順序腳本繫結假設序列委託**——並行執行同級 subagent 的實作會非確定性地將即時工作階段繫結到已記錄腳本；在這種情境出現前暫不實作更強的鍵控。
- **只有普通 loop 分片與帶標記的本地壓縮輸出才能派生**——在產生分片前直接丟擲、取消/掛起，或未標記的外部摘要器呼叫情境需要 `replay.override.json` 伴隨檔案；替換與補丁兩種形式都隻影響主工作階段，子工作階段腳本仍從各自日誌派生。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
