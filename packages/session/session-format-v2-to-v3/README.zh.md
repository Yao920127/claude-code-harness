---
description: "完整的 V2 到 V3 工作階段轉換：系統頭節點、經過審計的引用、PTC 與預設名稱、規範信封、保留與拒絕規則。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v2-to-v3

[English](README.md) | 中文

## 概述

將受支援的已釋出 V2 工作階段恢復為 V3，同時保留歷史請求含義。本頁是這條相鄰遷移邊的單一規範真源：先說明轉換、保留與拒絕的內容，再單獨說明原生 V3 准入。本庫將系統提示詞提升為訊息，重對映本地事件引用，轉換 PTC 與預設名稱，並規範化信封。持久化透過靜態目錄使用本庫；本庫不讀取或釋出檔案。

## 目錄

- [使用本包](#use-this-package)
- [V2 到 V3 規範](#v2-to-v3-specification)
  - [頭部與預設引用](#header-and-presets)
  - [系統頭節點與訊息身份](#system-head)
  - [序列引用與繼承](#sequence-references)
  - [PTC 詞彙](#ptc-vocabulary)
  - [規範信封與工具錯誤](#canonical-envelopes)
  - [投遞保護](#delivery-guards)
  - [源審計與拒絕](#source-audit)
- [原生 V3 准入](#native-v3-admission)
- [理解實作](#understand-the-implementation)
- [深入探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 使用情境

使用[目錄](../session-format-catalog/README.zh.md)恢復工作階段。直接匯入用於目錄組裝和測試；本庫沒有 Cordis 掛載設定。[公共匯出](src/index.ts)提供遷移宣告、已釋出 V2 源編解碼器、V3 目標編解碼器、目標頭驗證器和目標恢復器。

### 入口

僅頭部操作不會轉換或驗證事件正文：

```text
const targetHeader = sessionFormatV2ToV3.migrateHeader(sourceHeader)
```

完整恢復將解碼後的事件送入新的階段，並驗證目標產物。呼叫方不得將階段的部分輸出視為成功恢復：錯誤可能出現在後續事件或 `finish()`。[格式協定](../session-format/README.zh.md)負責階段排程與目錄錯誤處理；[JSONL 持久化](../session-persistence-jsonl/README.zh.md)負責讀取準備和不可變後繼代的釋出。

-----

<a id="v2-to-v3-specification"></a>
## V2 到 V3 規範

整條遷移邊不是恆等轉換。它保留源事件的相對順序、時間戳和每個歷史請求的含義，但插入的系統事件會改變事件數、稠密序列位置、本地引用和繼承切點。PTC/預設轉換及最終信封規範化不新增事件。只有下文列出的欄位發生變化；保留承諾適用於已接納的輸入，而非任意未經審計的擴充功能。

<a id="header-and-presets"></a>
### 頭部與預設引用

邏輯頭部將 `version: 2` 改為 `version: 3`。它保留 `id`、`createdAt`、`isSeeded`、`delegationDepth`，以及已接納的可選欄位 `cwd`、`parentSession` 和 `origin`。在 `header.agentPreset` 和每條 `agent-preset/selected.data.agentPreset` 中，精確匹配的預設標識 `code` 變為 `ptc`，包括繼承與本地選擇。其他字串和缺失的頭部預設保持不變。選擇載荷要求字串預設標識，並拒絕未經審計的成員。

此轉換不檢查已安裝預設，也不改寫其他位置的 `code`。已釋出 V0/V1 資料僅在經過凍結的前代遷移邊到達 V2 後接受此轉換。原生 V3 自定義預設標識不被重新命名，`settings.yaml` 不屬於本包範圍。

<a id="system-head"></a>
### 系統頭節點與訊息身份

首個 `step/start` 後立即追加空 `system/message`，即使該步驟在發出請求前中止。後續步驟不再建立頭節點。沒有步驟也沒有 surface 的日誌不會獲得頭節點或虛構請求。

在每條 `request/header` 處，缺失的 `data.header.system` 表示空提示詞；否則，其字串與目前提示詞進行精確比較。發生變化時，在該請求頭之前立即插入系統訊息，恰好替換目前受保護的頭節點，並在 `sourceEventSeqs` 中引用它。提示詞不變時不插入訊息。空字串和缺失欄位會清空先前的提示詞；僅含空白的字串仍為非空文字。每個請求頭都會移除 `data.header.system`，無論是否需要替換。

合成訊息攜帶開放步驟的 `turn` 和 `step`、錨點事件的 `time`、角色 `system`，以及來源 `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }`。空提示詞使用 `content: []`；其他提示詞使用包含精確字串的單個文字塊。首次追加沒有源事件引用；每次替換的兩個端點及唯一源引用都使用前一頭節點的目標序號。空頭節點保持受保護，但不產生模型訊息。

每個合成標識由 `v2-to-v3-system-` 加上 `JSON.stringify(['session-format-v2-to-v3', sourceHeader.id, anchor.seq, anchor.type])` 的十六進位制 SHA-256 構成。首次建立的錨點是源 `step/start`，替換的錨點是提示詞變化的 `request/header`。與已生成或源訊息標識的衝突均被拒絕，不受遇到順序影響；檢查範圍包括收件箱插入訊息與標題請求訊息中的標識。現有訊息標識絕不改變。特別是，`TOOL_NOT_STARTED` 修復標識保留規範的歷史 `interrupted-tool-result-<callId>-<integer>` 字尾；該字尾不是目標序列座標。

<a id="sequence-references"></a>
### 序列引用與繼承

源事件必須從零開始稠密排列。每個原始事件在其前面的插入完成後獲得目標位置。[引用對映器](src/references.ts)僅修改以下同產物引用；每個被引用的源位置必須指向已建立對映的更早事件：

| 所有者 | 重映射欄位 |
|---|---|
| Surface 信封 | `sourceEventSeqs[]`；規範重新命名前的 `surfaceOp.start/end` |
| `command/done.data` | 存在時的 `sourceEventSeq` |
| `compaction/summary.data` 和 `compaction/prune.data` | `shadowedRange.start/end` 和 `shadowedSeqs[]` |
| `session/title.data` 和 `session/title-llm-request.data` | `messageSeqs[]` |

不存在遞迴數值欄位改寫。投遞的 `throughSeq` 和 `sessionFormatVersion`、工作階段引用的 `capturedThroughSeq` 和 `capturedFormatVersion`、工作流本地 `seq`、流塊索引、輪次/步驟編號、收件箱索引、token/位元組計數以及所有標識都保留源值。內嵌 assistant 流、模型回放狀態、工具參數/結果、標題請求輸入文字及 `data.system` 保留已記錄的含義。壓縮（compaction）載荷端點保持 `start/end` 名稱；僅信封替換端點被重新命名。

對於有種子的工作階段，最後一條帶有 `data.inherited: true` 的 `session/end-seed` 標識源切點。其源序號等於繼承事件數，不含該標記；其對映後的目標序號即目標切點。此前的合成事件屬於繼承部分，此後的屬於本地部分。未標記繼承的結束標記不建立切點。若提供 `sourceInheritedEventCount`，則必須一致；有種子但沒有標記的日誌，以及無種子卻有繼承標記的日誌都會被拒絕。無種子階段公開 `headerInheritedEventCount: 0`；有種子階段保持未知，直到 `finish()` 推導精確切點。這也支援前一階段改變事件數、無法在 EOF 前提供切點的 V0/V1 遷移鏈。

<a id="ptc-vocabulary"></a>
### PTC 詞彙

精確的事件標籤 `tool/code-dispatch-start` 和 `tool/code-dispatch` 變為 `tool/ptc-dispatch-start` 和 `tool/ptc-dispatch`。其載荷值保持不變。僅在以下三個位置的 `source.kind === 'plugin'` 時，精確匹配的外掛歸屬 `tools-code-mode` 才變為 `tools-ptc`：

- `user/message.data.source.plugin`
- `agent/inbox/spliced.data.inserted[].source.plugin`
- `session/title-llm-request.data.messages[].source.plugin`

相似外掛名、其他來源種類、任意文字、巢狀 JSON 及包含 `:code:` 的歷史標識保持不變。此轉換不重新命名 `run_code` 或其 `code` 參數。已使用任一 V3 保留 PTC 標籤的 V2 源事件即使可忽略也會被拒絕；不透明源擴充功能不得透過遷移獲得目前生命週期含義。

<a id="canonical-envelopes"></a>
### 規範信封與工具錯誤

結構插入和引用重對映完成後，規範化將原始與合成事件上的精確信封替換物件 `{ op: 'replace', start, end }` 轉為 `{ op: 'replace', startSeq, endSeq }`。它僅從 `request/header.data.header` 中省略精確的 `tools: []` 和 `adapterDefaults: {}`。這個最終操作保留其輸入事件數、座標、時間戳、順序與繼承切點；既不重複對映，也不規範化 `config.stop: []` 等無關空值。

四種 V3 surface 型別（`system/message`、`user/message`、`assistant/message`、`tool/result`）都要求 `surfaceOp`。僅 assistant 訊息禁止 `sourceEventSeqs`；其他型別提供的列表必須非空、唯一，且僅引用更早的事件。已知僅日誌事件對這兩個 surface 中繼資料欄位均不允許。替換不允許別名或額外來鍵。端點按目前 surface 順序而非數值序號順序標識閉區間；恢復會檢查存活成員、端點順序與完整源事件覆蓋。

源 surface 事件本就要求位置標記；遷移不虛構缺失的追加標記。帶有 `data.error` 的 `tool/result` 要求其唯一工具結果塊攜帶 `isError: true`。失敗結果可以省略結構化錯誤身份。矛盾結果會被拒絕，絕不透過新增 `isError` 或刪除診斷來修復。普通工具與 PTC 生命週期關係仍須在這些事件本地檢查後驗證。

<a id="delivery-guards"></a>
### 投遞保護

V2 `session-log-deepseek/delivery-accepted` 若攜帶 `data.sessionFormatVersion === 3`，就會被拒絕，而非提升為 V3 上傳水位。其他代的標記保留其載荷，包括缺失代次和非目標的未來代次。V2 代標記必須具有有效且更早的 `throughSeq`；若它指向另一個工作階段，則僅允許出現在具有 `parentSession` 的工作階段的繼承字首中。本地的外部工作階段標記或沒有父工作階段中繼資料的外部工作階段標記會被拒絕。標記的信封序號正常變化；其捕捉的接收座標不變。

<a id="source-audit"></a>
### 源審計與拒絕

遷移分類[已釋出 V2 事件清單](../session-format-v1-to-v2/src/dispositions.ts)，包括僅日誌的 `assistant/attempt`，以及 `feedback/message-put` 和 `feedback/message-delete`。[載荷驗證器](src/payload.ts)應用精確的已接納信封和載荷成員，以及已釋出巢狀驗證。未知事件（即使可忽略）以及被檢查記錄中未經審計的成員均被拒絕。訊息來源分類覆蓋下表的五個訊息位置：未知來源種類會被拒絕，agent（智慧代理）中繼歸屬則被接納，但標識不會被解釋為工作階段引用。

內容審計僅接納 `text`、`reasoning`、`image`、`file`、`tool-call` 和 `tool-result`。它驗證歸本格式所有的塊欄位，並在以下有限位置遞迴審計每層巢狀的 `tool-result.content`：

| 所有者 | 審計內容 |
|---|---|
| 五個 Message 位置 | `user/message.data.content`；`assistant/message.data.message.content`；`tool/result.data.message.content`；`agent/inbox/spliced.data.inserted[].content`；`session/title-llm-request.data.messages[].content` |
| 排隊的團隊訊息 | `team/message/queued.data.message.content`；歷史 Team 載荷保持 `version: 1` 並帶有 `message.delivery` |
| 壓縮輸出 | `compaction/summary.data.summary` 和可選的 `compaction/summary.data.rawOutput` |
| PTC 前代輸出 | `tool/code-dispatch.data.content` |
| 內嵌 assistant 流 | `assistant/message.data.stream[]` 和 `assistant/attempt.data.stream[]` 中的原始 `type: 'chunk'` 記錄：`block-end` 的 `chunk.block` 和 `block-start` 的 `chunk.blockType`，包括尚無完整塊的起始記錄 |

所有位置共用同一歷史種類集合；未完成的起始記錄不能引入未知種類。未知種類和歸本格式所有的畸形塊都會拒絕整次遷移；目錄恢復報告 `SessionFormatUnsupportedMigrationError`。診斷標明源事件型別、源序號、包含索引的完整載荷路徑和違反的規則。未知種類錯誤標明違規種類；已知塊的畸形錯誤標明種類和欄位錯誤。畸形內容容器或缺失塊報告其位置，而不虛構種類。拒絕時，持久化保留源位元組且不釋出後繼代。

准入不改寫內容。特別是，內嵌流雖然接受歸本格式所有的塊欄位檢查，其位元組仍保持不變。工具參數、`replayState.response` 和 `replayState.blocks` 保持不透明；任意 JSON 內的同名欄位不會觸發此審計。檔案附件中繼資料接受驗證，但標識或位元組計數不會被解釋為 Session 引用。這不是通用 schema 審計或遞迴座標推斷，原生 V3 擴充功能准入與此分開。

首個步驟前的 surface 事件、開放步驟外的提示詞變化或生成標識衝突，會丟擲 `SessionFormatUnsupportedMigrationError`，而非移動事件或虛構歸屬。源欄位格式錯誤、缺失位置、無效引用、不一致切點、投遞違規與矛盾工具結果，會在直接階段或目標驗證器中丟擲格式錯誤。目錄將遷移階段和轉換後目標驗證失敗報告為型別化的不支援遷移；物理解碼失敗仍按所選恢復策略歸類為損壞。本遷移邊不修復源或目標，不退回代次，也不改寫檔案。

-----

<a id="native-v3-admission"></a>
## 原生 V3 准入

已標記為 V3 的輸入不執行 V2 到 V3 遷移。使用 `validation: 'transformed'` 的原生目錄讀取僅執行編解碼器檢查，跳過產物恢復；完整關係、開放步驟歸屬、受保護頭節點操作與詞彙檢查需要 `restoreReleasedV3Artifact` 或目錄的 `validation: 'current'`。以下規則區分這些恢復檢查與編解碼器准入；它們不是額外的歷史轉換：

- 原生 V3 接納歷史內系統訊息追加、非頭系統節點替換和非頭系統節點壓縮。系統訊息要求有效載荷及匹配的開放步驟歸屬。首個 surface 系統頭節點只能被恰好覆蓋該頭節點的系統訊息替換；普通替換和壓縮不能消耗它。遷移本身只產生初始頭節點與頭節點替換，不產生依賴路由的歷史內更新。
- 原生 V3 拒絕任何 `request/header.data.header.system`，包括空值或格式錯誤值，並拒絕非規範替換拼寫及兩個空請求頭可選欄位。它保留空白內容、空停止列表和已接納的巢狀 header/source/data 擴充功能。此擴充功能准入不會擴大 V2 源審計或精確的邏輯工作階段頭欄位範圍。
- 必需的前代 PTC 標籤即使已安裝也會被拒絕。已退役或未知的可忽略事件（包括其邏輯中繼資料）保持不透明，且不能滿足目前 PTC 關係。已安裝的普通事件新增項作為僅日誌信封接納；未知必需型別由識別詞彙的恢復階段拒絕。物理編解碼器仍執行已釋出的分幀與源事件區間編碼規則。
- V3 事件本地檢查在編碼前及解碼後執行。原始行的已退役系統頭欄位、畸形系統載荷和必需前代 PTC 的拒絕先於可恢復抑制執行，包括損壞行之後。嚴格讀取立即拒絕規範錯誤。可恢復的規範解碼不產出首個無效事件及其字尾；後續 `turn/end` 建立提交事實並拒絕該字尾。只有已接納的繼承標記計數；有種子的已接納字首若沒有標記則被拒絕。未分類事件中繼資料會延遲到識別詞彙的恢復階段，而不是作為規範損壞丟棄，因此不能隱藏未知必需型別。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

[階段](src/migration.ts)擁有每份產物獨立的同步序列對映、訊息身份集合和提示詞/生命週期狀態。緊湊事件段增量展開。[編解碼器](src/codec.ts)複用凍結的 V2 分幀；[恢復器](src/validation.ts)先驗證 V3 結構，再向凍結的普通關係驗證提供私有 system/PTC/修復標識與端點檢視。該檢視為投遞檢查保留實際目標代次，且絕不對外返回：恢復返回原始 V3 產物與身份。凍結的 V0 到 V1 和 V1 到 V2 語義保持不變。本庫不擁有可獨立觀察的註冊或狀態副本，因此不釋出執行時不變數伴隨入口。

[組合目錄測試](tests/combined-migration.spec.ts)驗證轉換組合與原生重新開啟；[遷移測試](tests/migration.spec.ts)和[規範測試](tests/canonical-envelopes.spec.ts)固定保留與拒絕規則。[持久化整合](../session-persistence-jsonl/tests/v2-ptc-migration.spec.ts)負責釋出證據。[已釋出格式決策](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)負責將相鄰組合測試與原生准入測試分開的依據。

</details>

-----

<a id="further-exploration"></a>
## 深入探索

- [已釋出 V1 到 V2](../session-format-v1-to-v2/README.zh.md) — 凍結的前代轉換與源編解碼器。
- [系統提示詞 surface 決策](../../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.zh.md) — 提示詞歸屬與頭節點保護依據。
- [規範 V3 信封決策](../../../.agents/notes/implemented/architecture/2026-09-06-v3-canonical-session-envelopes.zh.md) — 嚴格准入與驗證歸屬。

-----

<a id="model-experience"></a>
## 模型體驗

### 歷史日誌恢復

#### 模型看到什麼

每個歷史請求保留其提示詞文字與普通訊息內容。空系統頭節點不產生模型訊息。PTC 歸屬使用 `tools-ptc`；分發事件仍僅寫日誌。

#### Token 影響

遷移邊不新增模型可見文字；它將已記錄的提示詞從請求頭移入訊息歷史。

#### KV Cache 影響

遷移邊保留歷史請求含義與模型設定；它不保證提供者快取命中，也不保證與原生 V3 錄製位元組相同。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

- **歷史預設歧義** — 已釋出 `code` 引用無法區分與舊內建標識同名的自定義預設；[精確重新命名](#header-and-presets)不依賴主機。
- **不遷移檔案或設定** — 本包絕不修改已提交代或 `settings.yaml`。持久化負責釋出最終後繼代；已有 V3 代不重新執行其入邊。格式釋出狀態見[狀態記錄](../../../docs/session-format-status.zh.md)，相容性義務見[已釋出格式策略](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
