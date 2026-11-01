---
description: "面向選擇、設定或排查同工作階段持久 goal 服務的使用者與維護者：每工作階段一個持久的完成目標。"
kind: "package-reference"
---

# @deepseek-ai/dsh-goal

[English](README.md) | 中文

## 概述

`dsh-goal` 讓一個長期完成目標在多輪、工作階段恢復、fork 與程序重新啟動後持續存在。使用者與 agent（智慧代理）可以 create、edit、pause、resume、complete、block 或 clear 該目標；比較並設定的更新會拒絕陳舊檢視。可設定的 Round 上限（預設 256）約束自動續行，被阻塞的 goal 會保留穩定的策略程式碼和麵向人的說明。本包儲存 goal 狀態但不排程工作，續行權限是程序本地的而非持久狀態。單個目標需要橫跨多輪時選擇本包；常規單輪工作或並行目標不要使用。

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

當工作階段需要在多輪與多次重新啟動之間記住一個長期完成目標時，掛載 `dsh-goal`。本包是服務：模型工具、`/goal` 命令與續行驅動器都是消費同一 goal 狀態的獨立包，因此只掛載本包只會儲存和提供 goal，不會啟動任何工作。

### 何時使用

goal 適合一個需要跨自動 Goal Round 持續的長期完成目標——例如完成一次遷移，或修復所有失敗的文件門禁。常規單輪工作不應建立 goal。服務每工作階段至多保留一個目前 goal：未完成的 goal 必須先 edit、pause、resume、block 或 clear，才能被另一個替代；已完成的 goal 可以直接被替換。

### 設定服務

透過組合設定項載入本包；唯一的部署選擇是預設 Round 上限，應用於未自行指定上限的 create。

