---
description: "面向部署方與消費方的持久終端工作階段說明，用於選擇、組合或擴充功能限定所有者範圍的 ctx.terminals 服務。"
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal

[English](README.md) | 中文

## 概述

`dsh-terminal` 為 harness 提供持久且限定所有者範圍的終端工作階段：工作階段讓 shell 或 REPL 狀態跨工具呼叫存活，且每個操作都被限制在建立它的那個確切 agent（智慧代理）內。本包提供 `ctx.terminals` 服務，負責生成不透明的工作階段 id、透過已註冊的後端路由工作階段建立，並在所有者或服務 dispose（資源釋放）時等待完全停穩的清理。它本身不定義任何終端機制：`dsh-terminal-bash` 之類的後端負責啟動與就緒檢測，`dsh-tool-terminal` 中的面向模型工具負責呈現。工作階段只存在於程序本地：harness 重新啟動後不會恢復。

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

當組合需要狀態跨工具呼叫存活的終端工作階段時，掛載 `@deepseek-ai/dsh-terminal`。單獨的服務本身沒有用處：請與 `@deepseek-ai/dsh-terminal-bash` 之類的後端、`@deepseek-ai/dsh-tool-terminal` 之類的工具包配對，並在同一個組合中一起載入。

### 何時選擇

當工作狀態存在於終端而非檔案時，選擇持久終端：在偵錯程式中單步執行、在 Python 或 Node REPL 中探索，或中斷前臺命令後回到 shell。對於有界操作，請選擇單次 bash、read、write 與 edit 工具——它們保留更強的驗證、審批、輸出上限與回放約定。工作階段只存在於程序本地：harness 程序退出時它們會消失，因此需要持久的工作應寫入檔案或其他持久系統。

### 組合方式

將工作階段服務與後端、工具包一起載入：

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

後端提供一個穩定型別——隨附的 shell 後端提供 `shell`——工具按該型別開啟工作階段。shell 後端還額外要求沙箱、沙箱策略與子程序提供者；完整組合見其 [README](../terminal-bash/README.zh.md)。

### 工作階段能做什麼

工作階段存在後，消費方可以：開啟工作階段並獲得其 id 與有界啟動輸出；傳送文字（可選地提交 Enter）並等待 shell 再次就緒或傳送超時；讀取有界保留輸出；向前臺程序組投遞一個允許的訊號；關閉工作階段並等待其程序樹結束；以及列出呼叫方擁有的工作階段。每個工作階段同一時間最多有一個活躍傳送；第二次傳送會失敗，直到第一次結算。

### 所有權與隔離

每個工作階段都由開啟它的確切 agent 擁有。凡是指名工作階段的操作，只要呼叫方不是該 agent 就會被拒絕，因此即使模型獲知另一個 agent 的工作階段 id，也無法操作其終端。可選的工作階段 `name` 是所有者本地的顯示中繼資料——例如 `main` 或 `gdb` 這樣的標籤——並且只在所有者範圍內唯一。

### 可觀察結果與失敗

成功開啟會返回工作階段 id、型別、後端提供的 pid（如有）、狀態與有界啟動訊息。傳送以等待原因結算：`stdin_read`（shell 正在等待輸入）、`inferred_idle`（輸出靜默）、`timeout` 或 `session_exit`（頂層 shell 已退出）。失敗攜帶穩定的機器可路由錯誤碼：後端型別缺失（`NO_BACKEND`）、工作階段未知（`NO_SESSION`）、屬於其他 agent 的工作階段（`FOREIGN_SESSION`）、並行第二次傳送（`SEND_ACTIVE`），或所有者不再存活（`OWNER_NOT_LIVE`）。後端設定失敗會在釋出任何內容之前拒絕開啟；清理失敗會拒絕關閉，而不是聲稱成功。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務背後的設計並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

