# Agent Note: 相鄰 Agent 共享一個 Steer send_message 操作

Status: implemented

[English](2026-08-27-adjacent-agent-steer-messaging.md) | 中文

## 問題

可繼續 Agent 最初使用方向專屬的模型控制。parent 呼叫 `send_message({ subagent_id, message })`，委託給 FIFO `followup` 服務操作。child 則獲得 child 作用域的 `report({ output })` 工具、`tool:report` 系統提示詞 section，以及由部署選擇的靜默或喚醒投遞。兩個工具用不同 schema、服務路徑、來源與排程描述同一個相鄰 Agent 操作。

可繼續 child 擁有自己的 Session，因此 parent 不會自動收到 child 的 transcript（文字記錄）、工具輸出或推理。返回路徑必須保持顯式且可重複：child 可以在結束前傳送進度、傳送後仍保持可用，也可能在來得及配合前失敗。把每條最終 assistant 訊息變成隱式結果會混淆輪次完成與模型選擇的通訊，而且無法覆蓋異常結束。

child 專屬工具與系統提示詞 section 還位於每個繼承 fork 輪次之前。它們讓可繼續 fork child 的請求頭在 fork 旨在複用的歷史之前就與 parent 不同，迫使提供者重新預填充整份複製 transcript。

## 決策

`SubagentRuntime.sendMessage(sender, targetId, content, { signal })` 是唯一公開的模型編寫訊息操作。繼續執行管理器只接受確切線上 sender 與一條相鄰邊上的目標：

- parent 到直接可繼續 child，由 child 的持久化 `SessionHeader.parentSession` 授權；
- 駐留的可繼續 child 到其確切線上直接 parent，由 child 的 Activation 授權。

sibling、自身目標、超過一條邊的 ancestor、陳舊 Agent 物件、未知目標與一次性 child 都不是替代路由。該操作沒有呼叫方提供的 source、投遞模式、離線 parent mailbox 或提供者分發。

每條被接受的訊息都使用 `Agent.steer()`。執行中目標在最近 step 邊界接收訊息；空閒目標啟動輪次。缺失的直接 child 會先透過現有繼續執行生命週期冷恢復，再接受同一 Steer 投遞。管理器保留喚醒傳送記帳，因此受繼續執行管理的目標不會在同步 inbox 插入與 driver 准入之間結算。

兩個方向使用同一種持久來源。服務從已授權 Agent 推導 `senderSessionId`，並把模型可見內容組裝為 `Agent <sender-id> sent a message:`，因此來源資訊不會偏離權限。

```ts
import type { SessionId } from '@deepseek-ai/dsh-session'

interface AgentMessageSource {
  readonly kind: 'agent-message'
  readonly form: 'relay'
  readonly senderSessionId: SessionId
}
```

### 一個模型工具與一條返回指令

全域註冊的模型工具與方向無關，並使用一個固定 schema：

```ts
interface SendMessageInput {
  readonly agent_id: string
  readonly message: string
}
```

parent 與 child 以相同註冊表順序繼承相同定義。標準定義攜帶程序穩定的內部身份，同名的作用域工具不滿足該身份。child `toolFilter` 可以顯式移除繼承的工具，作用域替代工具也可以提供不同語義；兩種情況都不會收到標準呼叫指令。當標準工具仍可見時，繼續執行管理器會把經過 JSON 編碼的直接 parent id、結束前傳送一份自包含結果的指令，以及更早傳送可操作發現的指令追加到 child 初始使用者任務。對 fork child 而言，該任務位於繼承的已完成輪次字首之後；沒有 child 專屬系統提示詞 section 或工具 schema 位於此字首之前。

該指令是指導，不是結算強制。傳送不會結束 child 輪次，機制仍允許零次或多次呼叫，runtime 絕不會因 child 保持沉默而拒絕它。由管理器負責的 `subagent-settled` 通知仍無條件傳送並採用獨立來源，因為它記錄 Activation 如何結束，並在 child 無法配合時保留終態輸出。

