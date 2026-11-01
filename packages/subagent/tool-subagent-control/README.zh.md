---
description: "供使用者與維護者在組合或除錯可繼續子級控制功能時使用的全域 send_message、interrupt_agent 與 list_agents 工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-subagent-control

[English](README.md) | 中文

## 概述

`dsh-tool-subagent-control` 為可繼續子級新增全域控制工具：`send_message` 在直接父級與子級之間進行 steering（中途引導），`interrupt_agent` 停止子級目前輪次但保留其收件箱與後代，`list_agents`（來自可單獨載入的 `list-agents` 外掛）按持久化 ID 與標籤列出可繼續子級。父級與可繼續子級繼承相同的 `send_message` 定義和順序，因此模型通訊不會增加子級專屬工具 schema。是否載入這些工具不會決定委派工具是否啟動可繼續工作。

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

在模型需要對可繼續子級發訊息、中斷或列出的任何組合中掛載本包。根外掛只需要 subagent 服務；列表工具是獨立外掛，部署方可以省略。

### 最小設定

先載入 subagent 服務、一個後端、委派工具與本包。加上獨立的列表外掛即可公開全部三個工具：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    backgroundMode: continuable
- name: '@deepseek-ai/dsh-tool-subagent-control'
- name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'
```

本包不接收任何設定：根外掛提供 `send_message` 與 `interrupt_agent`，列表外掛提供 `list_agents`。

### send_message

向 `agent_id` 指定的 Agent 傳送訊息：任何確切線上 Agent 都可以向自己的直接可繼續子級傳送訊息，駐留的可繼續子級還可以向自己的直接父級傳送訊息。正在工作的目標透過 Steer 在最近的步驟邊界接收訊息；非活躍目標會透過繼續執行生命週期啟動或恢復一個輪次。呼叫只返回接受結果（被接受訊息的穩定 `messageId`），絕不返回回覆。失敗——不受支援的目標、不可用的父級、未知子級、缺少描述符而無法恢復的子級，或准入被拒——會明確說明訊息未送達。

### interrupt_agent

只停止目標目前輪次：已排隊訊息保持暫停，直到之後呼叫 `send_message`；後代繼續執行，子級仍可接受後續訊息。呼叫在停止請求被接受後立即返回，不等待目標完全停穩；中斷已結束的 agent 會被接受並按空操作處理，而自身、同級、陳舊及非祖先呼叫方會收到出錯結果。

### list_agents

列出呼叫方 agent 下方的可繼續子級：`children`（預設）從父目錄讀取直接子級，不開啟子日誌；`descendants` 按穩定前序遞迴讀取子級目錄，併為每個條目標註其持久化直接父級工作階段 ID 與深度。狀態來自線上 Agent 註冊表——`running` 或 `inactive`。可讀取的一次性子級不出現在輸出中，但其目錄仍是遍歷節點。未知模式與無法讀取的子級目錄（包括一次性子級）僅在 `descendants` 作用域中以診斷資訊呈現。普通 Session fork 不是目錄條目，因此從源 Session 列表中既無法發現這些 fork，也無法發現其後代。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具把什麼委託給 subagent 服務；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

`ctx.subagents.sendMessage()`、`interrupt()` 與列表投影之上的輕量介面卡；工具不執行任何生命週期路由。駐留、冷恢復與授權歸服務所有，工具把確切線上的呼叫 Agent（`exec.agent`）同時作為 sender 與權限憑證傳入。

### 投遞與訊號所有權

工具轉發其執行訊號，該訊號只在 inbox 接受之前掌管准入。目標一旦接受訊息，該訊息便無法再透過本工具取消。每條訊息都以 `Agent <sender-id> sent a message:` 作為字首，並記錄 `{ kind: 'agent-message', form: 'relay', senderSessionId: sender.id }`；該來源資訊由服務推導，且絕不被視為權限。

### 列表投影

`list_agents` 從呼叫 agent 推導根 id，不使用 cursor 讀取服務目錄，透過線上 Agent 註冊表細化每個候選的狀態，並省略無法接受 `send_message` 的一次性子級。後代遍歷保留每個父目錄的事件順序。未知模式產生診斷，但其目錄仍可遍歷；無法讀取的目錄產生診斷，並停止該分支。可達目錄中不存在的後代無法被發現。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `send_message` 與 `interrupt_agent` 註冊 |
| [`src/list-agents.ts`](src/list-agents.ts) | `list_agents` 註冊：作用域、狀態細化、投影 |
| — | 不釋出執行時不變式伴生入口；這個面向模型的介面卡沒有獨立的生命週期流；投遞與啟用關係由其呼叫的 subagent 服務負責。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從工具 schema 進入其背後的繼續執行服務。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——可繼續子級、Activation、inbox、中斷與後續訊息權限。
- [dsh-tool-subagent](../tool-subagent/README.zh.md)——啟動可繼續子級的委派工具。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent-control)——三個工具的 schema。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什麼

已生成的 [schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent-control)：`send_message` 接受 `agent_id` 與 `message`；`interrupt_agent` 接受 `agent_id`；`list_agents` 接受可選的 `scope` 列舉。

#### Token 影響

每個父級請求支付固定的 schema 成本。

#### KV Cache 影響

字首保持穩定；schema 不會在執行時改變。

### 中斷結果

#### 模型看到什麼

接受時返回 `interrupt requested for agent <agent_id>`。未授權的呼叫方——self、sibling、陳舊或非 ancestor——會成為指明拒絕原因的出錯結果；目標不存在或已結算仍渲染接受行。

#### Token 影響

每次呼叫產生一條簡短確認訊息；被中斷輪次的中止只在子級自己的 transcript（文字記錄）中可見。

#### KV Cache 影響

僅追加；每個結果都位於可複用請求字首之後。

### 投遞結果

#### 模型看到什麼

接受時返回 `message delivered to agent <agent_id>`；規範輸出攜帶被接受的 `messageId`。失敗——非相鄰目標、不可用的父級、未知子級、缺少描述符而無法恢復的子級，或准入被拒——會成為出錯的結果，其訊息說明該訊息未送達。

#### Token 影響

每次呼叫產生一條簡短確認訊息；目標的回應絕不會透過本次呼叫返回。子級使用同一個工具，並傳入其初始任務中的父級 ID，將選定內容追加到父級歷史中。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 列表結果

#### 模型看到什麼

按穩定目錄順序，每個可繼續子級佔一行：`<id> [<status>] — <label>`（`running` 表示正在執行輪次；`inactive` 表示沒有輪次在執行，包括已載入和僅存於儲存的情況；兩種狀態均不表示任務完成或結果）。僅 `descendants` 作用域會為未知模式或無法讀取的子級目錄新增 `<id> [diagnostic: <reason>]`，包括無法讀取的一次性子級。`descendants` 作用域會在每行標籤的破折號之前按前序插入 ` parent=<id> depth=<n>`。可讀取的一次性子級會被省略；`(no subagents)` 表示投影后沒有留下可繼續子級或診斷資訊。

#### Token 影響

隨所列可繼續子級和診斷數量線性增長——`descendants` 作用域下為目錄可達後代；沒有遊標或上限，因此長期存活且有許多持久化子級的父級每次呼叫都會承擔完整列表成本。

#### KV Cache 影響

僅追加；每個結果都位於可複用請求字首之後。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明控制工具無法觀察或引導什麼；它們是目前包約束。

- **已投遞訊息沒有獨立結果**——接受時只返回其 inbox `messageId`；目標後續工作會落入該目標的持久化工作階段，絕不會透過本工具收集。回覆是另一條顯式指定地址的 `send_message`，而非本次呼叫的結果。
- **只有受支援的相鄰 Agent 可以通訊**——每個傳送方都可以向直接可繼續子級傳送訊息；只有具備駐留可繼續 Activation 的傳送方可以向自己的直接父級傳送訊息，且該父級必須仍線上；同級與更深的後代不能作為訊息目標，只有向直接子級投遞才支援冷啟用。
- **列表是快照，而非投遞承諾**——它可能與釋出、dispose（資源釋放）或後續訊息發生競態，另一個程序也可能啟用目前程序報告為 `inactive` 的子級；跨程序準確性需要共享租約。`interrupt_agent` 自己執行權威的線上 lineage 檢查，因此過期的發現結果不會授予權限。
- **沒有分頁或刪除**——系統返回完整且穩定排序的集合；只要子級工作階段仍在持久化儲存中，它就會繼續出現在列表中，服務級上限或刪除操作留待後續產品決策。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
