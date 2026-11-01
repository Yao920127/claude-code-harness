---
description: "面向模型的持久 bash 工具，供選擇、設定或排查跨呼叫保留的按所有者隔離 shell 狀態的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-bash-persistent

[English](README.md) | 中文

## 概述

本包為 agent（智慧代理）提供 `bash` 工具，使 cwd、匯出的變數、函式與後臺任務跨呼叫保留。每個 agent 都有隔離的 shell，其命令序列執行。需要跨呼叫狀態的工作流應選擇本包；每條命令都應從乾淨環境開始時使用 `dsh-tool-bash`。設定 PTY 後端與單條命令的超時；`exit`、超時或取消會重置 shell，而等待 stdin 的互動式命令可能一直執行到超時。

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

在 agent 需要在命令之間保持 shell 狀態的任何組合中載入本外掛——例如長時間建置工作階段、已啟用的環境，或為後續步驟匯出變數的腳本。它註冊 `bash` 工具，需要 `ctx.tools` 與 `ctx.terminals` 服務，並在執行時需要擁有者 agent 工作階段。

### 何時選擇

當工作依賴跨呼叫狀態時選擇持久工具：一次性 `dsh-tool-bash` 呼叫無法記住 `cd` 或匯出的變數。當每條命令都應從已知、乾淨的環境開始，或命令又短又獨立時，選擇一次性工具。這裡不支援需要互動 stdin 的命令——讀取輸入的前臺子程序會一直阻塞到命令超時——因此互動工作屬於 terminal 工具。

### 最小設定

預設的 `shell` 後端透過 `dsh-terminal-bash` 啟動互動式 bash；部署方可以註冊其他 PTY 後端並按名稱選擇。

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-bash-persistent'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `backendType` | `shell` | 用於每個 agent shell 的已註冊 PTY 後端 |
| `timeoutMs` | `300,000` | 單條命令的牆鐘上限；超時關閉 shell |
| `maxOutputChars` | `16,000` | 保留的命令輸出字元上限；固定診斷資訊在其後追加 |
| `description` | `Run commands in a persistent bash shell. State, including the current directory and exported environment variables, persists across calls for this agent.` | 面向模型的環境約定；部署方可描述自己的環境 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### agent 可以依賴什麼

