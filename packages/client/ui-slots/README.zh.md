---
description: "dsh Web 用戶端的 slot 註冊表純核心：普通擴充功能 slots、可複用 Component Factory、推導 props 型別、store 席位與渲染器安裝約定。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-slots

[English](README.md) | 中文

## 概述

`dsh-client-ui-slots` 讓 Web 用戶端外掛定義並組合帶型別檢查的 UI 區域。普通 Slots 提供 parent-owned 擴充功能位置；Component Factory 提供帶呼叫方所選區域性 Component 的可複用裝配。兩套 API 都從宣告合併型別推導 scoped state、injection、locale 與 child-render props，並在外掛載入期間報告衝突 definition。用戶端需要渲染時，將這個不依賴 React 的包與 `ui-renderer` 配合使用。

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

編寫用戶端外掛時都透過本包組合 UI：把元件註冊進父級已宣告的 slot，或宣告元件將要渲染的子 slot。四種 kind 覆蓋組合形態——`single`（單個佔位者）、`list`（有序條目）、`keyed`（按鍵分派）與 `chain`（條目自行提名）。

### 可複用 Component Factory

當一個包定義裝配、而互不相關的 parents 需要獨立渲染它時，使用 Component Factory。在 `SlotFactoryMap` 中宣告完整型別，透過 `ctx.slots.registerFactory()` 安裝 definition，透過注入的 `renderFactorySlot()` 渲染 occurrences，並透過呼叫的 `slots` 選項選擇每個已宣告的區域性 Component。definition 透過 `useFactorySlot(name, fallback)` 讀取該選擇。

Factory `children` 仍是普通全域 Slots 且必須與 `SlotMap` 匹配，而區域性 `slots` 為每個 occurrence 選擇一個 Component。occurrence 繼承其渲染位置的 scope；`renderFactorySlot()` 不接受 Session identity。共享 Store handle 使用普通 scope 解析。Store factory 保持 lazy，直到 occurrence 首次物化時才為該渲染位置建立一個 handle；若持久化 Store spec 會讓 persistence key 在 occurrences 之間衝突，renderer 會拒絕它。

### 五個框架 props share

每個已註冊元件都會收到由五個框架 share 組合而成的 props：執行時 share（父級 render 呼叫點的 `owner`，加上工作階段標準工具包與全域席位）、child render share（靜態縮窄到已宣告 children 的 `renderSlot`）、Factory render share（`renderFactorySlot`）、store share（已宣告 handle 的 selector 掛鉤與移除 draft 的 actions），以及業務 share（從 `inject` 推導）。元件引用推匯出的 props 別名；它們絕不在本地重新定義任何 share 的型別。

### Store 席位

register 呼叫可以用 `store: defineStore(...)` 宣告 store 席位：`init` 推斷狀態 schema，`actions` 是完整的 draft-transform 寫入集合。元件經 selector 掛鉤讀取、經烘焙回呼寫入；`defineStore` 的引擎實作位於執行時包，並滿足這裡匯出的 `DefineStore` 約定。

### 宣告紀律

宣告即認領：註冊條目成為唯一被允許渲染該鍵的條目；註冊未宣告 slot、宣告已宣告過的子項、在兩個 scope 下掛載同一個共享控制代碼、或註冊缺少 `select` 的 chain，都會在載入時丟擲。條目的 disposer 會遞迴移除其宣告的子 slot——帳本行、貢獻與 store 掛載都隨同一生命週期結束而移除。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

普通 Slot 設計就是一張表：宣告 = 渲染授權 = 執行時規範。`SlotMap` 在這裡宣告為空，由消費方透過 `declare module` 增補合併；`SlotFactoryMap` 和標準工具包介面（`SessionStandardProps`、`GlobalStandardProps`）也採用同一方式。Factory definition 使用獨立的單 definition ledger，因為其 occurrences 沒有 parent 宣告。

### 註冊與路由

`SlotCore` 在建構時預置 `'root'` slot，並強制執行載入時驗證。`ChainSelect` selector 按升序 `priority` 執行（相同值按註冊順序）；第一個非 null 回傳值選中其條目，併成為元件的 `matched` prop；全部返回 null 時使用 owner 的 `renderSlotChain` fallback（`ChainRenderOpts`）。每個 key 都攜帶一個 declaration epoch，它只在宣告與移除時遞增；`ui-renderer` 將其用於 `ctx.slots.inject`，且與普通條目版本相互獨立。即時檢查使用嚴格的 `type: 'slot' | 'factory'` 節點，並把 Factory-owned child Slots 巢狀在其 definition 下。

### 渲染器約定

`renderer.ts` 攜帶安裝約定（`SlotRenderer`、`SlotRendererHost`）以及 `StaleAuthorizationError`/`SlotOwnershipError`；ui-renderer 負責實作，並在其外掛生命週期中完成安裝。引擎產物與渲染器主機約定攜帶裸快照 source（`getSnapshot`/`subscribe`），絕不攜帶 React 掛鉤——掛鉤繫結屬於渲染機制。Factory 崩潰使用普通監督通道，冪等 effect 僅在 commit 後保留逐渲染位置 Store handle。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋引擎、渲染器與組合模型。

- [ui-renderer](../ui-renderer/README.zh.md)——實作本包安裝約定的 React slot 渲染器。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——權威組合模型。
- [Component Factory](../../../.agents/notes/implemented/architecture/2026-09-10-component-factories-and-local-slots.zh.md)——可複用 definitions、區域性 Component 選擇與 occurrence 生命週期。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——本註冊表接入的載入鏈與物件層。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 接線層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義註冊表的規模擴充功能特性與已接受的型別噪聲；它們是目前包約束。

- **`isLive` 會線性掃描所有記錄**：在 UI 外掛的註冊規模（數十項）下沒有問題；如果帳本變得頻繁存取，再使用條目→記錄反向引用改進。
- **`__renders` 幻象錨點在 `PropsRenderSlots` 上可見**：這是與型別鏈設計的 `__accepts` 相同且已接受的噪聲；泛型方法簽名在 key 聯合之間比較寬鬆，因此必須依靠逆變標記強制執行「元件 key 集合 ⊆ children 宣告」。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這是零依賴的純註冊表核心，本身不發出 Cordis 事件；`ui-renderer` SlotRegistry 負責事件橋及其不變式。本包的行為規範直接斷言 define/register/dispose 的執行順序。
