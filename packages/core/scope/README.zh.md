---
description: "面向外掛作者與維護者的作用域註冊庫，用於建置按 agent（智慧代理）或按分組隔離貢獻的註冊表或事件介面。"
kind: "package-library"
---

# @deepseek-ai/dsh-scope

[English](README.md) | 中文

## 概述

`dsh-scope` 讓外掛作者能夠為每個 agent 或分組提供隔離的貢獻集合與統一生命週期。子作用域繼承祖先貢獻，且較近的定義優先；祖先作用域可以觀察後代活動，這兩種關係均不反向成立。釋放作用域會移除它擁有的一切。按 agent 或分組隔離必須脫離 agent loop（智慧代理迴圈）與 preset 工作時，請使用這個零依賴庫。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

外掛作者使用 `dsh-scope` 為單個 agent（或單個分組）提供獨立的註冊世界。core 分組中的註冊表都建置在它之上——透過 `agent.ctx` 註冊的工具只對該 agent 可見——同樣的原語也服務於任何自定義註冊表或帶作用域的事件。

### 建立作用域

`createScope(ctx, key)` 在 `ctx` 的 fiber 下建立作用域：其 `ctx` 攜帶作用域標籤，透過它進行的每項註冊既具備作用域可見性，也服從作用域生命週期。`dispose()` 撤銷透過該作用域進行的每項註冊；`rawDispose` 是確切 Cordis disposer，用於把 teardown 巢狀進有序組合 effect。

```text
const scope = createScope(ctx, agent)
scope.ctx.on('agent/status', ({ agent, status }) => track(agent, status))
// later:
await scope.dispose()   // unwinds every registration made through scope.ctx
```

### 路由帶作用域的事件

`scopeTarget(base, key)` 建構帶作用域事件分發所用的不透明載體。無標籤監聽器保持全域；標籤為 `key` 的監聽器接收該鍵及其後代的事件。載體只攜帶路由狀態——真實主體由事件參數攜帶。

### 建置帶作用域的註冊表層

註冊表作者使用 `ScopedLayers`、`NamedEntries` 與 `AnonymousEntries` 持有一個立即建構的全域層加惰性建立的精確作用域層：讀取從不建立層，`merge()` 沿作用域鏈物化按插入序的具名遮蔽，`effect()` 從同一上下文推導可見性與所有權。只有當整個聚合為空時才回收作用域層。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該包如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

註冊上下文同時決定可見性與所有權：透過帶作用域上下文進行的註冊在該作用域內可見、並隨其 dispose（資源釋放），從而防止貢獻在一個作用域中可見、卻隨另一個作用域拆除。該原語用於路由受信任的同程序外掛；它不是沙箱或權限邊界。交出帶作用域的上下文，也會交出建立該上下文的外掛的服務解析範圍（解析沿建立者 fiber 的依賴鏈行進），因此作用域應由具備這些帶作用域註冊所需依賴的外掛來建立。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `createScope`、`scopeOf`、`scopeTarget`、`bindScopeParent`/`scopeParentOf`/`scopeChainOf`、載體標記 |
| [`src/store.ts`](src/store.ts) | `ScopedLayers`、`NamedEntries`、`AnonymousEntries`、`ScopeLayer` |
| [`src/invariant.ts`](src/invariant.ts) | 基於生成的作用域事件對映的不變式配套 |
| [`src/scoped-events.generated.ts`](src/scoped-events.generated.ts) | 已宣告帶作用域事件的生成解析器對映 |

### 父鏈

一個關係支撐兩個方向：註冊檢視沿鏈**向下**繼承（子作用域看得見祖先的各層），事件放行沿鏈**向上**擴充功能（標籤為祖先的監聽器收到分發到後代鍵的事件）。繫結僅此一次——已有父級的鍵直接拋錯，只有返回的繫結控制代碼才能重新繫結——且每次連結都拒絕完整流程。`scopeChainOf` 返回 `[key, parent, …]`，最近者在前。

### 事件篩選

`scopeTarget` 把基物件的現有 `Context.filter` 與作用域謂片語合起來：無標籤監聽器放行；有標籤監聽器僅當標籤為分發鍵或其祖先時放行；`key === undefined` 只放行無標籤監聽器。帶 `{ global: true }` 的監聽器繞過篩選。`Scoped<T>` brand 要求帶作用域事件以載體作為 `this` 型別，因此用裸主體分發會產生編譯錯誤。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域與設計原理時再閱讀以下頁面。

- [作用域註冊子系統](../../../docs/subsystems/scope.zh.md)——身份、載體與層型別。
- [agent 作用域上下文 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.zh.md)——安全非目標與上下文設計。
- [agent 作用域執行時設計 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.zh.md)——迴圈如何建置按 agent 的作用域。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

這些限制說明該原語何時需要特別留意。它們是目前包約束，不是任務積壓。

- **只有感知作用域的 API 才會隔離狀態**：註冊表必須按 `scopeOf()` 歸檔，事件必須透過 `scopeTarget()` 分發；僅僅透過帶作用域的上下文呼叫任意 Cordis 服務，並不會改變該服務仍為上下文全域這一事實。
- **一個上下文只攜帶一個最近的作用域鍵**：層級關係存在於鍵級父關係中而非上下文標籤裡；巢狀作用域上下文仍遮蔽為單一標籤，多成員策略集仍不受支援。
- **服務可達性來自作用域建立者**：交出 `Scope.ctx` 也會交出建立外掛注入的服務範圍，因此，若作用域建立者提供的服務範圍較寬，持有者之後也無法將其收窄。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
