---
description: "基於 user-questions seam 的模型側 ask_user_question 工具；供組合或排查互動式 agent（智慧代理）表面的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-ask-user

[English](README.md) | 中文

## 概述

`ask_user_question` 讓模型暫停工作，向使用者請求確認、選擇或缺失的資訊。它接受一個或多個問題，並以緊湊 JSON 返回回答。呼叫會等待回答被接受或目前輪次被取消；如果沒有回答處理器接受請求，模型會收到錯誤。歸屬於執行時其他 agent 的子級不能呼叫此工具，必須在最終結果中報告尚未解決的問題。本包不渲染介面或收集輸入，因此呼叫方必須提供相容的使用者互動表面。

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

凡模型應當能夠暫停等待人類決定的情境，都可組合此外掛：它提供 `ask_user_question` 工具，並且需要帶有接受作用域請求的 answerer 的 `ctx.userQuestions` seam。沒有 answerer 接受時，工具呼叫會以錯誤失敗，而不是降級。

### 何時呼叫該工具

當模型需要確認、選擇結果或缺失的資訊才能繼續時，呼叫 `ask_user_question`。傳送一個或多個問題，每個問題攜帶穩定的 `id`（回答中會原樣包含）；推薦選項放在首位，並在標籤末尾追加 `(Recommended)`。

```json
{
  "questions": [
    {
      "id": "cleanup",
      "question": "Proceed with the destructive cleanup?",
      "header": "Confirm",
      "options": [
        { "label": "Yes, delete them (Recommended)", "description": "Removes the three stale files." },
        { "label": "No, keep them", "description": "Aborts the cleanup." }
      ]
    }
  ]
}
```

### 模型得到什麼

工具為每個問題返回一個回答物件：`selected` 儲存選中的選項標籤，`custom` 攜帶自由填寫的回答——對多選題補充 `selected`，對單選題覆蓋它。Native 渲染器保留緊湊的 JSON 文字形式。

```json
{ "answers": [{ "id": "cleanup", "selected": ["Yes, delete them (Recommended)"] }] }
```

### 呼叫何時失敗

工具呼叫會阻塞到使用者作答，並且只能透過目前輪次的訊號取消。沒有 answerer 接受、呼叫被中止、或呼叫方不是確切的存活執行時根，都會以模型在工具結果中看到的錯誤結算——最值得注意的是，歸屬於另一個 agent 的存活子級會被拒絕（`DELEGATED_CALLER`），必須在最終結果中包含尚未解決的問題或決定。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

可觀察行為已在[使用本包](#use-this-package)中說明；本節解釋工具定義及其與 seam 的關係。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具註冊：`ask_user_question` schema、執行路徑、結果渲染 |
| — | 不釋出執行時不變式伴生入口；此模型側介面卡沒有獨立的生命週期流；執行關係由其呼叫的能力 seam 負責。 |

### 消費方角色

該外掛以 `['tools', 'userQuestions']` 注入，在 `ctx.tools` 上註冊一個 `defineTool` 條目。`execute` 把模型參數對映為 `AskUserQuestionRequest`，轉發確切的呼叫 agent 與目前輪次的訊號，並把接受的回答對映回規範的 `answers` 陣列。身份檢查、意圖驗證、waterfall（瀑布式事件）分派與錯誤分類由 seam 擁有；本包只做轉換。

### 結果渲染

`render` 輸出把結構化值經 `JSON.stringify` 投影為單個文字塊，因此模型側結果是緊湊 JSON，而非更豐富的內容塊詞彙。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具表面逐步進入 seam 約定及其 answerer waterfall。

- [使用者互動子系統參考](../../../docs/subsystems/user-questions.zh.md)——此工具背後的服務約定、問題詞彙與 answerer waterfall。
- [工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ask-user)——生成的 `ask_user_question` schema。
- [user-questions 包](../user-questions/README.zh.md)——本工具消費的 seam。
- [互動組對映](../README.zh.md)——相鄰的審批與命令表面。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到的內容

模型會看到生成的 [`ask_user_question` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ask-user)，其中包含問題 id、提示語、標題、選項與多選標誌。

#### Token 影響

工具可見時，每個請求都會產生固定的 schema token 開銷。

#### KV Cache 影響

只要定義和可見性保持不變，字首即可穩定複用。外掛生命週期變化或作用域限制可能會使從此 schema 起的快取複用失效。

### 工具呼叫歷史與結果

#### 模型看到的內容

模型提出的完整問題保留在 assistant 工具呼叫參數中。使用者回答後，下一步會看到精確採用 `{"answers":[{"id":"<id>","selected":["<label>"],"custom":"<text>"}]}` 形式的緊湊 JSON；不使用 `custom` 時會省略該欄位，`selected` 可以包含零個、一個或多個標籤。呼叫等待期間的 UI 互動不屬於模型上下文。

#### Token 影響

參數和回答 JSON 是依資料而定的保留 token；等待使用者時不會產生 token 開銷。

#### KV Cache 影響

僅追加；新出現的可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該工具何時不合適。它們是目前包約束，不是 UI 積壓事項。

- **待處理問題會阻塞工具呼叫，直至使用者作答**：該工具未宣告 `timeout-policy` 預算；取消僅沿用目前輪次的 `exec.signal`。
- **執行時中歸屬於其他 agent 的 subagent 不能向使用者提問**：`ask_user_question` 會以 `DELEGATED_CALLER` 拒絕歸屬於另一個 agent 的存活子級；該子級必須在最終結果中包含尚未解決的問題或決定。持久譜系不能決定這一邊界，因此帶有譜系的工作階段恢復為執行時根後可以正常提問。
- **Native 回答渲染為 JSON 文字**：規範值仍為結構化資料，但模型側結果使用緊湊 JSON，而非更豐富的內容塊詞彙。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
