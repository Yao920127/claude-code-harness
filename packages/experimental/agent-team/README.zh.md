---
description: "在一個工作階段中執行一個小型具名 agent（智慧代理）團隊：成員之間的持久訊息與共享任務板，用於組合實驗性 Team 外掛的部署。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-team

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-team` 把一個編碼工作階段變成一個小型工作團隊：工作階段中的 agent 成為 Lead，建立具名 teammate 處理委派的工作，與它們交換持久訊息，並在公共任務板上跟蹤共享任務。訊息與任務狀態能挺過崩潰、reload 與中斷，因此離線的 teammate 會在恢復後收到排隊的訊息。它本身不提供任何工具——請掛載兄弟包 `dsh-experimental-tool-agent-team`，讓模型能夠建立 teammate、給它們發訊息並使用任務板。它以實驗性名稱公開發布、不承諾穩定性，並且需要持久工作階段儲存才能啟用。

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

當一個 agent 應該在自己的工作目錄中執行一支小型具名助手團隊、且訊息與任務狀態需要挺過崩潰與重新啟動時，把本包加入組合。它本身不帶工具：請與 `@deepseek-ai/dsh-experimental-tool-agent-team` 一起掛載，讓模型能夠建立 teammate、給它們發訊息並使用任務板。

### 何時選擇

當多個 agent 必須在同一個共享工作區協作、且 roster、訊息與任務狀態需要挺過崩潰與重新啟動時，選擇它。當 teammate 需要獨立工作目錄、多個程序需要協調同一支團隊、或任務 owner 需要自動釋放時，請不要選擇——這些都不受支援。團隊功能需要持久工作階段儲存才能啟用。

### 最小工作設定

<a id="smallest-working-setup"></a>

對現有組合的最小增量是持久工作階段儲存加兩個 Team 包：

```yaml
# smallest team setup — durable storage plus both Team packages
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-experimental-agent-team'
- name: '@deepseek-ai/dsh-experimental-tool-agent-team'
```

工具安裝後，模型會按請求完成其餘工作——例如先「建立一個名為 reviewer 的 teammate 檢查 diff」，再「把變更摘要發給 reviewer」。所有限制都是可選的，並在啟動時驗證：

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxMembers` | `16` | 一支團隊最多可建立的 teammate 數，包括失敗的 |
| `maxTasks` | `256` | 任務板上最多的活動任務數 |
| `maxPendingMessagesPerMember` | `64` | 單個成員最多可排隊的訊息數 |
| `maxMessageBytes` | `65,536` | 單條傳送訊息的最大尺寸 |
| `disposalTimeoutMs` | `5,000` | 關閉清理允許的時間 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-agent-team)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### Teammate

請 Lead 建立 teammate：給它一個唯一的小寫名字（例如 `reviewer`）並描述其職責。teammate 可以 fresh 啟動（不攜帶 Lead 對話的任何記憶），也可以作為 fork 啟動（繼承 Lead 已完成的輪次）；建立請求決定用哪種。teammate 名字是永久的——即使建立失敗的 teammate 也保留其名字，任何名字都不會被複用。

roster 顯示每個成員的職責（`lead` 或 `teammate`）與目前狀態：`running`、`inactive`（目前沒有執行輪次，包括已載入和僅儲存的成員）、`provisioning` 或 `failed`。未載入的成員會在喚醒後收到其訊息。

只有 Lead 可以建立 teammate 或中斷它們。

### teammate 之間的訊息

任何成員都可以向任何其他成員或 Lead 傳送訊息。live 成員會立即收到；離線成員的訊息會排隊，並在其恢復後到達。訊息不會丟失，也不會重複投遞。

每條訊息都使用 Steer：running target 在最近的步驟邊界收到訊息，inactive target 在已載入時啟動一個輪次，否則冷恢復。傳送方始終能看到結果——target inbox 已接受，或在投遞暫時不可用時保留為 queued。排隊的訊息已經安全儲存，因此絕不能重發。

