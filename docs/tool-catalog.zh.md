<!-- 英文原始檔由 scripts/gen-tool-catalog.ts 生成；本中文件案是透過雙語配對維護的經評審對側。
     更新時先執行 `pnpm run gen-tool-catalog` 更新英文，再更新本檔案並執行 `pnpm run verify-translation-pairing --write docs/tool-catalog.md` 重新記錄配對。 -->

# 工具 Schema 目錄

[English](tool-catalog.md) | 中文

已釋出外掛向 `ctx.tools` 提供的所有面向模型的工具：模型透過系統提示片語裝獲得的 `name`、`description` 和 JSON Schema `parameters`。本目錄是[子系統頁面](subsystems/core.zh.md)（型別及每頁生成的 `cordis-surface` 接線區域）的補充；本頁列出的是向 agent（智慧代理）提供的*工具*。

英文原始檔由系統**生成**，並透過 `pnpm run verify-tool-catalog`（`doc-sync`（文件同步門禁）的一部分）驗證新鮮度；本中文件案作為經評審對側透過雙語配對維護。與 Cordis 目錄（純原始碼 AST 處理）不同，英文生成器會在真實上下文中**啟動**每個工具外掛並讀取 `ctx.tools.schemas()`，因為工具 schema 無法透過靜態分析完全確定，例如執行時展開的列舉、拼接的描述、由設定決定的名稱以及使用原始 JSON Schema 的 MCP 工具。完整性守衛會 glob 匹配 `packages/*/tool-*`；如果生成器的啟動 manifest（中繼資料清單）遺漏任何包，檢查就會失敗，因此新工具不會在無人察覺的情況下缺少文件。

範圍：`packages/*/tool-*` 下已釋出的產品工具，每個工具均使用其**預設**設定啟動；但如果某個 Config 欄位是**必填項**且沒有預設值，生成器就必須作出選擇，對應包的說明會記錄本頁展示的是哪個分支。註冊的工具**名稱**可以是載入時設定，例如 `tool-subagent` 的 `toolName`，因此部署可能以不同名稱或額外名稱提供某個包；如果存在隨產品釋出的別名，對應包的說明會予以記錄。`examples/` 中的演示工具（例如 `echo`）不在範圍內，這與 Cordis 目錄僅涵蓋包的範圍一致。

<a id="tool-package-map"></a>

## 工具包對映

下表將模型可見的工具名稱與其背後的外掛包和服務 seam 對應起來。各包章節隨後給出確切的 JSON Schema。

