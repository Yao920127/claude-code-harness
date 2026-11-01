# Agent Note: Auto review 拒絕後請求使用者審批

Status: implemented

[English](2026-09-24-auto-review-user-approval-fallback.md) | 中文

## Problem

[Auto review](2026-08-28-auto-review.zh.md) 把每次 reviewer 拒絕都當作最終結果，並把每次 reviewer 失敗也報告為同樣的拒絕。旁觀 Session 的人無法讓被拒絕的呼叫繼續執行，即使 reviewer 誤判了此人想要的動作；唯一的補救是把整個 Session 切換到 Full access。Reviewer 回應不合法、provider 出錯或 Session 事實缺失時，模型與使用者看到的都是 `Auto review rejected tool "<name>"`，因此兩者都無法區分策略決定與技術失敗，也無法針對原因採取行動。

## Decision

當 Session 的審批策略為 `ask` 時，reviewer 拒絕返回 tools 流水線既有的 `ask` 決定。`ToolRuntime` 透過審批服務傳送該請求，理由為 `Auto review denied tool "<name>"`；reviewer 給出理由時再追加 `: <reviewer reason>`。`allowed-once` 執行呼叫；`rejected`、`cancelled` 與 `unavailable` 透過審批服務的普通訊息拒絕呼叫，body 不執行。只有後續 `tools/pre-execute` listener 放行呼叫後，listener 才請求審批，因此下游拒絕或取消優先且不彈出審批。

選擇 Auto 會寫入 `danger-full-access` 與 `ask` 審批策略。已記錄的 Auto 選擇也匹配 `never` 策略。[程序內委派 child 固定 `never`](2026-08-10-subagent-approval-pinned-never.zh.md)，因此 child 的 Auto 保留最終的 `AutoReviewDeniedError` 拒絕及其理由；按先前 `never` 組合記錄的 Session 仍解析為 Auto，而不是 Full access。再次選擇 Auto 會寫入 `ask`。

Reviewer 失敗以 `Auto review of tool "<name>" failed; its body was not executed: <error>` 拒絕呼叫，不帶結構化錯誤資訊。Provider 失敗訊息包含 finish 型別、失敗程式碼與 provider 訊息，因此模型與通用工具卡片顯示實際原因。

## Alternatives considered

**Reviewer 失敗後也請求使用者審批。** 失敗不說明動作風險；請求審批會把技術錯誤呈現為策略問題，並用反覆彈出的審批掩蓋損壞的 reviewer 路由。

**始終返回 `ask`，由 `never` 策略拒絕。** 審批服務把該拒絕報告為 `the user rejected tool "<name>"`，這對 child 不成立，而且會丟失 reviewer 理由。

**Auto 保持 `never`，由 reviewer 繞過審批策略。** 審批服務在任何應答者之前執行 `never`，因此沒有 listener 能繞過它；模型上下文中的策略文字也會告訴主 agent 不可能發生審批。

## Consequences

- 互動式 Auto Session 可能停在審批提示上，因此 Auto 不再保證無人值守地推進。
- 使用者可以在審批提示與審批審計事件中看到原始 reviewer 理由；主模型只看到審批結果。
- Reviewer 失敗文字（包括 provider 訊息）成為模型可見的工具錯誤內容。
- 在 Auto 與 Full access 之間切換現在也會改變審批策略，因此存活 agent 的切換路徑會排入審批策略變更通知。
- 單元測試覆蓋各審批結果、下游拒絕的先後順序、child 的 `never` 路徑以及具體失敗訊息；shipped Web 組合測試覆蓋真實 reviewer 拒絕之後的使用者拒絕。
