---
description: "供執行時包使用的無損 JSON 驗證、分離式快照、深度凍結、結構相等與窮盡聯合型別輔助函式。"
kind: "package-library"
---

# @deepseek-ai/dsh-util-values

[English](README.md) | 中文

## 概述

`dsh-util-values` 為執行時包提供統一的無損 JSON 值、不可變物件圖、JSON 結構相等和封閉聯合型別窮盡失敗實作。呼叫方可以驗證不受信任的值、建立分離的 JSON 快照、凍結待發布值、比較 JSON 相容資料，或終止不可達分支，而無需匯入某個能力包。這些 helper 不持有共享註冊表、constructor identity 或可變模組狀態。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 驗證 JSON 資料或建立快照

需要 predicate 時使用 `isJsonValue()`，還需要分離副本時使用 `snapshotJsonValue()`。兩者只接受無損 JSON 根值：`null`、布林值、除負零外的有限數字、字串、稠密的內建陣列，以及只含可列舉字串鍵的普通或 null-prototype 記錄。迴圈、稀疏陣列、自有 symbol 屬性或自有不可列舉屬性、函式和 class 實例都會被拒絕。

```ts
import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'

declare const input: unknown

if (!isJsonValue(input)) throw new TypeError('expected lossless JSON')
const snapshot = snapshotJsonValue(input) as JsonValue
```

### 釋出、比較或保留鍵控值

`deepFreeze(value)` 原地凍結物件圖並返回同一個值。它遍歷可列舉字串鍵的子項，並刻意讓活躍 `AbortSignal` 物件保持可變。`deepEqualJson(a, b)` 按結構比較 JSON 相容陣列與記錄；呼叫方必須先驗證惡意或不受約束的值，再進行比較。

`WeakMapWithValues<Key, Value>` 組合弱物件鍵查詢與強引用且保持插入順序的 `values` set。每個 value 只屬於一個 key。owner 必須在對應生命週期邊界呼叫 `delete(key)` 或 `clear()`；該集合不執行自動清理。

### 封閉可辨識聯合型別

在封閉可辨識聯合型別的 default 分支中使用 `assertNever(value, context?)`。新增變體會讓每個窮盡 switch 在 TypeScript 編譯時失敗；如果某個執行時值逃過了宣告型別，該函式會丟擲帶可選上下文標籤的錯誤。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

JSON 驗證器使用顯式工作棧，並只跟蹤目前祖先鏈，因此深層巢狀值不會消耗 JavaScript 呼叫堆疊，重複但無迴圈的引用仍然有效。快照寫入使用自有資料屬性，包括 `__proto__` 等名稱。值操作的結果只取決於傳入參數；`WeakMapWithValues` 僅儲存實例自有的關聯。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | JSON 值型別、驗證與快照遍歷、結構相等、深度凍結、弱鍵/強值關聯和窮盡聯合型別失敗 |
| — | 不釋出執行時不變數伴生入口；這些值操作沒有共享執行時狀態，其代數行為由單元測試覆蓋。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [工具包對映](../README.zh.md)——相鄰的無狀態 helper。
- [工作階段子系統](../../../docs/subsystems/session.zh.md)——要求無損 JSON 的持久事件。
- [工具子系統](../../../docs/subsystems/tools.zh.md)——建置於 `JsonValue` 之上的 schema 驗證與規範工具結果。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **`deepEqualJson` 假定輸入相容 JSON**——它不是通用物件比較器，不為 prototype、symbol、accessor、迴圈、map 或 set 定義語義。
- **`deepFreeze` 沿可列舉字串鍵遍歷子項**——它不會把任意主機物件變成不可變資料，並會刻意跳過活躍 `AbortSignal` 實例。
- **`WeakMapWithValues` 要求顯式清理且 value 唯一**——value 會保持強引用，直到 owner 刪除其 key 或清空集合；同一 value 不得由多個 key 共享。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
