---
description: "跨工作階段快照引用與持久的不受信任模型上下文，供啟用或排查 ctx.sessionReferenceResolver 的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-reference

[English](README.md) | 中文

## 概述

`dsh-session-reference` 讓一次對話可以引用其他工作階段：主機把 `@label` mention 轉換為規範 URI，服務則為模型準備每個被引用工作階段的有界、只讀快照，作為持久、不受信任的背景上下文。候選發現按工作目錄親和度對其他工作階段排序，並用其最新標題作標籤。快照在捕捉後不可變，並帶有固定警告，禁止遵循其中的指令、權限宣告或工具請求。它是面向支援跨工作階段 mention 的主機的可選服務；它消費 `ctx.sessionQuery`，不需要 SQLite FTS。

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

當主機應允許使用者提及另一個工作階段並把其上下文交給模型時，啟用此服務。由於它消費後端無關的 compact 檢查點標記，任何 session-query 後端都可配合使用。

### mention 語法

規範 mention 是 Markdown 形式的 `@[label](dsh-session:<base64url 編碼的 id>)`，或裸 `dsh-session:` URI；每個 JavaScript 字串工作階段 id 都能精確往返。服務會把 mention 改寫為訊息中可讀的 `@label` 文字，並返回結構化引用。顯式 Markdown mention 會拒絕格式錯誤的 URI；空或只含標點符號的 scheme mention 仍是普通討論文字。

### agent（智慧代理）能得到什麼

引用其他工作階段的訊息後會緊接一條 `## Referenced sessions` 快照，作為第二條 user 角色訊息。快照是不受信任的背景：固定警告告訴模型，除非目前使用者明確重複，否則不得遵循其中的指令、權限宣告或工具請求。每個來源預覽都獨立有界——每條訊息至多 `maxReferences` 個不同工作階段，每個來源的序列化 JSON 採用設定值或模型相對位元組預算。保留策略先丟棄較早的非檢查點訊息，再縮短保留的文字；只有保留處理後引用仍無法滿足預算時，準備才會失敗。

引用被截斷時，可選的 spill 後端會在目標工作階段下儲存完整的已捕捉文字投影。有界預覽 JSON 之外的獨立省略通知給出精確的 `omittedMessages` 與 `omittedBytes`，以及儲存後的定位資訊和 `retrievalHint`，或區分未設定儲存與儲存失敗的不可用結果。該通知屬於同一條持久上下文訊息。完整 transcript（文字記錄）攜帶相同的不受信任背景警告與捕捉中繼資料，包括 `capturedFormatVersion`。每條訊息使用每行至多 64 個 Unicode 碼點的 JSON 字串片段；解碼並拼接其片段即可恢復精確文字，包括原始換行。這種固定儲存格式使很長的單行文字也可透過分頁檔案讀取來檢查。

### 查詢可引用的工作階段

`listCandidates(agent, query?, limit?)` 列出除 agent 自身外的工作階段，按 id、工作目錄、投影標題或顯示標題做不區分大小寫的過濾，並把同目錄工作階段排在前面。每個候選的 `label` 使用最新標題；標題缺失或不可讀時退回到工作階段 id。顯示標題優先使用 subagent 的持久建立 label，再退回到該標題。候選還會報告其工作目錄是否就是發起方 agent 的工作目錄，主機因此可以只在位置能區分該行時才顯示它。瀏覽器消費方透過 `ctx.remote.sessionReferenceResolver.candidates` 呼叫同一發現能力；該方法在 `displayTitle` 存在時用它標記規範 mention。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxReferences` | `3` | 一條已準備訊息中不同源工作階段的最大數量；不得超過 `3` |
| `candidateLimit` | `50` | 返回給主機的預設候選數量 |
| `maxReferenceBytes` | 自動 | 每個來源的最大序列化 JSON 位元組數；顯式設定時精確覆蓋自動預算 |
| `referenceContextFraction` | `0.2` | 每個來源的上下文視窗比例，範圍為 `0` 到 `1` |

自動預算為每個來源 `max(65536, floor(contextWindow × 4 × referenceContextFraction))` 位元組。模型上下文容量以 token 計量；每個 token 四位元組是容量估算，不是精確的 token 換算。缺少路由、LLM（大語言模型）服務、介面卡或容量時使用 64 KiB；其他模型中繼資料查詢錯誤與取消會使準備失敗。

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-reference)是每個受支援欄位及其 JSDoc 的窮盡式真源。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

準備階段在目標訊息到達 `agent/pre-step` 時，對每個被引用工作階段的目前表層各精確讀取一次。預覽與 spill 使用同一份已捕捉投影：使用者直接傳送的文字、assistant 文字，以及攜帶規範壓縮（compaction）標記的 user 檢查點；工具、推理（reasoning）與其他注入上下文均被排除。這既防止引用遞迴傳播，也防止源工作階段後續變更影響已儲存 transcript。預覽 JSON 將每個 `<` 轉義為 `\u003c`，因此源文字無法拼出 `<referenced-sessions>` 定界標籤。

解析器透過 `ctx.get("spillStore")` 取得可選儲存，只儲存被截斷的引用。儲存歸目標工作階段所有；來源資訊標識被引用的源工作階段與標籤，不偽造工具呼叫。非同步儲存後會檢查取消，即使產物已寫入，也會阻止釋出。產物過期仍遵循後端既有策略。

預算使用目標 agent 的 `system-prompt/assemble` 完成後捕捉的提供者與模型。首次組裝前直接呼叫 `prepare` 時使用 agent 選項；工作階段頭不決定預算模型。不帶 agent 的診斷組裝不會影響已捕捉路由。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SessionReferenceResolver`：pre-step 監聽器、候選發現、準備 |
| [`src/config.ts`](src/config.ts) | `Config` schema、`SessionReferenceError` 錯誤分類體系 |
| [`src/uri.ts`](src/uri.ts) | `dsh-session:` URI 編解碼、mention 格式化與解析 |
| [`src/projection.ts`](src/projection.ts) | 目前表層投影與位元組預算保留 |
| [`src/serialization.ts`](src/serialization.ts) | 快照載荷的標籤安全 JSON 轉義 |
| [`src/spill.ts`](src/spill.ts) | 完整 transcript 序列化與模型可見省略通知 |
| [`src/types.ts`](src/types.ts) | `SessionReferenceInput`／`Candidate` 與來源型別 |
| — | 不釋出執行時不變式伴生入口；準備過程返回建置時已驗證的不可變單次快照；持久上下文的准入、凍結與回放由 agent 層和工作階段層負責。 |

