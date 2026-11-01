# Agent Note: subagent 能力 seam

Status: implemented

[English](2026-06-21-subagent-capability-seam.md) | 中文

> 完整 seam 已交付：`dsh-subagent` 介面與 `dsh-tool-subagent` 消費方；兩個程序內後端（`dsh-subagent-spawn-in-process`、`dsh-subagent-fork-in-process`）；巢狀 agent（智慧代理）快照基礎設施（[逐工作階段快照回放](../../archived/testing/2026-06-22-subagent-snapshot-replay.md)）；以及程序外的 ACP（Agent Client Protocol）、Codex 與 Claude Code 後端（[ACP Agent Note](../../archived/feature/2026-06-22-acp-subagent-backend.md)、[產品提供者 Agent Note](2026-08-04-claude-code-and-codex-subagent-backends.zh.md)）。

## 問題

harness 有一個長期擱置的 seam 用於 **subagent**：一個 agent 將工作委派給另一個 agent。這一意圖在 `Agent`/`AgentLoop` 介面中已有草案（[packages/core/agent/src/types.ts](../../../../packages/core/agent/src/types.ts)、[packages/core/agent-loop/src/index.ts](../../../../packages/core/agent-loop/src/index.ts)）：一個建立選項引用父 agent（fork = 用父工作階段的事件日誌初始化子工作階段；spawn = 全新工作階段），子 agent 以 `Agent` 控制代碼返回，使 steering（中途引導）和事件訂閱可以統一工作。

**多種 subagent 實作必須在執行時共存。**一個父 agent 可能在同一個工作階段中既需要一個廉價的程序內子 agent 處理有限範圍的子任務，又需要一個隔離的程序外子 agent（透過 ACP）。傳輸方式：

- **程序內**：在同一個 `Context` 上建立一個具體的子 `Agent`（最廉價，且鑑於現有 agent 工廠幾乎零成本）；
- **ACP**：作為 ACP *用戶端*驅動另一個 agent 程序（可以是自身的另一個實例）；
- **Codex app-server 與 Claude Code Agent SDK**：目前的一次性同類提供者，將同一個命名提供者約定應用於官方產品程序（[產品提供者 Agent Note](2026-08-04-claude-code-and-codex-subagent-backends.zh.md)）；
- 後續：**A2A**，採用同樣的程序外形態：「啟動子 agent、傳送提示詞、結算、取消」。

## 曾考慮的替代方案

### 為何不採用 bash seam 的形狀

bash seam（[能力 seam](../architecture/2026-06-13-capability-seams.zh.md)）在每個上下文中只註冊恰好一個 `ShellExecutor`；載入第二個會拋異常。這對 bash 是正確的（一臺機器、一種執行命令的方式），但對這裡是錯誤的：共存才是需求。因此 subagent 服務是一個**命名提供者註冊表**——每個實作以唯一名稱註冊，呼叫方按名稱選擇——映像 **LLM（大語言模型）介面卡註冊表**（`LlmRuntime.registerAdapter`），而非單服務的 bash 執行器。seam 仍然是由三類包構成的結構（Service Definition / Service Provider / Consumer）；只是「一個 vs. 多個實作」這個維度不同。

## 決策

### 由三類包構成的邊界

新建包組 `packages/subagent/`：

| 包 | 角色 |
|---|---|
| `@deepseek-ai/dsh-subagent` | 介面：`SubagentRuntime`（`ctx.subagents`）、`SubagentProvider`、`SubagentRun`、請求、結果、能力詞彙、`subagent/*` 事件 |
| `@deepseek-ai/dsh-subagent-spawn-in-process` | 實作：透過 `ctx.agents.create` 建立全新的程序內子 agent |
| `@deepseek-ai/dsh-subagent-fork-in-process` | 實作：用父 agent 日誌快照初始化的程序內子 agent |
| `@deepseek-ai/dsh-subagent-acp` | 實作：作為 ACP 用戶端驅動已設定的子程序 |
| `@deepseek-ai/dsh-subagent-codex` | 實作：一次性官方 Codex app-server 程序 |
| `@deepseek-ai/dsh-subagent-claude-code` | 實作：透過 Agent SDK 執行的一次性官方 Claude Code 程序 |
| `@deepseek-ai/dsh-tool-subagent` | 消費方：基於 `ctx.subagents` 的面向模型的 `subagent` 工具 |

### 原語：非同步 `start → SubagentRun`

提供者暴露 `start(request) → Promise<SubagentRun>`。完成時釋出一個子 agent，並將其執行控制代碼轉交給呼叫方。釋出前失敗的工作會拒絕 `start()`，而釋出後的提示詞、輪次、取消與基礎設施結果會透過 `run.result` 結算，且不會隱藏 child id。同一個訊號覆蓋釋出前後的取消；`dispose()`（資源釋放）取消剩餘工作並等待完全停穩。啟動被拒絕時會清理未釋出資源，且不發出生命週期事件；釋出後的結果失敗則會結束已經發布的生命週期事件對。`start` 與傳輸方式無關；`spawn` 僅指代全新的程序內後端。