| 工具包 | 模型可見名稱 | 依賴 | 寫入／影響 | 隨產品釋出的別名 | 部署說明 |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-plugin-manager` | `plugin_manager` | `ctx.tools`, `ctx.pluginManager`, `ctx.sandboxPolicy` | `tool/call`, `tool/result`, `user/message` | - | - |
| `@deepseek-ai/dsh-mcp-resources` | `list_mcp_resource_templates`, `list_mcp_resources`, `read_mcp_resource` | `ctx.tools`, `ctx.mcpResources` | `tool/call`, `tool/result` | - | - |
| `@deepseek-ai/dsh-experimental-browser-use-stagehand-native` | `stagehand_act`、`stagehand_extract`、`stagehand_navigate`、`stagehand_observe`、`stagehand_screenshot`、`stagehand_tabs` | `ctx.browserUse`、`ctx.agents`、`ctx.tools`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | - |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | `ctx.tools`、`ctx.userQuestions` | `tool/call`、`tool/result after a UI/provider answers the question` | - | ask_user_question 會暫停工具呼叫，直到目前 UI 提供者返回人類答案。 |
| `@deepseek-ai/dsh-tools` | `run_code` | `ctx.tools`、`ctx.ptcRuntime (execution time)`、`ctx.systemPrompt` | `tool/call`、`one tool/ptc-dispatch-start + tool/ptc-dispatch pair per bridged sub-call`、`tool/result` | - | 在 `mode: ptc`／`mode: both` 下，它由工具註冊表所有，作為可過濾能力層之外的保留傳輸機制（參見 PTC mode Agent Note）。在 `ptc` 下，它是註冊表對協定格式（wire format）的唯一貢獻；其他可見能力在使用已載入執行時語言生成的 SDK 章節中宣告。程式透過 binding 呼叫這些能力，呼叫按照原生並行約定排程：啟動順序和策略遵循提交順序，並行安全的函式體最多重疊執行 `maxParallelSubCalls` 個。呼叫會重新進入完整且受守衛保護的工具流水線，並將每個巢狀執行關聯到此外層結果。 |
| `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` | `ctx.tools`、`ctx.systemPrompt`、`ctx.userQuestions (execution time, opportunistic)` | `tool/call`、`plan/mode inactive on an approved review`、`tool/result` | - | 規劃未啟用時，exit_plan_mode 仍保留在面向模型的 schema 中，這樣狀態轉換不會在規劃策略變更之外額外造成工具目錄變動。其執行路徑會拒絕規劃模式之外的呼叫；在規劃模式下，它透過使用者互動 seam 提交計劃（批准／根據回饋繼續規劃），批准後會在步驟邊界記錄規劃模式已停用。 |
| `@deepseek-ai/dsh-tool-bash` | `bash` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs for run_in_background and the job-backed foreground path` | `tool/call`、`tool/result` | - | bash 工具是 bash 執行器 seam 面向模型的消費方。組合中有 job 註冊表時，每次呼叫一啟動就註冊到通用 `ctx.jobs` 執行時，並透過 `job_*` 工具（來自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；沒有註冊表或 `enableRunInBackground: false` 時，工具註冊不帶 `run_in_background` 參數的純前臺 schema。 |
| `@deepseek-ai/dsh-tool-present` | `present` | `ctx.tools`, `ctx.fs`, `ctx.sessionProjections` | `tool/call`, `deliverables/presented 在成功的最終結果之後`, `tool/result` | - | 交付歸呼叫方 Session 所有；Web ui-deliverables 提供原始檔開啟與卡片。 |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs for run_in_background and the job-backed foreground path` | `tool/call`、`tool/result` | - | pwsh 工具是 Windows 組合中 bash 執行器 seam 的 PowerShell 方言消費方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 執行器為 `ctx.shell` 提供後端）；除沙箱介面外，它逐項對應 bash 工具呼叫。使用 `run_in_background` 的執行會註冊到通用 `ctx.jobs` 執行時，並透過 `job_*` 工具收集／停止；託管的 `DSH_*` 環境來自 `@deepseek-ai/dsh-shell-env`。每次呼叫都在新程序中執行，不使用持久 PTY 工作階段。路徑採用原生 `C:\...` 形式，變數採用 `$env:NAME`。 |
| `@deepseek-ai/dsh-tool-cordis` | `cordis_inspect_list`, `cordis_inspect_query` | `ctx.tools`, `ctx.cordisInspect` | `tool/call`, `tool/result` | - | 創造模式提供兩個只讀執行時檢查工具。Cordis host runner 提供檢查註冊表；Client 查詢需要已連線頁面。持久化變更編寫為組合包，再透過 plugin_manager 安裝。 |
| `@deepseek-ai/dsh-tool-bash-persistent` | `bash` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一個按所有者隔離的持久 bash 工具；部署組合提供 PTY 後端，並可覆蓋面向模型的環境描述。 |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | `pwsh` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一個按所有者隔離的持久 pwsh 工具，持久 bash 工具的 Windows 對應物；部署組合提供 pwsh 方言的 PTY 後端，並可覆蓋面向模型的環境描述。 |
| `@deepseek-ai/dsh-tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`、`ctx.fs` | `tool/call`、`fs/observed after view presence/absence, edit absence, or successful mutation`、`tool/result` | - | 基於檔案系統 seam 的獨立檢視／建立／唯一字面量替換／按行插入工具；可與任何 shell 或終端介面組合。 |
| `@deepseek-ai/dsh-tool-fs` | `edit`、`read`、`read_image`、`write` | `ctx.tools`、`ctx.fs`、`ctx.systemPrompt`、`ctx.attachments (image-tool registration)`、`ctx.llm + an image-capable route (image-tool execution)` | `tool/call`、`fs/write-intent or fs/edit-intent for mutations`、`fs/observed after read presence/absence or successful file operation`、`durable attachment (read_image)`、`tool/result` | - | 先讀後寫／編輯策略由 `@deepseek-ai/dsh-fs-observation-policy` 新增；它是一個 `fs/*` 事件門禁外掛，不會改變 schema。載入這些工具的部署按預期也應載入該外掛。沒有 `ctx.attachments` 時圖片工具不會註冊；其 schema 與路由無關，執行時除非確切路由的模型宣告圖片輸入，否則拒絕。 |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`、`grep` | `ctx.tools`、`ctx.subprocess`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | glob 和 grep 是無條件可用的發現工具，透過 ctx.subprocess spawn 隨包提供的 ripgrep 二進位制檔案（`@vscode/ripgrep`），並作為普通前臺呼叫執行，絕不作為後臺任務；無需在主機安裝 `rg`，也不經過 shell 層。本目錄使用 `sampleOverCapGlobResults: true`；部署必須顯式選擇該行為。結果超過上限時，會透過可選的 ctx.spillStore 後端儲存完整的格式化列表；在共置部署中，如果後端公開本地路徑，返回的定位資訊可供後續讀取／搜尋。 |
| `@deepseek-ai/dsh-tool-terminal` | `terminal_close`、`terminal_list`、`terminal_open`、`terminal_read`、`terminal_send`、`terminal_signal` | `ctx.tools`、`ctx.terminals`、`ctx.systemPrompt`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | 這 6 個終端工具需要選擇啟用，用於補充一次性 bash／檔案系統工具。`terminal_send(run_in_background: true)` 會註冊到 `ctx.jobs`；schema 不包含 TUI、具名按鍵序列、BEL、調整尺寸、自動啟動和跨 agent 共享。 |
| `@deepseek-ai/dsh-tool-goal` | `create_goal`、`get_goal`、`update_goal` | `ctx.tools`、`ctx.agents`、`ctx.goals`、`ctx.systemPrompt`、`a calling Agent in an authorized open turn` | `tool/call`、`goal/change for mutations`、`tool/result` | - | create、edit、pause 和 resume 要求直接來自人類的根權限；complete 和 blocked 也接受確切的目前 Goal Round。blocked 的預設下限是 3 個獲准的 Round。 |
| `@deepseek-ai/dsh-schedule` | `schedule_create`、`schedule_delete`、`schedule_list`、`schedule_update` | `ctx.tools`、`ctx.schedule`、live 根 Agent | `tool/call`、Schedule storage domain 建立、更新或刪除、`tool/result` | - | Schedule 服務載入期間，在 live 根 Agent scope 內註冊。接受 after_seconds、顯式絕對 at、有界固定速率 every_seconds、帶顯式 IANA 時區的每日與每週本地時間，以及作為五欄位表示式的 cron。管理使用主機 storage domain；到期訊息會恢復原 Session。 |
| `@deepseek-ai/dsh-tool-lsp` | `lsp` | `ctx.tools`、`ctx.lsp`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | lsp 工具將提供者選擇和語言伺服器子程序置於 ctx.lsp 之後，因此其模型可見 schema 在更換提供者時保持穩定。執行時要求已註冊提供者，例如 `@deepseek-ai/dsh-lsp-stdio`；如果沒有提供者，查詢會返回結構化 `LSP_UNAVAILABLE` 錯誤，而不會改變 schema。 |
| `@deepseek-ai/dsh-tool-ralph` | `ralph` | `ctx.tools`、`ctx.workflowEngine`、`ctx.subagents`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents every fresh round)` | `tool/call`、`tool/result`、`workflow and child session events during execution` | - | 固定的前臺工作流會在每個 Round 啟動一個全新的結構化子級；模型只能選擇不可變目標和可選的 Round 上限。 |
| `@deepseek-ai/dsh-tool-skill` | `skill` | `ctx.tools`、`ctx.agents`、`ctx.skills` | `tool/call`、`tool/result`、`user/message replacement catalogs via agent.inject()` | - | - |
| `@deepseek-ai/dsh-tool-session-query` | `session_event_read`、`session_event_search`、`session_event_trace`、`session_search`、`session_trace` | `ctx.tools`、`ctx.systemPrompt`、`ctx.sessionQuery`、`a calling Agent for workspace authority` | `tool/call`、`tool/result` | - | 這 5 個只讀工具會隱藏提供者遊標，並根據不可變的呼叫 agent 工作階段為每個結果授權。該包需要選擇啟用；需要強制截止時間或限制行內輸出的組合還會掛載通用超時或 spill 策略。 |
| `@deepseek-ai/dsh-tool-subagent` | `list_subagent_models`、`subagent` | `ctx.tools`、`ctx.subagents`、`ctx.systemPrompt`、`用於模型發現和所選路由驗證的 ctx.llm` | `tool/call`、`tool/result`、`child session events through the chosen provider` | `subagent`、`subagent_fork` | 註冊的委派工具名稱取決於載入時 `toolName` 設定（預設為 `subagent`）；上述預設 schema 關閉模型選擇，而發現 schema 則展示為已啟用 Session 中可用的固定配套工具。Web preset 會在每個新頂層 Session 建立時讀取外掛頁偏好，併為其子 Session 保留該決定；`subagent_fork` 始終使用固定路由。每個實例透過 `modelSelectionSettings`、`backgroundMode` 與 `enableRunInBackground` 獨立控制是否讀取模型選擇設定及其後臺行為。 |
| `@deepseek-ai/dsh-tool-subagent-control` | `interrupt_agent`、`list_agents`、`send_message` | `ctx.tools`、`ctx.subagents`、`ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`、`tool/result`、`child session events through ctx.subagents` | - | 這些是控制可繼續後臺 subagent 的全域命名工具：繫結提供者的 `tool-subagent` 實例註冊不同的委派工具；本包註冊一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 透過單獨載入的 `/list-agents` 外掛提供，其目錄行使用 sessionProjections 和即時 Agent 註冊表。 |
| `@deepseek-ai/dsh-tool-jobs` | `job_kill`、`job_list`、`job_output` | `ctx.tools`、`ctx.jobs`、`ctx.systemPrompt` | `tool/call`、`tool/result`、`user/message via agent.inject() for background completion notices` | - | 與任務種類無關的後臺任務控制器：後臺 bash 命令、PTY 傳送和 subagent 都透過相同的 3 個工具讀取、列出和終止。載入該外掛會掛接控制器，從而啟用生產方的 `ctx.jobs.start()`。 |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `interrupt_agent`、`list_agents`、`send_message`、`spawn_teammate`、`team_task_create`、`team_task_get`、`team_task_list`、`team_task_update`、`wait_agent` | `ctx.tools`、`ctx.systemPrompt`、`ctx.agentTeams`、`an exact live Team member Agent` | `tool/call`、`team/member`、`team/message/queued`、`team/message/delivered`、`team/task`、`tool/result` | - | 這 9 個工具限定於隱式 Team Lead 與持久 teammate 作用域。隨產品釋出的 dsh-base bundle 預設停用該包；文件中的 Agent Teams profile patch 會啟用它，並停用舊 continuable child 的同名控制工具。 |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` | `ctx.tools`、`owning Agent session` | `tool/call`、`todo/write`、`tool/result` | - | todo_write 是工作階段所有的狀態；UI 將最新的 todo/write 事件渲染為檢查清單。`allowParallelInProgress` 是沒有預設值的必填項，因此本目錄明確選擇 `true`，對應描述允許同時存在多個 `in_progress` 項。選擇 `false` 的部署會獲得同一工具，但描述會要求只能有 1 個活動任務。 |
| `@deepseek-ai/dsh-tool-workflow` | `workflow` | `ctx.tools`、`ctx.workflowEngine`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents the script children)` | `tool/call`、`tool/result` | - | - |
| `@deepseek-ai/dsh-tool-workspace-dependencies` | `load_workspace_dependencies` | `ctx.tools` | `tool/call`, `tool/result` | - | - |
| `@deepseek-ai/dsh-tool-web` | `web_fetch`、`web_search` | `ctx.tools`、`ctx.web`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | web_search 和 web_fetch 將提供者選擇置於 ctx.web 之後，使模型可見 schema 在更換後端時保持穩定。 |

<a id="deepseek-aidsh-plugin-manager"></a>

## `@deepseek-ai/dsh-plugin-manager`

### `plugin_manager`

列出目前 profile 中的外掛或組合包，啟用或停用它們，安裝組合包或移除已安裝的組合包。每項操作都要求 danger-full-access 權限或本次呼叫的批准。批准不改變工作階段權限模式。變更影響該 profile 的所有工作階段。先列出條目以取得準確標識。包安裝可能執行已獲批准的建置腳本。支援熱更新的 profile 立即應用變更；僅啟動時載入的 profile 需要重新啟動。不相容的 DSH peer 依賴會阻止安裝和啟用。版本豁免可能導致崩潰和資料丟失：授權前必須警告使用者，並獲得使用者對精確外掛版本與執行時版本組合的明確許可。

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "description": "Management operation.",
      "enum": [
        "list_plugins",
        "list_bundles",
        "set_plugin",
        "set_bundle",
        "install_bundle",
        "remove_bundle",
        "list_version_exemptions",
        "set_version_exemption"
      ]
    },
    "target": {
      "type": "string",
      "description": "Plugin entry id, bundle package name, or installation spec, according to action."
    },
    "enabled": {
      "type": "boolean",
      "description": "Required for set operations; defaults to true for installation. For set_version_exemption, true grants and false revokes."
    },
    "runtimeVersion": {
      "type": "string",
      "description": "For set_version_exemption: exact DSH version from list_version_exemptions. Target must be the manifest package-name@version, not an alias or version range."
    },
    "acceptRisk": {
      "type": "boolean",
      "description": "For granting an exemption: true only after warning the user about possible crashes and data loss and receiving explicit permission for this exact plugin/runtime pair. General installation permission is not enough."
    },
    "approvedBuilds": {
      "type": "array",
      "description": "For install_bundle: pass names from pendingBuilds only after the user explicitly approves running their install scripts in the conversation. This grants persistent permission for this profile.",
      "items": {
        "type": "string"
      }
    },
    "registry": {
      "type": "string",
      "description": "For install_bundle: the npm registry URL asked first, when the user names one; otherwise the configured registry is asked, and its configured fallbacks while a registry is unreachable."
    },
    "offset": {
      "type": "number",
      "description": "Zero-based list offset; defaults to 0."
    },
    "limit": {
      "type": "number",
      "description": "List page size, from 1 to 100; defaults to 25."
    }
  },
  "required": [
    "action"
  ]
}
```

來源： [`packages/boot/plugin-manager/src/tools.ts`](../packages/boot/plugin-manager/src/tools.ts)

<a id="deepseek-aidsh-mcp-resources"></a>

## `@deepseek-ai/dsh-mcp-resources`

### `list_mcp_resource_templates`

列出 MCP 伺服器提供的參數化資源 URI 範本。

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "cursor": {
      "type": "string",
      "description": "Continuation cursor returned by this server."
    }
  },
  "required": [
    "server"
  ]
}
```

來源： [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

### `list_mcp_resources`

列出 MCP 伺服器提供的資源。

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "cursor": {
      "type": "string",
      "description": "Continuation cursor returned by this server."
    }
  },
  "required": [
    "server"
  ]
}
```

來源： [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

### `read_mcp_resource`

按 URI 從指定伺服器讀取 MCP 資源。使用已列出的 URI 或展開後的資源範本。

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "uri": {
      "type": "string",
      "description": "Resource URI to read."
    }
  },
  "required": [
    "server",
    "uri"
  ]
}
```

來源： [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

<a id="deepseek-aidsh-experimental-browser-use-stagehand-native"></a>

## `@deepseek-ai/dsh-experimental-browser-use-stagehand-native`

### `stagehand_act`

使用設定的 Stagehand 模型執行一次自然語言瀏覽器操作。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false
}
```

來源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_extract`

使用設定的 Stagehand 模型與可選的 JSON Schema 提取頁面資料。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    },
    "schema": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {
        "$ref": "#/$defs/__schema0"
      }
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false,
  "$defs": {
    "__schema0": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/__schema0"
          }
        },
        {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {
            "$ref": "#/$defs/__schema0"
          }
        }
      ]
    }
  }
}
```

來源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_navigate`

將 Stagehand 瀏覽器標籤頁導航至指定 URL。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "url": {
      "type": "string",
      "format": "uri"
    }
  },
  "required": [
    "url"
  ],
  "additionalProperties": false
}
```

來源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_observe`

使用設定的 Stagehand 模型查詢符合指令的瀏覽器操作。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false
}
```

來源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_screenshot`

擷取 Stagehand 標籤頁影象以供視覺檢查。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "fullPage": {
      "default": false,
      "type": "boolean"
    }
  },
  "required": [
    "fullPage"
  ],
  "additionalProperties": false
}
```

來源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_tabs`

列出、建立、選擇或關閉 Stagehand 瀏覽器標籤頁。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "const": "list"
        }
      },
      "required": [
        "action"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "const": "new"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "action"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "select",
            "close"
          ]
        },
        "pageId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "action",
        "pageId"
      ],
      "additionalProperties": false
    }
  ],
  "type": "object"
}
```

來源：[`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

<a id="deepseek-aidsh-tool-ask-user"></a>

## `@deepseek-ai/dsh-tool-ask-user`

### `ask_user_question`

繼續操作前，如果需要確認、選擇或缺失的資訊，請向使用者提出簡明問題。

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

來源：[`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question 會暫停工具呼叫，直到目前 UI 提供者返回人類答案。

<a id="deepseek-aidsh-tools"></a>

## `@deepseek-ai/dsh-tools`

### `run_code`

針對可用工具執行 TypeScript 程式。接受兩個必填參數：`code`，即非同步函式的**函式體**（僅使用可擦除語法；支援頂層 `await` 和 `return`）；以及 `description`，簡要說明該程式做什麼。請根據系統提示詞中的宣告，以 `await tools.name(args)` 形式呼叫工具。只有列印或返回的內容屬於程式輸出，請謹慎篩選。含圖片的子工具結果會在執行結束後附加。

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Positive elapsed-time budget in milliseconds, capped by the deployment maximum."
    },
    "sandbox_permissions": {
      "type": "string",
      "description": "Wider sandbox mode for this complete program execution; requires justification and approval.",
      "enum": [
        "workspace-write",
        "danger-full-access"
      ]
    },
    "justification": {
      "type": "string",
      "description": "Reason this complete program needs wider access, shown to the user for approval. Use the language of the user’s current request."
    }
  },
  "required": [
    "code",
    "description"
  ]
}
```

來源：[`packages/core/tools/src/ptc.ts`](../packages/core/tools/src/ptc.ts)

在 `mode: ptc`／`mode: both` 下，它由工具註冊表所有，作為可過濾能力層之外的保留傳輸機制（參見 PTC mode Agent Note）。在 `ptc` 下，它是註冊表對協定格式的唯一貢獻；其他可見能力在使用已載入執行時語言生成的 SDK 章節中宣告。程式透過 binding 呼叫這些能力，呼叫按照原生並行約定排程：啟動順序和策略遵循提交順序，並行安全的函式體最多重疊執行 `maxParallelSubCalls` 個。呼叫會重新進入完整且受守衛保護的工具流水線，並將每個巢狀執行關聯到此外層結果。

<a id="deepseek-aidsh-plan-mode"></a>

## `@deepseek-ai/dsh-plan-mode`

### `exit_plan_mode`

僅在規劃模式下使用。提交計劃供使用者評審，並在獲批後退出規劃模式。使用者可以批准（從你的下一步驟起執行計劃），也可以要求繼續規劃；其回饋會透過工具結果返回，請修改後再次提交。

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

來源：[`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

規劃未啟用時，exit_plan_mode 仍保留在面向模型的 schema 中，這樣狀態轉換不會在規劃策略變更之外額外造成工具目錄變動。其執行路徑會拒絕規劃模式之外的呼叫；在規劃模式下，它透過使用者互動 seam 提交計劃（批准／根據回饋繼續規劃），批准後會在步驟邊界記錄規劃模式已停用。

<a id="deepseek-aidsh-tool-bash"></a>

## `@deepseek-ai/dsh-tool-bash`

### `bash`

執行 bash 命令（`bash -c`）並返回 stdout/stderr。每次呼叫都在新 shell 中執行；請傳入 `workdir`，不要使用 `cd`。託管的 `$DSH_*` 變數公開目前 harness 環境資訊。較長的輸出會截斷，只保留尾部；如可用，完整輸出會儲存到檔案並報告其路徑。命令可能在檔案沙箱中執行；被阻止的檔案操作報告為 `[sandbox: file access denied under <mode> mode]`，這是策略拒絕：請勿換一種方式重試。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"npm install\" → \"Install package dependencies\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap; on expiry the command moves to the background as a job instead of being killed."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

來源：[`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

bash 工具是 bash 執行器 seam 面向模型的消費方。組合中有 job 註冊表時，每次呼叫一啟動就註冊到通用 `ctx.jobs` 執行時，並透過 `job_*` 工具（來自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；沒有註冊表或 `enableRunInBackground: false` 時，工具註冊不帶 `run_in_background` 參數的純前臺 schema。

<a id="deepseek-aidsh-tool-present"></a>

## `@deepseek-ai/dsh-tool-present`

### `present`

將已有檔案宣告為交付給使用者的最終交付物。當使用者需要獨立檔案時使用，尤其是 Office 文件、電子表格和簡報；如果最終回覆已經足夠，優先使用最終回覆。使用者開啟的是目前檔案；不複製其內容。

```json
{
  "type": "object",
  "properties": {
    "files": {
      "type": "array",
      "description": "Usually the 1-2 most important deliverables; at most 4 per call.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Path of an existing regular file. Relative paths use the Session working directory."
          },
          "description": {
            "type": "string",
            "description": "Brief description for the user."
          }
        },
        "required": [
          "path"
        ]
      }
    }
  },
  "required": [
    "files"
  ]
}
```

來源： [`packages/deliverables/tool-present/src/index.ts`](../packages/deliverables/tool-present/src/index.ts)

交付歸呼叫方 Session 所有；Web ui-deliverables 提供原始檔開啟與卡片。

<a id="deepseek-aidsh-tool-pwsh"></a>

## `@deepseek-ai/dsh-tool-pwsh`

### `pwsh`

執行 PowerShell 命令（`pwsh -Command`）並返回 stdout/stderr。每次呼叫都在新的 pwsh 程序中執行；請傳入 `workdir`，不要使用 `cd`。路徑採用 Windows 原生形式（`C:\...`）；使用 `$env:NAME` 讀取環境變數。託管的 `$env:DSH_*` 變數公開目前 harness 環境資訊。較長的輸出會截斷，只保留尾部；如可用，完整輸出會儲存到檔案並報告其路徑。在 Windows 上，被強制終止的命令會以 `[exit code: 1]` 結算且不帶訊號標記，請將其視為中斷，而不是命令失敗。命令可能在檔案沙箱中執行；被阻止的檔案操作報告為 `[sandbox: file access denied under <mode> mode]`，這是策略拒絕：請勿換一種方式重試。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap; on expiry the command moves to the background as a job instead of being killed."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

來源：[`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

pwsh 工具是 Windows 組合中 bash 執行器 seam 的 PowerShell 方言消費方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 執行器為 `ctx.shell` 提供後端）；除沙箱介面外，它逐項對應 bash 工具呼叫。使用 `run_in_background` 的執行會註冊到通用 `ctx.jobs` 執行時，並透過 `job_*` 工具收集／停止；託管的 `DSH_*` 環境來自 `@deepseek-ai/dsh-shell-env`。每次呼叫都在新程序中執行，不使用持久 PTY 工作階段。路徑採用原生 `C:\...` 形式，變數採用 `$env:NAME`。

<a id="deepseek-aidsh-tool-cordis"></a>

## `@deepseek-ai/dsh-tool-cordis`

### `cordis_inspect_list`

列出 Host 目前已知的所有 Cordis Inspect Provider，包括本地 Host Provider 和 Client 同步的最新清單。每項包含平臺、用途、只讀方法以及輸入輸出 schema。編寫或設定外掛前先呼叫本工具，再從結果選擇 cordis_inspect_query 的 provider 和方法。不要猜測名稱，也不要把 Inspect 方法當作外掛程式碼可呼叫的業務 Service。

```json
{
  "type": "object",
  "properties": {}
}
```

來源： [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

執行 Inspect Provider 宣告的只讀查詢。platform、provider 和 method 必須來自 cordis_inspect_list，input 必須符合該方法的 schema。編寫外掛程式碼前，用本工具讀取準確的 Service 方法、Event 模式、外掛 Config schema、Tool schema、主題 token，或即時 Slot 樹與 props。Host 查詢在本地執行。Client 查詢等待頁面首個有效回應，直到頁面回應或工具取消。本工具不能呼叫業務 Service 方法或修改執行時。

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

來源： [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

創造模式提供兩個只讀執行時檢查工具。Cordis host runner 提供檢查註冊表；Client 查詢需要已連線頁面。持久化變更編寫為組合包，再透過 plugin_manager 安裝。

<a id="deepseek-aidsh-tool-bash-persistent"></a>

## `@deepseek-ai/dsh-tool-bash-persistent`

### `bash`

在持久 bash shell 中執行命令。包括目前目錄和已匯出環境變數在內的狀態會在此 agent 的多次呼叫之間保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

來源：[`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

一個按所有者隔離的持久 bash 工具；部署組合提供 PTY 後端，並可覆蓋面向模型的環境描述。

<a id="deepseek-aidsh-tool-pwsh-persistent"></a>

## `@deepseek-ai/dsh-tool-pwsh-persistent`

### `pwsh`

在持久 PowerShell shell 中執行命令。包括目前目錄和已匯出環境變數在內的狀態會在此 agent 的多次呼叫之間保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

來源：[`packages/shell/tool-pwsh-persistent/src/index.ts`](../packages/shell/tool-pwsh-persistent/src/index.ts)

一個按所有者隔離的持久 pwsh 工具，持久 bash 工具的 Windows 對應物；部署組合提供 pwsh 方言的 PTY 後端，並可覆蓋面向模型的環境描述。

<a id="deepseek-aidsh-tool-str-replace-editor"></a>

## `@deepseek-ai/dsh-tool-str-replace-editor`

### `str_replace_editor`

用於檢視、建立和編輯檔案的自定義編輯工具：

* 狀態會在命令呼叫以及與使用者的討論之間持久保留
* 如果 `path` 是檔案，`view` 會顯示應用 `cat -n` 後的結果。如果 `path` 是目錄，`view` 會列出最多向下 2 層的非隱藏檔案和目錄
* 如果指定的 `create` 命令目標 `path` 已作為檔案存在，則不能使用該命令
* 如果 `command` 產生較長輸出，輸出會被截斷並標記為 `<response clipped>`
* 目前命令不使用某個參數時，值為 `null` 的佔位參數視為未提供。必填參數仍須提供值；刪除匹配內容時應省略 `str_replace.new_str`，而不是將其設為 `null`

使用 `str_replace` 命令時請注意：

* `old_str` 參數應與原檔案中一行或多行連續內容**完全**匹配。請留意空白字元！
* 如果 `old_str` 參數在檔案中不唯一，則不會執行替換。請確保在 `old_str` 中包含足夠的上下文，使其唯一
* `new_str` 參數應包含用於替換 `old_str` 的已編輯行

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `create` command, with the content of the file to be created. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "insert_line": {
      "oneOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required integer parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "new_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional string parameter of `str_replace` command containing the new string (if omitted, no string will be added). Required string parameter of `insert` command containing the string to insert. A null placeholder is accepted only by commands that do not use this parameter."
    },
    "old_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `str_replace` command containing the string in `path` to replace. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "view_range": {
      "oneOf": [
        {
          "type": "array",
          "items": {
            "type": "integer"
          }
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional parameter of `view` command when `path` points to a file. If omitted or null, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file."
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

來源：[`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

基於檔案系統 seam 的獨立檢視／建立／唯一字面量替換／按行插入工具；可與任何 shell 或終端介面組合。

<a id="deepseek-aidsh-tool-fs"></a>

## `@deepseek-ai/dsh-tool-fs`

### `edit`

透過替換字面量文字來編輯現有 UTF-8 文字檔案。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

讀取 UTF-8 文字檔案，並返回帶行號的內容。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

讀取 PNG/JPEG/WebP/GIF 檔案並返回影象本身。大圖會自動縮小；不要為了檢視圖片而安裝圖片庫或建立縮圖。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

建立或完全替換 UTF-8 文字檔案。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

先讀後寫／編輯策略由 `@deepseek-ai/dsh-fs-observation-policy` 新增；它是一個 `fs/*` 事件門禁外掛，不會改變 schema。載入這些工具的部署按預期也應載入該外掛。沒有 `ctx.attachments` 時圖片工具不會註冊；其 schema 與路由無關，執行時除非確切路由的模型宣告圖片輸入，否則拒絕。

<a id="deepseek-aidsh-tool-fs-search"></a>

## `@deepseek-ai/dsh-tool-fs-search`

### `glob`

查詢路徑匹配 glob 模式的檔案（不含目錄），包括隱藏檔案和被忽略的檔案。最多按修改時間順序返回 100 條路徑；更大的結果會從頂層條目中抽樣，並報告完整列表的儲存位置。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

來源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

使用 ripgrep 正規表示式搜尋檔案內容。返回帶行號的匹配行，並按檔案分組。最多返回 250 條匹配；更大的結果會報告完整匹配列表的儲存位置。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

來源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob 和 grep 是無條件可用的發現工具，透過 ctx.subprocess spawn 隨包提供的 ripgrep 二進位制檔案（`@vscode/ripgrep`），並作為普通前臺呼叫執行，絕不作為後臺任務；無需在主機安裝 `rg`，也不經過 shell 層。本目錄使用 `sampleOverCapGlobResults: true`；部署必須顯式選擇該行為。結果超過上限時，會透過可選的 ctx.spillStore 後端儲存完整的格式化列表；在共置部署中，如果後端公開本地路徑，返回的定位資訊可供後續讀取／搜尋。

<a id="deepseek-aidsh-tool-terminal"></a>

## `@deepseek-ai/dsh-tool-terminal`

### `terminal_close`

關閉一個持久終端，並等待其捕捉且所有的程序樹完全退出。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_list`

列出目前 agent 所有的持久終端工作階段。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_open`

透過已註冊的後端型別建立按所有者隔離的持久終端工作階段。需要在多次工具呼叫之間保留 shell 或 REPL 狀態時，請使用此工具。

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory. Defaults to the deployment workspace root."
    }
  },
  "required": [
    "type"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_read`

從持久終端讀取一頁有界的保留輸出，不傳送輸入。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_send`

向持久終端傳送文字。預設會提交 Enter，並等待提示符、stdin 等待、輸出靜默、超時或工作階段退出。後臺模式會返回供 job_output／job_kill 使用的 job id。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_signal`

向持久終端目前的前臺程序組傳送允許的訊號。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

這 6 個終端工具需要選擇啟用，用於補充一次性 bash／檔案系統工具。`terminal_send(run_in_background: true)` 會註冊到 `ctx.jobs`；schema 不包含 TUI、具名按鍵序列、BEL、調整尺寸、自動啟動和跨 agent 共享。

<a id="deepseek-aidsh-tool-goal"></a>

## `@deepseek-ai/dsh-tool-goal`

### `create_goal`

建立一個持久化目標，使目前工作階段跨自動延續 Round 持續工作。當直接人類請求是長期目標時使用，即使使用者沒有說「目標」；不要用於單輪工作。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

來源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

讀取目前工作階段目標，包括 update_goal 所需的 id 和 revision。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

更新目前目標。

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit, pause, and resume require a direct top-level human request. complete and blocked are also allowed during an automatic continuation of this goal; blocked is rejected before the configured minimum round count.",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Required only with action blocked: the concrete condition that persisted across rounds and blocks progress."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

來源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create、edit、pause 和 resume 要求直接來自人類的根權限；complete 和 blocked 也接受確切的目前 Goal Round。blocked 的預設下限是 3 個獲准的 Round。

<a id="deepseek-aidsh-schedule"></a>

## `@deepseek-ai/dsh-schedule`

### `schedule_create`

在目前工作階段中建立一條提醒，到期時投遞 prompt。請恰好提供一個時間參數：after_seconds、at、every_seconds、daily、weekly 或 cron。時區中不存在的本地時間會被跳過；重複出現的本地時間只在較早的時刻觸發一次。停機後，重複提醒只投遞最近錯過的一次。崩潰後可能重複投遞。

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "title": {
      "type": "string",
      "description": "Task name of at most 120 characters, shown on the task card and in task lists."
    },
    "after_seconds": {
      "type": "number",
      "description": "Delay in whole seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate interval in whole seconds, at least 60, aligned to the creation time; changing it with schedule_update re-aligns it to the save time."
    },
    "daily": {
      "type": "object",
      "description": "Every day at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 23:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "time",
        "time_zone"
      ]
    },
    "weekly": {
      "type": "object",
      "description": "On the given weekdays at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 09:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        },
        "weekdays": {
          "type": "array",
          "description": "ISO weekdays, Monday 1 through Sunday 7, without repetitions.",
          "items": {
            "type": "integer"
          }
        }
      },
      "required": [
        "time",
        "time_zone",
        "weekdays"
      ]
    },
    "cron": {
      "type": "object",
      "description": "Five-field Vixie cron expression in a time zone.",
      "additionalProperties": false,
      "properties": {
        "expression": {
          "type": "string",
          "description": "minute hour day-of-month month day-of-week, for example \"*/15 9-17 * * 1-5\". When both day fields are restricted, a date matches if either one matches."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "expression",
        "time_zone"
      ]
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target: an RFC 3339 date-time with offset, or a local date, time, and IANA time_zone."
    }
  },
  "required": [
    "prompt",
    "title"
  ]
}
```

來源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_delete`

