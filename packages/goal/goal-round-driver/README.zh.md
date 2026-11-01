---
description: "面向選擇、組合或排查自動 Goal Round 的使用者與維護者的同工作階段續行驅動器說明。"
kind: "package-reference"
---

# @deepseek-ai/dsh-goal-round-driver

[English](README.md) | 中文

## 概述

`dsh-goal-round-driver` 會在同一工作階段內自動繼續 active goal，但前提是 agent（智慧代理）已空閒、續行已啟用且設定的 Round 額度仍有剩餘。每個 Round 都讓模型獲得另一次推進目標的機會；只有進入模型歷史的 goal Round 才消耗額度，額度耗盡時會記錄 blocker。驅動器本身沒有設定：goal 定義 Round 上限，`dsh-tool-goal` 定義重複受阻後何時停止續行。若任務需要無人值守的多輪推進，應與 `dsh-goal` 和 `dsh-tool-goal` 一起掛載；若每一步都需要人工 steering（中途引導），則不要掛載。

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

當 active 的 goal 應在無人干預的情況下持續推進時，掛載 `dsh-goal-round-driver`。它與 goal 服務和 goal 工具組合使用：服務擁有狀態，工具讓模型控制狀態，本包負責排程輪次。

### 組合方式

把驅動器掛載在 goal 服務與 goal 工具旁邊；驅動器本身不需要任何設定。

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'

- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'

- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'
```

`maxGoalRounds` 屬於 goal 定義，面向模型的阻塞閾值屬於 `dsh-tool-goal`；在驅動器中重複任一數值都可能產生分歧策略。

### 每輪做什麼

當對應的活躍 agent 處於 idle，且存在 active、已啟用續行、仍有容量的 goal 時，驅動器會排入一條 goal-round 提示詞。它點明以 JSON 引用的目標、Round 編號與上限，並告訴模型以目前工作區、工具結果和持久狀態為準。被接納的 Round 會開啟獨立請求序列，因此 Chat 會在 goal 訊息之前渲染其自包含請求 header。該 Round 以 goal 來源的使用者訊息進入歷史；只有進入步驟的 goal 訊息消耗上限，人類訊息和陳舊預留不會消耗。goal 生命週期變更仍必須透過 `dsh-tool-goal` 的獨立權限檢查。

### 何時停止續行

Round 只在整個 agent 進入 idle 時啟動；完成、暫停和阻塞會阻止續行；主機發起的暫停還會中止正在執行的輪次，而模型在自己輪次內發起的暫停會正常結束。編輯只會透過修訂柵欄使進行中的 Round 失效，驅動器會繼續新修訂。驅動器也會在以下情況自行停止：輪次因 max tokens 結束、永續性寫入失敗、agent 被取消、外掛解除安裝，或 Round 上限耗盡——上限耗盡時它會以穩定程式碼 `round-limit` 記錄一個 blocker。取消絕不會自動重新啟動 Round：Round 已在進行或已排入佇列的 goal 會在下一次 idle 時被暫停；與 goal 嘗試無關的取消只會停用續行。

### resume、fork 或解除安裝之後

把驅動器掛載到現有 agent 上絕不會啟用任何 goal 的續行；工作階段 resume 或 fork 後，active 的 goal 會保持停用續行，直到使用者明確授權 resume——驅動器絕不會自行復活工作。解除安裝外掛會取消進行中的 Round，並確保不再啟動後續 Round。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋驅動器如何在無競態的情況下排程 Round；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計

- **先預留，後准入。** idle 時驅動器為目前 `{ goalId, revision }` 預留 `roundsStarted + 1`，排入一條攜帶 goal 訊息來源的 `<goal_round>` 提示詞；只有進入步驟的 `user/message` 才會增加 `roundsStarted`。因陳舊而被拒絕的預留不會消耗 Round 編號。
- **競態防護。** `agent/pre-step` 監聽器會在下游監聽器前後驗證完整的已領取記錄與目前 goal，因此陳舊、已取消或競爭中的提示詞會在其步驟進入前被拒絕。在預留前到達的人類工作會讓自動工作讓行，直到 agent 重新進入 idle。
- **永續性檢查點。** `goal/changed` 會產生永續性義務：排隊工作前，驅動器會等待 `ctx.sessions.flush()`，並在等待後重新檢查 goal revision 與競爭輸入。透過 `agent/error` 到達的 flush 失敗會停用續行，避免另一 Round 啟動。
- **fail-closed teardown。** Teardown 會關閉准入、停用所有活躍 goal 的續行、以 `parent` 原因取消進行中的工作，並在事件防護仍生效的情況下等待驅動器和 agent 完全停穩。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：驅動器狀態機、競態防護、teardown |
| [`src/prompt.ts`](src/prompt.ts) | 保留的 `<goal_round>` 續行提示詞 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生：goal-round 訊息必須與包自有提示詞一致 |

### Round 提示詞

保留的提示詞是一個文字塊：前幾行為 JSON 引用的目標與 `round/maxGoalRounds`，其後是工作指令。不變式伴生會從持久字首重建 goal，並拒絕內容與該提示詞不完全一致的任何 goal 來源訊息。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

驅動器消費 goal 狀態並把策略交由 goal 工具處理；需要了解周邊約定與設計理由時閱讀以下頁面。

- [goal 服務](../goal/README.zh.md)——本驅動器繼續推進的 goal 狀態與生命週期。
- [goal 工具](../tool-goal/README.zh.md)——面向模型的工具及其執行時權限檢查。

-----

<a id="model-experience"></a>
## 模型體驗

### Goal Round 提示詞

#### 模型看到的內容

每個已准入 Round 都是一段保留的使用者角色 `<goal_round>` 塊，其中點明完整目標與正數 Round 編號。更早的使用者訊息、goal 狀態快照、assistant 輸出與工具記錄仍保留在同一工作階段歷史中。

#### Token 影響

每個已准入 Round 會增加一個固定指令塊和目標。後續請求會重新傳送保留的 Round，直到壓縮（compaction）將其遮蔽；不會建立新 agent，也不會複製對話字首。

#### KV Cache 影響

在一個 epoch 內僅追加：每個已准入 Round 都會在可複用字首後擴充功能現有對話。壓縮可能替換派生歷史字尾，並移動可複用邊界。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明驅動器何時不合適或需要特別注意。它們是目前包約束，不是任務積壓。

- **沒有獨立評估器**——面向模型的 goal 策略會判斷證據是否足以完成，以及 blocker 在語義上是否未變；評估器支援的認證仍保持暫緩。
- **只在同一工作階段執行**——此包有意不 spawn 新 agent、不 fork 工作階段字首，也不實作 Ralph 風格的獨立嘗試；該工作流屬於單獨的外掛層。
- **已接受佇列的解除安裝競態**——Cordis 外掛解除安裝是非同步的。已經被 agent inbox 接受的 goal 提示詞可以在解除安裝開始前啟動並消耗其 Round；teardown 隨後會取消請求、停用 goal 的續行並等待完全停穩。不會再啟動後續 Round。
- **只有 Round 上限，不是資源預算**——token、貨幣、時間與提供者配額策略保持獨立。對應的工作階段事件不會歸屬於 goal 訊息，也不會對映為 goal 阻塞程式碼。
- **異常情況不自動重試**——暫時性的提供者與持久化失敗需要之後由使用者授權 resume，而不會採用隱式重試策略。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性。開放且未決的方向：異常失敗重試策略與逐輪評估器認證；兩者按設計都留在本包之外。

</details>
