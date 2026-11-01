---
description: "基於 waterfall 的問答服務，用於工具、權限外掛、本地 answerer 與 Agent-scoped Web 互動。"
kind: "package-reference"
---

# @deepseek-ai/dsh-user-questions

[English](README.md) | 中文

## 概述

使用者互動 Service Definition。它定義 `ctx.userQuestions`，供面向模型的工具或權限外掛在需要暫停工作並詢問人類決定時使用。當消費方必須暫停操作並等待使用者回答時，請使用它。

## 目錄

- [服務：`UserQuestionService`（ctx 鍵：`userQuestions`）](#service-userquestionservice-ctx-key-userquestions)
- [職責](#role)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="service-userquestionservice-ctx-key-userquestions"></a>
## 服務：`UserQuestionService`（ctx 鍵：`userQuestions`）

### 公開 API

- `ctx.userQuestions.ask(request): Promise<AskUserQuestionAnswer>` 派發回答者 waterfall，並等待首個被接受的回答。

### 關鍵型別

- `AskUserQuestionRequest`：`{ questions: [{ id, question, detail?, header?, options?, multiSelect?, intent? }], agent?, signal? }`；`detail` 提供輔助文字，提供者會將其隨問題一起渲染，而不會將其變成選項標籤。如提供 `agent`，它必須與註冊表中的存活執行時根 agent（智慧代理）是同一物件。
- `AskUserQuestionOption`：`{ label, description? }`。
- `AskUserQuestionIntent`：`{ kind: 'plan-review', approve }`；即下文的帶標籤呈現意圖。
- `AskUserQuestionAnswer`：`{ answers: [{ id, selected, custom? }] }`。
- `UserQuestionError`：`HarnessError` 的子類，包含 `EMPTY_QUESTIONS`、`BAD_INTENT`、`NO_PROVIDER`、`ASK_ABORTED`、`CALLER_NOT_LIVE` 和 `DELEGATED_CALLER` 等程式碼。

對於單選題，`custom` 會覆蓋選中的選項，且 `selected` 為空。對於多選題，`custom` 可以補充 `selected` 中的標籤。UI 可以把跳過的條目保留為 `{ id, selected: [] }`，既維持現有回答形態，也保留該批次中的其他回答。

請求包含 agent 時，`ask()` 會透過目前 `AgentRegistry` 驗證該 agent 與註冊表中的存活實例是同一物件，並且只允許執行時根呼叫。持久譜系不構成權限依據：帶有歷史委託深度的工作階段恢復為新的執行時根後可以提問；歸屬於另一個 agent 的存活子級即使持久化記錄的委託深度為零也會被拒絕。Web 回答者只接收帶 Agent scope 的請求；不含 agent 的程式化請求仍會交給本地未限定 scope 的 waterfall listener，若無人接受則以 `NO_PROVIDER` 失敗。

### 呈現意圖

`intent` 宣告某個問題本身就是一種已知決策，因此認識該標籤的 UI 可以照此呈現——`plan-review` 表示 `detail` 是一份待審閱的計劃，`dsh-plan-mode` 會在 `exit_plan_mode` 的問題上設定它。意圖只改變呈現：遵循它的 UI 回答的仍是通用 UI 會傳送的那些選項標籤，不認識該標籤的 UI 渲染通用選項列表，因此呼叫方兩種情況下讀到的回答欄位相同。`approve` 指名錶示批准的標籤，而不依賴選項順序。有兩項斷言無法透過型別表達，`ask()` 會以 `BAD_INTENT` 拒絕它們：`approve` 未命中該問題自身的任一選項，以及意圖落在沒有 `detail` 的問題上——而 `detail` 正是它自稱在審閱的東西。

<a id="role"></a>
## 職責

這是 Service Definition 包。`@deepseek-ai/dsh-tool-ask-user` 等 Consumer 依賴此服務；Web Client 透過 Remote Events 貢獻帶 Agent scope 的回答者。迴圈保持不變：工具呼叫等待 waterfall 結果，該結果隨後恢復正常的 agent loop（智慧代理迴圈）。

<a id="model-experience"></a>
## 模型體驗

間接地，透過 `dsh-tool-ask-user`：它會將成功回答保留為緊湊 JSON，或返回以下失敗之一：`Error: ask_user_question was aborted before the user answered`、`Error: ask_user_question requires at least one question`、`Error: human interaction requires the exact live calling agent when an agent is supplied`、`Error: human interaction is unavailable while the calling agent is owned by another live agent; include the unresolved question or decision in the child agent's final result`、`Error: no user-questions answerer accepted the request` 或 `Error: <message>`。等待人類回答不會增加 token。

#### KV Cache 影響

不會直接使 KV Cache 失效；請求字首的任何變更均由上述消費方負責。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **帶 Agent scope 的 Web 回答**：Remote Events 僅在請求帶有存活 Agent scope 時路由隨產品交付的 Web 回答者；agentless 呼叫方需要本地未限定 scope 的 waterfall listener。
- **詞彙僅包含問題表單形態**：可供選擇的選項加可選的自定義文字；更豐富的互動形態（檔案選擇器、diff 預覽確認）尚無 seam 詞彙。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

計劃審批中可選的 `callId` 標識已記錄的工具呼叫，供文件導航使用，不改變回答及其驗證。

</details>

**執行時不變式：** 不釋出伴生入口。answerer waterfall 按請求解析並把結果直接返回呼用方；該 seam 不釋出獨立的請求／回答審計流。
