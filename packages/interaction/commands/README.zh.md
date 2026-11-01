---
description: "互動式 UI 的面向使用者斜槓命令註冊表：外掛擁有的命令直接針對 agent（智慧代理）執行，不產生模型訊息；供組合或擴充功能命令面的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-commands

[English](README.md) | 中文

## 概述

`dsh-commands` 讓使用者能在互動式 Harness UI 中執行 `/command [input]` 操作，且不會把命令或結果變成模型訊息。命令可以展示輸入提示、接受附件，並只針對一個 agent 生效，同時為其他 agent 保留同名的全域命令。每次透過准入的執行都會記錄到接收 agent 的工作階段日誌中，UI 則在模型歷史之外渲染結算結果。它適合為 `dsh` CLI（命令列介面）或 Web 用戶端提供直接面向使用者的控制；無 UI 的演示與 ACP（Agent Client Protocol）自動化不提供此命令面。

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

當互動式 UI 希望使用者用斜槓命令而非模型提示詞驅動 agent 側行為時，組合此服務。無 UI 的演示主幹和 ACP 自動化不提供命令介面卡，也不需要它。

### 註冊命令

外掛透過 `ctx.commands.register()` 註冊命令，提供小寫名稱、發現介面中的說明、可選的 `input` 提示和處理器。可選的品牌型別欄位 `definitionId` 為介面卡提供帶外掛名稱空間的穩定定義標識，它獨立於顯示文案和每次執行的 `commandId`。有效描述符只攜帶被選中定義的標識，作用域覆蓋不會繼承被遮蔽註冊項的標識。

```text
ctx.commands.register({
  name: 'plan',
  description: 'Enter plan mode',
  input: { hint: '<message>' },
  handler: ({ agent, rawInput }) => {
    // Runs directly against the agent; no model message is created.
    return { kind: 'success', text: 'plan mode selected' }
  },
})
```

處理器返回 `success` 或 `error`，並可附帶由介面卡渲染的 UI 文字。`recordInput` 預設為 true；若載荷由命令自己的權威領域事件持有，命令會將 `recordInput` 設為 false，避免工作階段日誌重複記錄該輸入。同一作用域內重複註冊同名命令會丟擲異常。

### 命令語法

命令列的第 0 位元組必須是斜槓，隨後是小寫名稱（可含字母、數字、`_` 或 `-`），再之後是輸入末尾或空白。名稱之後的每個位元組——包括分隔空白——都是該命令的 `rawInput`，命令自己擁有其專屬語法。不符合命令語法、或名稱未知的行會被介面卡拒絕，而不是變成模型提示詞。

### 限定到 agent 的命令

普通註冊全域生效。掛載在 agent 自身上下文之下的命令生產外掛會宣告 `commands` 注入，並註冊精確限定到該 agent 的命令；該定義只對這個 agent 遮蔽同名的全域定義。

### 附件

命令可以宣告 `input.attachments` 以接受 composer 圖片與通用檔案。執行器負責強制執行宣告：把附件發給未宣告的命令、附件儲存缺失、工作階段範圍內的檔案上傳憑證未知或圖片批次超出限制，都會在處理器執行前以錯誤結果結算。圖片以 base64 輸入透過命令 wire，通用檔案則引用後臺上傳完成後得到的憑證，因此命令提交不會再次讀取檔案位元組。透過准入的 `ImageBlock` 與 `FileBlock` 按使用者選擇順序組成凍結的 `invocation.attachments` 陣列，其模型可見用途由處理器負責。

### 從介面卡分派

互動式介面卡呼叫 `execute(agent, line, attachments, signal)`，傳入確切的接收 agent、完整命令列與本次提交的有序附件。它返回已結算的 `CommandExecution`——規範化結果加生命週期配對 `commandId`——語法無效或名稱未知時返回 `undefined`。`list(agent)` 與 `find(agent, name)` 在應用 agent 作用域遮蔽後用於命令發現。

### 取消

呼叫方的中止訊號會讓註冊表停止等待處理器；無視訊號的處理器可能在呼叫方停止等待後繼續產生自身的外部副作用。被取消或拋異常的處理器在日誌中以 `command/done` 錯誤結算。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