刪除目前工作階段中的一條提醒，活動或已結束的均可。刪除不會撤回已經入隊的提醒訊息。

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Schedule id returned by schedule_list."
    }
  },
  "required": [
    "id"
  ]
}
```

來源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_list`

列出目前工作階段中的活動提醒。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

選擇啟用的 Schedule 服務載入期間，在 live 根 Agent scope 內註冊。接受 after_seconds、顯式絕對 at、有界固定速率 every_seconds、帶顯式 IANA 時區的每日與每週本地時間，以及作為五欄位表示式的 cron。管理使用主機 storage domain；到期訊息會恢復原 Session。

<a id="deepseek-aidsh-tool-lsp"></a>

### `schedule_update`

原地修改一條提醒並保留其 id。提供新的 title、prompt，或至多一個時間參數；未提供的欄位保持原值。需要相對延遲時請新建一條提醒。

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Schedule id returned by schedule_list."
    },
    "title": {
      "type": "string",
      "description": "New task name of at most 120 characters."
    },
    "prompt": {
      "type": "string",
      "description": "New reminder content."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate interval in whole seconds, at least 60, aligned to the creation time; changing it with schedule_update re-aligns it to the save time."
    },
    "daily": {
      "type": "object",
      "description": "Every day at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 23:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "time",
        "time_zone"
      ]
    },
    "weekly": {
      "type": "object",
      "description": "On the given weekdays at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 09:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        },
        "weekdays": {
          "type": "array",
          "description": "ISO weekdays, Monday 1 through Sunday 7, without repetitions.",
          "items": {
            "type": "integer"
          }
        }
      },
      "required": [
        "time",
        "time_zone",
        "weekdays"
      ]
    },
    "cron": {
      "type": "object",
      "description": "Five-field Vixie cron expression in a time zone.",
      "additionalProperties": false,
      "properties": {
        "expression": {
          "type": "string",
          "description": "minute hour day-of-month month day-of-week, for example \"*/15 9-17 * * 1-5\". When both day fields are restricted, a date matches if either one matches."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "expression",
        "time_zone"
      ]
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target: an RFC 3339 date-time with offset, or a local date, time, and IANA time_zone."
    }
  },
  "required": [
    "id"
  ]
}
```

Source: [`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

