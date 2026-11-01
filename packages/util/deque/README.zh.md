---
description: "供 Host 和瀏覽器包使用的環形雙端佇列，提供攤銷常數時間的佇列操作、已移除條目的即時釋放和有界空閒儲存。"
kind: "package-library"
---

# @deepseek-ai/dsh-deque

[English](README.md) | 中文

## 概述

`dsh-deque` 讓 Host 和瀏覽器包可以排空長期存在的程序內佇列，而無需在每次移除後移動所有剩餘條目。呼叫方可以追加或前插條目，並以攤銷常數時間從前端移除。雙端佇列負責條目順序和後備儲存釋放；喚醒、失敗、取消、容量和過載行為仍由各消費方負責。

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

當條目可能在非同步工作期間持續積累，且消費方需要 FIFO 移除、可選前插或顯式清空佇列時，使用 `Deque<T>`。如果有限本地工作列表的最大規模使頭部移除成本無關緊要，它可以繼續使用陣列。

### 入口

匯入雙端佇列，在尾部追加條目；當條目型別可能包含 `undefined` 時，在移除前檢查 `size`：

```ts
import { Deque } from '@deepseek-ai/dsh-deque'

const frames = new Deque<string>()
frames.pushBack('first')
frames.pushFront('before-first')

while (frames.size > 0) {
  console.log(frames.popFront())
}
```

這些方法不施加佇列限制，也不轉換消費方失敗。準確的 TypeScript 約定見 [`src/index.ts`](src/index.ts)。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

雙端佇列把條目存入環形陣列。移除條目會立即清空對應槽位；按幾何級數擴容並在四分之一滿時縮容，使複製工作保持攤銷常數時間，並防止頭遊標保留持續增長的空閒儲存。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 環形雙端佇列操作與後備儲存生命週期 |
| — | 不釋出執行時不變式伴生入口；這個集合不擁有事件流或共享可變狀態，其順序與儲存生命週期由單元測試覆蓋。 |
| [`tests/deque.spec.ts`](tests/deque.spec.ts) | FIFO、前插、環繞、擴容、壓縮（compaction）、清空和複用覆蓋 |
| [`benchmarks/drain.ts`](benchmarks/drain.ts) | 隨佇列規模增長的可復現 backlog 排空計時 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [工具包對映](../README.zh.md)——跨包組共享的其他零依賴原語。
- [線性流佇列決策](../../../.agents/notes/archived/bug-fix/2026-08-28-linear-stream-queue-drain.md)——生產流為何使用本雙端佇列而非陣列頭部移除。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為這個程序內集合不註冊任何面向模型的內容。

#### KV Cache 影響

這裡的內容不會進入模型請求，因此不影響提供者快取複用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **沒有容量策略**——雙端佇列不會限制、合併或拒絕條目；每個消費方必須定義適合其流的過載行為。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
