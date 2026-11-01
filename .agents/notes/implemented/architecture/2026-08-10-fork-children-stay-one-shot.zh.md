# Agent Note: Fork child 保留 parent 請求字首

Status: implemented

[English](2026-08-10-fork-children-stay-one-shot.md) | 中文

## 問題

fork 與 spawn 的差異在於：fork 會用 parent 已完成輪次的字首作為 child Session 的種子。該種子會消耗 token，其預期收益是提供者側的字首複用：使用相同提供者和模型時，如果 child 請求的開頭位元組與 parent 相同，共享區段就無需再次預填充。任何位於繼承歷史之前、僅屬於 child 的系統提示詞 section 或工具 schema 都會破壞這項收益。

先前的隨附組合透過把 fork child 保持為 one-shot 來避開這種不匹配。該限制源於原來的 child-only 返回工具，並非可繼續 fork 的固有屬性。

## 決策

面向模型的 `send_message` 工具在組合中的每個 Agent 上全域註冊。因此，可繼續 fork child 獲得與 parent 相同的工具名稱、描述、schema 和順序。其初始任務追加在繼承的 Session 種子之後；當 child 可以看到該工具時，任務還會包含直接 parent id，以及使用 `send_message({ agent_id, message })` 返回結果的指引。

base 與 headless 組合保留 one-shot fork 作為其保守生命週期策略。`cordis`、`standard` 和 `ptc` CLI preset 可以把 fork 繫結為可繼續生命週期，因為該繫結不再插入 child-only 請求頭欄位。`ForkInProcessProvider.prepareContinuable()` 與 `ctx.subagents.startContinuable()` 仍是這些 preset 使用的實作 seam。

逐位元組相同的字首複用受顯式部署選擇約束。設定 child persona 或 `toolFilter` 的 fork 委派仍可能改變請求頭。尤其是過濾掉 `send_message` 時，child 會同時失去該 schema 與返回指引；執行時不會繞過顯式 allow-list。

## 考慮過的替代方案

**讓所有 fork 保持 one-shot。** 這能保留字首，但 child-only schema 差異消失後，繼續放棄持久且多輪的 fork child 已無必要。

**安裝 child-only 返回別名。** 無需填寫接收方的別名可以縮短 child 呼叫，但會在繼承歷史之前重新產生工具 schema 與提示詞差異，並重復相鄰 Agent 操作。

**把返回指令放進系統提示詞。** 這會在繼承訊息之前加入 child-only 位元組。將其追加到初始使用者任務，可以保留繼承字首，並讓 parent id 緊鄰需要它的任務。

**忽略顯式 child `toolFilter`。** 結構性返回工具過去會繞過 child allow-list。否決該方案，因為宣告的工具限制必須同時決定 schema 可見性與指引；隱藏權限會讓面向模型的工具清單失真。

## 後果

- 未請求 persona 或工具過濾時，parent 與可繼續 fork child 暴露逐位元組相同且順序一致的工具 schema。
- 繼承的 Session 種子位於 child 初始任務及其返回指引之前。
- base 與 headless profile 保持 one-shot fork；選定的 CLI preset 會在沒有 child-only 請求頭增量的前提下使用可繼續 fork。
- child 顯式向直接 parent 傳送零條或多條訊息；最終回答不會被隱式複製。管理器負責的結算通知仍然無條件執行，並且與 Agent 訊息分離。
- keyless snapshot 與包測試固定 schema 相等性、繼承歷史順序、parent-id 指引，以及透過同一個 `send_message` 操作完成的 child-to-parent 投遞。

### 已接受風險

提供者側字首複用仍取決於選定的提供者和模型，以及是否不存在顯式 persona 或工具過濾差異。harness 證明的是自己組裝出的請求頭輸入相等，而不是提供者的快取行為。
