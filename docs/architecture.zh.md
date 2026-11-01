# DeepSeek Harness 架構

[English](architecture.md) | 中文

改動 `packages/` 下的任何內容之前，請先閱讀本文。本文假定你已瞭解 Cordis；如果尚未了解，請先閱讀[入門](cordis-primer.zh.md)或[教學](cordis-tutorial/index.zh.md)。

建議使用 agent（智慧代理）探索程式碼庫並理解其架構。

## Cordis

[Cordis](cordis-primer.zh.md) 是 dsh 底層的框架：外掛向共享上下文貢獻服務、型別化事件和可逆的副作用。產品的每一部分都是外掛，包括模型介面卡、工具註冊表、工作階段日誌，以及 agent loop（智慧代理迴圈）本身，因此每個都可以從設定替換。

不存在需要打補丁的特權核心：擴充功能 dsh 的方式是把外掛掛載到其他外掛旁邊，而各項註冊都是副作用，會在其外掛解除安裝時撤銷。

## Profile 與組合包

執行中的 `dsh` 是一棵外掛樹，由啟動時按序疊加的各層組合而成。

**profile** 是存放在 Harness home 中的具名組裝。它列出自己疊放的組合包，存放自己安裝的樹外外掛，並儲存使用者自己的 `cordis.patch.yml`。`web`、`headless`、`sdk`、`sdk-minimal` 和 `acp` 作為範本隨發行版交付。

**組合包**是 Cordis 設定項及其掛載程式碼的分發格式，因此它插入的內容始終可被其上各層 patch。

兩者都在各自的 `package.json` 中透過 `dsh` 欄位宣告自己：`dsh.profile` 列出一個 profile 的組合包，`dsh.bundle` 指向一個組合包的 patch 檔案。

[`dsh-base`](../packages/bundle/base/README.zh.md) 是 `web`、`headless`、`sdk` 與 `acp` profile 的共享第一層：模型介面卡、工具、持久化、沙箱與審批策略、設定、憑證、遙測。[`dsh-web-app`](../packages/bundle/web-app/README.zh.md) 增加瀏覽器應用，[`dsh-headless`](../packages/bundle/headless/README.zh.md) 增加不帶伺服器的一次性執行器，[`dsh-sdk-app`](../packages/bundle/sdk-app/README.zh.md) 增加 SDK JSON-RPC 伺服器，[`dsh-acp-app`](../packages/bundle/acp-app/README.zh.md) 增加僅用於自動化的 ACP 伺服器。[`dsh-sdk-minimal`](../packages/bundle/sdk-minimal/README.zh.md) 是刻意保留的例外：一個組合包擁有完整的顯式 SDK 設定樹，不應用 `dsh-base`。

各層按此順序應用在空條目列表之上：先按 profile 列出的順序應用每個組合包，然後是 profile 的 `cordis.patch.yml`，然後是 home 級的那份，最後是任意 `--patch` overlay。一條 patch 按 id 定位某個條目並替換其整個 config，或插入新條目。

YAML 控制 HMR：base 啟用僅監視設定的 `dsh-hmr`；Headless、SDK 和 ACP 停用它；`sdk-minimal` 不包含它。Profile patch 覆蓋這些預設值。HMR 協調監聽和過載；啟動器提供 profile 資料和就緒訊號。

base 提供用于 Web 和 Agent 的[外掛管理器](../packages/boot/plugin-manager/README.zh.md)。

要檢視你的機器啟動的設定樹：

```sh
dsh --profile web --dump-config
```

它列印出的任何條目，都可以由你自己的 patch 替換。

