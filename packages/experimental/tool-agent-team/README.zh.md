---
description: "九個讓模型建立、發訊息與協調 teammate 的工具，供掛載實驗性 Team 外掛的組合使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-agent-team

[English](README.md) | 中文

## 概述

本包讓模型建立具名 teammate、向它們傳送訊息、檢視可用狀態、等待進展、中斷卡住的工作，並透過共享任務板協調。每個團隊成員都會獲得相同的九個工具，以及在共享工作區協調的指引。當模型只應在你明確要求後執行團隊時，選擇本包。它會取代同名的舊版 subagent 控制元件，因此同時需要兩者的組合必須停用舊定義。本包以實驗性名稱公開發布，但不提供穩定性保證。

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

當模型應該透過工具執行一支團隊時，在 `@deepseek-ai/dsh-experimental-agent-team` 之上掛載本包。掛載後，每個團隊成員——Lead 與每個 teammate——都會獲得相同的九個工具，以及相同的協作策略。`spawn_teammate` 在初始任務前加上 teammate 的角色和名字。

### 何時選擇

當模型應該自行建立與協調 teammate、而不是由人來操作 subagent 控制元件時，選擇它。當同名的舊全域 subagent 工具必須繼續可用時，請不要選擇：團隊工具會為團隊成員取代它們，因此想同時使用兩者的組合必須停用舊定義。固定策略只在明確要求團隊或 teammate 時建立成員，因此普通任務永遠不會自行觸發委派。

### 最小工作範例

