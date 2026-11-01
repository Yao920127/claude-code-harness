# Agent Note: 持久 pwsh 保留後端的受控提示符

Status: implemented

[English](2026-09-21-persistent-pwsh-keeps-controlled-prompt.md) | 中文

## Problem

`dsh-tool-pwsh-persistent` 用自己安裝的 `prompt` 函式（`'__DSH_PERSISTENT_PWSH_PROMPT__ '`）初始化其 shell，覆蓋了 `dsh-terminal-bash` 在 pwsh 啟動序列中安裝的 `prompt`。後端的提示符就緒檢測要求 OSC `133;D` 標記之後的可列印尾部與受控提示符 `dsh> ` 完全相等（[設計](../feature/2026-07-16-persistent-pty-sessions.zh.md)），因此初始化之後任何 send 都無法經由該路徑結算，每次 send 都要支付靜默層加交接寬限。在 Windows 上透過真實 Loader 組合以生產預設值實測：首次呼叫（spawn、初始化與命令）8493 毫秒，隨後三次為 3722/3832/3759 毫秒；受控提示符完好時為 1340/255/251/241 毫秒。包測試把 `idleSilenceMs` 配成 300，掩蓋了該問題。

[持久 bash 工具已修復同一缺陷](../../archived/bug-fix/2026-08-15-persistent-bash-keeps-controlled-prompt.md)，方式是放棄自己的提示符覆蓋；pwsh 孿生工具保留了它。該覆蓋在兩個工具中服務同樣的兩個消費點：用視口字尾檢測「shell 已回到提示符但沒有結束標記」的退回判定，以及從部分輸出中剝離提示符文字的美化。

## Decision

工具不再安裝提示符。pwsh 的 `prompt` 函式由 `dsh-terminal-bash` 擁有，在 `spawn` 期間安裝，且只在該啟動流程達到 `stdin_read` 就緒後才返回工作階段，因此工具的初始化 send 已無可確立之事，與其 `PWSH_PROMPT_SETUP` 命令一併刪除。

視口字尾退回替換為 seam 自己的訊號：一次以 `stdin_read` 結算而 scrollback 中沒有結束標記的 send，返回已捕捉的部分輸出。私有提示符常數及其剝離邏輯刪除；部分輸出現在可能以後端自己的提示符文字結尾，工具無法也不應知道該文字。`stripPrompt` 收斂為 `trimTrailingNewline`，與 `dsh-tool-bash-persistent` 一致。

## Alternatives considered

**把工具的提示符文字對齊到後端的 `dsh> `。** 被拒絕：這保留了同一個協定常數的第二份安裝與第二個擁有者，而且該 send 是多餘的——後端在 `spawn` 返回前就已安裝相同的提示符。

**把受控提示符匯入工具。** 被拒絕：提示符是單個提供者的協定常數；Consumer 匹配它就把工具與 `dsh-terminal-bash` 具體耦合，換任何其他 pwsh 方言後端都會再次損壞。

**改為調小 `handoffGraceMs`/`idleSilenceMs`。** 被拒絕：任何靜默值都修不好已死的快速路徑，只是重新分配每次呼叫多付多少；而靜默層同時也是吸收真正損壞提示符的那一層。

**像 bash 的 `PROMPT_COMMAND` 那樣在每個提示符處重新設定 pwsh 提示符。** 被拒絕：除 `prompt` 函式本身之外，PowerShell 沒有每提示符掛鉤，因此重定義無法像 bash 的變數那樣被治好；該殘餘已記入已知限制。

## Consequences

Windows、生產預設值、真實 Loader 組合：工具呼叫從 8493/3722/3832/3759 毫秒降至 1340/255/251/241 毫秒（spawn + 初始化 + 首條命令，隨後三條熱命令）。

`stdin_read` 退回是行為而不只是美化：在提供者能證明前臺 stdin 等待之處，互動式子程序會返回已捕捉的部分輸出，而不是空轉到命令期限；其他情況下呼叫仍會執行到 `timeoutMs`。該提前返回保留工作階段，因此仍在讀取 stdin 的子程序可能吞掉下一次呼叫的命令，直到那次呼叫到達 `timeoutMs` 並重置 shell；`dsh-tool-bash-persistent` 行為相同，而區分「shell 自身的提示符就緒」與「子程序的 stdin 等待」屬於 seam，而不是任一工具。由標記界定的完整輸出保持不變。

loader 組合套件記錄每次 send 的 `waitReason`，要求至少六次 `stdin_read` 且沒有 `inferred_idle`：迴歸由結算原因本身報告，而不是靠靜默層耗時。把刪掉的提示符覆蓋加回去，該斷言會在 30 秒後以 `expected 0 to be greater than or equal to 6` 失敗，而同一案例的輸出斷言仍然透過。stub 套件刪除了初始化握手模式，並改為錨定部分輸出中保留的提示符文字，而不是它的缺席。

重定義 `prompt` 的模型命令仍會移除就緒標記，並把後續 send 降級到靜默層：後端只在啟動時安裝一次提示符，無法重新設定。