可觀察行為已在[使用本包](#use-this-package)中說明；本節解釋註冊表的建置方式與其約定的歸屬。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `CommandRuntime` 服務：註冊、作用域、分派、生命週期事件 |
| [`src/types.ts`](src/types.ts) | 命令定義、描述符、執行與結果型別 |
| [`src/brand.ts`](src/brand.ts) | 穩定命令定義標識和每次執行的生命週期 id |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：按工作階段日誌配對 `command/run` 與 `command/done` |

### 生命週期事件

`execute()` 會生成一個 `commandId`，在處理器執行前追加 `command/run`，並在結算時追加攜帶結果型別與原樣文字的 `command/done`；確切載荷欄位見 [`src/index.ts`](src/index.ts)。成功結果可以透過 `sourceEventSeq` 指向更早的一條非命令權威領域事件；處理器丟擲或被中止時以 `kind: 'error'` 結算。兩個事件都作為僅用於日誌的事件直接獨立追加：沒有輪次包裹它們，持久化機制會在常規檢查點和銷燬期間排空這些事件。未透過准入的輸入（語法無效或名稱未知）不記錄任何事件。

### 作用域

註冊表透過 `ScopedLayers` 維護全域層與按 agent 的作用域層，並按 agent 合併檢視。子級注入形態——掛載在 `agent.ctx` 之下的命令生產外掛宣告自身的 `commands` 注入——保留了 agent 作用域，同時不會讓核心 agent loop（智慧代理迴圈）依賴 UI 服務。同一層內的名稱重複會在註冊時失敗；註冊或移除命令時，系統會通知每個 `commands/change` 觀察者，使執行中的介面卡能夠重新整理發現結果。觀察者失敗會寫入日誌，既不能否決註冊表變更，也不能阻止後續觀察者執行。

### 附件准入

附件強制執行發生在執行器中：圖片經 `admitEncodedImages` 提交，檔案透過唯一的工作階段感知憑證提供者解析，執行器在呼叫處理器前恢復原始混合順序。驗證拒絕不會開始寫入附件。圖片儲存失敗可能留下等待清理且無法引用的內容定址物件，但不會發布模型可見訊息。取消會在處理器執行前生效。命令返回錯誤時，分發方 composer 的草稿與附件卡保持原位。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享命令詞彙逐步進入設計證據與相鄰表面。

- [命令子系統參考](../../../docs/subsystems/commands.zh.md)——註冊表語義、輸入中繼資料與 `ctx.commands` 的 Cordis 介面面。
- [命令註冊 Agent Note](../../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.zh.md)——此服務背後的邊界與分發約定。
- [互動組對映](../README.zh.md)——相鄰的審批、權限與問答包。
- [Plan mode 包](../../plan/plan-mode/README.zh.md)——一個驅動模型可見工作的已交付命令生產方。

-----

<a id="model-experience"></a>
## 模型體驗

### 直接面向使用者的命令

#### 模型看到的內容

註冊表自身不會提交任何內容。已知斜槓命令在 UI 命令平面執行，其 `CommandResult` 文字不會作為使用者訊息提交。已交付的介面卡會拒絕未知斜槓命令輸入，而不是將其變成模型提示詞。命令生產方可以顯式使用接收命令的 `Agent`；例如，[`dsh-plan-mode`](../../plan/plan-mode/README.zh.md#model-and-human-interactions)在選擇 plan mode 後，會提交 `/plan [message]` 中的可選訊息與有序附件。執行器只負責把附件准入為持久化物件，是否以及如何成為模型可見訊息由宣告接受的生產方決定。

#### Token 影響

命令發現、執行和 UI 輸出不會增加模型 token。命令生產方顯式安排的 agent 工作與相應 agent 輸入具有相同的 token 影響。

#### KV Cache 影響

註冊表中繼資料、命令輸入和直接輸出絕不會進入模型請求，也不會影響其快取。發生變更的領域負責之後產生的所有快取影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明註冊表不提供什麼。它們是目前包約束，不是 UI 積壓事項。

- **僅支援非結構化文字輸入**：表單、補全 schema 和型別化參數仍由各命令自行解析。
- **副作用採用協作式取消**：中止後，分發會停止等待；處理器必須遵循訊號，才能停止已經進入外部系統的工作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