服務擁有終端機制以外的一切：工作階段身份、釋出、授權與清理。後端負責工作階段如何啟動、檢測就緒、保留輸出與關閉；服務只在後端設定成功後釋出工作階段。這個拆分讓同一個註冊表可用於不同的終端基底。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `TerminalSessionService`：後端註冊表、spawn/send/read/signal/kill/list、所有者清理與 dispose |
| [`src/types.ts`](src/types.ts) | 共享約定：後端介面、工作階段型別、等待原因、訊號集合、錯誤碼 |
| — | 不釋出執行時不變式伴生入口；後端與限定所有者範圍的工作階段註冊表均為私有可變狀態，且服務既不暴露獨立的生命週期流，也不暴露不限定範圍的快照。 |

### 資料模型與生命週期

每個已釋出工作階段是一條記錄，包含其 id、所有者、可選名稱、後端型別、後端工作階段，以及目前唯一的活躍傳送。未釋出的 spawn 按所有者以預留形式跟蹤，並持有服務擁有的中止訊號。dispose 會中止待完成的 spawn、等待其結算與復原，然後關閉每個擁有的工作階段並等待完全停穩，最後執行所有者分離器；清理失敗會拒絕生命週期，而不是聲稱成功。

### 所有權與清理規則

- 限制基於確切的 `Agent` 物件：`hasOwnerActivity(owner)` 覆蓋從尚未釋出的設定到最終關閉的全過程，沒有釋出競態，因此生命週期策略可以精確限制所有者。
- 無法清理部分啟動資源的後端會以 `TerminalBackendCleanupError` 拒絕；服務會將該失敗保留為受跟蹤的所有者活動，直到所有者或服務 dispose 消費並報告它。
- 呼叫方取消保留其確切的 `AbortSignal.reason`；`kill()` 與 dispose 只在後端捕捉的程序樹完全停穩後完成。

### 傳送預留

服務在返回操作之前同步為一個活躍傳送預留工作階段，包括在後臺任務的 job id 可見之前；第二次傳送會以 `SEND_ACTIVE` 失敗，因此輸出與取消永遠不會跨操作所有權。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享終端模型進入隨附後端、工具與設計證據。

- [終端子系統參考](../../../docs/subsystems/terminal.zh.md)——共享型別、後端與工作階段約定，以及生成的 `ctx.terminals` 介面面。
- [terminal/ 包對映](../README.zh.md)——三包家族及其組合方式。
- [terminal-bash 後端](../terminal-bash/README.zh.md)——提供 `shell` 型別的隨附 shell 後端。
- [tool-terminal 工具](../tool-terminal/README.zh.md)——操作工作階段的 6 個面向模型工具。
- [持久 PTY Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——設計理由、備選方案與暫緩邊界。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接消費方

#### 模型看到什麼

沒有直接可見內容。此包不註冊提示詞或工具；可見 schema 與結果文字由 `@deepseek-ai/dsh-tool-terminal` 負責。

#### Token 影響

沒有直接影響。活躍工作階段狀態保留在程序本地，直到消費方返回有界結果。

#### KV Cache 影響

不會直接失效；請求字首變更由 `@deepseek-ai/dsh-tool-terminal` 負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明服務何時不合適。它們是目前包約束，不是任務積壓。

- **程序本地工作階段**——工作階段與原始 scrollback 只存在於本程序中，harness 重新啟動後不會恢復；需要持久的工作必須寫入檔案或其他持久系統。
- **不支援跨 agent 共享**——工作階段有意保持單一所有者，沒有共享或轉移工作階段的途徑。
- **沒有宣告式自動啟動**——工作階段只在 agent 工具呼叫期間建立。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性：已交付的行為、限制與既定理由以本文件上文、包程式碼與所連結的 Agent Note 為準。

#### 未決方向

- 共享工作階段設計需要獨立的權限約定。
- 宣告式自動啟動功能需要透過尚未釋出的 agent 設定組合而成。

</details>