瀏覽器中的人類提示不是模型編寫的 Agent 訊息。遠端提示路徑保留私有 Queue 投遞，使每條人類提示保持為獨立輪次。中斷行為與結算投遞保持獨立。

### 完整移除與重新引入條件

獨立的 `@deepseek-ai/dsh-tool-subagent-report` 包、`report` schema、`tool:report` 提示詞 section、`reportDelivery` 設定、report 專屬訊息來源、目錄項、組合行和受支援行為快照均已不存在。統一工具放棄了無需接收方的 child 快捷方式，也放棄了讓結構性返回工具繞過顯式 child allow-list 的舊能力。只有具體案例需要相鄰 `agent_id` 與固定 Steer 無法表達的語義時，這些能力才會重新出現；重新引入需要獨立的模型操作與字首成本證據，而非 `sendMessage()` 之上的別名。

## 考慮過的替代方案

**保留 `followup` 並新增 child 到 parent 路由。** 該名稱承諾後續輪次並繼承 `Agent.followup()` 語義。它會掩蓋選定的最近 step 行為，併為方向無關能力保留以 parent 為中心的名稱。

**保留 `sendMessage()` 之上無需接收方的 `report` 包裝層。** 這會保留便利的 child 快捷方式，並讓作用域區域性註冊繞過全域工具過濾。它落選是因為獨立 schema 與提示詞重複一個操作、使 parent 與 child 請求頭不同，並允許等價方向再次漂移。

**讓 `report` 全域可見。** 根 Agent、一次性 child、遠端 child 與無 Agent 呼叫方無法推導 report 接收方。全域宣傳它會讓 schema 可見性與權限不一致，而 `send_message` 已顯式給出接收方。

**把每條 child 最終訊息變成隱式傳送。** 長期執行的 child 可能在某個輪次沒有值得傳送的內容，在另一個輪次卻有多條發現。自動投遞會混合模型編寫通訊與 runtime 結算說明，而且無法替代錯誤、取消或 token 耗盡時的無條件通知。

**只依賴工具描述。** 工具描述會在模型考慮該工具後提供幫助；失敗模式是 child 認為自己已經完成而根本沒有考慮返回呼用。初始任務指導能觸及該決策，又不會改變繼承的系統或工具字首。

**保留靜默投遞作為部署策略。** 靜默的模型編寫訊息可能被接受，但空閒目標永遠不會讀取它。固定 Steer 為兩個方向提供一種投遞含義，並保持與後續結算通知的接受順序。

## 後果

- 模型 Consumer 向 parent 與 child 公開一個 `send_message({ agent_id, message })` 定義，不提供模型選擇的 Queue 與 Steer 參數。
- 繼續執行管理器仍是相鄰關係授權、駐留、冷恢復、喚醒准入與拆卸競態的唯一所有者。
- 被接受的訊息可以延長執行中目標的目前輪次；一起等待的訊息共享 next-step FIFO 順序。
- 呼叫方取消只在 inbox 接受前掌管工作，不會撤回已接受訊息或 dispose（資源釋放）目標。
- 初始任務在 fork 字首之後攜帶經過 JSON 編碼的動態 parent 地址，而請求頭系統提示詞與工具順序保持可複用。
- 人類提示、結算通知、QueueDock 與 base bundle 的一次性 fork 策略仍是獨立決策。

本決策合併並刪除了已完全被取代的 report 工具與 child report 義務記錄。它取代[按意圖命名的 subagent 繼續執行操作](../../archived/simplification/2026-07-27-intent-named-subagent-continuation-operations.md)中的 `followup` 命名選擇，並保留[Child Agent 訊息先於其結算通知](../bug-fix/2026-08-17-subagent-message-settlement-ordering.zh.md)中的接受順序保證。