Schedule 服務載入期間，在 live 根 Agent scope 內註冊。接受 after_seconds、顯式絕對 at、有界固定速率 every_seconds、帶顯式 IANA 時區的每日與每週本地時間，以及作為五欄位表示式的 cron。管理使用主機 storage domain；到期訊息會恢復原 Session。

<a id="deepseek-aidsh-tool-lsp"></a>

## `@deepseek-ai/dsh-tool-lsp`

### `lsp`

查詢語言伺服器，以精確導航程式碼。operation 可取 goToDefinition、findReferences、goToImplementation 或 hover。line 和 character 是從 1 開始的 UTF-16 游標座標。findReferences 包含宣告。

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

來源：[`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

lsp 工具將提供者選擇和語言伺服器子程序置於 ctx.lsp 之後，因此其模型可見 schema 在更換提供者時保持穩定。執行時要求已註冊提供者，例如 `@deepseek-ai/dsh-lsp-stdio`；如果沒有提供者，查詢會返回結構化 `LSP_UNAVAILABLE` 錯誤，而不會改變 schema。

<a id="deepseek-aidsh-tool-ralph"></a>

## `@deepseek-ai/dsh-tool-ralph`

### `ralph`

圍繞一個不可變目標執行使用全新 agent 的前臺 Ralph 迴圈。僅當直接人類明確要求 Ralph 或使用全新 agent 迭代時使用。每個 Round 都會啟動一個全新子級，該子級看不到父級對話或先前子工作階段；共享工作區充當長期記憶，Round 之間只傳遞有界的結構化報告。當工作程序報告完成、報告具體阻塞項或達到 Round 上限時，呼叫返回。普通的長期同工作階段工作應使用 goal 工具。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

來源：[`packages/workflow/tool-ralph/src/index.ts`](../packages/workflow/tool-ralph/src/index.ts)

固定的前臺工作流會在每個 Round 啟動一個全新的結構化子級；模型只能選擇不可變目標和可選的 Round 上限。

<a id="deepseek-aidsh-tool-skill"></a>

## `@deepseek-ai/dsh-tool-skill`

### `skill`

載入某項 skill（技能）的完整說明。在執行點名某項 skill 或與工作階段 skill 目錄中某項 skill 明確匹配的任務前，請呼叫此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

來源：[`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="deepseek-aidsh-tool-session-query"></a>

## `@deepseek-ai/dsh-tool-session-query`

### `session_event_read`

從一個已獲授權的工作階段中讀取一個完整且未刪節的事件，以及可選的相鄰原始事件概述。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_search`

在一個已獲授權的工作階段中搜尋先前事件；如果搜尋目前工作階段，則排除執行此次呼叫的步驟。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_trace`

讀取已獲授權工作階段中某個事件的所有直接替換關係，以及該事件與其引用的來源事件之間的關係。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_search`

搜尋呼叫方工作區中的先前工作階段，並從每個工作階段返回匹配度最高的事件。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_trace`

讀取圍繞一個工作階段的已授權工作階段譜系，包括完整可見的祖先和後代關係。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

這 5 個只讀工具會隱藏提供者遊標，並根據不可變的呼叫 agent 工作階段為每個結果授權。該包需要選擇啟用；需要強制截止時間或限制行內輸出的組合還會掛載通用超時或 spill 策略。

<a id="deepseek-aidsh-tool-subagent"></a>

## `@deepseek-ai/dsh-tool-subagent`

### `list_subagent_models`

發現 subagent 可用的 LLM 路由，不更改目前 Agent。無參數呼叫會列出已註冊提供者；提供 `provider` 時會列出其公佈的模型；同時提供 `provider` 和 `model` 時會檢查該精確模型及其推理強度。目錄條目只提供建議：adapter 可能接受未列出的模型 id。把返回的 id 用於委派工具的 `provider`、`model` 與 `reasoning_effort` 欄位。

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "description": "Registered LLM provider id. Omit to list providers."
    },
    "model": {
      "type": "string",
      "description": "Exact model id to inspect. Requires provider; omit to list that provider's advertised models."
    }
  }
}
```

來源：[`packages/subagent/tool-subagent/src/list-models.ts`](../packages/subagent/tool-subagent/src/list-models.ts)

### `subagent`

將一項自包含任務委派給 subagent（在自身上下文中工作的獨立 agent），用它解除安裝聚焦且獨立的工作，例如研究、限定範圍的實作或分析，以免消耗目前對話的上下文。subagent 會返回結果，但不會返回中間步驟。此呼叫預設等待結果。

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run as a background job and return its id (collect with job_output, stop with job_kill). Defaults to false."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

來源：[`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

