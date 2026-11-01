# 子系統

[English](README.md) | 中文

每個子系統一頁，覆蓋 DeepSeek Harness 的全部子系統：它是什麼、它操作哪些資料結構，以及——當它由某個 `ctx` 服務或事件作用域支撐時——一段生成的 **Cordis API** 小節，承載其服務與事件參考。本目錄與 [architecture.md](../architecture.zh.md) 互補：後者描述跨子系統的*行為*（服務對映、工作階段/輪次/步驟生命週期、事件分類體系）；這裡的每一頁是單個子系統詞彙與接線的參考。

| 頁面 | 負責內容 |
|---|---|
| [boot.md](boot.zh.md) | 目前 profile 外掛管理與 launcher 過載協調 |
| [core.md](core.zh.md) | `packages/core` 如何控制 agent loop（智慧代理迴圈）：逐包的迴圈說明、agent 建立與所有權（`AgentHandle`）、`Agent` 控制代碼的投遞/取消/攔截約定，以及全倉通用型別模式（`…Map → derived-union`、品牌化 id） |
| [llm-streaming.md](llm-streaming.zh.md) | `packages/llm` 的對話型別——`Message`/`ContentBlock`、組裝完成的模型請求、`StreamChunk` wire protocol 和介面卡約定（adapter contract）、`BlockAssembler`，以及 `LlmAdapter` 提供者約定 |
| [token-meter.md](token-meter.zh.md) | 不可變的標量與位置回放度量，附帶已消費日誌修訂號 |
| [scope.md](scope.zh.md) | 作用域註冊標識、dispatch 載體，以及擁有的 `Scope` 上下文 |
| [typert.md](typert.zh.md) | 遠端呼叫描述符、lookup/Context 宣告、Typert 註冊表，以及 Host Gateway/Client API 邊界 |
| [goal.md](goal.zh.md) | 持久 goal 標識、生命週期快照、啟用、變更記錄與 Round 歸屬 |
| [schedule.md](schedule.zh.md) | Host 擁有的提醒記錄、持久轉換、活動和已結束檢視與普通對話交付 |
| [todo.md](todo.zh.md) | todo 包的整列表條目型別、持久事件所有權、投影和未結束輪次不變式 |
| [deliverables.md](deliverables.zh.md) | 一輪交給使用者的東西：`present` 宣告的 `PresentedFile` 交付，以及由 git 快照得出、由 Host 提供的 `WorkspaceChangesSummary` 改動摘要 |
| [commands.md](commands.zh.md) | 人類命令註冊表服務：定義、介面卡發現、直接呼叫、結果與解析檢視 |
| [session.md](session.zh.md) | 完整的 `SessionEventMap` 變體目錄、`TurnEndReason`、`deriveMessages()`、執行封閉與獨立事件 |
| [persistence.md](persistence.zh.md) | 永續性 seam：`SessionPersistence`、JSONL 提供者、`session/flush`、崩潰恢復、`SessionHeader` |
| [settings.md](settings.zh.md) | 使用者設定 seam：`SettingsNamespace` 註冊、分層解析（預設值 → 組合 `base` → 使用者文件）、owner scope、熱提交 |
| [credentials.md](credentials.zh.md) | 憑證 seam：設定中的 `CredentialRef` 引用（絕不含值）、按操作解析、對 UI 安全的 `CredentialInfo`、提供者來源層 |
| [session-query.md](session-query.zh.md) | 邏輯記錄、有界精確事件讀取、關係追蹤、語義篩選器/文件與全文檢索結果頁 |
| [feedback.md](feedback.zh.md) | 繫結生命週期的逐訊息回饋記錄、樂觀版本、伴隨記錄持久化與 Host Remote 約定 |
| [session-title.md](session-title.zh.md) | 持久標題快照、被引用的來源訊息 seq 與非同步提供者約定 |
| [session-reference.md](session-reference.zh.md) | 結構化跨工作階段引用：`SessionReferenceInput`/`Candidate`、prepared 訊息上下文、穩定錯誤分類 |
| [system-prompt.md](system-prompt.zh.md) | 逐次組裝的上下文、工具提供者結果、提示詞段落與協作式組裝 |
| [tools.md](tools.zh.md) | `ToolDefinition` 完整欄位、schema DSL、`ToolExecution`/`ToolResult`、工具展示 UI 型別，以及受保護的執行流水線 |
| [mcp.md](mcp.zh.md) | 外部 MCP 連線、作用域工具與資源、伺服器指令、協定結果與設定歸屬 |
| [user-questions.md](user-questions.zh.md) | UI 支援的人工問答 seam：`AskUserQuestionRequest`、answer/options 詞彙、提供者 API、錯誤分類體系 |
| [approval.md](approval.zh.md) | 一次性使用者審批 seam：`ApprovalRequest`、`ApprovalOutcome`、逐工作階段策略、審計事件和 answerer 約定 |
| [office-to-pdf.md](office-to-pdf.zh.md) | 已授權的 Office 到 PDF 轉換、原生/WASM 引擎與有界共享複用 |
| [attachment.md](attachment.zh.md) | 持久圖片標識與中繼資料、驗證輸入、經驗證讀取，以及 `AttachmentStore` seam |
| [shell.md](shell.zh.md) | shell 執行器 seam：`ShellExecRequest`/`Spec`、`ShellRunResult`、後臺 `ShellProcess` 控制代碼 |
| [subprocess.md](subprocess.zh.md) | 子程序 seam：完全顯式的 `SubprocessSpawnSpec`、基於偏移的輸出讀取器、不含分類的 `SubprocessOutcome`，以及受管 `DSH_*` 環境詞彙 |
| [ssh.md](ssh.zh.md) | POSIX SSH 連線與遠端檔案系統、子程序和沙箱提供者 |
| [terminal.md](terminal.zh.md) | 持久化終端 ID、後端/工作階段約定、傳送就緒狀態、有界讀取與 owner 可見快照 |
| [sandbox.md](sandbox.zh.md) | 每工作階段策略解析與程序約束 seam：檔案效果模式、執行/提供者策略、`ConfinedArgv`、強制執行與故障關閉錯誤 |
| [ptc-runtime.md](ptc-runtime.zh.md) | PTC 執行 seam：`PtcRunRequest`/`Result`、繫結名稱空間、捕捉日誌、`PtcRunFailure` 分類體系 |
| [computer-use.md](computer-use.zh.md) | 按名稱獨佔註冊計算機操作提供者，以及 Cua Driver 整合選項 |
| [browser-use.md](browser-use.zh.md) | 按名稱獨佔註冊瀏覽器操作提供者、提供者選項與按 Session 管理的瀏覽器所有權 |
| [extensions.md](extensions.zh.md) | 帶版本的動態 Cordis 外掛與包、Host/Client 啟用、審批、執行時檢查和生命週期清理 |
| [filesystem.md](filesystem.zh.md) | 檔案系統 seam：`FsTarget`、讀/寫/編輯結果、觀測到的檔案狀態、`FsErrorCode` |
| [lsp.md](lsp.zh.md) | LSP 導航 seam：`LspQueryRequest`/`Result`、`LspProvider`/`Service`、四種操作、`LspError` |
| [skills.md](skills.zh.md) | skill（技能）服務：發現優先順序、`SkillSummary`/`SkillDefinition`、工作階段字首目錄、面向模型的 `skill` 載入 |
| [compaction.md](compaction.zh.md) | 壓縮（compaction）seam：`compaction/*` 工作階段事件、`CompactionResult`、`CompactionEngine` 介面 |
| [subagent.md](subagent.zh.md) | subagent seam：命名提供者註冊表、`SubagentStartRequest`/`Result`/`Run`、啟動時與執行時能力拆分 |
| [voice-input.md](voice-input.zh.md) | 實驗性具名語音識別、臨時音訊和受版本保護的草稿插入 |
| [agent-team.md](agent-team.zh.md) | Agent Teams：隱式 Lead 身份、具名 continuable teammate、持久 peer mailbox 與共享任務 DAG |
| [web.md](web.zh.md) | Web 存取 seam：`WebSearchRequest`/`Result`、`WebFetchRequest`/`Result`、`WebFetchBody`、提供者可用性、`WebError` |
| [spill.md](spill.zh.md) | spill 儲存 seam：`SaveTextSpill`、`SpillOwner`/`SpillSource`、`SpillRef`、品牌型別 `SpillLocator` |
| [workflow.md](workflow.zh.md) | 工作流 seam：`WorkflowStartRequest`、`WorkflowMeta`、`WorkflowRun`/`Result`、`workflow/*` 事件載荷、`WorkflowError` 致命性 |
| [jobs.md](jobs.zh.md) | 後臺任務執行時：品牌化 `JobId`、producer 約定、消費方檢視和 `ctx.jobs` 服務行為 |
| [permission-presets.md](permission-presets.zh.md) | 權限預設層：`PresetSpec`/`PresetOption`、派生的 `custom` 狀態、僅記日誌的 `permission/preset` 事件 |
| [plan.md](plan.zh.md) | 計劃模式：僅記日誌的 `plan/mode` 狀態、待定選擇的沖刷、`PlanModeConfig`、`exit_plan_mode` 審閱流程 |
| [invariants.md](invariants.zh.md) | 執行時不變式註冊表：選擇設定 `Config`、`InvariantInstaller`/`InvariantFailure`、空配套外掛約定 |
| [web-server.md](web-server.zh.md) | HTTP 載體：`WebRouteKind`/`WebRoute`、匹配順序、可認領的退回席位、index 渲染掛接點 |
| [webhook.md](webhook.zh.md) | 透過身份驗證的提供者交付、任意程式化規則，以及發起 Workspace 工作階段建立後不等待結果 |
| [storage.md](storage.zh.md) | 儲存子系統：後端約定（`StorageBackend`）、`StorageForms`、`DomainSpec`/`Domain`、`domain/changed` |
| [workspace.md](workspace.zh.md) | 工作區註冊表：`Workspace`/`WorkspaceId`、註冊與解析、與工作階段 `cwd` 的關係 |
| [web-client.md](web-client.zh.md) | 瀏覽器架構：啟動、Remote 通訊、配對的 Client model、UI 介面卡、Conversation 組裝、slot 與重連語義 |
| [client-modules.md](client-modules.zh.md) | Web 外掛表：`dsh.client` 宣告、`WebBootGraph` 協定格式組合、bundle 路由與 index 掛接點 |
| [slots.md](slots.zh.md) | 型別化 Web UI 組合：宣告所有權、cardinality 與 scope、框架與功能注入、props 推導及已交付的層級結構 |
| [client-resources.md](client-resources.zh.md) | 用戶端資源模型：`dsh-resource://<type>/…` 地址、協定提供者與 `ResourceProtocolMap`、`useResource` 全域掛鉤及其狀態、釘住與釋放 |
| [sidebar-right.md](sidebar-right.zh.md) | 右側 Sidebar：資源地址與導航地址、tab 型別註冊與路由、`ctx.sidebarRight` 導航服務、pane-tab slot 與 owner props、資源模型及 Workspace Files 服務 |
| [conversation.md](conversation.zh.md) | 目標無關的工作階段事件組裝：上下文標識、位置資料、回放路徑、檢視建置器與目標自有的渲染節點 |
| [session-projection.md](session-projection.zh.md) | 投影 seam：`SessionProjectionMap`、純函式 `ProjectionDefinition` 單元、`ProjectionSnapshot` 的一致切面、變更饋送 |
| [session-telemetry.md](session-telemetry.zh.md) | 對外工作階段上報能力 seam：`SessionTelemetryRecord`/`SessionTelemetrySeverity`、`SessionTelemetrySink` 約定和 `session-telemetry/record` 脫敏 waterfall（瀑布式事件） |
| [product-telemetry.md](product-telemetry.zh.md) | 顯式產品分析事件提交與 OTLP/HTTP 傳輸 |

> 這些頁面上的型別宣告及其 JSDoc 與原始碼等價，並由 `pnpm run verify-type-equiv` 檢查漂移（見 [development.md](../development.zh.md#documenting-types-verbatim-ts-type-equiv)）。普通塊保留完整宣告；`public-api` 塊保留去除實作體的公開 class 宣告。Cordis 服務與事件使用每頁生成的 **Cordis API** 小節。
