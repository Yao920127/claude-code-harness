---
description: "面向模型的持久 pwsh 工具，供選擇、設定或排查跨呼叫保留的按所有者隔離 PowerShell 狀態的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-pwsh-persistent

[English](README.md) | 中文

## 概述

`dsh-tool-pwsh-persistent` 為每個 agent（智慧代理）提供 `pwsh` 工具，跨呼叫保留其目前目錄、環境變數、函式與後臺任務。同一 agent 的命令序列執行，不同 agent 維護相互隔離的 shell 狀態。多步 PowerShell 工作應選擇本包；若每條命令都應從乾淨狀態開始，請使用 `dsh-tool-pwsh`，需要互動 stdin 時則使用 terminal 工具。請設定支援 pwsh 的後端和單條命令超時；超時或顯式 `exit` 會丟棄 shell，因此下次呼叫從全新狀態開始。

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

在 agent 需要在命令之間保持 PowerShell 狀態的任何組合中載入本外掛——它是 `dsh-tool-pwsh` 的持久對應物，用於依賴跨呼叫狀態的工作。它註冊 `pwsh` 工具，需要 `ctx.tools` 與 `ctx.terminals` 服務，並在執行時需要擁有者 agent 工作階段。

### 何時選擇

當工作依賴跨呼叫 PowerShell 狀態時選擇持久工具；當每條命令都應從已知、乾淨的環境開始時選擇 `dsh-tool-pwsh`。這裡不支援需要互動 stdin 的命令——讀取輸入的前臺子程序會一直阻塞到命令超時，隨後重置 shell——因此互動工作屬於 terminal 工具。

### 最小設定

預設的 `shell` 後端透過設定了 `shellDialect: pwsh` 的 `dsh-terminal-bash` 實例啟動 PowerShell shell；部署方可以註冊其他 pwsh 方言 PTY 後端並按名稱選擇。

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
  config:
    shellDialect: pwsh
- name: '@deepseek-ai/dsh-tool-pwsh-persistent'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `backendType` | `shell` | 用於每個 agent shell 的已註冊 PTY 後端 |
| `timeoutMs` | `300,000` | 單條命令的牆鐘上限；超時關閉 shell |
| `maxOutputChars` | `16,000` | 保留的命令輸出字元上限；固定診斷資訊在其後追加 |
| `description` | `Run commands in a persistent PowerShell shell. State, including the current directory and exported environment variables, persists across calls for this agent.` | 面向模型的環境約定；部署方可描述自己的環境 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### agent 可以依賴什麼

