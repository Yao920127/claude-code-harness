---
description: "面向使用者與維護者的日誌支援型工作階段標題說明，用於選擇標題來源、設定服務或排查標題狀態。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title

[English](README.md) | 中文

## 概述

使用 `dsh-session-title` 為每個工作階段提供用戶端可見標題，標題可以來自第一條符合條件的使用者訊息、可選非同步生成器或顯式使用者重新命名。已接受的標題在回放、恢復與分頁後仍然存在，但絕不會進入模型輸入。自動生成絕不會延遲主 agent（智慧代理）回應，較新的標題請求會取代舊工作。當用戶端需要帶可設定長度上限的持久標題，以及透過 `refresh()` 主動重新生成標題的路徑時，請選擇本包。

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

掛載服務，讓工作階段獲得用戶端可以顯示、且絕不觸及模型的標題。常用路徑是顯式的：載入工作階段儲存、以必填上限掛載服務，並可選掛載一個提供者外掛。

### 選擇標題來源

標題來自三個來源，最新者勝出。內建退回在設定上限內從第一條符合條件使用者訊息的開頭若干詞派生；已註冊提供者對符合條件的訊息生成標題；顯式 `rename()` 接受使用者提供的標題。只有人類 `user/message` 事件中的文字塊符合條件，空提示詞或非文字提示詞會等待後續符合條件的輸入。使用者來源的最新標題會釘住工作階段——後續使用者訊息不再安排自動修訂，顯式 `refresh()` 仍是有意的解釘手段。

### 最小設定

所有上限都是必填項；該庫不提供預設值。以三個上限掛載服務：

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-title'
  config:
    fallbackMaxWords: 8
    fallbackMaxBytes: 96
    maxTitleBytes: 120
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `fallbackMaxWords` | 必填 | 確定性退回中以空白分隔的最大詞數 |
| `fallbackMaxBytes` | 必填 | 退回允許的最大 UTF-8 位元組數；不得超過 `maxTitleBytes` |
| `maxTitleBytes` | 必填 | 接受任何來源標題的最大 UTF-8 位元組數 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-title)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 新增提供者

可選非同步提供者可透過 `ctx.sessionTitle.register(provider)` 註冊一個；第二次註冊會立即丟擲。隨附的模型支援提供者是[首訊息](../session-title-first-prompt-llm/README.zh.md)與[全訊息](../session-title-all-prompts-llm/README.zh.md)，兩者都使用共享的 [LLM（大語言模型）生成策略](../session-title-llm/README.zh.md)。提供者只有在帶標記、由迴圈建置的請求的確切路由與已記錄 `request/header` 匹配時才啟動，較新的修訂會取代並中止舊工作。

### 讀取標題

`get(session)` 從活躍或回放工作階段讀取摺疊出的最新標題，`foldSessionTitle(events)` 是對日誌的純摺疊。服務要求 `ctx.sessionProjections` 並註冊兩個單元：用戶端可見的 `title` 單元（供用戶端列表行使用的已接受標題字串）和僅供 host 使用的 `titleInput` 單元——後者摺疊第一條與最新一條合格訊息及其計數，使排程與退回讀取透過 `stateOf()` 達到 O(1)；某次提供者生成所需的完整合格字首，則會在執行時從工作階段日誌中掃描取得。顯式 `refresh(session)` 在需要時物化退回，然後對目前符合條件的訊息顯式執行已註冊提供者。

### 失敗與恢復

自動失敗會發出警告並保留最新標題；顯式 `refresh()` 在提供者錯誤或呼叫方取消時拒絕，取消不會復原已接受的退回事件。自動工作絕不會延遲主 agent 回應，其延遲完成會追加一個獨立純日誌事件而不開啟輪次，陳舊的完成結果無法追加。fork 出的工作階段會原樣繼承種子中的標題事件。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋標題設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

標題是持久的、僅寫入日誌的狀態：每個已接受的修訂都是 `session/title` 事件，`foldSessionTitle()` 選擇最新事件，因此標題像任何其他工作階段事件一樣在回放、恢復與分頁中存活。服務擁有排程、取代與接受；提供者負責生成。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務：設定、摺疊、退回排程、提供者註冊表、並行、`title` 投影單元 |
| [`src/normalize.ts`](src/normalize.ts) | 標題文字清洗、UTF-8 安全截斷與確定性退回 |
| [`src/types.ts`](src/types.ts) | `title` 投影鍵宣告的歸屬位置 |

### 生命週期與並行

每個工作階段的工作狀態維護一個修訂計數器、一個進行中的退回，以及待處理與活躍的提供者工作。較新的使用者訊息、提供者 dispose（資源釋放）、工作階段 dispose 或顯式重新整理都會透過 `AbortController` 中止舊工作；提供者、修訂、工作階段或訊號已陳舊的完成結果無法追加。顯式重新整理會在提供者工作之前預留修訂號；重疊的自動／顯式退回請求共享一個工作階段本地正在進行的追加操作。服務拆卸會取消排隊工作，並在解除安裝完成前等待不回應取消的呼叫結算。

### 規範化

已接受標題會清除終端控制序列、方向性與不可見控制符以及非空白的 C0/C1 控制符；空白被規範化，按位元組上限截斷時絕不切斷 Unicode 碼點。確定性退回在 `fallbackMaxWords` 與 `fallbackMaxBytes` 內取第一條符合條件訊息的開頭若干詞。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當服務約定不夠用時閱讀以下頁面。它們從子系統參考逐步進入在此插拔的模型支援提供者。

- [工作階段標題子系統](../../../docs/subsystems/session-title.zh.md)——持久標題狀態與提供者詞彙型別。
- [共享 LLM 標題策略](../session-title-llm/README.zh.md)——兩個隨附提供者共用的模型生成輔助模組。
- [首訊息標題提供者](../session-title-first-prompt-llm/README.zh.md)——根據第一條符合條件的使用者訊息生成標題。
- [全訊息標題提供者](../session-title-all-prompts-llm/README.zh.md)——根據所有符合條件的使用者訊息生成標題。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 工作階段標題狀態

#### 模型看到什麼

無。`session/title` 只寫入日誌，絕不會進入工作階段介面、`deriveMessages()`、系統提示詞、工具 schema 或請求字首。

#### Token 影響

退回與已接受的提供者修訂不會向主 agent 請求增加 token。可選提供者的獨立輔助請求由對應提供者包的文件說明。

#### KV Cache 影響

不影響主請求；標題事件不會改變其重建內容或快取鍵。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明標題服務不提供什麼。它們是目前包約束。

- **沒有標題刪除、搜尋或列表索引**——不經顯式 `refresh` 就解釘回自動標題、搜尋與列表索引不屬於此服務。
- **至多一個提供者**——註冊表有意只接受一個實作，因此部署若要組合相互競爭的標題策略，必須編寫一個自行負責優先順序的提供者。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
