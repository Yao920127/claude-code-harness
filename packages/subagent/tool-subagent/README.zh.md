---
description: "面向模型的 subagent 委派工具，供使用者與維護者設定、組合或排查基於 subagent 提供者的委派。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-subagent

[English](README.md) | 中文

## 概述

使用本包可為 agent 提供一個具名工具，把工作委派給已設定的子 agent 後端。`one-shot` 模式下，呼叫預設等待子 agent；`continuable` 模式下，呼叫預設在後臺啟動持久化子 agent，並返回可用於後續訊息的 id。受支援的後端還可公開獲准的子級 LLM 提供者、模型與推理等級供模型選擇。每個實例均可設定子 agent 的 persona、工具權限與深度限制，失敗的執行會返回錯誤，而非部分成功。

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

每個委派目標掛載一個實例，且每個實例的 `toolName` 必須不同。工具與其提供者同時存在、同時消失，因此同級載入順序與提供者重新載入都不會讓工具懸空。

### 最小設定

先載入 subagent 服務、一個程序內或遠端後端與本工具，然後指定提供者名稱。此組合暴露一個委派給 `spawn` 後端的 `subagent` 工具：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `provider` | 必填 | `ctx.subagents` 上的提供者名稱（如 `spawn`、`fork`、`acp`） |
| `toolName` | `subagent` | 面向模型的工具名稱；每個已載入實例必須不同 |
| `modelSelectionSettings` | `false` | 為每個頂層 Session 讀取主機的精確路由授權偏好；常駐 preset 觀察匹配 Session，直接 Agent setup 則顯式傳入其 Session；要求提供者支援 `agentOptions` |
| `enableRunInBackground` | `true` | 公開 `run_in_background`；停用時也會拒絕強制後臺呼叫 |
| `backgroundMode` | `one-shot` | 後臺策略：`one-shot` 預設前臺呼叫；`continuable` 預設後臺呼叫，並要求提供者具備 `prepareContinuable` 能力 |
| `agentOptions` | — | 設定的子級 `provider`、`model`、介面卡所有的 `reasoningEffort` 與正整數 `maxTokens` 預設值；要求提供者支援 `agentOptions`，並會覆蓋提供者持有的路由預設值 |
| `persona` | — | 每個子 agent 獨立的 persona；要求提供者具備 `persona` 能力 |
| `toolFilter` | — | 每個子 agent 獨立的全域工具限制；要求提供者具備 `toolFilter` 能力 |
| `maxDepth` | Host 設定（`1`） | 絕對委派深度上限（`0` 禁止委派）；`'provider-managed'` 不向程序外提供者傳送上限 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-subagent)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 前臺與後臺模式

`one-shot` 策略下，省略 `run_in_background` 會在前臺等待並返回子 agent 的最終文字；`run_in_background: true` 會啟動一個歸父級所有的普通後臺任務，並返回 `started background subagent job <id>`，可用 `job_output` 收集、用 `job_kill` 停止。

`continuable` 策略下，省略或為 `true` 的 `run_in_background` 會啟動一個持久化子 agent，並返回 `started subagent <childId>`，不等待結果；子 agent 的 Activation 結束時，執行時投遞一條結算通知，可選的 `send_message` 工具會向它傳送更多工作。把 `run_in_background` 設為 `false` 可在前臺等待結果。

`maxDepth` 限制遞迴深度（`0` 禁止委派）；省略時，每次委派讀取 Host 目前的 `subagent.maxDepth` 設定，初始值為 `1`。數值深度要求提供者具備 `depthLimit` 能力；`'provider-managed'` 把預算留給程序外提供者。當提供者支援時，`persona` 與 `toolFilter` 會設定每個子 agent；工具在達到上限時仍然可見——每次嘗試啟動都會檢查呼叫 agent 的目前深度，被拒絕時返回出錯的工具結果。

### 選擇子級 LLM

設定 `modelSelectionSettings: true`，即可在組合每個全新頂層 Session 時讀取主機的 `subagent-model-selection` 偏好。沒有已記錄策略的恢復 Session 會保持停用，包括顯式為空的恢復。啟用後，非空的精確 provider/model 路由列表會記錄進 Session、由子 Session 繼承，後續設定編輯不會改變它。工具隨後公開可選的 `provider`、`model` 與 `reasoning_effort` 欄位，並註冊共享的 `list_subagent_models` 工具。此模式要求後端宣告 `agentOptions`；兩個程序內後端和 DSH SDK 支援該能力，而 ACP、Codex 與 Claude Code 會拒絕它，而不是忽略它。