對現有組合的最小增量是 [agent-team README](../agent-team/README.zh.md#smallest-working-setup) 中的兩包片段：持久工作階段儲存、團隊領域包與本包。外掛本身只有兩個可選設定：

```yaml
- id: tool-agent-team
  name: '@deepseek-ai/dsh-experimental-tool-agent-team'
  config:
    freshProvider: spawn
    forkProvider: fork
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `freshProvider` | `spawn` | 啟動 fresh teammate 的提供者 |
| `forkProvider` | `fork` | 啟動 fork teammate 的提供者 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-tool-agent-team)是每個受支援欄位及其 JSDoc 的窮盡式真源。

試試這樣要求 Lead 模型：「建立一個名為 reviewer 的 teammate 檢查 diff，再把變更摘要發給 reviewer」。模型會呼叫建立工具，然後呼叫訊息工具。

### 模型能做什麼

九個工具分為四類能力：

- **建立 teammate**——`spawn_teammate` 接收名字、描述與初始任務；只有 Lead 可以呼叫它。
- **傳送訊息**——`send_message` 在最近的步驟邊界對執行中的成員進行 steering（中途引導）、啟動或恢復非活動成員。
- **檢視與等待**——`list_agents` 返回各成員的 `target` 與可用狀態；`wait_agent` 等待下一次團隊變化；`interrupt_agent` 停止 teammate 的目前輪次（僅限 Lead）。
- **管理任務板**——`team_task_create`、`team_task_list`、`team_task_get` 與 `team_task_update` 新增、瀏覽、讀取與更新共享任務。

建立和列表結果使用 `target` 標識成員，不包含成員 Session ID。可將該值用於訊息和中斷呼叫，或任務工具的 `owner` 參數；任務的 `ownerName` 使用相同值。`inactive` 表示沒有輪次在執行，包括已載入和需要恢復的成員；它不表示任務完成或結果。`provisioning` 與 `failed` 描述成員建立狀態。任何成員都可以給任何其他成員發訊息並使用任務板；只有 Lead 可以建立與中斷 teammate。任務更新保留領域的 owner 與 revision 驗證，因此過期的編輯會被拒絕，而不是覆蓋更新的成果。

### 成功與失敗的表現

傳送訊息在安全儲存後即成功：結果為 `accepted`（已立即送達）或 `queued`（等待中），排隊的訊息絕不能重發。當沒有其他成員 running 或 provisioning 時，`wait_agent` 會立即返回 `noProgress`，提示呼叫方先喚醒 teammate；否則它會等待下一次變化，呼叫方隨後重新讀取狀態。基於過期 revision 的任務編輯會被拒絕，而不是覆蓋更新的成果。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋介面卡背後的設計決策並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

介面卡建立在三項承諾之上：

- **按作用域，而非全域。** 每個註冊都位於成員 Agent（智慧代理）自己的 `ctx` 上；安裝依據 Agent 釋出時可用的成員身份。
- **宣告式結果，緊湊 JSON。** 每個工具都宣告完整結果 schema，並把該值渲染為緊湊 JSON，因此編譯器會對照向模型承諾的結果檢查 `execute`，任何結果都不會在縮排上消耗 token。
- **領域掌握裁決權。** 工具委託給 `ctx.agentTeams`，後者強制執行 Lead 權限與 revision 驗證；介面卡不新增更弱的路徑。

[Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)負責模型側與 scoping 決策。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定、固定策略文字與九個 scoped 工具註冊 |
| — | 不釋出執行時不變式伴生入口；Team 服務擁有持久化與授權關係。 |

### 策略與工具

member scope 上的一個 `team:policy` 段落說明共享的協作規則；固定文字與九個工具註冊都宣告在 [`src/index.ts`](src/index.ts)。九個工具 schema 註冊在釋出時被識別為 Team member 的 scope 中。與舊全域 continuable-subagent 控制元件同名的 scoped 註冊只會為團隊成員覆蓋這些全域控制元件。

### 按作用域註冊與拆除

`maybeInstall` 對每個 live Agent 執行，並訂閱 `agent/created`；它跳過沒有 Team 成員關係的 Agent。Agent 的 dispose（資源釋放）會執行已安裝的 disposer，外掛 HMR（熱模組替換）會在重新安裝前對每個已安裝的 scope 執行 dispose。每個 disposer 按逆序撤銷註冊，因此失敗的安裝不會留下殘缺 scope。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從領域服務逐步進入精確 schema 與設計背後的決策。

- [agent-team 包](../agent-team/README.zh.md)——這些工具背後的 `ctx.agentTeams` 領域服務。
- [Agent Teams 子系統](../../../docs/subsystems/agent-team.zh.md)——持久 Team 型別與服務 API。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-experimental-tool-agent-team)——模型接收的每個工具 schema。
- [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)——模型側、scoping 與隔離決策。

-----

<a id="model-experience"></a>
## 模型體驗

### Team 策略與工具

#### 模型看到什麼

一段共享 system 策略會說明顯式 delegation 要求、共享 cwd 行為、檔案陳舊版本恢復、Bash／formatter／codegen 風險、task／write-scope 協調、Steer 投遞、mailbox 不重試規則，以及 Lead 必須在回答前等待。Lead 與 teammate 的全部九個 Team schema 相同；執行時檢查僅限 Lead 的操作權限。`spawn_teammate` 在初始 user 訊息前加上 `<system-reminder>\nYou are teammate "<name>".\nYour Team Lead is named "lead".\nUse list_agents({}) to find your teammates and their names.\nTo message your Team Lead, use send_message({ target: "lead", message: "..." }).\nTo message another teammate, use send_message({ target: "<teammate name>", message: "..." }).\n</system-reminder>`，接著是一個空行和任務。該字首不含 Team id，停用執行時上下文時也能生效。fork 繼承歷史，不額外新增 Lead 身份訊息。

#### Token 影響

每次 Team member 請求都有固定策略與 schema 成本。初始身份文字隨普通曆史經歷後續步驟、冷恢復和壓縮；外掛不掃描或重新插入它。工具呼叫會增加緊湊 JSON roster、task、wait 或 receipt 結果。Peer 內容由 Team 領域保留在 target 歷史中。

#### KV Cache 影響

provider／model、共享 system 策略和工具 schema 相同時，fork 保留父請求字首並追加帶身份字首的初始任務。工具結果與 peer 訊息追加在可複用請求字首之後。原先在 system prompt 中記錄身份的 Session，首次使用此佈局請求時可能改變該字首；提供者實際快取命中仍為盡力而為。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **一次性子代理工具可見性**——程序內一次性子代理在釋出後才獲得 subagent descriptor。Team 安裝因此可能將它們誤認作 Lead 並暴露 Team 策略和工具。descriptor 將它們識別為非成員後，呼叫會被拒絕。安裝時序修復留待以後處理。

這些限制說明策略與工具無法為一支團隊保證什麼。它們是目前包約束，不是與其他協作方式的對比。

- **提示詞策略只負責協調，不負責 confinement**——它無法阻止 Bash 或外部程序寫入重疊檔案。
- **不會自主建立 Team**——除非使用者明確要求，普通任務不會觸發 delegation。
- **沒有 Web 控制功能**——瀏覽器 roster 與任務板呈現不屬於該執行時包。
- **實驗原型，無穩定性承諾**——本包公開發布，但孵化期間 schema 仍可自由變更。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
