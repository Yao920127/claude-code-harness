---
description: "工具結果保留：文字和圖片共享 token 預算，並透過完整結果檔案恢復省略內容。"
kind: "package-reference"
---

# @deepseek-ai/dsh-spill-policy

[English](README.md) | 中文

## 概述

將過大的文字和圖片結果限制在共享的估算 token 預算內。模型收到按原順序保留的首尾內容，以及完整結果檔案的路徑。圖片儲存在附件儲存中，結果檔案記錄其可讀取路徑。省略 `maxInlineTokens` 會停用策略，無法儲存可恢復內容時保留原結果。

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

將策略與 spill 後端一起掛載。執行後策略接受結果之後，文字和圖片共享設定的預算。

### 最小設定

掛載 spill 後端，並以估算 token 數設定 `maxInlineTokens`：

```yaml
- name: '@deepseek-ai/dsh-spill-local'
- name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineTokens: 12500
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxInlineTokens` | 省略 | 保留的文字、圖片、圖片說明和提示的估算 token 上限；省略時停用策略 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-spill-policy)是每個受支援欄位的窮盡式真源。負數或小數上限會讓外掛載入失敗，而不是破壞每次呼叫的行為。

### 模型看到什麼

過大的結果保持原始順序。扣除省略提示後，兩端各使用剩餘預算的一半；文字可以切分，圖片整張保留或省略。省略區間中的圖片也會被省略。成功替換的內容不超過設定的 token 估算預算：

```text
<retained head/tail preview>

(Omitted N bytes. Full formatted result stored at: /…/session-…/…-web_fetch.txt. Use read with offset/limit, or grep this path to search within it.)
```

提示也會報告省略的圖片數量。預算容不下預覽時允許只返回提示；連提示也超出上限時保留原內容。完整結果檔案儲存全部已接受文字，並在每張圖片的位置記錄附件路徑，模型可先用 `read` 讀取，再用 `read_image` 檢視。圖片位元組不複製到這個檔案中。本地附件物件的持久儲存獨立於 spill 檔案清理。

### 哪些結果會受影響

策略接受文字和圖片序列。預算內結果、`read`、被阻止的決策、值替換以及其他內容塊型別會原樣透過。純文字巢狀結果只限制日誌副本。提供者或工具在此前應用的限制無法在這裡恢復。

### 盡力而為的故障行為

缺少歸屬或 spill 後端、儲存失敗、缺少模型圖片計量或圖片路徑無法在執行環境讀取時，策略記錄警告並保留原內容。策略不會用無法讀取的路徑替換圖片。

### 持久日誌副本

PTC 程式收到完整的規範值。含圖片的子結果在轉發給模型前設定上限；全部圖片被省略時，模型仍會收到保留的文字和讀取提示。分發日誌使用相同的保留內容。純文字子呼叫的日誌，包括 `read`，非同步設定上限，不延遲程式取得回傳值。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該策略背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

純保留函式按成本選擇有序內容，外掛負責策略、讀取提示和儲存呼叫。文字使用現有 token-meter 估算。圖片使用目前模型的 `imageRequestPricing`，並計入說明文字。DeepSeek 模型複用提供者的圖片尺寸計算器。預算是估算值，不保證與實際分詞結果完全一致。

### 兩條分支

以 prepend 註冊的 `tools/post-execute` 監聽器先委託，再限制已接受的內容。`tools/ptc-dispatch-log` 共用同一輔助函式。MCP 的 `projectContent` 在這些策略之前安裝真實圖片塊；後續內容替換、值替換或阻止仍然生效。

<a id="shared-notice-ownership"></a>
### 共享通知的所有權

瀏覽器安全入口 `./notice` 負責 `formatSpillNotice(omitted, ref, images)` 和 `hasSpillNotice(text)`。它識別歷史的僅位元組提示和包含整張圖片數量的提示，不改寫已有記錄。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` 驗證、兩個 waterfall 監聽器、共享替換輔助函式 |
| [`src/notice.ts`](src/notice.ts) | 瀏覽器安全的通知格式化與識別，以 `./notice` 釋出 |
| [`src/retention.ts`](src/retention.ts) | 有序圖文首尾保留的純函式 |
| — | 不釋出執行時不變式伴生入口；除在所屬 seam 處強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |

### 故障模式

無法恢復內容或計量失敗時保留輸入，並記錄原因。負數、小數或非安全整數預算會使外掛載入失敗。包含不支援的內容塊型別的結果保持原樣。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。

- [spill 儲存服務](../spill/README.zh.md)——策略替換背後的 `saveText` 約定。
- [dsh-spill-local](../spill-local/README.zh.md)——儲存 spill 文字的本地後端。
- [Token meter](../../llm/token-meter/README.zh.md) — 共享文字估算和模型圖片計量。
- [工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——能力邊界與設計依據。

-----

<a id="model-experience"></a>
## 模型體驗

### 過大的文字和圖片結果

#### 模型看到什麼

保留的字首和字尾維持圖片順序，並在省略區間顯示 `[...]`。末尾提示說明省略的文字位元組數、整張圖片數量及完整結果路徑。讀取該檔案可以找到省略的文字和圖片地址。

#### Token 影響

成功替換的結果在共享文字估算和目前模型圖片計算器下不超過 `maxInlineTokens`，包括提示和圖片說明文字。實際用量以提供者報告為準。

#### KV Cache 影響

僅追加；新可見內容位於可重用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明策略在哪些情況下無法提供幫助。它們是目前的包約束。

- **文字識別無法認證輸出來源**——工具也能列印相同的通知文字；`hasSpillNotice` 識別的是文字約定，不能證明策略儲存過結果。
- **無法恢復或計量**：圖片要求模型計算器和執行環境可讀取的附件路徑，否則保留原內容。不支援的內容塊、被阻止的回饋和 `read` 也會原樣透過。
- **通知無法容納時會停用該次呼叫的替換**——上限極小或定位資訊很長時，後端已經儲存了無引用的 spill，但過大的原始結果仍留在內聯位置。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放方向。它明確不具權威性。

#### 未來：逐工具設定

逐工具選擇退出或逐工具策略宣告仍然延期；內建的 `read` 跳過已覆蓋已知迴圈，第二個真實工具需求才能證明設定的合理性。

#### 未來：更早的 spill

策略只處理最終已接受的內容。此前的提供者截斷和工具自身的輸出限制仍由各自負責。

</details>
