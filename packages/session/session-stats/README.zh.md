---
description: "面向用戶端與維護者的全日誌工作階段計數與牆鍾時間說明，用於選擇、組合或排查 sessionStats 投影單元。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-stats

[English](README.md) | 中文

## 概述

本包透過公開的 `sessionStats` 值，為用戶端提供全工作階段輪次與步驟計數，以及 LLM、工具、首 token 和解碼牆鍾時間。這些數字來自完整的持久日誌，因此分頁與壓縮不會改變它們。當用戶端必須在重新載入或縮減歷史記錄後顯示一致的工作階段統計時，請使用本包。全工作階段統計不可用時，用戶端可改用視窗口徑計數。

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

當用戶端需要顯示不受分頁與壓縮影響的全工作階段數字時，在工作階段儲存與投影註冊表旁掛載此外掛。只有存在註冊表時單元才會註冊。

### 組合

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-session-stats'
```

### 各欄位含義

| 欄位 | 含義 |
|---|---|
| `turns` | 含至少一個已關閉步的不同輪次；被拒絕或空輪不計 |
| `steps` | 已關閉的步——完成、失敗、取消與 max-tokens 的步全部計入 |
| `llmMs` | 組裝出訊息的步的模型牆鍾時間之和 |
| `toolMs` | 匹配的 `tool/call` → `tool/result` 牆鍾時間之和 |
| `ttftMs` / `ttftSteps` | 首 token 延遲之和及其承載步數 |
| `decodeMs` / `decodeTokens` | 上報用量的步的解碼牆鍾時間與提供者輸出 token 之和 |

每個欄位在首個貢獻事件之前均為 0；已裝配的註冊表恆提供該鍵，因此用戶端讀取值本身，而非鍵的存在性。用戶端透過投影 seam 的快照與變更流渲染全日誌數字；參考消費者是 Web 聊天統計條，其視窗摺疊以相同欄位名充當無單元時的退回。

### 失敗與恢復

沒有投影註冊表時單元是惰性的：`inject` 使 fiber 保持掛起，不註冊任何內容，因此其他裝配缺少 `sessionStats` 鍵。解除安裝外掛會移除該鍵，因為註冊是掛載 fiber 上的 effect。被崩潰打斷的步在工作階段重新載入後計入，屆時崩潰恢復補寫合成的 `step/end`。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋數字背後的摺疊；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該單元是對已提交工作階段事件的純摺疊：`step/end` 是被計數的步事件，因為 agent loop 對每個進入的步在 `finally` 中恰好追加一條，因此完成、失敗、取消與 max-tokens 的步都會落實一條。若改按已組裝的 assistant 訊息計數，則會多算 max-tokens 的 usage 主機訊息（空內容、被排除在 surface 之外），並少算被取消的步（在訊息組裝前已中止）。牆鍾摺疊逐欄位對齊用戶端視窗摺疊。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`inject`、在掛載 fiber 上註冊單元 |
| [`src/projection.ts`](src/projection.ts) | 摺疊：狀態形狀、逐事件轉換、wire 檢視 |
| [`src/types.ts`](src/types.ts) | `sessionStats` 投影鍵宣告與欄位型別的唯一歸屬 |

### 資料模型

摺疊狀態儲存八個總計外加進行中的邊界：`lastTurn`（最近一次被計數 `step/end` 的輪次）、`openStep`（開啟步的邊界事實，由其 `assistant/message` 關閉）與 `pendingCalls`（按 callId 記錄的工具分發時間）。wire 檢視是嚴格子集——八個總計——因此持久快取的狀態 schema 以邊界欄位擴充功能檢視 schema。

### 摺疊規則

- 不相關事件返回同一狀態引用；註冊表的 `Object.is` 門禁保持變更流安靜。
- 首 token 延遲記錄首個非空 delta chunk，並在步內 `llm/retry` 後保留。
- 解碼時間與 token 只在同時攜帶首 token 與有效提供者用量報告的步上累加；與視窗摺疊守衛節點用量一樣忽略畸形用量。
- 工具時間按 callId 配對 `tool/call` → `tool/result`；未解決的呼叫在 `turn/end` 時丟棄，因為結果總在其輪內落實，而撞上 `Object` 原型名的 callId 讀作未匹配。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當單元約定不夠用時閱讀以下頁面。它們從驅動單元的註冊表逐步進入相鄰的工作階段包。

- [工作階段投影子系統](../../../docs/subsystems/session-projection.zh.md)——驅動單元並提供快照與變更流值的註冊表。
- [工作階段投影註冊表包](../session-projection/README.zh.md)——單元註冊所依據的註冊表約定。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 sessionStats 單元把已寫入日誌的步邊界摺疊成面向用戶端的讀模型，不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包從不組裝或傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明數字描述什麼、單元何時缺失。它們是目前包約束。

- **步數統計的是已發生的工作，而非可見輸出**——在產生任何可見內容前就失敗的步仍以 `step/end` 關閉並計入；被崩潰打斷的步在工作階段重新載入後計入，屆時崩潰恢復補寫合成的 `step/end`。
- **被取消的步計數但不計時**——沒有組裝出 assistant 訊息，其部分流式時間不進入任何牆鍾數字；反之 max-tokens 的 usage 主機訊息貢獻 surface 上看不到的模型時間。
- **計數是日誌口徑，不是 surface 口徑**——訊息後來被壓縮掉的步仍然計入；數字描述整個工作階段，而非目前模型可見 surface。
- **僅在組合了投影註冊表時掛載**——其他裝配不提供 `sessionStats` 鍵，其消費者退回到視窗口徑計數。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包只擁有一個純投影摺疊區，其 wire payload 在每次快照和變更流發射時都由投影註冊表進行 schema 驗證。該摺疊區依賴的事件關係（每個已進入步驟恰有一個 `step/end`、主機分配的輪次編號單調遞增，以及分片和工具事件攜帶各自的步驟座標與呼叫 id）由 dsh-agent-loop 與 Session surface 擁有並在執行時檢查，而不由本包擁有。
