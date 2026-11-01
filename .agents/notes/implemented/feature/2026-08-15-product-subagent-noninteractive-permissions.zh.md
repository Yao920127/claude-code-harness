# Agent Note: 產品 subagent 使用 Profile 選擇的非互動權限

Status: implemented

[English](2026-08-15-product-subagent-noninteractive-permissions.md) | 中文

## Problem

[Claude Code 與 Codex 產品提供者](2026-08-04-claude-code-and-codex-subagent-backends.zh.md)都在沒有人工介面的情況下執行。因此，原生權限提示、使用者對話或 MCP elicitation 不能等待人員回應，但依賴任一產品環境中的預設值仍可能選擇互動模式。部署也需要選擇更寬鬆的原生模式，同時不能讓父模型或單次工具呼叫提升自身權限。

失敗的產品執行此前只能把終止原因送入 [subagent seam](2026-06-21-subagent-capability-seam.zh.md)。日誌可以保留產品錯誤，但前臺父 agent 與[一次性後臺 Job](../../archived/feature/2026-08-12-product-subagent-one-shot-background-tasks.md)無法區分權限拒絕和其他失敗。若複用 assistant 輸出承載該事實，則會把基礎設施說明錯誤歸因給子模型。

## Decision

每個產品提供者分別擁有自己的 Profile 級 `permissionMode` 值。兩個 Config 欄位有意使用各產品的原生名稱，而不是共享的受限／自動／完全抽象。提供者會為該外掛實例的每次執行固定已解析值。subagent 工具 schema 與 `SubagentStartRequest` 都不包含權限欄位，因此模型或單次委派無法改變它。

### Claude Code

Claude Code 預設使用 `dontAsk`，而且只接受鎖定版本 Agent SDK 支援的原生非互動模式：

| 值 | 原生行為 |
| --- | --- |
| `dontAsk` | 不彈出提示，直接拒絕尚未獲授權的操作。 |
| `acceptEdits` | 接受編輯；其餘權限提示由無人值守回呼拒絕。 |
| `auto` | 由 Claude Code 原生分類器允許或拒絕權限請求。 |
| `plan` | 使用規劃模式，拒絕執行審批，並把完整計劃作為最終答案返回。 |
| `bypassPermissions` | 設定 SDK 的顯式危險確認並跳過權限檢查。 |

提供者繼續省略 `settingSources`：可選的實例級模型是獨立的直接 SDK 覆蓋；除所選模式以外，使用者、專案和本地設定、身份驗證、工具與沙箱行為仍由 Claude Code 擁有。

每次 query 都停用 `AskUserQuestion`。非 bypass 模式的權限回呼會拒絕請求，而不會返回 SDK 中會無限阻塞的 `null`；plan 模式還會把 `ExitPlanMode` 放入 `disallowedTools`，因此原生 allow 規則無法把無人值守 query 切回執行模式。MCP elicitation 會被拒絕；已支援的拒絕對話會被取消；未宣告的對話型別使用 SDK 的無對話失敗行為。原生 `permission_denied` 訊息會記錄同一份目前執行事實。這些路徑不會建立審批工作階段、佇列、快取或重試迴圈。

### Codex

Codex 預設使用 `never`，並接受 Codex 0.153.4 公開的三種原生非互動模式。提供者啟動固定的 app-server 命令，再把所選模式對映為官方 `thread/start` 欄位，因為 CLI 全域權限 flag 不會設定之後由 app-server 用戶端建立的執行緒：

| 值 | `thread/start` 欄位 | 原生行為 |
| --- | --- | --- |
| `never` | `approvalPolicy: never`；省略 sandbox | 永不彈出提示；執行失敗會在原生 sandbox 下返回模型。 |
| `approve-for-me` | `approvalPolicy: on-request`、`approvalsReviewer: auto_review`、`sandbox: workspace-write` | 由 Codex 自動評審權限請求。 |
| `dangerously-bypass-approvals-and-sandbox` | `approvalPolicy: never`、`sandbox: danger-full-access` | 跳過審批與 sandbox。 |

提供者只覆蓋這些權限與 sandbox 欄位。可選的實例級模型是獨立的直接 `thread/start` 覆蓋；`CODEX_HOME`、專案設定、模型 provider 選擇、MCP、hook、skill、身份驗證，以及模式未選擇的 sandbox 事實仍屬於 Codex 原生狀態。wire 仍會拒絕任何意外到達的審批、權限、使用者輸入或 MCP 請求，而不會開放動態 allow 通道。

### 失敗診斷

`SubagentResult` 攜帶可選的 `diagnostic`，用於提供者產生且不屬於 assistant 內容的失敗說明。提供者在生成它之前會排除工具輸入、檔案內容、環境值、憑證與原始協定載荷。共享的程序外結果邊界會把完整文字限制在 4096 個 UTF-8 位元組以內，並在不切斷字元的前提下標記截斷。[最小診斷決策](../../archived/simplification/2026-08-21-product-subagent-minimal-diagnostics.md)負責兩個產品透過同一欄位承載的非權限行動類別、生命週期階段、HTTP 事實與程序結果。

