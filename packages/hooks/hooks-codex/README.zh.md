---
description: "在 agent 執行期間使用你現有的 Codex hooks.json 掛鉤設定——阻塞提示詞與工具、附加上下文或強制繼續——供本橋接的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-hooks-codex

[English](README.md) | 中文

## 概述

`dsh-hooks-codex` 在 agent（智慧代理）執行期間執行現有 Codex `hooks.json` 中的 command 掛鉤，讓提示詞與工具把關邏輯無需重寫即可生效。它支援 5 個 Codex hook 點：工作階段開始、提示詞提交、工具執行前後以及停止。掛鉤可以用模型可見的原因阻塞提示詞或工具呼叫、新增對話上下文，或強制 agent 再執行一步。需要在 harness 中複用 Codex command 掛鉤時選擇本包；超出這一受支援子集的行為應使用原生外掛。

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

掛載本包並把 `configPath` 指向你的 `hooks.json`，你已有的掛鉤就會在 agent 執行中的對應時刻開始觸發。在第一個掛鉤生效之前無需其他設定。

### 何時選擇

當你持有 Codex `hooks.json`、且其中的 command 掛鉤需要把關提示詞、工具與輪次時，使用它。沒有 Codex 對應物的行為請跳過它：原生外掛擁有完整的 harness API，而本橋接只執行參考工具的 command hook 子集。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-hooks-codex'
  config:
    configPath: ./.codex/hooks.json
    model: deepseek-v4
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `configPath` | 必填 | Codex `hooks.json` 的路徑 |
| `model` | `''` | 寫入每個 payload 的模型名稱（Codex 在每個事件中都包含 `model`） |
| `defaultTimeoutMs` | `600,000` | hook 未設定時的每 hook 超時（即 Codex 預設值） |
| `stderrSummaryMaxChars` | `500` | 持久化 `hook/result` stderr 摘要的字元上限 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-hooks-codex)是每個受支援欄位的窮盡式真源。

### 你的掛鉤能做什麼

| 你的掛鉤 | 執行時機 | 能做什麼 |
|---|---|---|
| `SessionStart` | 工作階段開始時 | 附加該工作階段中模型可見的上下文 |
| `UserPromptSubmit` | agent 收到提示詞時 | 阻塞提示詞，或附加上下文 |
| `PreToolUse` | 工具執行前 | 阻塞工具 |
| `PostToolUse` | 工具執行後 | 帶回饋阻塞結果，或附加上下文 |
| `Stop` | 執行即將停止時 | 帶原因強制再執行一步 |

### 掛鉤如何執行與失敗

- 掛鉤在你的專案目錄（agent 的工作階段工作區）中執行，因此掛鉤裡的 `pwd` 與相對路徑指向你的專案，而非伺服器啟動目錄。
- 一份設定應用於整個程序：啟動時只讀取一次，相對 `configPath` 從啟動程序的目錄解析。
- 只執行同步 command 掛鉤；`async: true` 或非 command 掛鉤會被跳過並給出警告。
- 同一事件上的掛鉤按設定順序逐個執行。
- 如果設定無法讀取或解析，橋接會記錄警告且不執行任何掛鉤——agent 仍會啟動。
- 執行失敗的掛鉤（命令錯誤或崩潰）會被記錄，agent 繼續執行。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋橋接背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### Hook 點對映

每個受支援事件都面向一個 harness 擴充功能點：`SessionStart` 在首個輪次前透過需等待的 `agent/created` 初始化加入上下文，`UserPromptSubmit` 與 `PreToolUse` 是能拒絕傳入動作的 waterfall（瀑布式事件）（`agent/pre-step`、`tools/pre-execute`），`PostToolUse` 是能帶回饋阻塞或向下遊決策新增上下文的 waterfall（`tools/post-execute`），`Stop` 是序列監聽器，其阻塞結果透過 `steer()` 強制再執行一步（`agent/turn-stopping`）。僅提供上下文的 hook 總是先透過 `next()` 委託，再把帶來源的訊息摺疊進下游決策，因此後續監聽器仍可拒絕或改寫；阻塞決策對映為 `deny`（`PreToolUse` 沒有 `allow` 或 `ask`）。逐事件接線位於 [`src/index.ts`](src/index.ts)。