### 共享任務板

任何成員都可以新增任務，包含標題、詳情、對其他任務的可選依賴，以及可選的檔案觸及提示。只有其全部依賴完成後，任務才可 claim。

任務有 owner：成員 claim 任務開始工作，完成後標記完成、釋放回板或重新開啟；Lead 可以把任務分配給任意成員。每次變更都是 compare-and-set：基於過期副本的更新會被拒絕，因此兩個成員不會悄悄覆蓋彼此的成果。

當兩個 in-progress 任務計劃觸及重疊路徑時，檔案提示會產生警告——它們絕不阻止任何操作。已刪除任務保留在歷史中，但從活動列表中消失。

### 等待與中斷

成員可以等待下一次團隊變化——teammate 的狀態、新訊息或任務更新——而不必反覆輪詢；等待只報告是否超時，呼叫方隨後重新讀取目前狀態。

Lead 可以停止 teammate 的目前輪次，而不會刪除其排隊的訊息；任務歸屬不變。

### 成功與失敗的表現

成功的表現是：teammate 出現在 roster 中、訊息報告 `accepted` 或 `queued`、任務 revision 隨每次變更遞增。可能的失敗會以具體錯誤報告，而不會悄悄破壞狀態：發給不存在的成員名字、claim 尚未就緒的任務、用過期 revision 編輯、或超出成員上限建立 teammate。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務背後的設計決策並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本服務建立在一個分離與三項承諾之上：

- **持久日誌，派生狀態。** Lead 工作階段日誌是唯一真源；roster、mailbox 與任務狀態每次讀取都從中回放。
- **程序內歸屬。** 所有協作都位於單一程序；保證是重試加去重，絕不是跨程序共識。
- **顯式權限。** 每個服務方法都接收確切的即時呼叫方 `Agent`；只有 Lead 可以 spawn、reassign 或 interrupt。
- **超出上限時明確失敗。** 每個限制都是經過驗證的部署值，耗盡時報告型別化錯誤，而不是複用 id 或名字。

[Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)負責身份、mailbox、任務與共享 checkout 決策。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、服務註冊、恢復排程 |
| [`src/roster.ts`](src/roster.ts) | Team 身份、成員關係解析、provisioning 與 roster 拆除 |
| [`src/mailbox.ts`](src/mailbox.ts) | 持久佇列、目標本地投遞、確認與恢復 |
| [`src/task-board.ts`](src/task-board.ts) | 任務 CAS 命令、DAG 驗證與派生檢視 |
| [`src/journal.ts`](src/journal.ts) | 序列化的 Lead 日誌事務與提交通知 |
| [`src/projection.ts`](src/projection.ts) | 解碼並驗證 Team 事件、釋出 `agentTeam` 用戶端檢視的嚴格回放投影 |
| [`src/task-view.ts`](src/task-view.ts) | 任務板與用戶端檢視共用的純任務派生：就緒狀態、owner 名稱與寫入範圍重疊 |
| [`src/activity.ts`](src/activity.ts) | 一次性變更等待者與 dispose（資源釋放）時的等待解除 |
| [`src/lifecycle.ts`](src/lifecycle.ts) | 共享准入截止與有界結算 |
| [`src/invariant.ts`](src/invariant.ts) | 在 append 前回放候選事件的不變式伴生外掛 |

### Team 身份與 roster

每個普通執行時 root 都是一個隱式 Team 的 Lead，其 `TeamId` 等於 `SessionId`；不存在建立事件，持久狀態從第一條成員、訊息或任務記錄開始。`spawnTeammate()` 先追加並 flush 一條 `provisioning` 成員記錄，再要求設定的提供者建立預留 child；提供者失敗會追加一條持久的 `failed` 成員。fresh child 不攜帶 Lead 歷史；fork child 只捕捉一次 Lead 的已完成 turn 字首。恢復把未終結的 provisioning 記錄對照 child 獨立持久化的工作階段進行對帳：直接 parent 與 continuable descriptor 匹配、且初始使用者訊息已記錄則產生 `active`，其他任何情況都產生 `failed`。如果恢復在同程序競爭中先完成，creator 會接受終態，或報告 `TEAM_PROVISIONING_CONFLICT` 並 drain 該 child。名字由第一條 provisioning 記錄保留，且永不復用。

