---
description: "面向需要跨呼叫終端狀態的 agent（智慧代理）的 6 個持久終端工具，帶所有者隔離、有界結果與可選後臺傳送。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-terminal

[English](README.md) | 中文

## 概述

當 agent 需要跨呼叫保留終端狀態或提供互動式輸入時，使用 `dsh-tool-terminal`。它可以開啟、傳送、讀取、傳遞訊號、關閉和列出終端工作階段，同時防止一個 agent 操作其他 agent 的工作階段。傳送可以等待有界的前臺輸出，也可以返回供後續收集或中斷的後臺任務 job id。`maxResultBytes` 限制每個結果的大小，而結果會保留在工作階段歷史中直到壓縮（compaction）。指引會讓模型對有界工作優先使用單次工具。

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

當組合掛載了終端後端、且模型應當能跨呼叫使用終端狀態時啟用這些工具——使用偵錯程式單步除錯、在 REPL 中探索，或中斷前臺命令後回到 shell。指引章節會引導模型對有界操作使用單次 bash、read、write 與 edit 工具。

### 六個工具

| 工具 | 作用 | 結果 |
|---|---|---|
| `terminal_open` | 按後端型別建立限定所有者範圍的工作階段 | 工作階段 id、名稱、型別、pid、狀態與有界啟動輸出 |
| `terminal_send` | 寫入文字，可選地提交 Enter，並等待就緒——或啟動後臺任務 | 有界輸出加等待與工作階段狀態，或一個 job id |
| `terminal_read` | 不傳送輸入，讀取一頁有界保留輸出 | 帶行分頁中繼資料的文字 |
| `terminal_signal` | 向前臺程序組投遞一個允許的訊號 | `delivered` 加目標程序組 id |
| `terminal_close` | 關閉工作階段並等待其程序樹結束 | 已關閉或正在關閉的結果 |
| `terminal_list` | 列出呼叫方的活躍工作階段 | 限定所有者範圍的工作階段摘要 |

### 組合方式

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

工具需要 `ctx.terminals`——必須掛載一個後端——以及用於指引章節的系統提示詞服務。後臺傳送還額外要求任務服務及其面向模型的控制器（`@deepseek-ai/dsh-tool-jobs`）。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `enableRunInBackground` | `true` | 公開並接受 `run_in_background`；設為 `false` 時移除 schema 欄位並拒絕該參數 |
| `maxResultBytes` | `262144` | 每個完整終端結果的 UTF-8 上限（最小值 `64`）；在等待、工作階段、分頁、截斷與任務狀態中繼資料全部加入後計算 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-terminal)與[工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-terminal)是設定欄位與 schema 的窮盡式真源。

### 後臺傳送

`terminal_send(run_in_background: true)` 立即返回 job id，而不是等待。任務用 `job_output` 收集——它會等待並讀取增量輸出——用 `job_kill` 停止，後者向前臺程序組投遞真正的 `SIGINT`。缺少任務介面面時，後臺模式會在寫入輸入之前失敗。

### 可觀察結果與失敗

前臺傳送返回終端的新輸出以及 `wait: <原因>` 與工作階段狀態；`session_exit` 表示頂層 shell 已退出，而 `inferred_idle` 或 `timeout` 絕不證明前臺命令已退出。用未註冊的後端型別開啟工作階段會失敗。大於 `maxResultBytes` 的結果會在 UTF-8 邊界處截斷並附標記。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

本包是薄介面卡：6 個工具以執行 agent 作為所有者轉發到 `ctx.terminals`，呈現層渲染有界結果。後臺傳送把在途操作註冊到 `ctx.jobs`，由通用任務介面面負責等待、增量讀取與 `SIGINT` 投遞。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 6 個工具定義、schema、指引章節、後臺任務整合 |
| [`src/render.ts`](src/render.ts) | 結果渲染與完整結果的 UTF-8 上限 |

### 結果上限

每個終端自身的單文字結果都會在規範化後的工具或流水線錯誤、策略拒絕與短路、替換與阻止、以及通用任務狀態文字之後，受 `maxResultBytes` 限制；截斷保留 UTF-8 邊界併為截斷標記預留空間。結構化的多塊策略結果保留其結構。64 位元組的最小上限保證註冊表簽發的每個工作階段或 job id 都出現在建立確認中。

### UI 呈現意圖

前臺傳送使用終端呼叫與結果卡片；後臺傳送與其他 5 個工具使用通用 `execute`、`read` 或 `delete` 卡片。所有工具都不輸出源位置。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從生成的 schema 進入服務約定、後端與後臺任務介面面。

- [工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-terminal)——6 個生成的 schema 與結果形態。
- [終端子系統參考](../../../docs/subsystems/terminal.zh.md)——工具背後的服務約定與共享型別。
- [terminal 服務](../terminal/README.zh.md)——工作階段操作、所有者限制與清理語義。
- [terminal-bash 後端](../terminal-bash/README.zh.md)——提供工作階段的隨附 shell 後端。
- [jobs 包對映](../../jobs/README.zh.md)——收集與停止後臺傳送的後臺任務介面面。
- [持久 PTY Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——能力設計與暫緩邊界。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

該外掛貢獻以下固定指引章節：

##### 終端指引

```markdown
Use a terminal session only when work needs persistent terminal state or interactive stdin; prefer shell/read/write/edit for bounded one-shot operations. Track every terminal session id and close sessions that no longer matter. An inferred_idle or timeout result does not prove the foreground command exited.
```

#### Token 影響

外掛活躍期間，每次請求都會產生少量固定輸入成本。

#### KV Cache 影響

註冊範圍與指引文字不變時，字首保持穩定。

### 工具 schema

#### 模型看到什麼

6 個生成的 schema 列在 [`dsh-tool-terminal` 目錄章節](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-terminal)中。此外掛活躍時，請求中會包含它們的固定 schema token；按 agent 範圍過濾工具時可能隱藏這些 schema。

#### Token 影響

工具可見的請求會產生固定的 schema 成本。

#### KV Cache 影響

工具可見性與定義不變時，字首保持穩定。

### 工具結果與任務上下文

#### 模型看到什麼

spawn 返回 id 與有界啟動輸出。傳送與讀取返回有界終端文字以及就緒與歷史標記。後臺模式返回通用 job id。每個終端自身的單文字結果都受 `maxResultBytes` 限制；結果保留在工作階段歷史中直到壓縮，增量任務讀取不會重複已經消費的輸出。

#### Token 影響

終端自身的結果隨資料變化，並受 `maxResultBytes` 限制；每個返回結果都保留在歷史中直到壓縮。

#### KV Cache 影響

僅追加；新結果位於可複用請求字首之後。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明缺失的面向模型介面面。它們是目前包約束，不是任務積壓。

- **沒有 TUI 或按鍵序列介面面**——具名按鍵序列、全螢幕 TUI 互動、BEL、調整大小與自動啟動均未出現在任何 schema 中。
- **後臺模式要求任務介面面**——`run_in_background` 同時需要 `@deepseek-ai/dsh-jobs` 及其面向模型的控制器（`@deepseek-ai/dsh-tool-jobs`）；缺少時會拒絕該參數。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個無狀態介面卡只貢獻工具與提示詞指引；PTY 生命週期與後臺任務關係仍由其組合的服務持有。