命令共享每個 agent 一個 shell，因此狀態一直保留到 `exit`、超時或重置——每一種都會關閉 shell 並告訴 agent 下一次呼叫從工作區的新目錄與環境開始。結果排除私有完成標記；每條完成的命令都追加 `[Command finished with exit code N]`，而在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]` 或 `[shell exited]`，然後重置。長輸出保留最早的已保留字首並附裁剪通知；若 terminal 已經丟棄該字首，結果會明確說明，而不是把尾部當作完整輸出呈現。

### 可能出什麼問題

沒有擁有者 agent 工作階段的呼叫會以 `bash requires an owning agent session` 失敗，沒有 PTY 後端的組合會啟用該工具，但首次呼叫以 `no PTY backend registered for "shell"` 失敗。互動式前臺子程序（例如 REPL）只有在後端證明其 stdin 等待時才提前返回部分輸出；否則呼叫一直執行到 `timeoutMs`，隨後關閉不確定的 shell 並報告重置。取消也會重置並丟棄結果，即使完整狀態標記已經可觀察。清理完成後，ToolRuntime 釋出 `Error: tool call aborted`，錯誤碼為 `ABORTED`；取消原因不作為命令輸出渲染。排隊期間被取消的呼叫不傳送命令。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **每個 owner 一個 shell，互不共享。** shell 註冊表按呼叫方 `Agent` 為每個工作階段建鍵，因此並行 agent 永不共享狀態，同一 agent 的命令透過按 owner 的佇列序列化。
- **標記錨定提取。** 每條命令都用攜帶退出狀態的唯一起止標記包裝；工具輪詢 PTY scrollback 並提取真實標記之間的區間，因此提示符與回顯輸入永不洩漏進結果。
- **重置，而非修復。** 任何不確定狀態——顯式 `exit`、超時、傳送失敗、中止——都會關閉 shell 並讓下一次呼叫從全新狀態開始，因為半知情的 shell 不如干淨的 shell。
- **按 owner 的生命週期。** shell 在首次使用時惰性建立，在外掛釋放或 owner 拆除時終止；按所有者隔離的 `ctx.terminals` 服務把每個操作都圍欄到擁有它的 agent。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：shell 註冊表、命令包裝、scrollback 輪詢、提取與渲染 |
| — | 不釋出執行時不變式伴生入口；介面卡私有的 owner-to-shell 快取沒有可觀察的事件或資料關係。shell 複用仍可透過工具執行觀察。生命週期測試會驗證其清理行為，無需僅為不變式增加公共 API。 |

### 命令流程

首條命令透過 `ctx.terminals.spawn` 生成 shell，停用輸入回顯（`stty -echo`），並等待就緒。隨後每條命令都包裝成一行物理文字——printf 起始標記、用 `$'…'` 轉義的命令體、printf 結束標記加 `$?`——因此內嵌換行無法把終端提示符洩漏進結果。工具以 1,000 行一頁輪詢 scrollback，直到出現結束標記，提取區間並連同任何狀態標記一起渲染。超時會中止截止時間、捕捉部分輸出並重置 shell。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 terminal 家族逐步進入 seam、後端，以及按所有者工作階段背後的設計筆記。

- [terminal 包對映](../../terminal/README.zh.md)——持久 PTY 能力家族。
- [terminal seam](../../terminal/terminal/README.zh.md)——工具背後的 `ctx.terminals` 服務。
- [terminal-bash 後端](../../terminal/terminal-bash/README.zh.md)——預設的 `shell` 後端。
- [tool-terminal](../../terminal/tool-terminal/README.zh.md)——面向互動工作的六個模型側 terminal 工具。
- [持久 PTY 工作階段 Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——按所有者工作階段的設計及其理由。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)——`bash` 參數 schema 的確切內容。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什麼

生成的 [`bash` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)，包括設定的 `description`。本外掛不貢獻獨立的系統提示詞區段；人設與環境指引由部署方負責。

#### Token 影響

`bash` 可見期間產生固定 schema 開銷。

#### KV Cache 影響

只要設定的描述與 schema 不變，字首就保持穩定。

### 工具結果

#### 模型看到什麼

命令共享每個 agent 一個 shell，因此 cwd、匯出的變數、已啟用的環境、函式與後臺任務都會跨呼叫保留。結果排除私有完成標記。當 shell 在沒有列印完成標記的情況下再次讀取 stdin——`exec`、中斷，或提供者證明其 stdin 等待的互動式前臺子程序之後——呼叫返回捕捉的部分輸出，它可能以後端自己的提示符文字結尾。每條完成的命令都追加 `[Command finished with exit code N]`；在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]`，或後端兩者都未提供時的 `[shell exited]`，然後重置並告訴模型下一次呼叫從全新狀態開始。長輸出保留最早的已保留字首並附裁剪通知。若 PTY 已經丟棄該字首，結果會明確說明，而不是把尾部當作完整輸出呈現。超時返回有界部分輸出並追加 `[Command timed out or OOM]`、關閉不確定的 shell 並報告重置。

#### Token 影響

依資料而定。`maxOutputChars` 限制保留的命令輸出；固定的裁剪、丟失字首、狀態、超時與重置診斷可能延長結果。

#### KV Cache 影響

僅追加的工具結果位於可複用請求字首之後。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適或需要特別小心。它們是目前包約束，不是任務積壓。

- **工具需要擁有者 agent 與真實的 PTY 後端**——無 agent 的呼叫與無法啟動互動 shell 的後端都會失敗。
- **互動式前臺子程序只在子程序提供者證明其 stdin 等待時才提前返回部分輸出**——否則呼叫一直執行到 `timeoutMs`。
- **顯式 `exit` 與超時會丟棄 shell 狀態**——取消同樣重置並丟棄結果，即使完整狀態標記已經可觀察；下一次呼叫啟動全新 shell。
- **網路存取與包映像等環境事實屬於設定的 `description`**——而不是本包的預設描述。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