每個產品的權限事實都只包含有效模式、請求類別、無人值守決定與固定的安全原因。Claude Code 從 SDK 回呼和 `permission_denied` 訊息取得這些事實。Codex 從 app-server 請求、被拒絕的 item 與結構化 `sandboxError` 終態取得事實。原始 stderr 仍會轉發給 Host，但既不會被分類，也絕不會複製進診斷。兩個提供者都會把失敗行放在最新參與失敗的權限事實之前。成功結果只返回嚴格的最終答案；本地取消仍以 `aborted` 結算且不附帶權限說明；未釋出的啟動失敗仍會拒絕 `start()`。提供者絕不會把任一診斷事實寫入 assistant 輸出、結構化輸出或 `subagent/end.lastAssistantMessage`。

前臺消費方依次呈現終止原因標題、可選診斷和任何部分 assistant 輸出。一次性後臺介面卡會在失敗 Job 的 detail 中，把同一診斷與終止原因一起儲存。沒有填寫該欄位的提供者保持原有行為。

### 所有權與生命週期

| 事實或資源 | Owner | 可觀察行為 |
| --- | --- | --- |
| Profile 權限選擇 | 各產品提供者 Config | 設定階段會拒絕無效、互動式或未知值。 |
| 權限與沙箱語義 | Claude Code Agent SDK 或 Codex app-server | 各提供者傳入一個原生模式，不映像產品策略。 |
| 互動決定與安全診斷 | 單次產品執行 | 並行執行分別擁有獨立的模式、協定與診斷狀態。 |
| 診斷型別與位元組上限 | `dsh-subagent` | 消費方收到與 assistant 輸出分離的有界可選欄位。 |
| 前臺與 Job 呈現 | `dsh-tool-subagent` 和通用 Job 執行時 | 排程選擇不會改變底層失敗事實。 |
| 程序取消與完全停穩 | 產品提供者和 `dsh-subprocess` | 結果結算後仍執行冪等的完整程序樹資源釋放。 |

## Verification

包測試固定所有允許與拒絕的 Config 值、準確的 SDK 與 app-server 欄位對映、危險確認、無人值守終態、診斷脫敏與 UTF-8 上限、成功結果不攜帶診斷、並行執行隔離、前臺順序、Job detail、stderr observer 釋放和程序清理。真實 Claude Agent SDK 0.3.263 與 Claude Code 2.1.263 fixture 證明其安全預設、受限拒絕、顯式 bypass 與整棵程序樹完全停穩。真實 Codex 0.153.4 app-server fixture 證明執行緒級 `never` 覆蓋環境中的 `on-request`、自動評審可以啟動、危險繞過只在測試擁有的臨時儲存中寫入、被拒絕的提權不會留下副作用且診斷不含原始命令或路徑、stderr 只供 Host 觀測，而且 wrapper／native 程序樹會退出。Loader 組裝證明非預設模式可以在不啟動任一產品的情況下發布；無金鑰 ACP snapshot 則記錄每個產品的失敗診斷如何經過前臺與 Job 呈現，同時面向模型的產品工具 schema 不包含權限參數。

## Alternatives considered

**使用產品環境中的權限預設值。** 原生設定可能選擇互動模式，使無人值守行為依賴部署環境。提供者必須為每次 query 顯式選擇非互動模式。

**把權限模式放入面向模型的工具或每次 start 請求。** 這會讓任務內容選擇權限，並在每次呼叫中重複一個 Profile 部署決定。

**複製產品設定或對映父級 Harness 沙箱。** 各產品並不共享同一套權限詞彙。映像這些狀態會建立第二個權威，並掩蓋自動模式與 bypass 模式的原生沙箱後果。

**把提示轉發給父 agent、Web 用戶端或 CLI。** 一次性產品執行沒有由其擁有的人工互動生命週期。新增該能力需要持久請求身份、路由、取消與 timeout 語義，超出本決策範圍。

**返回原始產品錯誤、stderr 或工具輸入。** 這些值可能包含命令、路徑、工作區資料、環境值或憑證。固定的安全診斷既保留可操作性，也不會暴露產品 transcript。

**單獨儲存 Job 診斷。** Job 只是同一 `SubagentRun` 的排程介面卡；第二個欄位會讓前臺和後臺的失敗含義發生漂移。

## Consequences

Profile 可以在提供者啟動前選擇各產品原生的受限、自動、在產品支援時僅規劃／編輯放行，或 bypass 行為，而兩個安全預設值都絕不會詢問人員。更寬鬆的模式仍是顯式部署選擇，並保留其原生沙箱後果。

權限失敗會同時到達前臺父 agent 和一次性後臺 Job，且不會把基礎設施文字偽裝成 assistant 回答。同一欄位還可以承載由另一項決策負責的結構化失敗事實。它可以沿普通消費路徑進入模型上下文、Job 通知、API 投影與 Job UI，因此提供者必須在結果結算前對完整文字完成脫敏和限長。

本改動不增加產品工作階段持久化、人工審批通道、動態權限操作、進度流、重試策略或復原。其他提供者無需產生診斷或公開權限模式 Config，仍然保持合法。
