# Agent Note: 執行時邊界顯式攜帶 Agent 身份

Status: implemented

[English](2026-08-31-explicit-agent-runtime-identity.md) | 中文

## 問題

Agent 的 Cordis Context 擁有註冊及其清理。Agent 身份則為某項操作選擇工作階段、執行時所屬方、事件主體、權限決策或協定身份。Context 上反向的 Agent 屬性讓這兩個事實看起來可以互換：呼叫方選擇用於管理 effect 所有權的 Context 時，可能意外地讓該選擇決定領域身份。

型別資訊被擦除後，這項反向關聯還需要補償機制。Host Remote 轉發會從已路由主體檢查其 Context，建立流程會從呼叫方 Context 推斷執行時父級，介面卡則維護反向身份掃描。這些機制重複型別化請求中已有的身份，也掩蓋了哪個呼叫方在執行時擁有 Agent。

若沒有顯式所屬方，`SubagentContinuationManager` 會透過私有外掛 Context 建立和恢復子級，因此基於 Context 的推斷會把每個可續跑子級歸類為 runtime root，儘管管理器持有其確切父級。僅限根級的消費方隨後可能附加排程工具、授予直接人類輸入對應的 Goal 權限，或像處理頂層 Agent 一樣路由使用者問題。

## 決策

執行時介面在擁有身份的位置攜帶 Agent 身份。`AgentSetup` 接收 `(agentCtx, agent)`；建立與恢復 Agent 的 options 透過 `parentAgent` 標識執行時子級；作用域事件在 payload 中攜帶 Agent；Remote 轉發驗證 `request.agent` 就是 carrier key；Host Typert Context 解析則把協定身份對映到存活 Agent Context，不執行反向掃描。`agent.ctx` 繼續擁有註冊和生命週期，不暴露反向 Agent 屬性。

感知作用域的註冊表繼續僅使用不透明作用域鍵判斷註冊成員關係。tool-subagent 不會分類該鍵，也不會從 Context 解析 Agent。直接 `AgentSetup` 顯式傳入尚未釋出的 Session，並在釋出前透過所給 Context 完成安裝。對於由設定控制的常駐 preset，事件 payload 提供 Agent，其 Session 提供策略目標，其 Context 擁有註冊項。

`SubagentContinuationManager` 會把確切父級放進全新建立與冷恢復的 options。因此，存活的可續跑子級不會出現在 `AgentRegistry.roots()` 中，並且滿足 `isOwnedBy(child.id, parent)`。持久化 `parentSession` 中繼資料不能代替這項關係：沒有存活 Agent 擁有 fork 或已恢復工作階段時，它仍可成為 runtime root。

[Agent 註冊作用域決策](2026-07-08-agent-scope-contexts.zh.md)、其[執行時設計](2026-07-12-agent-scope-runtime-design.zh.md)和[發起方作用域決策](2026-07-15-agent-initiator-scope.zh.md)繼續擁有各自獨立的註冊、生命週期及私有呼叫鏈理由。本決策只取代其中描述的反向 Context 關聯和隱式執行時所屬方推導。

## 驗證

Agent 建立測試鎖定顯式的根級與子級歸屬。continuation 整合測試讓一個真實子級保持存活，直到斷言其既不屬於 `roots()`、又滿足 `isOwnedBy()`。現有 Schedule 測試驗證僅限根級的註冊項不會出現在顯式歸屬的子級中。

Remote 事件測試會在轉發作用域 waterfall 前拒絕缺失或不匹配的 Agent。tool-subagent 測試驗證 direct setup 會在 Session 釋出前完成安裝；常駐 preset 測試驗證逐 Session 的策略讀取與繼承。

## 考慮過的替代方案

**保留 `Context.agent`。** 反向 accessor 會讓註冊所有權看起來等同於操作身份，還要求每個 Context 派生、介面卡和測試替身保留一項與 Cordis 服務選擇或 effect 清理無關的關聯。

**從呼叫方 Context 推斷執行時歸屬。** 私有管理器 Context、Agent Context 和常駐 preset Context 都能呼叫同一個工廠。因此，Context 祖先關係無法說明由哪個存活 Agent 擁有結果；建立方必須把它已知的父級放進請求 options。

**分類 Agent 作用域鍵。** 不透明作用域鍵表達路由成員關係，而不是領域身份。分類該鍵會讓 Agent 成為組合中心，也仍會把外掛的 effect 所有者與策略所需的 Session 耦合起來。

**使用發起 Agent 作為建立歸屬。** 發起方作用域記錄非同步執行的因果關係，而非生命週期歸屬。父級可能發起有意建立根級 Agent 的工作，而 setup 仍位於子級驅動邊界之外。

**使用持久化工作階段譜系。** `parentSession` 跨程序生命週期記錄對話祖先關係。執行時歸屬控制存活根級和 teardown，因此把二者等同會阻止合法恢復的 fork 成為頂層 Agent。

## 後果

生命週期 options、事件、服務請求和傳輸請求會攜帶顯式 Agent 身份，因此每項操作都會宣告自身使用的身份，TypeScript 也會檢查兩側。Context 可以繼續複用於依賴存取與 effect 所有權，而不會成為另一種領域物件定位器。

可續跑子級與一次性程序內子級使用同一種執行時父級關係。僅限根級的消費方會排除這些子級，父級 teardown 可以依據唯一的存活歸屬圖推理，而持久化譜系仍可描述歷史，不必承擔程序內生命週期語義。
