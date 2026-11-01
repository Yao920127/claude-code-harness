---
description: "持久終端工作階段的隨產品交付的 shell 後端：在共享沙箱策略下啟動互動式 bash 或 pwsh，帶就緒檢測與有界逐行輸出。"
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal-bash

[English](README.md) | 中文

## 概述

`dsh-terminal-bash` 在部署的沙箱策略下啟動持久互動式 shell：工作階段跨工具呼叫存活，檢測 shell 何時可以接收輸入，並保留有界的逐行輸出供讀取。它提供 `shell` 後端型別，並透過 `shellDialect` 設定在 POSIX 上支援 bash、在 Windows 上支援 pwsh。透過已掛載的子程序提供者，同一個後端既可以與本地執行世界組合，也可以與遠端執行世界組合。全螢幕終端應用不在其逐行約定的範圍內。

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

當組合需要持久 shell 工作階段時掛載此後端——cwd、匯出的變數、函式或正在執行的互動式子程序等狀態必須跨工具呼叫存活。它是預設的 `shell` 型別：組合只掛載 `@deepseek-ai/dsh-terminal` 而不掛載它時，將沒有任何工作階段可開啟。

### 何時選擇

當工作需要狀態持續存在的互動式 shell 或 REPL 時選擇此後端：在偵錯程式中單步執行、在 Python 或 Node REPL 中探索，或中斷前臺命令後回到 shell。對於應當一次呼叫即開始並結束的有界命令，請選擇單次 bash 工具。bash 方言面向 POSIX；pwsh 方言面向 `dsh-pwsh-local` 能解析出 pwsh 可執行檔案的 Windows 主機。

### 組合方式

掛載終端服務、子程序提供者、沙箱與策略服務、此後端以及一個工具包：

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-sandbox-local'
- name: '@deepseek-ai/dsh-sandbox-policy'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

`danger-full-access` 直接啟動 shell。受限模式要求同一執行世界中存在 `ctx.sandbox` 提供者：缺少時，spawn 會在 shell 啟動前失敗。限制準備過程接收開啟操作的取消訊號；即使提供者稍後返回，取消仍會阻止終端分配。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `backendType` | `shell` | 註冊到 `ctx.terminals` 的後端型別 |
| `shellDialect` | `bash` | 互動式 shell 棧：`bash` 或 `pwsh` |
| `shellPath` / `shellArgs` | 按方言 | shell 可執行檔案與參數；為空時選擇方言預設值 |
| `maxReadBytes` | `262144` | 一次讀取或一次結算傳送返回的最大 UTF-8 位元組數 |
| `timeoutMs` | `30000` | 一次傳送等待的絕對上限 |
| `disposeGraceMs` | `3000` | 清理升級到 `SIGKILL` 前的寬限時間 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-terminal-bash)是每個欄位的窮盡式真源，包括就緒計時（`pollIntervalMs`、`exactProbeAfterMs`、`idleSilenceMs`、`handoffGraceMs`）、終端尺寸（`rows`、`cols`）與 scrollback 上限（`scrollbackLines`、`scrollbackMaxBytes`）。

### shell 方言與就緒

兩種方言暴露相同的就緒約定，因此消費方與方言無關。當 shell 再次就緒時傳送即結算：受控提示符被驗證之後、前臺程序組被證明在等待 stdin（Linux）之後、輸出靜默（`inferred_idle`）之後，或到達絕對 `timeoutMs`。`inferred_idle` 或 `timeout` 結果並不證明前臺命令已退出。

### 沙箱與安全執行

shell 在整個生命週期內執行在有效的沙箱邊界之下。當所有者仍有開啟的工作階段或進行中的 spawn 時，改變有效沙箱模式會被拒絕——請先等待建立完成並關閉工作階段，避免以更寬權限開啟的終端在權限降級後繼續存在。後端只提供終端專屬的環境覆蓋；共享憑證清理由子程序提供者負責。

### 可觀察結果與失敗

開啟會返回工作階段 id 與有界啟動訊息。傳送以四種等待原因之一與一個工作階段狀態結算；`session_exit` 表示頂層 shell 已退出。設定失敗會拒絕開啟：受限模式下缺少沙箱提供者、shell 在啟動期間退出、shell 未能在啟動超時前達到就緒，或呼叫方取消。清理失敗會拒絕關閉，而不是聲稱成功。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋後端背後的設計並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

一個後端服務兩種方言：bash 與 pwsh 共享同一套工作階段機制——清理器、有界緩衝區、就緒輪詢、取消與關閉——只在 argv、環境與提示符安裝方式上不同。bash 透過 `PS1` 加 `PROMPT_COMMAND` 接收私有標記。pwsh 會寫入提示符函式、固定 UTF-8 控制檯編碼，並只在後端報告 `stdin_read` 後釋出啟動；回顯的設定文字不能釋出 shell。一個不保留 scrollback 的 `@xterm/headless` 實例會消費原始 PTY 資料，並透過同一控制代碼返回終端協定回應；逐行 sanitizer 仍是唯一輸出投影。