### 兩類可選能力，兩種發現方式

- **啟動時功能**（`agentOptions`、`outputSchema`、`depthLimit`、`toolFilter`、`persona`）掛在靜態的 `provider.capabilities` 描述符上。服務在委派之前檢查每個被請求的功能，如果提供者不支援則**響亮拒絕**（`SubagentError('UNSUPPORTED_CAPABILITY')`），絕不接受後靜默忽略。這些功能必須在 run 存在之前檢查，因此不能是執行時方法。
- **可繼續建立**使用可選的 `SubagentProvider.prepareContinuable` 方法；方法是否存在本身即為能力，TypeScript 型別收窄即為發現機制，因此不需要可能與實作失同步的獨立 flag。繼續執行管理器直接透過 `AgentHandle` 負責後續投遞與冷恢復，而一次性 `SubagentRun` 沒有 steering 或 resume 操作，具體由[可繼續 subagent](2026-07-28-continuable-subagent-conversations.zh.md) 細化。

### Fork 與 fresh 是獨立後端，而非一個 flag

全新子 agent 與 fork 子 agent 是獨立的提供者，而非請求中的一個 flag。`dsh-subagent-spawn-in-process` 啟動隔離的子 agent；`dsh-subagent-fork-in-process` 用一個平衡字首初始化子 agent，該字首僅包含已完成的父輪次。進行中的輪次被排除，因為其 subagent 呼叫尚無結果，無法構成有效的回放歷史。

### 子 agent 隔離與父日誌

每個程序內 subagent 執行在**自己的 `Session`** 中（獨立 id、`parentSession` 譜系），獨立持久化。遠端 ACP 和一次性產品提供者則會生成一個父級作用域的生命週期 id，且不暴露本地 `Agent` 或子 `Session`；其內部狀態留在遠端程序中。兩種形式下，父日誌都僅記錄 spawn `tool/call` 及其 `tool/result`（子 agent 的最終輸出，或帶可選提供者診斷的失敗結果），而子 agent 的步驟和工具呼叫均留在父日誌之外。

### 同步收集（首版）

`dsh-tool-subagent` 將其執行訊號傳給 `start()`，等待子 agent 結果，並在報告前 dispose 該 run。非完成態的結果變為錯誤結果，而非成功的部分輸出；它會把由[非互動權限決策](2026-08-15-product-subagent-noninteractive-permissions.zh.md)負責的可選安全診斷與部分 assistant 文字分開呈現。結果與 dispose 的拒絕仍可彼此獨立地觀察。

### 傳輸提供者選擇是設定，不面向模型

`dsh-tool-subagent` 繫結到恰好一個 subagent 傳輸提供者名稱（`Config.provider`）。若要暴露多種傳輸方式，請多次載入該工具外掛，每次繫結不同的提供者和不同的 `toolName`（工具註冊表拒絕重名）。*服務*持有多提供者註冊表；*工具*選擇其中一個——schema 中沒有 subagent 傳輸/type 參數。後續 opt-in 增加了子 agent LLM 提供者/模型欄位，但沒有改變這項傳輸決策；見[模型選擇的 subagent 路由](2026-08-18-model-selected-subagent-routes.zh.md)。

## 測試

註冊表與工具測試僅用包內腳本化提供者替換非確定性的子 agent，同時測試真實的 `SubagentRuntime`、生命週期、任務整合和麵向模型的工具。loader 迴歸測試仍覆蓋提供者與消費方的 export，以防止[事故檢討（postmortem）0001](../../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md) 中描述的失敗。註冊表測試覆蓋過載安全性、重名和啟動時能力拒絕；巢狀 agent 情境透過[逐工作階段快照回放](../../archived/testing/2026-06-22-subagent-snapshot-replay.md)進行無金鑰回放；程序內後端還有真實迴圈的單元測試和帶金鑰的 e2e 測試。

## 後果

- **遞迴。** 如果不設限制，程序內子 agent 能看到委派工具並遞迴呼叫。程序內後端實作了可選的絕對深度限制和有作用域的即時全域 `toolFilter`；ACP 宣告這兩項能力為關閉狀態，並拒絕此類請求。[subagent 組合控制 Agent Note](2026-07-12-subagent-persona-tool-filter-and-depth.zh.md) 負責定義它們的確切語義和安全邊界。
- **阻塞父輪次。** 前臺收集在子 agent 的整個持續時間內保持父 agent 的步驟開啟。後臺委派使用共享的 `ctx.jobs` 執行時與通用 `job_*` 工具，與後臺 bash 共用同一套收集機制；subagent seam 本身仍不感知任務。
- **即時進度。** 僅暴露生命週期事件與最終結果；逐分片的子→父更新流推遲到後臺重新設計時一併處理。
- **ACP 用戶端介面。** 將 ACP 子 agent 的 `fs`/`terminal` 代理回父 agent（共享工作區模式）是後續工作；該後端不宣告這兩項能力，子 agent 在自己的程序中自行服務。
