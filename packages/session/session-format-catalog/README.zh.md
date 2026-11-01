---
description: "供持久化讀取方使用的建置期靜態第一方 Session 格式編解碼器與相鄰遷移裝配。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-catalog

[English](README.md) | 中文

## 概述

`dsh-session-format-catalog` 為持久化提供一個確定性的 Session 格式讀取器，且無需查詢已掛載外掛。它裝配從最早受支援格式到[目前寫入格式](../../../docs/session-format-status.zh.md)的編解碼器與相鄰遷移邊，在模組初始化時驗證完整且無缺口的遷移鏈，並透過 `sessionFormatCatalog` 暴露物理分派、僅 header 分類、單遍行還原和目前格式逐記錄編碼。

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

當持久化與測試支援讀取方需要在任何功能外掛掛載前取得完整第一方已釋出格式清單時，匯入本庫。功能組合不會註冊或重排其條目。它不釋出執行時不變式伴生入口，因為建構過程會拒絕無效靜態清單，每次完成的還原也會驗證結果；可變行 decoder 狀態只屬於一次由呼叫方持有的流式還原。

### 入口

```text
const descriptor = sessionFormatCatalog.readHeader(physicalHeader)
const catalog = createSessionFormatCatalogWithChildren(childFacts)
const restore = catalog.createRestore(physicalHeader, { recovery: 'recoverable', validation: 'transformed' })
for (const row of physicalRows) restore.decodeRow(row)
const current = restore.finish()
const headerRecord = sessionFormatCatalog.encodeCurrentHeader(current.header, current.inheritedEventCount)
const eventRecords = current.events.map(sessionFormatCatalog.encodeCurrentEvent)
```

從包根匯入 `sessionFormatCatalog`。JSONL 與 fixture（測試前置資料）讀取方建立一次 restore，把每個已解析物理行傳給 `decodeRow()`，再呼叫一次 `finish()`。Writer 透過 `encodeCurrentHeader()` 與 `encodeCurrentEvent()` 序列化返回的目前產物。列表讀取呼叫 `readHeader()`，絕不開啟事件正文。

Production 歷史讀取使用 `{ recovery: 'recoverable', validation: 'transformed' }`。Worker 與 fixture 驗證使用 `{ recovery: 'strict', validation: 'current' }`。Transformed validation 會在遷移後執行已釋出 current 規則，但對已經是 current 的輸入有意跳過已安裝語義驗證。

該目錄直接包含所有受支援的歷史讀取器。Profile 無法透過掛載功能外掛來新增、移除或重新排列遷移邊。它透過對 `dsh-session` 的對等依賴（peer dependency）獲得已安裝的目前事件詞表與目前還原規則，而歷史遷移邊驗證器保持凍結。瀏覽器安全的 `./message-projections` 匯出為獨立建構函式和 surface 摺疊裝配目前外掛擁有的處理器，不掛載恢復監聽器。

`createSessionFormatCatalogWithChildren(childFacts)` 在組裝時將顯式的子 Session 證據繫結到 V3→V4，見[目錄補齊規範](../session-format-v3-to-v4/README.zh.md)。`historicalSessionFormatCatalog` 使用固定的已釋出 V3 事件詞彙恢復 V0–V3，收集子日誌前置事實而不遞迴補齊其目錄。即使已安裝寫入方認識事件名，可忽略 V3 擴充功能仍保持不透明。獨立轉錄回放顯式提供空陣列；持久化必須收集完整的可用直屬子 Session 集合。在 catalog 的生命週期內保持傳入證據不變。每次恢復各自擁有獨立的 stage 狀態。靜態 `sessionFormatCatalog` 支援 header 和原生目前格式讀取；歷史正文讀取必須使用已繫結子 Session 的 catalog。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

[`src/generated.ts`](src/generated.ts) 是編解碼器與遷移邊順序的靜態所有者。[`src/current.ts`](src/current.ts) 把最終標頭、事件信封、訊息、表面、種子和目前請求標頭驗證委託給已安裝的 Session 語義。底層建構函式會在開始讀取任何 Session 之前拒絕重複編解碼器、重複遷移邊、缺口，以及超過目前版本的條目。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [遷移機制](../session-format/README.zh.md)——目錄建構與分派行為。
- [已釋出 v0 到 v1 遷移邊](../session-format-v0-to-v1/README.zh.md)——編解碼器與驗證器所有權。
- [已釋出 v1 到 v2 遷移邊](../session-format-v1-to-v2/README.zh.md)——Assistant 流嵌入與基數變化引用重對映。
- [已釋出 V2 到 V3 規範](../session-format-v2-to-v3/README.zh.md#v2-to-v3-specification)——轉換、保留與拒絕。
- [V3 到 V4 規範](../session-format-v3-to-v4/README.zh.md#v3-to-v4-specification)——轉換、引用重對映與 delivery generation 驗證。
- [JSONL 持久化](../session-persistence-jsonl/README.zh.md)——不可變 generation 命名與排他釋出。

-----

<a id="model-experience"></a>
## 模型體驗

### 目錄分派

#### 模型看到什麼

沒有直接內容。該目錄只還原由請求重建邏輯消費的 `SessionEvent` 歷史。

#### Token 影響

不直接產生 token。

#### KV Cache 影響

沒有直接影響；還原後的歷史在其消費方中決定快取身份。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅包含第一方建置清單**——尚不支援外部遷移所有權與分發。
- **生成順序封閉**——執行時外掛註冊無法補充缺失的歷史遷移邊。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