Scrollback 和尚未讀取的傳送輸出保留獨立擁有的字串，並增量維護位元組數與換行符數，因此清理後的切片不會保留已丟棄的控制序列。追加與淘汰文字的攤還耗時與輸入文字量成正比；讀取時才拼接保留的分片。保留策略維持碼點邊界，並將末尾換行符之後的空行計入行數。[保留策略決策](../../../.agents/notes/implemented/bug-fix/2026-09-11-incremental-terminal-retention.zh.md)記錄複雜度與測量依據。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 後端註冊、沙箱模式限制、argv 與環境組裝、啟動序列 |
| [`src/config.ts`](src/config.ts) | 方言解析、預設值與每個計時欄位的驗證 |
| [`src/session.ts`](src/session.ts) | `LocalPtySession`：傳送生命週期、就緒輪詢、scrollback、訊號、關閉 |
| [`src/sanitize.ts`](src/sanitize.ts) | 流式控制序列清理器與行規範化 |

### 就緒模型

三個有界檔位結算一次傳送：來自子程序提供者的精確 stdin 等待證據（僅 Linux）、帶精確可列印尾部的受控私有提示符標記，以及輸出靜默（`inferred_idle`）；絕對超時始終限制等待。pwsh 啟動的完整設定迴圈共用同一個截止時間，因此 `inferred_idle` 後續傳送不會重新計時。提供者寫入前收集的證據會在寫入邊界丟棄，早於寫入的 stdin 等待不算寫入後就緒，未知的前臺狀態絕不是精確空閒的正向訊號。

### 傳送取消與關閉

取消先把排隊輸入標記為已取消，再在任何在途的提供者寫入結算後向目前前臺程序組傳送真正的 `SIGINT`；它絕不會透過寫入 `\x03` 模擬中斷。關閉會停止就緒輪詢、終止提供者擁有的程序樹、等待完全停穩，並把活躍傳送結算為 `session_exit`。

### 沙箱模式限制

當所有者存在開啟的工作階段或進行中的 spawn 時，凡是會改變有效沙箱模式的寫入都會在 `sandbox/mode` 事件提交前被拒絕。該限制繫結到確切所有者，並在保留現有工作階段的提供者重新載入後依然有效。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享終端模型進入服務、工具與執行世界基底。

- [終端子系統參考](../../../docs/subsystems/terminal.zh.md)——此後端實作的服務約定與生成的 `ctx.terminals` 介面面。
- [terminal 服務](../terminal/README.zh.md)——後端註冊、所有者限制與清理語義。
- [tool-terminal 工具](../tool-terminal/README.zh.md)——操作工作階段的面向模型工具。
- [子程序 seam](../../../docs/subsystems/subprocess.zh.md)——負責 PTY 分配與程序樹清理的終端原語。
- [持久 PTY Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——能力設計與暫緩邊界。
- [持久 pwsh Agent Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md)——Windows 基底與 pwsh 方言。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接消費方

#### 模型看到什麼

此包不註冊提示詞或工具。模型透過 `@deepseek-ai/dsh-tool-terminal` 或其他 PTY 消費方可能收到有界的啟動輸出、傳送增量、scrollback 頁、就緒原因與清理錯誤。

#### Token 影響

在消費方返回有界輸出之前，保留的 PTY scrollback 不會進入模型歷史。

#### KV Cache 影響

不會直接失效；消費方結果保持僅追加。

### 沙箱策略上下文

#### 模型看到什麼

組合此後端期間，`sandbox-policy` 歸屬方會向提示詞貢獻與具體能力無關的 `sandbox:policy` 執行時上下文子句。

#### Token 影響

後端掛載期間，請求中會包含該策略子句。

#### KV Cache 影響

常駐策略發生變化時，會在保留的歷史之後追加一份取代先前狀態的執行時上下文快照。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明後端何時不合適或需要特別的運維注意。它們是目前包約束，不是通用 shell 對比或任務積壓。

- **僅逐行輸出**——headless xterm 只為終端協定回應維護控制序列狀態。返回輸出仍按行規範化；不支援全螢幕備用緩衝區互動。
- **沒有精確檔時，就緒是啟發式的**——精確 stdin 等待檢測取決於已掛載的子程序提供者；無法證明該狀態的提供者（macOS、Windows）按提示符標記與靜默／超時就緒結算。
- **受限沙箱中的 pwsh 引導**——提示符函式與 UTF-8 編碼固定操作透過 `[Console]::` 寫入，Windows ACL 沙箱的只讀模式可能拒絕。若因此無法獲得標記就緒狀態，啟動會在 `timeoutMs` 到期時拒絕，而不會發布不完整的 shell。
- **清理保證屬於提供者**——程序樹清理是 `SubprocessTerminalHandle` 的約定，而不是此後端的。
- **工作階段不隨程序退出存活**——harness 重新啟動會銷燬所有工作階段。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。就緒狀態、終端緩衝區與程序樹狀態都是各工作階段私有的實作狀態，後端不釋出獨立的生命週期流或快照。