註冊的委派工具名稱取決於載入時 `toolName` 設定（預設為 `subagent`）；上述預設 schema 關閉模型選擇，而發現 schema 則展示為已啟用 Session 中可用的固定配套工具。Web preset 會在每個新頂層 Session 建立時讀取外掛頁偏好，併為其子 Session 保留該決定；`subagent_fork` 始終使用固定路由。每個實例透過 `modelSelectionSettings`、`backgroundMode` 與 `enableRunInBackground` 獨立控制是否讀取模型選擇設定及其後臺行為。

<a id="deepseek-aidsh-tool-subagent-control"></a>

## `@deepseek-ai/dsh-tool-subagent-control`

### `interrupt_agent`

請 subagent 停止目前工作。此呼叫不等待其停止即返回。之後可以用 send_message 繼續與直接子級的對話。它啟動的 subagent 會繼續執行。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The id of an agent created under you: your direct child or a deeper descendant."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

來源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

列出你啟動的 subagent 及其 id、標籤和狀態。running 表示正在工作；inactive 表示目前未在工作。subagent 完成時你會收到通知，無需反覆檢視狀態。使用 send_message 繼續對話。

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children, which accept send_message in any status. descendants lists the whole tree below you with each entry's parent session id and depth; entries deeper than 1 accept only interrupt_agent.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

