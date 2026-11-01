---
description: "與通道無關的一次性審批 seam；供組合應答者、設定策略或排查以拒絕方式關閉的權限決定的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-user-approval

[English](README.md) | 中文

## 概述

使用本包可要求敏感工具操作在繼續前取得一次性決定。`ask` 策略將每個請求傳送給部署中的人類或機器應答者；`never` 則直接拒絕，不發出提示。應答者缺失或失敗時返回 `unavailable`，使操作以拒絕方式關閉；每項批准也只適用於對應請求。每個請求與結果都會記錄在發起請求的工作階段審計日誌中。模型會看到最終工具結果與目前策略，但不會看到人類權限 UI 或審計事件。

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

當敏感工具操作應當暫停等待人或機器的決定、而非無條件執行時，組合此服務。工具流水線與沙箱 bash 工具會透過此 seam 路由 `ask` 決定，並在該 seam 缺失時以拒絕方式關閉，因此互動式部署至少應組合一個應答者。

### 組合應答者

應答者是 `approval/request` waterfall（瀑布式事件）監聽器：返回一個結果即為所負責的 agent（智慧代理）作答，否則呼叫 `next()` 委託。限定到 agent 的監聽器只接收該 agent 的請求，且每項部署應組合一個最終應答者——同級監聽器的順序不是策略優先順序機制。沒有最終應答者時，請求解析為 `unavailable` 並以拒絕方式關閉；服務自身絕不會提示人類。

### 設定策略

有效策略取工作階段中已設定的策略，並退回到設定的預設值。`ask`（預設）委託給已組合的應答者；`never` 在互動式分發之前確定性地拒絕每個請求——這是 CI 與無人值守執行採用的嚴格無頭模式。

```yaml
- name: '@deepseek-ai/dsh-user-approval'
  config:
    policy: ask
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `policy` | `ask` | 沒有 `approval/policy` 覆蓋的工作階段的預設策略 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-user-approval)是每個受支援欄位及其 JSDoc 的窮盡式真源。`setPolicy(agent, policy)` 切換執行中的 agent 的策略，併為它的下一個模型步驟排隊一條「由使用者更改」訊息；`setApprovalPolicy(session, policy)` 是工作階段初始化使用的直接持久寫入路徑。`effectivePolicy(session)` 讀取該工作階段下一次請求所依據的策略。

### 請求決定

`request(req)` 指名 agent、工具、原因、可選的呼叫 id，以及一箇中止訊號。可選的 `displayReason` 提供在地化展示文案，不改寫日誌中的原因。它要求目前處於尚未結束的輪次中：空閒或在輪次之間呼叫會在審計前丟擲異常。中止會撤回問題——請求以 `cancelled` 結算，遲到的回答被丟棄。若任一審計事件在提交前失敗，請求會被拒絕，而不會返回一項未記錄的決定。

### 模型與使用者看到什麼

模型只會看到發起請求的消費方最終給出的工具結果——允許、拒絕、取消或不可用——以及執行時上下文快照中的目前策略；審計事件與面向人類的權限 UI 不屬於模型上下文。`never` 切換會以一條帶來源的使用者訊息告知模型，兩種策略都會把各自的完整目前含義貢獻給快照。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

可觀察行為已在[使用本包](#use-this-package)中說明；本節解釋分發、策略執行與審計路徑。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `ApprovalService`：請求分發、策略摺疊與寫入路徑、執行時上下文貢獻 |
| [`src/types.ts`](src/types.ts) | `ApprovalRequestId` brand 與結果型別 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：在未結束的輪次內配對 `approval/asked` 與 `approval/decided` |

### 分發

`decide()` 讓應答者 waterfall 與請求訊號賽跑，並隔離所有應答者故障：丟擲異常的監聽器會使問題以 `unavailable` 關閉，不屬於結果詞彙的異常回傳值也會規範化為 `unavailable`。`never` 策略在服務內部、waterfall 分發之前執行，因此之後以 `prepend` 註冊的監聽器也無法繞過確定性的拒絕。請求必須處於未結束的輪次內，因為輪次是持久日誌的提交／回放邊界——輪次之間的裸事件與崩潰尾部無法區分。

### 策略與執行時上下文快照

系統提示詞貢獻 `approval:policy` 在保留歷史之後陳述有效策略的完整目前含義——`ask` 及其以拒絕方式關閉的後果，或 `never` 及其非升權後果——因此切換策略會追加一份新的完整快照，而不會改寫穩定的請求頭。`setPolicy()` 還會注入一條帶來源的使用者訊息，為下一步宣佈變更。

### 審計

`request()` 先追加攜帶請求身份與工具的 `approval/asked`，再追加攜帶最終結果的 `approval/decided`；確切追加欄位見 [`src/index.ts`](src/index.ts)。兩者都只寫入日誌；不變式會在同一個未結束輪次內按 id 驗證這一事件對，並驗證結果屬於封閉詞彙。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從審批詞彙逐步進入消費方與設計依據。

- [審批子系統參考](../../../docs/subsystems/approval.zh.md)——共享的請求／結果詞彙與 `ctx.approval` 的 Cordis 介面面。
- [審批 seam Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-approval-seam.zh.md)——該 seam 的設計依據。
- [沙箱 Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——沙箱 bash 工具如何為升權重試消費審批。
- [互動組對映](../README.zh.md)——相鄰的權限預設與問答包。

-----

<a id="model-experience"></a>
## 模型體驗

### 目前審批策略上下文

#### 模型看到的內容

首次請求與有效策略每次變化時，都會在保留的歷史後追加一份完整執行時上下文快照。在 `ask` 下，審批上下文內容會說明系統可以諮詢已設定的應答者，缺少可用應答者時則以拒絕方式關閉。在 `never` 下，它會說明確定性的拒絕與非升權後果。未變化的請求會保留先前快照，不增加另一條訊息。

##### Ask 策略貢獻

```markdown
Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.
```

##### Never 策略貢獻

```markdown
Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).
```

#### Token 影響

首次請求和策略實際變化時增加一條簡潔的上下文訊息；未變化的請求不增加重複的策略 token。

#### KV Cache 影響

在保留的歷史之後僅追加。`ask`／`never` 切換會保留穩定的系統與對話字首，而不會改寫第一條 wire 訊息。

### 工具結果

#### 模型看到的內容

`approval/asked` 和 `approval/decided` 只寫入日誌。模型只會看到發起請求的消費方最終給出的允許、拒絕、取消或不可用工具結果；面向人類的權限 UI 不屬於上下文。

#### Token 影響

不會產生重複的審計 token。拒絕可能以一條簡短且會保留的錯誤資訊替換正常工具結果，而允許會保留消費方的普通結果。

#### KV Cache 影響

僅追加；新出現的可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 不適用的情境，以及組合時需要特別注意的情境。它們是目前包約束，不是通用權限對比。

- **請求只在尚未結束的輪次內有效**：在空閒時或輪次之間發起呼叫，會在審計前丟擲異常；持久化的輪次外審批工作流仍屬延期工作。
- **僅存在一次性授權**：結果詞彙包含 `allowed-once`，但不含 `allow-always`、已記住的規則、撤銷或授權儲存；工作階段策略只有 `ask`／`never`。
- **請求不攜帶工具參數**：應答者會看到工具名稱、原因和可選呼叫 id；ACP（Agent Client Protocol）機器通道要求呼叫 id，並會委託不含 id 的請求。
- **沒有內建應答者**：無頭或組合不完整的部署會返回 `unavailable` 並以拒絕方式關閉；服務自身絕不會提示人類。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
