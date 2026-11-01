---
description: "在實驗性瀏覽器提供者之間共享按 Session 管理的瀏覽器所有權與 MCP 啟用。"
kind: "package-library"
---

# @deepseek-ai/dsh-experimental-browser-use-runtime

[English](README.md) | 中文

## 概述

瀏覽器提供者使用此庫，在一個 Session 的多個輪次之間複用瀏覽器，並在該 Session 的執行時釋放時關閉其資源。一個 Session 的操作按順序執行，隔離的 Session 則可以獨立推進。附加模式將一個外部瀏覽器保留給單個 Session。此庫還連線提供者擁有的 MCP 伺服器，並在 Session 首次模型請求前發現其工具。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

此公共實驗性庫是瀏覽器提供者的依賴。它沒有外掛入口或掛載設定。[瀏覽器操作服務](../../browser-use/browser-use/README.zh.md)保持獨立於此庫。

原生提供者從包根入口建構 `SessionResources`，提供資源取得與清理回呼。呼叫向 `run()` 傳遞確切的即時 Agent；失效的所有者與獨佔附加的第二個所有者在取得資源前失敗。取消資源取得等待不會終止初始化，同一 Session 的其他呼叫方仍可繼續等待；釋放 Session 會中止並等待該初始化結束。提供者將註冊保留到 `dispose()` 完成。

MCP 提供者使用 `@deepseek-ai/dsh-experimental-browser-use-runtime/mcp` 中的 `mountSessionMcp`，提供固定伺服器名稱、可執行檔案、參數與所有權策略。輔助庫在每個後續 Agent 的 `agent/created` 事件中等待一次有作用域的用戶端啟動與發現嘗試。Agent 建立或恢復在發現完成後結束，隨後才執行排隊輸入；成功的用戶端跨輪次歸該 Session 所有。

附加連線被佔用時，本次啟用永久跳過啟動，但其他工作繼續執行。連線釋放不會觸發被跳過啟用的重試；新建立或恢復的 Agent 可以取得連線。啟動失敗或取消會拒絕 Agent 建立或恢復，並觸發包含用戶端清理的建立復原。重連已停用。載入或重新載入提供者只作用於後續的 Agent 啟用。

呼叫方在等待 Agent 建立或恢復完成後，即可檢查提示片語裝和作用域工具定義。

指向此伺服器的瀏覽器工具呼叫與資源請求使用同一佇列，且要求呼叫 Session 自己擁有連線。其他 MCP 伺服器仍可使用。沒有所有權時會省略繼承的伺服器指導；共享伺服器名稱目錄保留常規作用域行為。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部機制 — 點選展開</summary>

[資源管理器](src/index.ts)以即時 Agent 身份為所有權鍵，並將操作取消與所有者釋放關聯起來。每個資源只有一個取得 promise 和一個操作佇列。取得失敗時，僅在提供者回呼復原已取得資源後釋放保留。

因釋放而取消時，在 AgentHandle 等待空閒前開始資源清理。清理先關閉資源再等待執行中的操作，使連線清理能夠中斷不支援 abort 的上游 API。關閉失敗會拒絕釋放並保留所有權。Agent 作用域清理防止使用同一持久 id 恢復的 Session 繼承之前的瀏覽器。

[MCP 輔助庫](src/mcp.ts)在序列 `agent/created` 中建立連線；[AgentLoop](../../core/agent-loop/README.zh.md#understand-the-implementation)保留排隊輸入並負責建立復原。提示片語裝讀取已初始化的目錄。輔助庫在資源清理期間保留提供者註冊，並透過 [MCP 用戶端](../../mcp/mcp-client/README.zh.md)處理傳輸、schema 發現、結果轉換與持久影象接納。

不釋出執行時不變數伴隨入口：資源所有權與待處理工作是私有生命週期狀態，沒有可供比較的獨立維護執行時投影。所屬測試覆蓋隔離、釋放與清理失敗。

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [瀏覽器操作](../../../docs/subsystems/browser-use.zh.md) — 提供者選擇與 Session 所有權。
- [MCP 用戶端](../../mcp/mcp-client/README.zh.md) — 發現、取消與結果接納。
- [瀏覽器所有權決策](../../../.agents/notes/implemented/architecture/2026-09-12-browser-use-provider-registration.zh.md) — 僅註冊名稱的服務與資源生命週期。

-----

<a id="model-experience"></a>
## 模型體驗

透過提供者擁有的瀏覽器工具間接影響模型，MCP 輔助庫在模型請求組裝前發現其目錄；提供者與 MCP 用戶端擁有描述、schema、結果與影象行為。

#### KV Cache 影響

此庫不新增提示文字。發現的工具 schema 與提供者指導決定請求字首變化；常規瀏覽器資源複用不改變這些 schema。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

提供者仍負責自己提供的瀏覽器操作。

- **MCP 啟用** — 提供者不接管已有的活動 Agent；被佔用的附加連線不會在本次啟用中重試。
- **附加範圍** — 獨佔所有權作用於一個資源管理器，不約束獨立提供者、程序或外部瀏覽器用戶端。
- **取消** — abort 訊號與連線關閉無法撤銷已交付的瀏覽器操作。同時忽略兩者的上游操作可能延遲清理。
- **恢復** — 關閉失敗會保留所有權；此管理器不重試釋放，也不從 Session 日誌恢復瀏覽器狀態。
- **共享主機執行時** — profile 會把本包與 dsh 安裝並排安裝，因此 `@deepseek-ai/dsh-scope` 與 `@deepseek-ai/dsh-mcp-client` 保持為 peer 依賴。寫成 `dependencies` 會再裝一份 `dsh-scope`，它的作用域標記主機註冊表讀不到：每個 Agent 的 MCP 工具都會註冊到全域工具層，第二個 Agent 的建立隨之失敗。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