來源：[`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

向某個 agent 傳送訊息。工作中的 agent 會在下一個 step 收到訊息；空閒的 agent 會以該訊息開始新一輪。返回投遞確認，而不是該 agent 的答案。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of your direct continuable child, or your direct parent when you are a resident continuable child."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the agent."
    }
  },
  "required": [
    "agent_id",
    "message"
  ]
}
```

來源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

這些是控制可繼續後臺 subagent 的全域命名工具：繫結提供者的 `tool-subagent` 實例註冊不同的委派工具；本包註冊一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 透過單獨載入的 `/list-agents` 外掛提供，其目錄行使用 sessionProjections 和即時 Agent 註冊表。

<a id="deepseek-aidsh-tool-jobs"></a>

## `@deepseek-ai/dsh-tool-jobs`

### `job_kill`

請求取消正在執行的後臺任務。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

來源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

列出你的後臺任務（包括正在執行和已完成的任務）及其 id、種類和狀態。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

讀取後臺任務：流式任務返回自上次讀取以來的輸出，已完成的最終輸出任務返回其結果。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job finishes or the timeout expires; a timed-out wait leaves the job running. Defaults to false."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds with wait: true. Defaults to and is capped by configuration."
    }
  },
  "required": [
    "job_id"
  ]
}
```

來源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

與任務種類無關的後臺任務控制器：後臺 bash 命令、PTY 傳送和 subagent 都透過相同的 3 個工具讀取、列出和終止。載入該外掛會掛接控制器，從而啟用生產方的 `ctx.jobs.start()`。

<a id="deepseek-aidsh-experimental-tool-agent-team"></a>

## `@deepseek-ai/dsh-experimental-tool-agent-team`

### `interrupt_agent`

中斷一名 teammate 的目前 turn，同時保留其待處理 inbox。僅 Team Lead 可用。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Teammate target returned by spawn_teammate or list_agents."
    }
  },
  "required": [
    "target"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `list_agents`

列出 Lead 與所有持久 teammate，以及可用於定址的 target 和目前可用狀態。inactive 表示沒有輪次在執行，不表示任務結果。provisioning 與 failed 描述成員建立狀態。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `send_message`

向另一名 Team member 傳送一條持久訊息。running target 會在最近的步驟邊界收到訊息；inactive target 會啟動或恢復一個 turn。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Member target returned by spawn_teammate or list_agents, including lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `spawn_teammate`

建立一名具名、持久的 teammate。只有 Team Lead 可以呼叫此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique lower-kebab-case teammate name."
    },
    "description": {
      "type": "string",
      "description": "Short description of the delegated responsibility."
    },
    "prompt": {
      "type": "string",
      "description": "Complete initial task for the teammate."
    },
    "context": {
      "type": "string",
      "description": "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.",
      "enum": [
        "fresh",
        "fork"
      ]
    }
  },
  "required": [
    "name",
    "description",
    "prompt"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_create`

