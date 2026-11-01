---
description: "凍結的已釋出 v0 工作階段標頭、事件與打包行解碼器，以及到 v1 的恆等轉換。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v0-to-v1

[English](README.md) | 中文

## 概述

本包逐個物理行解碼已釋出的 v0 工作階段 JSONL，並生成共享佈局的 v1 格式，以還原歷史工作階段。除把版本從 0 改為 1 外，它會保留經過驗證的標頭與事件，並僅應用 v0 持久化接受的有限舊格式規範化。畸形或不支援的歷史記錄會在目前還原器執行前使遷移失敗，同時保留原始檔以便恢復。該遷移只接受凍結的第一方事件清單，且不釋出或選擇後續格式遷移。

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

### 何時使用

持久化透過 `dsh-session-format-catalog` 取得該遷移邊；功能組合不會掛載它。只有在裝配或測試靜態已釋出格式目錄時，才直接匯入本包。它不釋出執行時不變式伴生入口，因為本包沒有狀態可能彼此分歧的、可獨立觀測的執行時註冊項；decoder 與 migration stage 的狀態只屬於一次還原。

### 入口

```text
const decoder = releasedV0SessionFormatCodec.createDecoder(physicalHeader, 'recoverable')
for (const row of physicalRows) decoder.decodeRow(row, migrationContext)
const inheritedEventCount = decoder.finish(migrationContext)
const stage = sessionFormatV0ToV1.createStage(stageInput)
stage.transformEvent(event, migrationContext)
const targetInheritedEventCount = stage.finish(migrationContext)
```

`releasedV0SessionFormatCodec` 讀取精確的 v0 header 與物理行，包括打包的 Assistant 增量和範圍編碼的來源序號。它的 decoder 透過 `emitEvent()` 與 `emitRun()` 發出單個事件或 codec 自有的緊湊 run。`sessionFormatV0ToV1` 為每次還原建立一個有狀態 Stage；靜態 catalog 連線該 decoder 與 Stage，使遷移無需保留物理行陣列。`releasedV1SessionFormatCodec` 為 v1 物理佈局暴露相同的逐行 decoder，同時不凍結普通事件詞表。

Alpha 遷移邊會拒絕凍結清單之外的所有事件型別，包括帶有 `ignorable: true` 標記的未知事件。它也會拒絕意外的 payload 成員。`tool/result.meta` 與巢狀 PTC `arguments` 是顯式的不透明 JSON 欄位；遷移會原樣保留它們，不把其中的數字解釋為工作階段序號。內容塊中未知的 `type` 分支、訊息來源中未知的 `kind` 分支、assistant 結束原因中未知的 `kind` 分支與 `turn/end` 原因中未知的 `kind` 分支保持 owner-opaque JSON，已知分支則接受結構驗證。

有限的歷史規範化會把 `steering/message` 轉換為 `user/message`、把 `compact/*` 事件重新命名為 `compaction/*`、移除 `turn/start.trigger`、轉換已停用的 `turn/end` reason、新增目前訊息包裝層，併為舊訊息、retry chain 與壓縮（compaction）組補充確定性 id，同時移除已停用且重複的 `request/header.header.messagePrefix`。已停用的 `request/header-delta`、`mode/set` 和 `request/header` fallback reason 會使遷移失敗。除此之外，任何事件、引用、來源或 payload 事實都不得改變。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

物理 codec 會以行為原子單位驗證每個打包行，以緊湊 run 發出它，且絕不修改已解析輸入。可恢復解碼會丟棄完整的故障行並保留此前字首，除非後續成功解碼的 `turn/end` 證明故障區域已經提交。增量 normalizer 只保留 message、retry 與未結束的壓縮 identity；catalog 會在最終目前產物上執行完整關係驗證。

| 檔案 | 職責 |
|---|---|
| [`src/codec.ts`](src/codec.ts) | 凍結的 v0/v1 物理標頭、打包行與來源序號範圍 |
| [`src/dispositions.ts`](src/dispositions.ts) | 已釋出 v0 事件與 payload 成員清單 |
| [`src/payload-validation.ts`](src/payload-validation.ts) | 每種已釋出 v0/v1 事件型別的凍結巢狀 payload 語義 |
| [`src/relationships.ts`](src/relationships.ts) | 凍結的跨事件配對：輪次、步驟、工具開始與結果、重試、壓縮、標題 |
| [`src/migration.ts`](src/migration.ts) | 恆等遷移邊與舊格式規範化 |
| [`src/validation.ts`](src/validation.ts) | 精確的源與目標驗證 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [遷移機制](../session-format/README.zh.md)——純遷移鏈與編解碼約定。
- [靜態目錄](../session-format-catalog/README.zh.md)——由建置負責的裝配。
- [工作階段子系統](../../../docs/subsystems/session.zh.md)——目前邏輯工作階段語義。

-----

<a id="model-experience"></a>
## 模型體驗

### 歷史還原

#### 模型看到什麼

沒有直接內容。還原後，`deriveMessages()` 會看到在 v1 下保持不變的規範已釋出 v0 事件；有限歷史結構會透過規定的目前包裝層產生相同的模型可見內容。

#### Token 影響

不直接產生 token。

#### KV Cache 影響

對規範 v0 歷史沒有直接影響。有限 normalizer 會在生成目前包裝層與確定性標識時保留模型可見內容。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **封閉的第一方清單**——按照目前 Alpha 策略，未知的外部外掛事件會使遷移失敗。
- **單個相鄰遷移邊**——本包不執行釋出，也不選擇後續遷移。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