### 載荷與環境

payload 採用 Codex 形狀：snake_case，輪次事件帶 `turn_id`，每個事件都帶 `model` 與 `permission_mode: "default"`，stdin 寫入時不帶尾隨換行符。工具呼叫的 payload 攜帶真實 `tool_name` 與 `tool_input: { command }` 形狀（存在 `command` 參數時使用該值，否則使用 `''`），因此非 shell 工具參數不會被如實公開。基礎 payload 攜帶 `session_id` 與 `transcript_path`；後者保留 Codex `string | null` 形狀但始終為 `null`——持久化 seam 不暴露產物路徑，且預設 zstd 壓縮的工作階段日誌無法被 hook 腳本讀取。Codex 不進行命令替換，也不注入外掛環境。

### Matcher subject 與序列執行

matcher subject 是工具名稱（`PreToolUse`／`PostToolUse`）或工作階段源（`SessionStart`）；`UserPromptSubmit` 與 `Stop` 忽略 matcher。Codex matcher 始終是未錨定正則。匹配 hook 按設定順序序列執行，這使每個 hook 的 `hook/invoked`／`hook/result` 對在日誌中相鄰，且最嚴格摺疊與順序無關（`deny > ask > allow`）。

### 脫離執行與釋放

`SessionStart` 是唯一的 emit 點，它脫離執行——沒有擴充功能點等待它。每條執行鏈都會被跟蹤，對橋接執行 dispose（資源釋放）時會中止仍在執行的 hook 程序，並在 dispose 完成前排空 continuation（`createDetachedRuns`，位於 `dsh-hook-protocol`）。

### 設計理念

- **相容介面卡，而非強力工具。** 橋接的存在意義是執行現有 Codex 設定中顯式受支援的子集；定製行為應放在同一批擴充功能點上的原生外掛中。
- **新增上下文不是否決。** 僅提供上下文的 hook 會先透過 `next()` 委託，再把其訊息摺疊進下游 enter 決策，因此後續 `agent/pre-step` 或 `tools/post-execute` 監聽器仍可拒絕或改寫。
- **每個失敗點都受控。** 設定讀取／解析失敗與無效 matcher 不註冊任何內容；拋異常的脫離注入會被捕捉並記錄，而不是破壞工作階段啟動或迴圈。
- **dispose 必須達到完全停穩。** 脫離執行會被跟蹤並在釋放時排空，因此不會有 hook 程序或遲到回呼超出 fiber 存活。
- **保持方言形狀，而非最大化。** payload 保持 snake_case 並帶 `turn_id`／`model`，stdin 不帶尾隨換行符，橋接也不實作工具前審批或改寫路徑——即使 harness 本可以做得更多，也保留協定的形狀。

[hook-bridges Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) 記錄了橋接設計與延期缺口；[hook-protocol-lib Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) 記錄了共享與逐方言的劃分。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定驗證、監聽器註冊、逐事件 payload、決策對映 |
| [`src/config.ts`](src/config.ts) | Codex 設定解析：五個受支援事件、matcher 驗證、跳過原因 |
| — | 不釋出執行時不變式伴生入口；本橋接釋出 hook-protocol 工作階段事件，既有 companion 負責驗證每個結果所引用的呼叫事件。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享協定進入橋接設計，以及橋接所面向的擴充功能點。

- [hooks 組地圖](../README.zh.md)——同級組頁面及其包表。
- [hook 協定庫](../hook-protocol/README.zh.md)——本橋接應用的共享掛鉤規則。
- [掛鉤橋接 Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md)——橋接設計、決策對映與延期缺口。
- [攔截擴充功能點 Agent Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.zh.md)——橋接所對映的型別化 Decision 介面面。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-hooks-codex)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### Hook 提供的上下文

#### 模型看到什麼

`SessionStart`、已接受提示詞與工具後 hook 可以新增帶源歸因的上下文訊息；阻塞 `Stop` hook 將原因新增為下一步 steering（中途引導）。