組裝機制見 [app-boot](../packages/boot/app-boot/README.zh.md#profiles)；設定欄位見生成的[設定目錄](config-catalog.zh.md)。

<a id="application-launch"></a>

## 應用啟動

受支援的 Node 應用透過具名 `dsh` profile 啟動。隨附 profile 為 `web`、`cch`、`headless`、`sdk`、`sdk-minimal` 和 `acp`，可透過 `dsh --profile <name>` 或 `dsh <name>` 選擇。`cch` 組合 Desktop profile 的組合包。`plugin` 表示管理命令；同名 profile 必須用 `--profile plugin` 選擇。TypeScript SDK 會解析其同版本 `dsh` 依賴並選擇 `sdk`；自定義外掛組合繼續由 profile 與有序 patch 檔案表達，而不是另一個可執行檔案或內聯應用樹。`sdk-minimal` 是位於同一 launcher 後的儲存庫自有獨立組合包，而不是由呼叫方提供的 Cordis 設定樹。

Vendored CLI、僅用於建置和測試的可執行檔案、程序內直接掛載外掛以及私有瀏覽器 WebWorker 預覽都不屬於 Harness 應用啟動器。[`verify-application-entrypoints`](../scripts/verify-application-entrypoints.ts)將每個包 bin、可執行原始碼、根 demo 以及根腳本 `cch`、`start:web` 與 `dev:web` 歸入顯式類別，並拒絕任何繞過 `dsh` 的 Node 應用路徑。

Python SDK 遵循相同的應用架構。其執行時 wheel 把普通 `dsh` CLI 打包為 `deepseek-harness-sdk-runtime-<platform>-<arch>`，用戶端預設以顯式 Harness home 啟動 `dsh --profile sdk`。極簡範例選擇隨附的 `sdk-minimal` profile。Python 暴露 profile 選擇與有序 patch 檔案，而不是完整 Cordis 樹；持久外部外掛透過 `dsh plugin` 安裝。已刪除的私有直讀設定載體沒有相容 bin 或退回 parser。

## 桌面應用

[Electron 桌面應用](../apps/desktop/README.zh.md)在簽名資源中攜帶精確匹配的 dsh 生產執行時，並擁有保留的 `$DSH_HOME/profiles/desktop`。共享 profile helper 初始化其檔案、協調已安裝 bundle，並解析安裝與 bundle 的依賴而不替換 pnpm 擁有的包。CLI 與 Desktop 共享產品資料，可執行包、啟用選擇與鎖檔案保持獨立。公開 CLI 不能管理 Desktop profile。

Electron 使用 Electron Node 模式啟動私有 Desktop Host。Host 呼叫共享 CLI profile runner 與完整 Web 應用。視窗立即載入打包 Web 資源，等待啟動注入後在同一文件中啟用用戶端外掛。Web 負責 RPC 與流；桌面載體將本地頁面連線到已認證的 Host。Node IPC 承載啟動注入、就緒、致命錯誤與關閉。Desktop 預設埠為 `19388`，profile 設定可覆蓋。殼擁有的 UI 透過內建 pnpm 執行外掛事務，並遵循正常使用者與 profile 設定。

## 核心包

以下是向 Cordis 樹貢獻內容的部分核心包。

| 包 | 職責 | `ctx` 鍵 |
|---|---|---|
| [`core/session`](subsystems/session.zh.md) | 僅追加的 `SessionEvent` 日誌和記憶體儲存 | `ctx.sessions` |
| [`core/system-prompt`](subsystems/system-prompt.zh.md) | 提示詞片段與工具 schema 的組裝 | `ctx.systemPrompt` |
| [`core/tools`](subsystems/tools.zh.md) | 作用域化的工具註冊表和帶把關的執行流水線 | `ctx.tools` |
| [`core/agent`](subsystems/core.zh.md) | `Agent` 介面、活躍 agent 註冊表和 `agent/*` 事件 | `ctx.agents` |
| [`core/agent-loop`](subsystems/core.zh.md) | 實作該介面的預設驅動器 | `ctx.agentLoop` |
| [`core/scope`](subsystems/scope.zh.md) | 按 agent 劃分作用域的註冊原語 | 庫，無 ctx 鍵 |
| [`llm/llm`](subsystems/llm-streaming.zh.md) | 訊息與流式詞彙表，以及介面卡 seam | `ctx.llm` |
| [`webhook/webhook`](subsystems/webhook.zh.md) | 已認證 delivery 的分派和 Workspace Session 建立 | `ctx.webhookRuntime` |

<a id="events"></a>

## 事件

事件就是擴充功能點，而選對事件域是大多數改動的第一個決定。

- **工作階段事件**是追加到日誌並透過 `session/event` 廣播的持久事實。當某個事實必須在重新載入後仍然存在時，使用它。
- **Agent 事件**（`agent/*`）攜帶活躍 `Agent`：inbox、步驟、狀態、請求、驗證、續跑。要觀察或攔截進行中的工作時，使用它。
- **能力事件**無需匯入迴圈即可向某個 seam（`fs/*`、`tools/*`、`telemetry/*`）附加策略和介面卡。

AgentLoop 在啟動已排隊工作前等待序列 `agent/created` 初始化。初始化失敗會復原建立；[agent-loop](../packages/core/agent-loop/README.zh.md#understand-the-implementation)定義 teardown 順序。

[事件對映](event-producer-consumer.zh.md)列出每個事件的生產方與消費方。

<a id="turn-flow"></a>

## 輪次流程

一個**步驟**是一次模型請求加上它呼叫的工具。一個**輪次**包含零個或多個步驟：它在領取首條輸入之前開啟，並在不再欠下任何工作時關閉。

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas; project runtime context
  -> agent/pre-step                   reject | enter(messages, startsRequestSeries?)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     agent/request -> prepareCall (cancellation commits neither system nor users)
     reconcile system/message using the prepared call capability
     append entered messages as user/message; log request/header and request/context as needed
     derive and freeze model history from the log
     stream the bound prepared call -> llm/stream -> agent/assistant-stream start
       agent/assistant-stream chunk*
       assistant/message | assistant/attempt -> agent/assistant-stream end
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

`turn/*`、`step/*`、`system/message`、`user/message`、`assistant/message`、`assistant/attempt` 和 `tool/*` 是持久工作階段事件；其餘是分屬三個事件域的即時擴充功能點。`agent/assistant-stream` 釋出程序本地 start、瞬態 chunk 與 end frame。loop 會在 committed end frame 前把完整緊湊 stream 提交為一個 message 或僅日誌 attempt；Web Session-follow adapter 是該 live event 唯一的遠端消費方。`agent/pre-step`、`agent/request`、`llm/stream` 和三個 `tools/*` 事件是 waterfall（瀑布式事件），其監聽器必須呼叫 `next()` 才能委託下去；`agent/turn-stopping` 是 serial 事件，沒有 `next()`。

輸入透過同一個 inbox 到達驅動器；注入的上下文等待一條喚醒訊息。AgentLoop 的持久 `inbox` 投影使待處理輸入在沒有活躍 Agent 時仍可讀取。

`agent/pre-step` 決定接納的輸入。監聽器可以改寫或拒絕已領取訊息；首次領取被拒絕或為空時，關閉不含步驟的持久輪次。enter 決策可設定 `startsRequestSeries`：迴圈記錄新的 `request/header`（原因為 `series`，或在封裝同時變化時為攜帶 `startsSeries: true` 的 `change`）。包裝監聽器透過 `{ ...decision, messages }` 保留該宣告。組裝與 `step/start` 之後，`agent/request` 和 `prepareCall()` 先解析實際路由，再提交系統提示詞與已接納使用者訊息；在任一非同步階段取消都不會提交這兩者。提示詞准入依據已準備呼叫的能力，而非先前的 `request/context`。每次嘗試同步協調同一份已渲染組裝結果、僅在首次嘗試追加使用者訊息、按需記錄 header/context、派生並凍結請求，再透過繫結呼叫發起流式請求。重試不重複組裝或 `agent/pre-step`。附接後的 surface 替換和圖片省略決定開啟新請求序列，包括恢復後的首次 pre-step 中發生的替換；未變化的恢復延續序列。首次接納的步驟在使用者訊息之前預留系統頭節點，即使提示詞為空（不產生協定訊息）。提示詞僅透過 `system/message` 歷史傳遞：空渲染文字清除所有生效的系統節點，模型不再看到舊提示詞；具備能力的路由可在快取字首之後追加非空更新，包括同時發生的受支援工具更新；不具備能力的路由與新請求序列將非空提示詞文字歸併到首個系統節點，併為非空的後續系統節點記錄空內容替換（[決策](../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.zh.md)；[決策規則](../packages/core/agent-loop/README.zh.md#understand-the-implementation)）。

迴圈傳送不可變請求，同時保持取消有效，僅對完全凍結的物件複用凍結證據；[agent-loop](../packages/core/agent-loop/README.zh.md) 負責請求建置與取消原因。

詳情見[時序圖](agent-lifecycle.zh.md)、[工具流水線](tool-execution-pipeline.zh.md)和[取消與錯誤恢復](subsystems/core.zh.md#the-agent-handle)。

## 工作階段日誌

工作階段日誌是模型所見上下文的來源。`deriveMessages()` 從中投影出模型歷史。每個 `assistant/message` 都嵌入產生其組裝內容的精確緊湊帶時間 stream；`assistant/attempt` 保留已到達 settlement 的失敗、重試、取消與 stream error attempt，且不新增模型歷史。fork、恢復、transcript（文字記錄）、遙測與持久化都從這些持久 settlement 派生，即時 UI 增量則來自 `agent/assistant-stream`；如果程序在 settlement 前硬中斷，則不會留下持久 attempt stream（見[決策](../.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.zh.md)）。

Session 消費方只瞭解目前邏輯格式。僅 header 的 `stat` 與 `list` 會重新掃描每個 Session 目錄，選擇數值最高的規範 generation，並在不載入事件或釋出後繼的情況下轉換受支援的歷史 header。已儲存 Session 的 `open` 選擇同一 generation，拒絕未來版本，或只 Decode 並組合一次建置時靜態確定的相鄰遷移鏈，再返回經過驗證的目前邏輯事件。只讀 open 直接使用這份記憶體結果，不釋出後繼；寫 open 則先編碼、驗證並在未改變源的旁邊排他釋出最終版本命名的後繼。未被後續事件封住的普通中斷尾部仍由控制代碼消費方修復；只有在後續 `turn/start` 已經封住一種有限的已釋出 restart 時，migration 才會插入缺失的 interrupted `turn/end`。JSONL v0 使用 `session.jsonl[.zstd]`，v1 及後續版本使用小寫 `session.vN.jsonl[.zstd]`；已提交 generation 路徑絕不重新命名、替換或刪除。JSONL provider 負責物理 framing、壓縮、generation 選擇與排他釋出，每個相鄰遷移包只負責一個 `vN -> vN+1` 步驟（[決策](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)）。

**模型可見即已記錄。** 執行時不變數檢查模型請求是否可從日誌重建。新增模型可見輸入需要工作階段事件。修改現有訊息內容的外掛註冊[純訊息投影](subsystems/session.zh.md#plugin-owned-message-projections)，獨立讀取器顯式傳入相同的處理器。 工具變更不依賴能力；[Session 工具歷史](../packages/core/session/README.zh.md)提供提供者宣告。

**投影 seam。** `dsh-session-projection` 提供 `ctx.sessionProjections`：已註冊單元增量摺疊已提交事件，host 消費方透過 `stateOf()` 讀取單個型別化狀態，載體透過 `snapshot()` 批次取得裁剪後的用戶端檢視。host 讀取方要麼在啟用時要求該服務，要麼在註冊表或必需 key 缺席時明確失敗。貢獻方可以保留 `ctx.inject(['sessionProjections'], ...)` 註冊，但不能為缺失的 host 值靜默提供預設值。agent loop 為讀取方註冊共享的 `turnBoundary` 狀態（[決策](../.agents/notes/implemented/architecture/2026-08-19-session-projection-mandatory-seam.zh.md)）。

## 能力 seam

一個 **seam** 是一項可替換能力，包含三種角色：宣告介面的 **Service Definition**、實作它的 **Service Provider**，以及使用它的 **Consumer**（通常是面向模型的工具）。一個包可以合併承擔多個角色，但單一角色本身不是 seam；新增一項能力意味著把三者一併設計（[能力圖](capability-seams.zh.md)）。

seam 正是替換一個提供者就能改變整個產品的原因。檔案系統與程序提供者共享同一個執行世界，因此把它們指向遠端沙箱，也就把 Bash、PTY 和 LSP 一併搬了過去，無需提供者專用 fork。[subagent 提供者](subsystems/subagent.zh.md)在同一個介面之後同樣千差萬別，從新建一個子 agent，到把一個輪次委派給另一個產品。

[實驗性 Agent Teams](subsystems/agent-team.zh.md) 是 `ctx.agentTeams` 上公開發布、顯式啟用的協作 seam，在可繼續 subagent 之上提供持久 roster、任務板和 mailbox。

## 新行為的歸屬位置

新行為附加到已有文件記錄的擴充功能點。改動迴圈本身時，本對映隨之更新。

| 目標 | 機制 |
|---|---|
| 新增模型提供者 | 在 `ctx.llm` 上註冊其介面卡 |
| 新增面向模型的能力 | 在 `ctx.tools` 上註冊；其 schema 加入提示片語裝 |
| 讓某個工作階段擁有不同的能力集合 | 組裝一個 agent preset；其中的服務行需要 `isolate` realm |
| 新增 shell 執行 | 註冊 `ctx.shell` 後端；本地後端透過 `ctx.subprocess` spawn 程序 |
| 新增持久化終端執行 | 註冊 `ctx.terminals` 後端和 `dsh-tool-terminal` |
| 新增使用者命令 | 在 `ctx.commands` 上註冊；它無需模型輪次即可分派 |
| 管理後臺任務 | 在 `ctx.jobs` 上註冊；`job_*` 工具讀取或停止任務 |
| 從外部 webhook 啟動 Session | 在 `ctx.webhookRuntime` 上註冊可信規則，並掛載提供者介面卡 |
| 新增檔案系統存取或策略 | 註冊 `ctx.fs` 提供者，或監聽 `fs/*` 事件 |
| 限制所啟動的程序 | 使用 `ctx.sandbox` 後端；消費方在啟動程序前包裝 argv |
| 攔截請求、工具或輪次 | 使用相應的 `agent/*` 或 `tools/*` 事件；`agent/turn-stopping` 會停止輪次 |
| 新增模型可見上下文 | 呼叫 `agent.inject()`；它會落到下一次獲准的請求中 |
| 新增 UI 或編輯器整合 | 驅動 `ctx.agents` 並從 `session/event` 渲染 |
| 新增 Web Client Chat 節點 | 註冊 `ConversationNodeDefinition` + keyed renderer |
| 新增持久工作階段狀態 | 擴充功能 `SessionEventMap`；從日誌渲染和回放 |
| 生成工作階段標題 | 註冊唯一的 `ctx.sessionTitle` 提供者 |
| 管理同工作階段目標 | 使用 `ctx.goals`；透過 `agent/*` 續跑 |
| 在輪次邊界 fork 工作階段 | `ctx.agents.create({ sessionId, seed, meta: { parentSession, seedLength } })`——只有經 agent-loop 釋出的工作階段才會持久化 |
| 在新後端儲存工作階段 | 基於共享的控制代碼腳手架實作 `SessionPersistence`（`create`/`open`/`stat`/`list`/`export`） |
| 將註冊項限定到單個 agent | 使用該 agent 的 `agent.ctx` |

[擴充功能實操手冊](cookbook/extension-cookbook.zh.md)將功能對映到能力，並索引[包](cookbook/adding-a-package.zh.md)、[工具](cookbook/adding-a-tool.zh.md)、[LLM（大語言模型）介面卡](cookbook/adding-an-llm-adapter.zh.md)和[設定頁](cookbook/adding-a-settings-card.zh.md)的分步指南。[Conversation 子系統](subsystems/conversation.zh.md)負責 Chat node 組裝。
