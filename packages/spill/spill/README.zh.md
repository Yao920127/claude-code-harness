---
description: "spill 儲存服務：儲存超大工具文字或已捕捉的工作階段引用，並返回可用於取回內容的定位資訊。"
kind: "package-reference"
---

# @deepseek-ai/dsh-spill

[English](README.md) | 中文

## 概述

`dsh-spill` 讓外掛和工具透過公開的 `ctx.spillStore` API 儲存超大文字，並取得不透明定位資訊、精確位元組數與取回指引。當完整結果必須保持可取回、同時又不能填滿模型上下文時選擇它。設定 `dsh-spill-local` 可獲得本地持久化；當超大工具結果應變為有界預覽時，再新增 `dsh-spill-policy`。該 API 不提供保留、替換、取回或搜尋操作。儲存故障會使儲存操作拒絕，由呼叫方決定保留內聯內容還是讓操作失敗。

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

儲存 spill 產物的組合需要掛載一個後端——僅本包本身不儲存任何內容。`dsh-spill-policy` 決定工具結果何時 spill；`dsh-session-reference` 直接儲存截斷後的工作階段引用 transcript（文字記錄），不需要該策略。呼叫方使用 `ctx.spillStore.saveText()` 並明確指定歸屬；可選消費方透過 `ctx.get("spillStore")` 取得後端。

### 何時選擇

當部署需要在模型看到有界預覽後仍能取回全文時，選擇 spill 儲存，例如抓取的頁面正文或已捕捉的工作階段引用 transcript。前提是後端的定位資訊與取回指引在部署環境中可用；該服務不要求本地檔案系統存取。

### 最小可用組合

把後端與策略一起掛載；設定 `maxInlineTokens` 後，過大的圖文工具結果都會自動變成預覽加定位資訊。

```yaml
- name: '@deepseek-ai/dsh-spill-local'
- name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineTokens: 12500
```

### 儲存文字

掛載後端後，用所屬工作階段、來源描述、建議檔名與完整文字呼叫 `ctx.spillStore.saveText()`：

```text
const ref = await ctx.spillStore.saveText({
  owner: { sessionId: 'session-1' },
  source: { kind: 'tool', toolName: 'web_fetch', callId: 'call-1', label: 'result' },
  suggestedName: 'web_fetch.txt',
  content: fullText,
})
```

返回的 `SpillRef` 攜帶三個欄位：`locator`，後端產生的面向模型的不透明控制代碼（對 `dsh-spill-local` 是本地檔案路徑，對其他後端可能是 URI 或鍵）；`bytes`，寫入的精確 UTF-8 位元組數；`retrievalHint`，消費方展示給模型的指引——對本地後端而言是讀取或搜尋該路徑。消費方將定位資訊與指引一同呈現，絕不自行解析定位資訊。

### 歸屬與邊界

儲存按所屬工作階段分組：fork 後的工作階段從種子日誌繼承既有定位資訊，無需複製或更改歸屬，fork 後新產生的 spill 使用子工作階段 id。工作階段引用產物歸接收上下文的目標工作階段所有，而不是被引用的源工作階段。`suggestedName` 只是提示——後端會把它清理成單個安全路徑段，絕不把它當作可信路徑。預覽與 spill 決策由消費方負責；儲存與產物過期由後端負責。

### 故障與恢復

`saveText` 只在真實儲存故障時拒絕——權限不足、磁碟已滿或後端不可用。由呼叫方決定如何降級：已交付的策略把拒絕當作盡力而為處理，記錄警告並保留原始內聯結果，因此 spill 失敗絕不會把成功的工具呼叫變成錯誤或隱藏內容。如果沒有掛載後端，就沒有可儲存的目標；請在組合中載入 `dsh-spill-local` 或其他後端。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該服務背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包建立在一個分離與刻意的極簡之上：

- **約定、實作與策略保持分離。** 本包定義後端做什麼（`saveText`）；`dsh-spill-local` 實作它；`dsh-spill-policy` 決定何時觸發。各項關注點獨立演進與替換。
- **只有一個方法，別無其他。** 該 seam 不負責保留策略、結果替換或取回/搜尋 API——那些都有各自的歸屬包。
- **在 seam 處拒絕，絕不靜默降級。** 降級由呼叫方負責；seam 報告真實儲存故障。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：抽象 `SpillStore` 服務及其 `saveText` 約定 |
| [`src/types.ts`](src/types.ts) | 詞彙：`SaveTextSpill`、`SpillRef`、帶品牌型別 `SpillLocator`、`SpillOwner`、`SpillSource` |
| — | 不釋出執行時不變式伴生入口；除歸屬 seam 強制執行的約定外，本包不暴露獨立的事件序列或可變資料關係。 |

### 資料模型

`SaveTextSpill` 將儲存歸屬與描述性來源資訊分開。`SpillSource` 接受工具來源 `{ kind: "tool", toolName, callId, label }` 或 `{ kind: "session-reference", sessionId, label }`，後者的 id 標識被捕捉的源工作階段。工作階段引用絕不偽造工具呼叫 id。來源資訊與歸屬名稱空間都不授予讀取權限。消費方把返回的定位資訊視為不透明值，並與取回指引一同展示。

### 生命週期

後端繼承 `SpillStore` 並以外掛方式載入，註冊為 `ctx.spillStore`；每個上下文只有一個實作，第二次載入會失敗。執行 dispose（資源釋放）時會釋放該服務。抽象類本身不註冊任何內容——本包只提供約定與詞彙。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞彙逐步進入已交付後端、策略與設計依據。

- [spill 子系統](../../../docs/subsystems/spill.zh.md)——窮盡式詞彙、歸屬與後端關係。
- [spill 包對映](../README.zh.md)——三包家族與各自職責。
- [dsh-spill-local](../spill-local/README.zh.md)——已交付的本地檔案系統後端。
- [dsh-spill-policy](../spill-policy/README.zh.md)——決定最終結果何時過大的策略。
- [dsh-output-retention](../../util/output-retention/README.zh.md)——策略背後的預覽機制。
- [工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——能力邊界與設計依據。

-----

<a id="model-experience"></a>
## 模型體驗

spill 消費方將後端的定位資訊與取回指引渲染給模型，從而間接影響模型體驗。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 spill 儲存服務單獨使用時在哪些方面不完整。它們是目前的包約束。

- **沒有取回或刪除 API**——消費方只能渲染後端的定位資訊與指引；生命週期與存取語義仍由後端自行決定。
- **儲存不等於存取控制**——所屬工作階段區分寫入名稱空間，但不會授權透過定位資訊讀取內容；每個後端與取回消費方都必須自行強制執行存取邊界。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：尚未決定的探索方向與開放問題。它明確不具權威性。

#### 未來：執行器 spill 檔案整合

該 seam 只有 `saveText`；為既有執行器 spill 檔案提供儲存檔案或連結/複製路徑（例如規範化 bash 臨時檔案），以及為 subagent 展開提供工具自有 spill，仍然延期，見[工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)。

#### 未來：非本地後端與清理

遠端或資料庫後端仍是開放方向。本地後端執行其[啟動清理策略](../spill-local/README.zh.md#startup-cleanup)；該服務未定義按工作階段清理或重新整理定位資訊的 API。

</details>