一次呼叫需同時提供 `provider` 與 `model`；當設定值、父 agent 值或提供者持有的預設值能提供路由時，也可只提供推理等級。靜態的 `provider.agentRouteDefaults` 在存在時構成提供者／模型基線；工具設定與模型欄位會在路由相關強度合併和確切路由預檢前覆蓋它。沒有這些預設值的提供者會使用父 agent 最新已記錄請求中的相容值，再使用父級首次請求前的建立選項，並保留設定的 `maxTokens`。更改路由但未顯式提供推理等級時，會清除繼承的路由自有等級，使所選模型解析自己的預設值。即時 LLM 介面卡在建立子 agent 前驗證有效路由。目錄成員資格只提供建議，因此介面卡接受時，模型可以使用未列出的 id。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具如何映像提供者生命週期並結算執行；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

一個實例就是一個提供者加一個工具名稱。外掛映像提供者生命週期：具名提供者出現時註冊工具，提供者離開時釋放工具，因此同級載入順序與 HMR 替換不會讓工具懸空。直接 Agent setup 顯式傳入尚未釋出的 Session，並在釋出前等待安裝完成。由設定控制的常駐 preset 透過 `agent/created` 接收每個匹配 Agent，從其 Session 選擇策略，並等待透過其 Context 發起的安裝；安裝失敗會拒絕建立。提供者無法執行的數值型 `maxDepth` 或已設定 LLM 選擇會在掛載時失敗，而不是在首次委派時失敗。每個工具作用域內最多一個實例可以擁有模型選擇，因為 `list_subagent_models` 使用全域名稱。

### 前臺結算

前臺呼叫會等待 `run.result`，把每個非完成終止原因對映為錯誤標題，追加提供者診斷與任何保留下來的部分 assistant 文字，並在返回前始終等待 `run.dispose()`；當結果收集與 dispose（資源釋放）都 reject 時，出錯結果會保留兩項失敗。

### 後臺路由

一次性後臺模式會註冊一個歸父級所有的普通 Task，其 done 通道結算啟動，並在 detail 中保留終止原因與可選提供者診斷。可繼續後臺模式呼叫 `ctx.subagents.startContinuable()`，該呼叫在 inbox 接受時結算：子 agent 自此擁有自己的輪次，因此該呼叫既不等待也不收集結果。

### 隨上下文變化的措辭

工具描述源自 `provider.inheritsParentContext`：全新子 agent 得到「it does not see this conversation」措辭，fork 子 agent 得到「it does not see the current in-flight turn」措辭，因此模型既不會複述、也不會省略並不存在的上下文。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具註冊、生命週期映像、模式解析、結果結算 |
| [`src/model-selection.ts`](src/model-selection.ts) | 請求／設定合併與即時 LLM 路由預檢 |
| [`src/model-selection-settings.ts`](src/model-selection-settings.ts) | 為新 Session 讀取的主機所有 opt-in 設定 |
| [`src/model-selection-state.ts`](src/model-selection-state.ts) | 記錄並繼承已讀取決定的 Session 事件 |
| [`src/list-models.ts`](src/list-models.ts) | `list_subagent_models` 執行時發現工具 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從工具執行時行為進入它所委派其上的 seam，以及相鄰的子 agent 工具。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——提供者、一次性啟動請求、可繼續子 agent 與 Activation。
- [dsh-tool-subagent-control](../tool-subagent-control/README.zh.md)——可繼續子 agent 的訊息、中斷與列表工具。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent)——預設 schema 與各模式的措辭。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-subagent)——每個受支援設定欄位。
- [後臺優先的可繼續委派](../../../.agents/notes/archived/feature/2026-08-11-background-first-continuable-delegation.md)——可繼續工作為何預設在後臺執行。
- [模型選擇 subagent 路由](../../../.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.zh.md)——選擇策略、繼承、發現與 fork 限制。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什麼

委派工具的描述使用 `running` 與 `inactive` 表達後續投遞的可用狀態；`inactive` 不表示任務結果。當提供者存在時，以目前實例設定的名稱公開已生成的預設 [`subagent` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent)。啟用的 Session 策略會新增 `provider`、`model` 與 `reasoning_effort`，以及繼承和選擇指引；提供者必須支援 `agentOptions`。提供者是否繼承上下文會改變工具描述和提示詞描述。啟用後臺模式會新增 `run_in_background`：可繼續模式會記錄其預設值為 `true`、執行時結算通知與顯式前臺覆蓋；一次性模式會記錄其預設值為 `false`，以及用 `job_output` 收集或用 `job_kill` 停止的 job id。當工具在本次組裝的作用域中可見時，一個 `tool:<toolName>` 系統提示詞 section 會指示模型同時啟動相互獨立的可繼續委派、在它們執行時繼續工作，並且僅當下一步動作依賴結果時選擇前臺；工具限制會同時移除其 schema 和這段指引。