### 主要流程

外層 `agent/pre-step` 監聽器接受步驟，從直接使用者訊息中解析規範 mention，再呼叫 `prepare`：規範化引用（保持首次 mention 順序、去重、拒絕自引用與超限數量），並行讀取每個表層，在解析出的位元組預算下逐源保留，並渲染聚合提示詞。每條持久來源記錄保留凍結的 `capturedThroughSeq` 並記錄非零 `capturedFormatVersion`；欄位缺失表示格式 v0。每份快照都插入到引用它的訊息緊後，目標日誌先記錄可讀的直接訊息、再記錄其帶來源上下文，因此捕捉後的源變更無法改變目標回放。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從共享引用表面進入設計決策與其背後的讀取服務。

- [工作階段引用子系統](../../../docs/subsystems/session-reference.zh.md)——規範 URI、投影規則與穩定的錯誤分類體系。
- [工作階段引用 spill 複用](../../../.agents/notes/implemented/bug-fix/2026-09-05-session-reference-spill-reuse.zh.md)——快照身份、省略通知、儲存歸屬與替代方案。
- [工作階段查詢子系統](../../../docs/subsystems/session-query.zh.md)——提供工作階段表層的讀取服務。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-reference)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 引用工作階段背景

#### 模型看到的內容

模型會看到兩條連續的 user 角色訊息：先是帶可讀 `@label` 的目前訊息，再是 `## Referenced sessions` 不受信任快照。警告禁止遵循快照中的指令、權限宣告或工具請求，除非目前使用者明確重複這些內容。標籤、cwd 值、id 與工作階段文字會作為 JSON 在 `<referenced-sessions>` 標籤中序列化；資料中的每個 `<` 都會以無損 JSON 轉義 `\u003c` 的形式發出，因此源文字無法拼出定界標籤。

#### Token 影響

每條包含引用的訊息都會新增固定警告和最多三個序列化預覽，每個預覽都受設定值或模型相對位元組預算獨立限制。被截斷的引用會在該預算之外新增獨立省略通知；已儲存的完整 transcript 只有在被取回時才增加 token。精確上下文會保留在目標歷史中，直到目標壓縮遮蔽或摘要它；源工作階段變更不會新增更多 token。

#### KV Cache 影響

請求與快照是兩條連續、僅追加的目標訊息，並保留較早的可快取歷史。不同引用或源捕捉內容只改變新字尾；後續目標壓縮可能使從替換邊界起的複用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明跨工作階段引用何時不合適。它們是目前包約束。

- **不支援訊息正文檢索**：候選查詢會檢查標題，但不搜尋訊息主體。
- **標籤只來自投影**：已掛載工作階段的標籤來自即時投影切面，冷工作階段的標籤來自持久檢查點；若工作階段無法提供這兩者，則以其 id 作為標籤，也無法按標題找到。發現過程絕不讀取日誌：摺疊出一個標題需要處理整份日誌，而這段程式碼會在每次補全擊鍵時執行。在投影快取建立前持久化的工作階段，會在首次開啟時恢復標題並寫入檢查點。
- **受信任呼叫方邊界**：該服務假設主機有權讀取 `ctx.sessionQuery` 公開的每個工作階段；它不是面向模型的搜尋工具。
- **只投影文字**：不會在工作階段間傳播非文字 user 與 assistant 塊。
- **沒有即時連結**：引用是快照，不是 fork、恢復、訂閱或源工作階段變更。
- **transcript 搜尋按行進行**：字面短語可能跨越 JSON 片段行或包含跳脫字元；精確文字匹配需先解碼並拼接訊息片段。已儲存產物可能按後端策略過期。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
