# Agent Note: PTC mode 塌縮執行器而非僅通告面

Status: implemented

[English](2026-08-07-ptc-executor-collapse.md) | 中文

## 問題

`mode: 'ptc'` 只塌縮了通告面，沒有塌縮執行面。`wireSchemas()` 只向模型傳送一個工具——`run_code`——但執行器透過 `get()` 解析所有呼叫，而 `get()` 返回完整的可見工具表外加保留的傳輸工具。模型一旦發出原生工具名（`write`、`read`、`bash`、`subagent` 等），就能完全繞過 `run_code`：呼叫照常走完整流水線並執行成功，儘管它的 schema 從未被通告過。模型提供者不攔截未通告的工具名，因此不發 schema 等於沒有約束。

包契約點名了這個反模式：當直接呼叫方可以繞過時，schema 省略不算強制執行；拒絕必須經執行器驗證。

## 決策

`ToolRuntime` 透過新增的私有 `resolveExecution(name, scope, nested)` 解析可執行定義，在擁有該決策的操作邊界上應用模式塌縮。當 `modeFor(scope)` 解析為 `ptc` 時，模型直呼（`nested = false`）只允許命名保留的 `run_code` 傳輸工具；任何原生名字都解析為 `undefined`，並以執行器既有的 `UNKNOWN_TOOL` 錯誤呈現，其訊息會指出改走 `run_code` 的正確路徑——因為這個名字對目前模型而言是**已宣告過**的（已中止的呼叫方 signal 保留取消契約：`ABORTED_BEFORE_DISPATCH`，並應用可見工具的 finalizer）。有效的 scope 模式包括從 agent preset 繼承的宣告，因此其 wire schema 與執行權限保持一致。被塌縮的呼叫在 `createExecution`（`prepare` 的第一階段）即終止——在可擴充功能策略流水線之前，因此 `tools/pre-execute` 監聽器、approval `ask` 與 guard 永遠不會觀察到一個註定被拒絕的呼叫，人類也不會被提示去批准它。巢狀子呼叫（`nested = true`——即設定了 `parent` token，生產程式碼中只有 `run_code` SDK 繫結會設定）可以呼叫任意可見工具，因此程式保留生成 SDK 宣告的全部繫結。

執行鏈結的四處查表——`executionMode`、`dispatchToolBody`、`postExecute`、`normalizeDispatchResult`——改走 `resolveExecution`。`createExecution` 透過共享的 `collapses(name, nested)` 謂詞應用同一塌縮，以便在策略流水線之前區分被塌縮的呼叫與真正未知的名字。公共註冊表檢視（`get`）與 SDK 投影（`schemas`）語義不變：展示、檢查與繫結列舉仍看到完整可見集合。通告（`wireSchemas`）與執行器現在一致。帶非 JSON 可序列化參數的塌縮呼叫報告參數 `TypeError`（invalid-args 契約），而非 `UNKNOWN_TOOL`——函式體仍不會執行，策略也不會執行。

塌縮是安全相關的不變數，因此驗收經執行器釘死：`ptc` 模式下模型直呼原生工具返回 `UNKNOWN_TOOL`；同一工具經 SDK 子呼叫成功；`native`/`both` 模式直呼與 `run_code` 本身行為不變。本 note 把執行邊界疊加在基礎 [PTC mode 基礎](../feature/2026-06-15-ptc.zh.md) 之上，傳輸設計由後者擁有。

## 備選方案

### 按模式過濾 `get()` / 註冊表檢視

檢視被展示方、`tool-cordis` 檢查與 SDK 繫結消費；塌縮檢視會從程式表面隱藏仍必須繫結的工具，並改變所有消費者的公共解析契約，而不只是執行器。

### 在 agent-loop 入口過濾

loop 不是唯一的執行器呼叫方，且真正要緊的區分（模型直呼 vs 傳輸子呼叫）掛在執行輸入上，不在 loop 邊界。入口過濾還會重複編碼註冊表已經擁有的模式語義。

### 透過內建 guard 拒絕

guard 是可選的外掛擴充功能；安全不變數不能依賴部署恰好組裝了正確的外掛。模式決策歸註冊表所有，必須由它自己執行。

### 只保留 schema 省略（維持現狀）

沒有提供者保證攔截未通告的名字；被報告的工作階段證明攔截不會發生。

## 後果

- `mode: 'ptc'` 現在兌現其通告：模型直呼原生工具變為 `UNKNOWN_TOOL`，模型可以透過改走 `run_code` 自行糾正（已中止的呼叫仍按取消契約解析為 `ABORTED_BEFORE_DISPATCH`）。
- `both` 與 `native` 行為不變；SDK 子呼叫不變（判別訊號是 `parent` token）。
- 被塌縮的呼叫在 `prepare` 階段即被拒絕——在可擴充功能策略流水線之前：pre-execute 監聽器、approval `ask` 與 guard 永遠不會觀察到它。`executionMode` 同樣 fail-closed（`exclusive`），排程無可觀察差異。
- 原生工具指引段（`tool:read`、`tool:write`、`tool:bash` 等）保留在系統提示詞中，因為它們同時描述了透過生成 SDK 及原生函式呼叫可用的能力，其中若干段還承載著任何單個工具描述都裝不下的跨工具路由策略（`read` 優先於 `bash cat`、預設 fs-observation-policy 要求先 `read` 再 `write`、一兩個委派用 `subagent` 而非 `workflow`）。防止模型直呼原生工具的是執行器塌縮，而非提示詞過濾。
- 提示詞會**宣告**這條塌縮，位於 first-party 逐工具指導之前的 `tools:ptc-only` 段。那些段只寫出工具名而不限定其可達方式，因此只讀到它們的模型會發出原生呼叫，為一個同一份提示詞剛剛宣告過的工具收到 `UNKNOWN_TOOL`，進而判定部署不一致，而不是自行糾正。拒絕資訊給出正確路徑也是同一原因。TypeScript SDK 段在生成宣告旁再次區分兩者，將其標為只能在程式內使用的繫結，並說明只有單獨提供的工具 schema 才賦予直呼權限。宣告列表可能被誤讀為原生工具可用性，因此噹噹前 `bash` 參數 schema 接受範例參數時，該段會給出以 `run_code` 包住 `tools.bash(...)` 的完整呼叫。`both` 下該規則渲染為空：它的原生呼叫確實會執行，在那裡宣告就是假話——這也是 `both-mode-turn` 不再與 `ptc-turn` 共用期望提示詞的原因。
- 未來任何設定 `parent` token 的組合傳輸，其子呼叫自動走全表，與該 token 已有的巢狀呼叫語義一致。