```yaml
- name: '@deepseek-ai/dsh-goal'
  config:
    defaultMaxGoalRounds: 256
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `defaultMaxGoalRounds` | `256` | 當 create 請求省略上限時應用的 Round 上限 |

`defaultMaxGoalRounds` 必須是正的安全整數；指定了自身上限的 create 請求會覆蓋它。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-goal)是每個受支援欄位的窮盡式真源。

### 工作階段投影

`GoalService` 要求組合提供 `ctx.sessionProjections`（[`@deepseek-ai/dsh-session-projection`](../../session/session-projection/README.zh.md)），並在啟動時註冊 `goal` 投影單元；未組合投影註冊表的組合無法啟用 `ctx.goals`。該單元版本為 6，其主機狀態保留最新的有效目前 goal、所有曾使用的 goal id，以及第一次嚴格回放失敗。用戶端檢視提供目前 goal；首次 create 前與 clear tombstone 後為 `null`。該鍵同時合併到 `SessionProjectionStateMap` 與 `SessionProjectionMap`；載體透過歷史尾頁和 `session/projection` 推送幀提供用戶端值。

### 驅動生命週期

goal 經歷四種持久 phase——`active`、`paused`、`blocked`、`complete`——外加一個程序本地標誌，表示自動續行是否已啟用。動詞如下：

| 操作 | 作用 |
|---|---|
| `create` | 以目標和 Round 上限啟動一個 active goal |
| `edit` | 修改目標和/或 Round 上限，不改變 phase |
| `pause` | 停止自動續行並保留狀態 |
| `resume` | 重新開始續行；也用於工作階段恢復或 fork 後重新啟用 active goal |
| `complete` | 標記 goal 已完成並停止續行 |
| `block` | 記錄穩定的 blocker 程式碼與說明 |
| `clear` | 移除目前 goal；其歷史保留在工作階段日誌中 |

pause、complete、block 和 clear 都會停用續行。block 是唯一保留策略自有 lower-kebab-case 程式碼與自由文字說明的 phase，因此提供者限制、預算耗盡、執行錯誤與請求人工輸入共用一種持久 phase，而不是擴增生命週期狀態。resume 只在 Round 上限仍有剩餘容量時接受已停止的 goal，或 active 但已停用續行的 goal，並清除任何先前的 blocker reason。

### 什麼會保留，什麼不會

每項被接受的變更都會持久記錄到工作階段日誌——goal 狀態的唯一儲存——因此 goal 狀態絕不依賴臨時訊息投遞。工作階段恢復或 fork 後，goal、其 phase、其 revision 與已准入 Round 數量都仍然存在。自動續行是例外：任何工作階段開始邊界之後，`active` 的 goal 都會被停用續行——在有人顯式 resume 之前，agent 不會自行繼續。

### 觀察 goal

消費方用 `ctx.goals.get(agent)` 讀取目前 goal，獲得脫離內部狀態的檢視：目標、phase、已開始與上限 Round 數量、被阻塞時的 blocker reason，以及續行是否已啟用。變更必須攜帶該檢視中的精確 `{ id, revision }`，因此持有舊狀態的消費方會收到清晰的陳舊 revision 錯誤，而不是靜默覆蓋更新的狀態：

```text
const view = ctx.goals.get(agent)      // undefined when no goal is current
view.phase                             // 'active' | 'paused' | 'blocked' | 'complete'
view.roundsStarted, view.maxGoalRounds // continuation progress
view.activation                        // 'armed' | 'disarmed' — not persisted
```

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計

- **事件溯源狀態。** 每次變更都追加持久的 `goal/change` 事件（版本 1），攜帶變更後的完整快照；clear 寫入帶 revision 的 tombstone。工作階段日誌是唯一的持久權威。
- **比較並設定的變更。** `ctx.goals` 只接受以對應 id 註冊的完全相同的活躍 `Agent` 實例。`get()` 返回脫離狀態的 `GoalView`；變更攜帶 `GoalRef { id, revision }` 並拒絕陳舊引用。建立在提交前於內部解析部署預設值。
- **續行啟用狀態是程序本地的。** `armed` 與 `disarmed` 儲存在每工作階段快取中，絕不持久化。新快取與每次 `agent/created` 邊界都會停用續行，即使回放發現持久 phase 為 active；`disarm()` 移除續行權限，不寫入 revision 也不發出變更事件。
- **嚴格回放。** 摺疊只從 `goal/change` 派生生命週期變更，並拒絕形狀錯誤、不連續 revision、非法 phase 轉換、每目標時間戳非單調，以及不連續的已准入 Round。只有已准入的來源為 goal 的 `user/message` 事件會推進正數 Round；掛鐘時間倒退時，變更時間戳會限制在不早於上一次更新的值。
- **投影單元。** 本包要求提供投影註冊表，並註冊一個嚴格的 `goal` 單元。其主機狀態保留回放驗證資料與第一次失敗，用戶端檢視提供最新有效的完整 goal 或 `null`；保留回放失敗後，`GoalService` 會拒絕存取。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`GoalService`、設定 schema、變更、續行啟用快取、投影單元 |
| [`src/domain.ts`](src/domain.ts) | 持久變更載荷、`goal/changed` 事件、goal 訊息來源歸屬 |
| [`src/types.ts`](src/types.ts) | 純用戶端安全型別：`GoalView`、`GoalSnapshot`、`GoalActivationChanged`、投影鍵宣告 |
| [`src/fold.ts`](src/fold.ts) | 持久 goal 變更的嚴格回放摺疊與解碼器 |
| [`src/runtime.ts`](src/runtime.ts) | `GoalId` 品牌、`GoalError` 程式碼、變更版本常數 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套模組：對每個已掛接工作階段的獨立增量摺疊 |

### 事件與歸屬

`goal/changed` 在持久事件提交後觸發，監聽器失敗會被隔離；載荷攜帶操作、精確 ref 與最新檢視（clear tombstone 時省略）。`goal/activation-changed` 在不改變持久狀態的情況下，轉發攜帶精確目前 ref 的程序本地 `armed`／`disarmed` 邊界；clear 後則不攜帶 goal。已准入的續行 Round 透過 `user/message` 事件上的 `GoalMessageSource { goalId, revision, round }` 歸屬，嚴格摺疊會將其驗證為目前 goal 的下一個已准入 Round。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要了解周邊領域與設計理由時閱讀以下頁面。

- [goal 子系統](../../../docs/subsystems/goal.zh.md)——goal 型別、持久的變更載荷與生成的服務 API。
- [goal 組地圖](../README.zh.md)——goal 各包及其組合方式。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-goal)——每個受支援設定欄位及其源宣告。
- [goal 領域 Agent Note](../../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.zh.md)——領域設計、備選方案與決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 目標狀態變更

#### 模型看到什麼

Goal 變更不會注入模型上下文。`get_goal` 等工具返回目前狀態；續行消費方可以在排程模型工作時渲染目標與 Round 狀態。

#### Token 影響

Goal 變更事件本身不增加模型 token。工具結果與續行排程提示詞各自暴露的狀態會分別計入 token 用量。

#### KV Cache 影響

在其他元件把 goal 狀態暴露為模型可見輸入之前，不會影響 KV Cache。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 goal 服務何時不合適或需要特別注意。它們是目前包約束，不是任務積壓。

- **只負責狀態，不負責任務排程**——本包不決定已啟用續行的 goal 何時繼續，不重試異常失敗，也不取消活躍輪次；這些策略屬於 `dsh-goal-round-driver` 等消費方包。
- **只有 Round 數量預算**——`maxGoalRounds` 不計量 token、貨幣、掛鐘時間或提供者配額。
- **沒有獨立評估器**——記錄完成或阻塞的呼叫方擁有最終決定權；由評估器支援的認證暫緩到獨立策略層。
- **只有一個目前 goal**——系統有意不支援並行目標或獨立 goal 資料庫；替換或清除後，歷史仍可在工作階段日誌中讀取。
- **信任程序內生產方**——能直接存取 `Session` 的外掛可以追加偽造的 `goal/change` 資料。嚴格回放會檢測格式錯誤或不一致的記錄，並使 goal 存取從該記錄起失敗，直到日誌修復；這是完整性檢測，不是外掛隔離。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性。開放且未決的方向：為需要在每個模型請求中看到目標的部署提供始終可見的 goal 上下文外掛，以及由評估器支援的完成與阻塞認證。

</details>
