---
description: "純函式式相鄰工作階段格式規劃、無損 JSON 值檢查、僅標頭遷移與物理編解碼分派。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format

[English](README.md) | 中文

## 概述

`dsh-session-format` 讓持久化程式碼可以直接還原目前工作階段，或在只消費一次物理行的同時組合唯一的相鄰遷移序列。一次還原會讓呼叫方擁有的已解析值流經有狀態 Stage，不複製或凍結中間產物。物理分幀、壓縮、不可變 generation 命名、排他釋出和 Cordis 生命週期行為不屬於本庫。

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

當持久化或格式目錄程式碼需要分類物理工作階段 header、還原目前邏輯值或組合已釋出相鄰遷移時，使用本庫。它不是 Cordis 外掛，也沒有 profile 掛載行。它不釋出執行時不變式伴生入口，因為每個已完成操作都會驗證結果；decoder 與 transformer 狀態只屬於一次尚未完成的流式還原，絕不在多次還原間共享。

### 入口

```text
const catalog = createSessionFormatCatalog({ currentVersion, codecs, currentEncoder, migrations, restoreCurrent, restoreTransformedCurrent, restoreCurrentHeader })
const descriptor = catalog.readHeader(physicalHeader)
const restore = catalog.createRestore(physicalHeader, { recovery: 'recoverable', validation: 'transformed' })
for (const row of physicalRows) restore.decodeRow(row)
const current = restore.finish()
const headerRecord = catalog.encodeCurrentHeader(current.header, current.inheritedEventCount)
const eventRecords = current.events.map(catalog.encodeCurrentEvent)
```

`createSessionFormatCatalog()` 接收每個受支援版本的一個凍結 codec、目前格式的逐記錄 encoder、每組相鄰版本的一個遷移，以及目前產物與 header 還原器。`readHeader()` 在不讀取事件的情況下返回 `current`、`migration-required`、`unsupported` 或 `malformed` 描述符。正文讀取方建立一次 restore，把每個已解析物理行傳給 `decodeRow()`，再呼叫一次 `finish()` 獲得目前產物。寫入方逐條編碼其 header 與事件。

`recovery` 選項決定嚴格拒絕故障行，還是執行可恢復字尾處理。`validation: 'current'` 會執行所有已安裝的 current 格式驗證。`validation: 'transformed'` 會在歷史遷移後執行已釋出的 current 格式驗證；已經是 current 的輸入則只接受其 codec 的物理驗證。

可恢復解碼器返回已接受的邏輯字首。編解碼器可以丟棄一個格式錯誤或序號不連續的行及其未提交字尾，但後續成功解碼的 `turn/end` 會使原始問題成為致命錯誤。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

遷移鏈在建構時驗證唯一且無缺口的順序。源切點可以在 EOF 前保持未知；依賴頭部切點的 Stage 拒絕缺失值，而基於標記的 Stage 從已發出的事件推導切點。每個 Stage 在完成時返回精確的目標切點，且必須與預宣告切點一致。Catalog 把一個行 decoder 與有狀態的相鄰事件 transformer 組合起來，只保留其有界狀態與最終目前事件，並在 `finish()` 時執行目標驗證；只有呼叫方決定是否釋出該結果以及如何釋出。

| 檔案 | 職責 |
|---|---|
| [`src/chain.ts`](src/chain.ts) | 相鄰計劃建構與目前格式繞過 |
| [`src/catalog.ts`](src/catalog.ts) | 物理版本分派與標頭分類 |
| [`src/json.ts`](src/json.ts) | 分離的無損 JSON 快照與通用座標驗證 |
| [`src/filename.ts`](src/filename.ts) | 持久化、匯出與 fixture（測試前置資料）共用的規範 `session[.vN].jsonl` 檔名 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [已釋出 v0 到 v1 遷移邊](../session-format-v0-to-v1/README.zh.md)——凍結的歷史解碼與恆等轉換。
- [靜態目錄](../session-format-catalog/README.zh.md)——第一方編解碼器與遷移裝配。
- [JSONL 持久化](../session-persistence-jsonl/README.zh.md)——持久化分幀與代際釋出。

-----

<a id="model-experience"></a>
## 模型體驗

### 工作階段還原

#### 模型看到什麼

沒有直接內容。消費方透過 `deriveMessages()` 從經過驗證的目前產物重建模型歷史。

#### Token 影響

不直接產生 token。

#### KV Cache 影響

沒有直接影響。遷移若改變目前歷史，可能改變由請求重建邏輯擁有的快取身份。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **最終目前歷史仍常駐記憶體**——流式處理只保留有界中間狀態，但返回的目前事件陣列和必需的序號重對映表仍為 O(事件數)。
- **僅支援相鄰整數版本**——本庫不暴露 span、穩定事件身份或通用引用重寫代數。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
