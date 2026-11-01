---
description: "用於 projection state 的不可變的僅追加列表，提供有界追加複製、按插入順序迭代和 Zod 檢查點驗證。"
kind: "package-library"
---

# @deepseek-ai/dsh-chunked-list

[English](README.md) | 中文

## 概述

`dsh-chunked-list` 讓呼叫方追加值並保留早期列表版本，無需複製整個集合。呼叫方可以按插入順序迭代所有值，並使用自己的值 schema 驗證 JSON 檢查點。subagent 目錄用它儲存不可變的 projection state。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

當僅追加集合需要不可變版本和相容 JSON 的儲存時，使用此列表。空列表用 `undefined` 表示；追加返回新的頭節點，不修改已有節點。列表按引用共享所存的值，因此呼叫方必須將這些值視為不可變。

```ts
import { appendChunkedList, iterateChunkedList } from '@deepseek-ai/dsh-chunked-list'

const first = appendChunkedList(undefined, 'first')
const second = appendChunkedList(first, 'second')
console.log([...iterateChunkedList(second)])
```

範例輸出 `['first', 'second']`；`first` 仍只包含原來的值。`chunkedListSchema(valueSchema)` 驗證 JSON 檢查點並拒絕未知欄位、無效值和空分片或超大分片。當外層欄位也允許空列表時，在 schema 上使用 `.optional()`。各操作詳見[原始碼約定](src/index.ts)。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部機制——點選展開</summary>

最新的分片最多儲存 64 個值。追加最多複製該分片並共享較舊的節點，工作量為有界 O(1)。容量控制儲存佈局，不限制列表總長度。迭代以 O(N) 時間存取全部 N 個值，並使用 O(N / 64) 臨時空間按從舊到新的順序存取各分片。追加換片與遞迴 Zod 驗證共用一個容量常數。

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 持久化列表操作與檢查點驗證 |
| [`tests/chunked-list.spec.ts`](tests/chunked-list.spec.ts) | 版本隔離、順序、結構共享與檢查點接受條件 |

此庫沒有獨立變化的觀測值，因此不釋出執行時不變式伴隨模組；其操作返回呼用方擁有的不可變值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [工具包對映](../README.zh.md)——共享原語。
- [Subagent 目錄決策](../../../.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.zh.md)——projection state 使用分片的原因。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為此集合不註冊任何面向模型的內容。

#### KV Cache 影響

本包沒有內容進入模型請求，因此不影響提供者快取複用。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- **僅追加存取**——需要刪除或隨機存取的呼叫方應使用其他集合。
- **遞迴檢查點**——JSON 序列化與 schema 驗證仍受執行時巢狀深度限制。所存的值本身必須支援呼叫方的序列化格式。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