#### Token 影響

hook 不返回上下文時沒有成本。Hook 文字取決於資料，會被記錄，並在後續工作階段請求中重發，直到壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 已阻塞提示詞或工具結果

#### 模型看到什麼

提供者提供的原因逐字傳遞。缺失原因時，已拒絕工具變為 `Error: blocked by PreToolUse hook`，已阻塞工具後回饋精確為 `blocked by PostToolUse hook`，阻塞 stop 則精確新增 steering `continue: blocked by Stop hook`；已阻塞提示詞不會產生任何模型可見訊息，而是以 `blocked` 結束該輪次。Codex `systemMessage` 不會呈現。

#### Token 影響

阻塞提示詞不會產生該提示詞對應的模型請求 token；拒絕或回饋會新增保留的退回或提供者文字；強制 continuation 需要另一個完整請求。

#### KV Cache 影響

已阻塞提示詞不傳送請求，不會導致失效。拒絕、回饋與強制 continuation 上下文會追加在可複用字首之後，不改寫字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制描述你的 Codex 掛鉤目前還無法透過本橋接做到的事情，以及行為與參考工具的差異。它們是目前包約束，而非任務積壓。

- **不支援的 hook 事件（Codex 目前 10 項中的 5 項）**——`PermissionRequest`、`PreCompact`、`PostCompact`、`SubagentStart` 與 `SubagentStop`。這些事件的設定會在解析期間靜默丟棄。比較基線是 Codex [官方 hook 參考](https://learn.chatgpt.com/docs/hooks)。
- **`SessionStart` 只支援部分功能**——支援純 stdout 與 JSON `additionalContext`，但 hook 脫離執行，因此上下文可能錯過第一個請求。
- **`UserPromptSubmit` 只支援部分功能**——支援阻塞加純 stdout 或 JSON 上下文，但不會強制執行通用 `systemMessage` 與 `{"continue": false}` 控制。
- **`PreToolUse` 只支援部分功能**——支援阻塞，但會忽略 `additionalContext`、`permissionDecision: "allow"` 與 `updatedInput`。每個工具都表示為 `tool_input: { command }`，因此非 shell 工具參數不會被如實公開給 hook。
- **`PostToolUse` 只支援部分功能**——支援阻塞回饋與 JSON `additionalContext`，但不會強制執行 `{"continue": false}`，非 shell 工具參數會縮減為 `{ command }`，結構化工具輸出會在 `tool_response` 中展平為文字。
- **`Stop` 只支援部分功能**——阻塞會強制另一個模型輪次，但 `stop_hook_active` 始終為 `false`，`last_assistant_message` 始終為 `null`，且不會強制執行 `{"continue": false}`。因此，無條件阻塞 hook 會在每個步驟中強制 continuation，除非它自我限制。
- **通用 payload 與輸出欄位只支援部分功能**——每個已對映事件都報告靜態設定的 `model` 與 `permission_mode: "default"`，而非目前 Codex 執行時值，且 `transcript_path` 永不填充：它始終為 `null`，因為持久化 seam 不暴露產物路徑，且預設 zstd 壓縮的工作階段日誌無法被 hook 腳本讀取。`systemMessage` 會被記錄 + 警告但不呈現，`{"continue": false}` 會被記錄但不會應用 Codex 的事件特定停止行為。
- **設定載入與執行只支援部分功能**——一個程序級 `configPath` 會在載入時解析；尚未實作 Codex 的活動使用者層、專案層、工作階段層、系統／託管層與外掛層、信任控制以及內聯 `config.toml` hook 形態。只執行同步 `command` handler，`statusMessage` 與 `commandWindows` 等目前中繼資料會被忽略，匹配 handler 序列執行，而非使用 Codex 的並行啟動語義。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

上面的延期缺口就是工作佇列：按工作階段的 hook 設定發現、工作階段啟動投遞門、stop 迴圈防護，以及 `continue: false` 的執行級停止。目前均無設計；官方 Codex 參考是實作其中任何一項的基線。

</details>
