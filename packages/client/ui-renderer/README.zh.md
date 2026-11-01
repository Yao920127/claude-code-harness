---
description: "瀏覽器 UI 渲染器：普通 Slot 與可複用 Component Factory 的 React 繫結、ctx.uiRenderer 與組裝後的 dsh Web 應用根。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-renderer

[English](README.md) | 中文

## 概述

`dsh-client-ui-renderer` 掛載組裝完成的 dsh Web 用戶端 GUI：完整用戶端外掛名冊穩定後，啟動核心呼叫 `ctx.uiRenderer.mount(container)`，它會 hydrate 不依賴框架的啟動頁，並在下一次繪製前切換到完整的 React 應用。業務外掛仍是接收型別化 props 的普通 React 元件，透過 props 取得工作階段與 Workspace 資料，永遠不需要自行接線訂閱——渲染器在 slot outlet 處把執行時的裸 observable source 繫結為 selector 掛鉤。Web 外殼與啟動核心是它僅有的直接消費方，因此只要組合需要 React 渲染的 GUI，就需要它。

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

本包屬於基礎設施：Web 外殼與啟動核心是它僅有的直接消費方。只要組合需要 React 渲染的 GUI，就需要它——`dsh-client-web` 載入名冊，等待每個 entry 啟用，然後呼叫 `ctx.uiRenderer.mount(container)`。

### 掛載做什麼

`mount(container)` 會安裝 slot 渲染器、在存在時 hydrate 現有啟動 DOM、在下一次繪製前把組裝後的應用渲染進容器，並返回一個解除安裝 React 根的 disposer。渲染器執行全程式唯一一次上下文級 `renderSlot('root')` 呼叫；註冊的根佔用方擁有產品佈局與文件中繼資料。

### 對業務外掛

業務外掛註冊普通 Slot entry 或可複用 Component Factory；渲染器在渲染位置把執行時的工作階段與 Workspace observable source 繫結為 selector 掛鉤。外掛透過推匯出的 Component props 收到標準 scope props——它絕不匯入渲染器，也不觸碰 React 內部機制。每個由 renderer 建立的 Component 都能渲染 Factory occurrence，Factory 也能暴露由呼叫方選擇的區域性 Component，而無需在包之間共享實作值。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包實作一條邊界：物件層（執行時，無 React）擁有業務狀態；這裡是 ctx 到 React 整合唯一發生的位置——slot 渲染器、`SessionProvider` 與 `useSyncExternalStore` 介面卡。

### 啟用與掛載

外掛在 `slots`、`sessions` 與 `layout` 就緒後啟用；它安裝 `createSlotRenderer()` 並 reflect `uiRenderer` 服務。`mountApp` 會查詢啟動核心的 `[data-dsh-boot]` 元素：存在時經 `BootHandoff`（一個保留載入 DOM 的單幀直接傳遞）hydrate，否則建立全新的根節點並同步提交渲染。

### Slot 繫結

`createSlotRenderer` 把 slot 註冊表連線到 React：普通 entry list 與 Factory definition 成為回應式 source，每個 outlet 或 occurrence 經已安裝的渲染器渲染。業務外掛透過帶型別的 `hooks` 傳遞裸 observable source；渲染器經 uSES 介面卡在渲染位置完成繫結。Factory Store factory 保持 lazy，直到 occurrence 首次物化時才建立 handle；其 exclusive handle 拒絕持久化，渲染期記錄保持弱引用，冪等 effect 僅強引用 mounted occurrences，同時在 effect replay 期間保留 identity。Factory 錯誤使用普通監督通道且不會 abdicate 共享 definition：definition 及其 fallback 區域性 Component 的失敗歸屬 definition，呼叫方所選區域性 Component 的失敗歸屬呼叫方 registration，每個邊界隨自身 scope incarnation 重置。

### 身份

React、React DOM、Cordis、ui-slots 與 ui-primitives 透過 Web 外殼的靜態模組表保持同一瀏覽器身份；本包則以動態用戶端 bundle 的形式載入。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋周邊機制與組合模型。

- [ui-slots](../ui-slots/README.zh.md)——本渲染器繫結到 React 的 slot 註冊表純核心。
- [web](../web/README.zh.md)——載入名冊並呼叫 `mount` 的外殼。
- [ui-session](../ui-session/README.zh.md)——提供本渲染器所繫結標準工作階段 source 與掛鉤的介面卡。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——載入鏈、物件層與分層紅線。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——權威組合模型。
- [Component Factory](../../../.agents/notes/implemented/architecture/2026-09-10-component-factories-and-local-slots.zh.md)——可複用 definitions、區域性 Component 選擇與 occurrence 生命週期。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端渲染組裝層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明應用首幀何時出現、按區域就緒能走多遠；它們是目前包約束。

- **應用首幀會等待全部用戶端 entry**：啟動核心只在 loader 名冊穩定後交出掛載點；按區域就緒仍屬暫緩事項。
- **slot 渲染沒有 Suspense 整合或逐 entry 惰性載入**：完整外掛名冊穩定後，渲染器才掛載根節點。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