命令共享每個 agent 一個 shell，因此 cwd、`$env:` 變數、函式與後臺任務都會跨呼叫保留。結果排除私有完成標記與回顯的輸入行。當 shell 再次讀取 stdin 卻沒有列印完成標記時——一次中斷、一個被替換的 shell，或提供者能證明其 stdin 等待的互動式前臺子程序——呼叫返回已捕捉的部分輸出，其結尾可能是後端自己的提示符文字。非零的包裝命令追加 `[exit code: N]`——命令執行原生程式時給出確切原生結束代碼，PowerShell 終止錯誤則為 `1`。在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]` 或 `[shell exited]`（Windows 強制終止報告 exit 1 且沒有訊號），然後重置並告訴 agent 下一次呼叫從全新狀態開始。長輸出保留最早的已保留字首並附裁剪通知；若 terminal 已經丟棄該字首，結果會明確說明。

### 可能出什麼問題

沒有擁有者 agent 工作階段的呼叫會以 `pwsh requires an owning agent session` 失敗，沒有 pwsh 方言 PTY 後端的組合會啟用該工具，但首次呼叫以 `no PTY backend registered for "shell"` 失敗。模型重定義 `prompt` 函式會移除就緒標記，shell 隨後在靜默層級而非標記快路徑上結算。命令內的原始 ESC 字元會在執行前被 PSReadLine 消費，不受支援。超時關閉不確定的 shell，並報告受限的部分輸出與重置。取消會重置 shell 並丟棄命令輸出。清理完成後，ToolRuntime 釋出 `Error: tool call aborted`，錯誤碼為 `ABORTED`；取消原因不作為命令輸出渲染。排隊期間被取消的呼叫不傳送命令。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **`dsh-tool-bash-persistent` 的刻意孿生。** 工作階段註冊表、輪詢迴圈與重置約定按設計映像持久 bash 工具（[pwsh 持久 PTY Agent Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md)）。
- **後端擁有提示符就緒。** shell 的 `prompt` 函式屬於後端：它列印 BEL 結尾的 OSC 標記加受控的可列印提示符，該確切提示符文字讓每條命令都經由後端快路徑結算。工具既不安裝也不匹配自己的提示符，因此只有模型重定義 `prompt` 才會把就緒降級到靜默層級。
- **PSReadLine 回顯靠錨定剝離。** PowerShell 會把提交的輸入渲染迴流中；標記錨定提取與包裝原始碼剝離移除回顯，而跨終端寬度換行的包裝可能在部分輸出結果中留下部分回顯。
- **重置，而非修復。** 任何不確定狀態——顯式 `exit`、超時、傳送失敗、中止——都會關閉 shell 並讓下一次呼叫從全新狀態開始。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：shell 註冊表、命令包裝、scrollback 輪詢、提取與渲染 |
| — | 不釋出執行時不變式伴生入口；介面卡私有的 owner-to-shell 快取不存在可觀察的事件或資料關係。生命週期測試無需僅為不變式增加公共 API 即可驗證其清理。 |

### 命令流程

首條命令透過 `ctx.terminals.spawn` 生成 shell，其 pwsh 啟動流程安裝受控的 `prompt` 函式，並只在該 shell 達到就緒後返回。隨後每條命令都包裝成一行物理文字——`Write-Output` 起始標記、用反引號轉義進雙引號字串的命令體、`Write-Output` 結束標記加退出狀態——因此 PSReadLine 對換行包裝的回顯無法偽造完成。工具以 1,000 行一頁輪詢 scrollback，直到出現結束標記或該 send 以 `stdin_read` 結算，提取區間、剝離回顯的包裝，並連同任何狀態標記一起渲染。超時會中止截止時間、捕捉部分輸出並重置 shell。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 terminal 家族逐步進入 seam、後端，以及持久 shell 設計背後的設計筆記。

- [terminal 包對映](../../terminal/README.zh.md)——持久 PTY 能力家族。
- [terminal seam](../../terminal/terminal/README.zh.md)——工具背後的 `ctx.terminals` 服務。
- [terminal-bash 後端](../../terminal/terminal-bash/README.zh.md)——預設後端，設定 `shellDialect: pwsh`。
- [pwsh 持久 PTY Agent Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md)——pwsh 側工作階段設計及其理由。
- [持久 PTY 工作階段 Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——按所有者工作階段的設計及其理由。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)——`pwsh` 參數 schema 的確切內容。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什麼

生成的 [`pwsh` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)，包括設定的 `description`。本外掛不貢獻獨立的系統提示詞區段；人設與環境指引由部署方負責。

#### Token 影響

`pwsh` 可見期間產生固定 schema 開銷。

#### KV Cache 影響

只要設定的描述與 schema 不變，字首就保持穩定。

### 工具結果

#### 模型看到什麼

命令共享每個 agent 一個 shell，因此 cwd、`$env:` 變數、函式與後臺任務都會跨呼叫保留。結果排除私有完成標記與回顯的輸入行（PSReadLine 會把提交的輸入渲染迴流中；標記錨定提取與包裝原始碼剝離會移除它）。當 shell 再次讀取 stdin 卻沒有列印完成標記時——一次中斷、一個被替換的 shell，或提供者能證明其 stdin 等待的互動式前臺子程序——呼叫返回已捕捉的部分輸出，其結尾可能是後端自己的提示符文字。非零的包裝命令追加 `[exit code: N]`——命令執行原生程式時給出確切原生結束代碼，PowerShell 終止錯誤則為 `1`。在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]`，或後端兩者都未提供時的 `[shell exited]`（Windows 強制終止報告 exit 1 且沒有訊號），然後重置並告訴模型下一次呼叫從全新狀態開始。長輸出保留最早的已保留字首並附裁剪通知；若 terminal 已經丟棄該字首，結果會明確說明。超時返回有界部分輸出、關閉不確定的 shell 並報告重置。

#### Token 影響

依資料而定。`maxOutputChars` 限制保留的命令輸出；固定的裁剪、丟失字首、狀態、超時與重置診斷可能延長結果。

#### KV Cache 影響

僅追加的工具結果位於可複用請求字首之後。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適或需要特別小心。它們是目前包約束，不是任務積壓。

- **工具需要擁有者 agent 與帶 pwsh 方言的真實 terminal 後端**——Windows ConPTY 或 POSIX pwsh。
- **輸入回顯不可避免**——PowerShell 的 PSReadLine 會把提交的輸入渲染回終端流，而且沒有 `stty -echo` 等價物。標記錨定提取在完整結果中排除回顯；包裝原始碼剝離覆蓋退回路徑，但跨終端寬度換行的包裝可能在部分輸出結果中留下部分回顯，受 `maxOutputChars` 設界。
- **模型命令內的原始 ESC 字元不受支援**——PSReadLine 會在執行前消費它們。包裝器會轉義它需要的控制位元組（`[char]27` 建構的 OSC 標記、正文的反引號轉義）。
- **模型重定義 `prompt` 函式會移除就緒標記**——shell 隨後在靜默層級而非標記快路徑上結算。
- **命令期間沒有互動 stdin**——在提供者能證明前臺 stdin 等待之處，讀取輸入的子程序會提前返回部分輸出並保留工作階段，因此該子程序可能吞掉下一次呼叫的命令，直到那次呼叫到達 `timeoutMs` 並重置 shell。其他情況下原呼叫本身會執行到 `timeoutMs`，隨後重置 shell。
- **Windows 上 SIGTSTP/SIGHUP 不可用**（後端拒絕）；SIGINT 以控制檯級 Ctrl-C 輸入寫入投遞，在提示詞處會取消待處理行而不是向程序發訊號。
- **在 Windows ACL 沙箱的只讀模式下，pwsh 以 ConstrainedLanguage 啟動**，可能拒絕引導的 `[Console]::` 編碼固定與 prompt 標記。命令仍可透過可列印提示詞與靜默層級結算，但非 ASCII 輸出可能跟隨主機內碼表。
- **BEL 結尾的 OSC 標記目前只是就緒訊號**——通向模型的 BEL 事件通道仍被推遲，與目前實作保持一致。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
