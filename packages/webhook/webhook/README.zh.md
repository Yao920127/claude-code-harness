---
description: "面向註冊可信外部事件策略並建立 Workspace 工作階段的維護者，說明 webhook 規則執行時。"
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook

[English](README.md) | 中文

## 概述

`dsh-webhook` 提供 Host 側的 `ctx.webhookRuntime`：它既是受信任程式化 webhook 規則的註冊表，也擁有唯一內建動作——在 Web Workspace 中建立普通根工作階段。介面只包含 `register(rule)` 和 `dispatch(delivery)`；提供者身份驗證屬於介面卡包。當受信任規則必須把外部事件變成新的 agent（智慧代理）工作階段時，請使用它。

## 目錄

- [規則介面](#rule-interface)
- [工作階段請求](#session-request)
- [組合](#composition)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="rule-interface"></a>
## 規則介面

`WebhookRule<K>` 具有帶 brand 型別的唯一 `id`、提供者 `kind` 與 `run(delivery, signal)`。回呼可以執行任意受信任程式碼，並返回 `null` 或一個 `WebhookSessionRequest`。同類規則彼此獨立啟動；某個回呼丟擲異常或其返回的 Promise 被拒絕時，只會記錄日誌，不會阻止同級規則。

`VerifiedWebhookDelivery` 攜帶提供者種類、已設定來源 id、提供者交付 id、規範化的無損 JSON 與接收時間。執行時會在共享前快照並凍結完整值。`deliveryId` 僅是來源資訊；重複交付會再次執行規則。

註冊是一項 effect。它的可等待 disposer 會先隱藏規則，再中止並排空活動回呼。回呼必須觀察所提供的 signal；忽略取消的同程序程式碼無法被安全強制停止。

<a id="session-request"></a>
## 工作階段請求

`WebhookSessionRequest` 要求 `workspacePath`、`title`、`prompt`、`agentPreset` 與 `permissionPreset`；可選 `model` 會指定明確的提供者／模型路由與輸出 token 上限。明確路由使用其介面卡的預設推理（reasoning）強度。省略時會快照包含推理強度的完整目前部署選擇，直到首個請求記錄持久 header；之後的 Web 模型變更保留普通工作階段行為。

執行時會在變更狀態前驗證 preset，解析或建立規範 Workspace，以該 Workspace 路徑作為 `SessionHeader.cwd` 建立 Agent，在釋出前掛載 agent preset，並在應用權限、標題與提示詞前附加工作階段。附加失敗會對尚未釋出的動作執行 dispose（資源釋放）。之後若在提示詞前失敗，則以盡力而為方式脫離 Workspace 並對 Agent 執行 dispose。

成功的 `Agent.followup()` 是 webhook 操作的提交點。訊息使用 `source.kind: "webhook"`，並攜帶提供者、來源、交付與規則來源資訊。執行時不等待 idle、不執行特殊 flush、不檢查回覆，也不釋出完成狀態；之後完全由普通 Agent 與工作階段行為接管。

<a id="composition"></a>
## 組合

在 Web Host plane 上，於 Agents、模型預設值、agent presets、permission presets、標題與 Workspace 註冊表之後載入執行時。使用者編寫的規則外掛注入 `webhookRuntime`，並透過自己的 effect 交出 `register()` 返回的 disposer。

[GitHub 評審指南](../../../docs/user/guide/github-review.zh.md)展示了規則模組、專用入口埠、金鑰設定與 Workspace 路由。

<a id="model-experience"></a>
## 模型體驗

### 規則編寫的初始提示詞

#### 模型看到的內容

每個匹配規則都會讓模型看到 `WebhookSessionRequest.prompt` 返回的非空文字原文。通用執行時不增加私有框架；若規則包含外部文字，則由規則負責標明其信任屬性。隨附 GitHub 範例會把選定 PR 欄位標為不受信任的 JSON 中繼資料。

#### Token 影響

一條依賴資料的 user-role 訊息保留在新工作階段中，並持續貢獻 token，直到普通壓縮（compaction）替換或移除該歷史。

#### KV Cache 影響

初始提示詞開啟一個新工作階段，因此它建立而不是使該工作階段的可複用請求字首失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅限程序內 fire-and-forget** — 崩潰會丟失尚未接納提示詞的規則呼叫；不存在佇列、回放或重試。
- **無內建去重** — 提供者重複交付可能建立重複工作階段；需要冪等性的規則自行負責。
- **無完成結果** — HTTP 接受與規則結算都不報告 Agent 成功、idle 或輸出。
- **受信任回呼必須配合取消** — 執行時 teardown 會中止並等待回呼，但無法終止任意同程序程式碼。
- **Workspace 建立可能比失敗的工作階段嘗試更長壽** — 空 Workspace 會保留，因為另一個並行呼叫者可能已經使用它。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