### 持久 mailbox

`sendMessage()` 驗證 peer 成員關係，追加 `team/message/queued` 並在嘗試投遞前 flush。目標訊息以 `Team message <id> from <name>:` 開頭，並在 `TeamMessageSource` 中保留同一 id 與傳送者。只有目標工作階段在 pending inbox 或已記錄歷史中持久持有訊息身份後，才會以 `team/message/delivered` 確認投遞。即時准入按目標與持久佇列順序序列化；恢復按同一順序重新投遞 queued-minus-delivered 記錄。重試前會同時摺疊 live 與持久目標 inbox／歷史狀態，因此 inbox 已接受但模型尚未 claim 時發生崩潰不會複製訊息。該保證是程序內重試加 target 工作階段去重，而不是跨程序 exactly-once 投遞。

投遞給 Lead 時直接呼叫 `Agent.steer()`。投遞給 teammate 時使用 continuation owner 的 host-only Steer 路徑；該路徑會保留 Team 傳送者 source，同時授權 Lead-to-child edge 並冷恢復 inactive target。sibling 訊息絕不會透過公開的相鄰 Agent 訊息操作偽裝成 Lead。

### 共享任務板

任務是完整版本化快照；每次變更都攜帶 `expectedRevision`，陳舊呼叫方會收到 `TEAM_TASK_STALE_REVISION`，而不會覆蓋更新的值。數字 `task-<n>` id 的字尾必須是安全整數，id 空間耗盡時報告 `TEAM_TASK_LIMIT`，而不是複用最後一個 id。已刪除任務作為 tombstone 保留以供回放與維持 id 穩定，但不佔用 `maxTasks`，也不出現在 `listTasks()` 中。`writeScopes` 是規範化後的 workspace 相對字首；檢視會對與 in-progress 任務的重疊發出警告，但絕不阻止 claim 或授予寫權限。

### 等待與中斷

`waitForChange()` 等待註冊之後發生的下一條 roster、task、mailbox 或即時狀態邊，時長從 10 秒到 1 小時，並且只報告是否超時；執行時 dispose 會釋放目前等待。取消會保留 Error reason；非 Error reason 則透過 `TEAM_WAIT_ABORTED` 報告。`interrupt()` 僅限 Lead，委託 continuable-subagent 的 interrupt 路徑，以 `keepInbox` 只取消 live teammate 的目前 turn；它既不釋放任務 owner，也不刪除持久 mail。

### 永續性模型

Team 事件追加到精確的 live Lead 工作階段，並在操作報告成功或喚醒等待者之前 flush。`team/member`、`team/task`、`team/message/queued` 與 `team/message/delivered` 僅存在於日誌：它們從不進入工作階段表面，因此派生模型歷史不受協作記錄影響。順序與時間由工作階段事件的 `seq` 與 `time` 負責，快照不重複儲存。`./invariant` 伴生外掛把每條候選 Team 事件對照已提交字首回放，並在 append 前拒絕非法轉換。

原生 V4 的 Team 事件及檢查點准入會拒絕退役的 `tool-result` 內容，防止它進入電子郵件狀態。歷史轉換由 Session 格式遷移負責，Team 投影不轉換舊包裝。

Mailbox 投影與 checkpoint 准入保留本地宣告的驗證器之外獲准內容中全部已解碼 JSON 欄位，包括自有 `__proto__` 鍵。本地欄位檢查覆蓋 `text`、`reasoning`、`image` 和 `tool-call`；獲准的未知標籤保持不透明。Team 投影快取版本 4 從 Session 日誌重建較早快取版本的 checkpoint；Session 格式版本保持不變。