在共享 Team 任務板上建立一個無 owner 的 pending task。

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string",
      "description": "Concise task title."
    },
    "description": {
      "type": "string",
      "description": "Complete task details and acceptance criteria."
    },
    "blocked_by": {
      "type": "array",
      "description": "Task ids that must complete first.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Advisory workspace-relative file or directory prefixes this task expects to modify.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "subject",
    "description"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_get`

在修改或執行共享任務前，讀取其完整的最新值。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    }
  },
  "required": [
    "task_id"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_list`

列出共享任務，包括 readiness、owner、revision、blocker 與 write-scope warning。

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "Optional exact status filter.",
      "enum": [
        "pending",
        "in_progress",
        "completed"
      ]
    },
    "owner": {
      "type": "string",
      "description": "Optional member target from spawn_teammate or list_agents, matching ownerName; use unowned for tasks without an owner."
    },
    "ready": {
      "type": "boolean",
      "description": "Optional readiness filter."
    },
    "cursor": {
      "type": "integer",
      "description": "Zero-based result offset. Defaults to 0."
    },
    "limit": {
      "type": "integer",
      "description": "Number of rows, 1 through 100. Defaults to 50."
    }
  }
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_update`

使用 team_task_get 或 team_task_list 返回的最新 revision，對共享任務操作執行 compare-and-set。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    },
    "expected_revision": {
      "type": "integer",
      "description": "Current task revision used as the CAS precondition."
    },
    "action": {
      "type": "string",
      "description": "Task transition to apply.",
      "enum": [
        "claim",
        "release",
        "edit",
        "set_dependencies",
        "complete",
        "reopen",
        "reassign",
        "delete"
      ]
    },
    "subject": {
      "type": "string",
      "description": "Replacement title for edit."
    },
    "description": {
      "type": "string",
      "description": "Replacement details for edit."
    },
    "blocked_by": {
      "type": "array",
      "description": "Complete blocker list for set_dependencies.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Replacement advisory write scopes for edit.",
      "items": {
        "type": "string"
      }
    },
    "owner": {
      "type": "string",
      "description": "Member target from spawn_teammate or list_agents for Lead-only reassign; omit to unassign."
    }
  },
  "required": [
    "task_id",
    "expected_revision",
    "action"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `wait_agent`

等待本次呼叫開始後下一次 teammate 狀態、mailbox 或共享任務變更。它絕不會喚醒 inactive member；若沒有其他 member 正在 running 或 provisioning，則立即返回 noProgress。喚醒或超時後應重新列出狀態，而不是輪詢。

```json
{
  "type": "object",
  "properties": {
    "timeout_ms": {
      "type": "integer",
      "description": "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
    }
  }
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

這 10 個工具限定於隱式 Team Lead 與持久 teammate 作用域。隨產品釋出的 dsh-base bundle 預設停用該包；文件中的 Agent Teams profile patch 會啟用它，並停用舊 continuable child 的同名控制工具。


<a id="deepseek-aidsh-tool-todo"></a>

## `@deepseek-ai/dsh-tool-todo`

### `todo_write`

記錄並更新任務列表，用於規劃多步驟工作並展示進度；簡單的單步驟任務無需使用。開始前為每個具體步驟新增一項 todo。只要工作尚未完成，就將正在處理的 todo 標記為 `in_progress`，僅在工作並行執行時同時標記多項。某項 todo 完成後立即標記為 `completed`。

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

來源：[`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write 是工作階段所有的狀態；UI 將最新的 todo/write 事件渲染為檢查清單。`allowParallelInProgress` 是沒有預設值的必填項，因此本目錄明確選擇 `true`，對應描述允許同時存在多個 `in_progress` 項。選擇 `false` 的部署會獲得同一工具，但描述會要求只能有 1 個活動任務。

<a id="deepseek-aidsh-tool-workflow"></a>

## `@deepseek-ai/dsh-tool-workflow`

### `workflow`

執行用於大規模編排 subagent 的 JavaScript 工作流腳本。當工作會分散到許多相互獨立的部分時，請使用此工具，例如審查大量檔案、執行遷移、開展多角度研究或對發現進行對抗式驗證；此時應將編排寫成腳本，而不是逐輪委派。

腳本函式體提供以下掛鉤：

- `agent(prompt, opts?): Promise<any>`：執行一個 subagent 直至完成。不提供 `opts.schema` 時，解析為子級最終文字；提供 `opts.schema` 時，它必須是以物件為根、且**只能**使用 type/properties/required/additionalProperties/items/enum/const/oneOf 的 JSON Schema，此時解析為透過驗證的物件。子級失敗時解析為 `null`，可使用 `.filter(Boolean)` 過濾。其他選項包括 `label`（顯示名稱）、`phase`（進度組），以及相互獨立的 `provider`／`model` LLM（大語言模型）目標覆蓋項。
- `pipeline(items, ...stages): Promise<any[]>`：讓每個條目分別經過各階段，階段之間**沒有**屏障；多階段工作優先使用它。每個階段接收 `(prev, item, index)`。階段異常會將該**條目**變為 `null`，並跳過它的剩餘階段。
- `parallel(thunks): Promise<any[]>`：並行執行零參數函式並等待**全部**完成。它會形成屏障，僅當某個階段確實需要彙總全部先前結果時使用。丟擲異常的 thunk 解析為 `null`。
- `phase(title)`：開始一個進度階段；`log(message)`：說明進度；`args`：工具呼叫的 `args` 輸入，原樣提供。

如果誤用掛鉤（參數錯誤、未知選項、不受支援的 schema、觸發上限），整個腳本會終止，而不會產生 `null`。腳本沒有檔案系統、網路、定時器或 Node.js API；具體工作由 agent 完成。

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain JavaScript body, not TypeScript and without an `export const meta` statement; top-level await is allowed. End with `return <value>`; the JSON-serializable value is this tool's result."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity as plain JSON, not code.",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run as a background job: return a job id immediately instead of waiting; the return value arrives with the completion notice."
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

來源：[`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="deepseek-aidsh-tool-workspace-dependencies"></a>

## `@deepseek-ai/dsh-tool-workspace-dependencies`

### `load_workspace_dependencies`

取得隨包附帶的 Python 和庫目錄的絕對路徑，以及隨包 Python 發行版的版本。payload 提供 Node.js 和 pnpm 時才返回對應路徑。Python 含 numpy、pandas、python-docx、python-pptx、openpyxl、Pillow、lxml 與 XlsxWriter。除非使用者或工作區指令選擇了別的環境，Office 檔案請使用這些庫。返回 Node.js 和 pnpm 路徑時，用該 Node 可執行檔案和 pnpm 腳本路徑執行 pnpm。本工具不改 PATH，也不改包管理器設定。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/skill/tool-workspace-dependencies/src/index.ts`](../packages/skill/tool-workspace-dependencies/src/index.ts)

<a id="deepseek-aidsh-tool-web"></a>

## `@deepseek-ai/dsh-tool-web`

### `web_fetch`

取得指定 HTTP(S) URL 的內容，並將其解碼為文字後返回。

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

來源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

在 Web 上搜尋最新資訊。返回可選的摘要答案和來源 URL 列表。

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "description": "1–4 search queries; their results are merged.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "queries"
  ]
}
```

來源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search 和 web_fetch 將提供者選擇置於 ctx.web 之後，使模型可見 schema 在更換後端時保持穩定。