#### Token 影響

每個父級請求支付固定的 schema 成本；模型選擇會增加三個參數。每個提供者實例增加一個 schema，每個可繼續實例還增加一個簡短的系統提示詞 section。

#### KV Cache 影響

只要提供者實例及其設定不變，字首就保持穩定。介面卡目錄變化不會改變定義；子級路由覆蓋可能使 fork 子 agent 無法複用繼承的父級字首。

### 模型選擇與發現

#### 模型看到什麼

Session 攜帶策略的 settings 控制實例會公開子級 LLM 選擇欄位與 `list_subagent_models`。可選 `ctx.llm` 服務不可用時，呼叫會失敗。發現只返回精確路由策略中的已註冊提供者與已公佈模型；未授權提供者會在呼叫其介面卡目錄前被拒絕，精確查詢也必須先獲准，才會解析模型的推理強度與預設值。執行階段會獨立強制同一策略。

#### Token 影響

啟用的組合中存在一個固定發現 schema。只有模型呼叫工具時，目錄內容才進入 transcript。

#### KV Cache 影響

介面卡註冊與目錄變化不會改變 schema 字首。每個發現結果都追加在可複用字首之後。

### 系統提示詞

#### 模型看到什麼

當 `enableRunInBackground` 與 `backgroundMode: continuable` 同時設定時，模型還會讀到 `tool:<toolName>` 系統提示詞 section，指示它把相互獨立的可繼續委派一起啟動，並在它們執行時繼續工作。使用預設工具名 `subagent` 時，section 文字為：

##### 工具指導 section

```markdown
Start independent subagent delegations together in one assistant message and continue useful work while they run.
```

#### Token 影響

每個可繼續實例一個簡短固定 section，只要工具在作用域內，就由每個父級請求支付。

#### KV Cache 影響

只要 section 文字與工具存在性不變，字首就保持穩定；移除工具或更改 section 會建立不同的父級字首。

### 前臺結果

#### 模型看到什麼

呼叫會保留描述與提示詞。成功時只包含子 agent 的最終文字；其他結果變為 `Error: <stop reason>`，隨後在存在時附上安全的提供者診斷，再附上任何部分 assistant 文字。子 agent 中間步驟不會進入父級。

#### Token 影響

提示詞與結果保留在父級歷史中，直到上下文壓縮（context compaction）；子 agent 工作上下文留在子 agent 中。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 後臺結果

#### 模型看到什麼

在設定的可繼續模式下，啟動時返回內容恰為 `started subagent <childId>`；在設定的一次性模式下，則返回 `started background subagent job <id>`。一次性模式下，通用 Task 介面提供後續狀態、最終輸出、取消回應與通知；若結果攜帶提供者診斷，失敗狀態的 detail 會包含它。可繼續模式下，本工具不返回自己的結果：子 agent 的結算以服務負責的通知到達父級，獨立載入的 `send_message` 工具投遞後續訊息，而透過其 id 檢視子 agent 的 transcript（文字記錄）即是其詳細輸出來源。

#### Token 影響

確認訊息會被保留；一次性最終輸出只在收集或注入時進入父級歷史，而可繼續子 agent 的輸出絕不會透過本工具返回——其結算通知獨立於任何工具結果到達。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本工具不返回或不強制執行什麼；它們是目前包約束。

- **後臺執行不透過本工具公開結果**——一次性任務的最終輸出透過通用 Task 介面收集，可繼續子 agent 的輸出留在其自身工作階段中，按其 subagent id 讀取。結算通知會說明該子 agent 如何結束，並攜帶其最終 assistant 輸出中的非空文字，但它不是本次呼叫的回傳值，也無法在此等待。
- **等待中的一次性實例較晚才發現重複名稱**（`TODO(subagent-dup-toolname)`）——可繼續實例會在外掛應用期間預留提示詞 section 名稱，但若要阻止等待中的一次性實例復原提供者註冊，仍需要一份預期名稱註冊表。
- **隨附 fork 工具不能選擇子級 LLM 路由**——它們繼承父級提供者與模型，使複製的對話字首仍有資格複用 KV Cache。僅當路由變更能保留複用或公開有界重算成本時，才重新啟用選擇。
- **非路由子 agent 策略按實例固定**——另一個 persona、工具過濾器或深度上限需要另一個名稱不同的工具。LLM 選擇要求啟用逐 Session 偏好，且提供者必須宣告 `agentOptions`；兩個程序內提供者和 DSH SDK 會宣告該能力，而 ACP、Codex 與 Claude Code 會拒絕它，而不是忽略它。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