### Dispose

dispose 會關閉准入、中止並等待已獲准的建立與 mailbox dispatch 事務，再讓 continuation owner 釋放 roster 中確切的 live direct child 及其後代；Lead 的非 Team continuable child 不受影響。cleanup 失敗會讓 dispose 明確失敗，並以 `disposalTimeoutMs` 為上限。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享子系統型別逐步進入工具表面與設計背後的決策。

- [Agent Teams 子系統](../../../docs/subsystems/agent-team.zh.md)——持久 Team 型別與 `ctx.agentTeams` 服務 API。
- [tool-agent-team 包](../tool-agent-team/README.zh.md)——讓模型建立 teammate、向其傳送訊息並進行協調的工具。
- [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)——身份、mailbox、任務與共享 checkout 決策。
- [實驗包決策](../../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.zh.md)——位置、公開發布與依賴隔離。

-----

<a id="model-experience"></a>

### 瀏覽器投影

`agentTeam` Session 投影釋出 Lead Session 的持久成員身份與階段、成員錯誤、未刪除任務檢視，以及最後有效狀態旁的 `failure`。其 `apply` 只替換被觸及的集合；僅電子郵件的變化保留用戶端檢視引用，不產生 frame。[子系統參考](../../../docs/subsystems/agent-team.zh.md#web-projection) 定義傳輸型別。

[Web UI](../client-ui-agent-team/README.zh.md) 讀取共享 Session 投影，並從 Session 狀態疊加活動資訊。任務建立與更新由 Team agent 透過服務和模型工具完成。`./client` 匯出可供瀏覽器使用的 roster、任務與投影型別。

## 模型體驗

### Peer 訊息

#### 模型看到什麼

每條已投遞 peer 訊息都是使用者角色訊息。第一個短文字塊包含穩定訊息 id 與傳送者，之後原樣附加傳送者的內容塊。roster、task 與 mailbox 記錄僅存在於日誌，絕不進入派生模型歷史。

#### Token 影響

每次 peer 投遞都會把傳送者字首與訊息內容加入 target 歷史。任務與 roster 變更不增加模型 token；其面向模型的呈現屬於 `@deepseek-ai/dsh-experimental-tool-agent-team` 結果。

#### KV Cache 影響

Peer 訊息追加在 target 可複用歷史字首之後。冷恢復會先複用持久對話，再追加尚未投遞的訊息。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明一支團隊目前不能做什麼、或哪些方面需要特別的運維關注。它們是目前包約束，不是與其他協作機制的對比。

- **完整檢視廣播** — 每次 roster 或任務變化都會把完整 roster 和未刪除任務板（含描述）發給所有已連線瀏覽器，即使它正在檢視其他 Session。
- **實驗原型，無穩定性承諾**——本包公開發布，但孵化期間約定仍可自由變更。
- **單程序、共享 checkout**——成員共享 cwd，修改立即可見；本包不提供 worktree、遠端成員、merge 或檔案鎖。
- **write scope 僅作提示**——Bash、formatter、程式碼生成器與直接外部寫入可以繞過檔案版本檢查；Lead 必須協調 owner 並檢查最終 diff。
- **扁平且不可變的 roster**——只有 Lead 可以建立直接 teammate；不支援巢狀 Team、重新命名、刪除或名字複用。
- **不會自動釋放 owner**——成員不活動、interrupt、程序退出與工作失敗都不會釋放任務 owner。
- **mailbox 不保證跨程序 exactly-once**——不支援多個 harness 程序並行操作同一 Team。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性。

#### Promotion

promotion 到產品角色組需要按[實驗子樹規則](../AGENTS.md)審查公共約定、限制、測試證據、釋出載荷、執行時依賴與具名穩定 owner。

#### 未來方向

尚未決定的探索方向包括巢狀 Team、自動釋放 owner 的策略、跨程序 mailbox 事務，以及透過 worktree 實作檔案系統隔離；這些都沒有承諾。

</details>
