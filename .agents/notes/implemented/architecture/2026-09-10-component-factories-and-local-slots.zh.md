# Agent Note: 帶區域性 slot 的可複用元件 Factory

Status: implemented

[English](2026-09-10-component-factories-and-local-slots.md) | 中文

## 問題

瀏覽器 Slot 系統從 parent-owned 擴充功能位置開始。parent entry 透過 `children` 宣告 child，之後互不相關的外掛可以向該位置註冊實作。宣告固定 child Slot 的 kind、scope、渲染權限與生命週期。

可複用元件裝配採用相反的所有權方向。一個包定義裝配，互不相關的 parents 渲染獨立 occurrence，並且每個 parent 可以為具名內部區域選擇不同 Component。普通 Slot 無法表示這種關係，因為它的 definition 屬於全域 Slot 樹中的一個 parent 位置。

定義包與消費包獨立編譯。TypeScript 無法從另一個包中的執行時 registration 推導所選 Component 的 props，另行維護的扁平 props 型別則會重複 store、injection、locale、child-render 與 scope 宣告。

## 決策

`ui-slots` 與 `ui-renderer` 在[普通 Slot 體系](2026-07-22-slot-type-chain-implementation.zh.md)之外提供具名 Component Factory。`registerFactory()` 安裝一個可複用 definition，`renderFactorySlot()` 渲染一個 occurrence，definition 透過 `useFactorySlot()` 讀取呼叫方選擇的區域性 Component。

### 相反的註冊方向

普通 Slot 與 Component Factory 保留不同的所有權模型。

| 屬性 | 普通 Slot | Component Factory |
|---|---|---|
| 首個宣告 | Parent 宣告 child Slot | Definition owner 宣告 Factory |
| 後續操作 | Child 註冊進 parent 位置 | Parent 渲染 occurrence |
| 靜態權威 | `SlotMap` 描述位置 | `SlotFactoryMap` 描述完整 definition |
| 有效 definitions | 多個 entries 可以佔據 cells | 一個 definition 獨佔一個 Factory 名 |
| Parent 輸入 | `renderSlot()` owner 與 keyed props | `renderFactorySlot()` occurrence props |
| Parent 選擇的 Component | Registry routing 選擇 entries | 呼叫方為每個區域性 slot 選擇一個 Component |
| 後代擴充功能點 | Entry-owned 普通 `children` | Definition-owned 普通 `children` |

`SlotFactoryMap` 透過宣告合併給出完整靜態 definition：

```text
interface SlotFactoryDef {
  scope: SlotScope
  props?: object
  children?: ChildrenDecl
  store?: StoreDecl
  inject?: object
  locale?: keyof LocaleNamespaceMap & string
  slots?: Record<string, { scope: SlotScope; props?: object }>
}
```

該 map 是唯一型別權威。`registerFactory()` 根據對應 map 條目檢查執行時 definition 與主 Component。Store 宣告透過 `HandleOf` 規範化，因此 registration 只接受一個共享 handle 或一個生成該 handle 的 factory，絕不接受巢狀 factory。`FactoryComponentPropsOf<F>` 和 `FactoryLocalComponentPropsOf<F, N>` 從同一條目推導完整 Component props；definition owner 與消費方無需重述扁平共享型別。

### Definition 與 occurrence 生命週期

每個 Factory 名在獨立於普通 Slot cells 的 registry ledger 中只有一個有效 definition。registration 遵循呼叫方的 Cordis effect。dispose 會移除 definition、摺疊其普通 child 宣告、通知已掛載 outlets，並令保留的 child-render 或區域性 Component 權限失效。

每次 `renderFactorySlot()` 呼叫都會建立 occurrence，其 identity 由 React 位置和 `key` 決定。替換 definition 會重新掛載 occurrence。Definition Component 及其 fallback 區域性 Component 的失敗歸屬 definition，呼叫方所選區域性 Component 的失敗歸屬呼叫方 registration；巢狀 Factory 渲染保留同一 owner。所有失敗都限制在目前 occurrence 內，不會移除共享 definition。裝配錯誤繼續向外傳播，所有權與陳舊授權錯誤則像普通元件失敗一樣上報。外層錯誤邊界隨 Factory scope incarnation 重置，每個區域性邊界隨自身區域性 slot 的 scope incarnation 重置。

Factory scope 跟隨 occurrence 所在 React 位置的 scope binding。`renderFactorySlot()` 不接受 Session id 或 scope target。嚴格 `session` Factory 要求目前 binding 存在，並在 identity 變化時重新掛載；`session-maybe` Factory 保留首次從空狀態採納 Session 的過程，並在後續 identity 變化時重新掛載，與普通 Slot 行為一致。

共享 store handle 保留普通模式的 handle-by-scope 行為，包括兩個非 root scope 均要求 Session binding。獨佔 store factory 在 occurrence 首次物化時建立一個 handle；若該 handle 宣告 `spec.persist`，renderer 會拒絕它，因為 registration 必須保持 lazy，且多個同時存活的獨立 occurrence 無法安全共享一個 persistence key。渲染期記錄在冪等 effect setup 保留已 commit occurrence 前只持有弱引用；effect cleanup 會移除 mounted 強引用，而 occurrence-keyed WeakMap 在 React effect replay 期間保留 identity，並允許實例在解除安裝後被回收。

### 區域性 slots 與普通 children

呼叫方可以為 Factory `slots` 宣告中的每個名稱選擇一個 Component。Factory 呼叫 `useFactorySlot(name, fallback)`，取得 identity 穩定的繫結 Component；該 Component 只接受對應區域性 slot 的 occurrence props。繫結 Component 渲染時，renderer 提供 Factory 的 store、injection、locale、child renderers 與該區域性 slot 自身的標準 scope props。

區域性 slots 沒有 list、keyed 或 chain routing，也沒有獨立 registration 生命週期。多貢獻方擴充功能點仍使用 Factory 宣告的普通 child Slots。這些 child 宣告在 definition 範圍內全域共享，而每個 occurrence 都在繼承的 scope 下渲染其 registered entries。

即時檢查將每個 definition 表示為 `type: 'factory'` 節點，並把其普通 child Slots 巢狀在該節點下。普通節點保留 `type: 'slot'` 與現有 `kind`；呼叫方透過 `factory:<name>` 選擇 Factory 根節點。

每個由 renderer 建立的 Component 都會收到 `renderFactorySlot`，因此 Factory occurrence 不需要 parent-side use declaration。區域性選擇仍然屬於單個 occurrence，並且不會引入對定義包的執行時 value import。

### 首個交付用途

`ui-conversation` 在共享正文與 Composer 外註冊 optional-Session `conversation.content` Factory。其 strict-Session `views` 區域性位置預設使用一個渲染現有 `conversation.session` Slot 的 adapter；其他 occurrence 可以選擇不同的 View Component，且不會掛載主 Conversation Header。

Factory 不擁有 Conversation store。普通 `conversation.session` body 與 `conversation.session.header` 保留同一個 strict-Session handle，在保持草稿與 View 選擇 identity 的同時，避免將該 handle 同時掛到 `session` 和 `session-maybe` scope。

### 型別與執行時強制規則

型別鏈拒絕未知 Factory 名、缺失或多餘的 occurrence props、與 `SlotMap` 不一致的 child spec、與 `SlotFactoryMap` 不一致的 definition 欄位、巢狀 store factory、未知區域性名稱、不相容的選中 Component，以及 input、registration、injection 與 scope props 之間的所有權重疊。

執行時檢查覆蓋動態裝配與純 JavaScript 呼叫方：重複 definitions、child 宣告衝突、未宣告的區域性名稱、遞迴渲染、prop 衝突、陳舊權限、嚴格 scope 缺失與元件失敗隔離。型別和執行時測試還固定了各 occurrence 的獨佔 store、按 scope 共享的 handles、註冊前 fallback 行為、definition 替換、區域性 scope 投影與普通 child 渲染。

## 考慮過的替代方案

**把普通 Slot 複用為可移植 definition。** 普通 Slot 屬於一個 parent 宣告以及全域樹中的一個位置。在其他位置複用它會借用錯誤的所有權與生命週期。

**把主 Conversation Header 移進 Factory。** 只有主 host 渲染該 Header。將其留在 Factory 外，使嵌入式 occurrence 無需另一個區域性選擇即可省略 Header，並保留其現有 strict-Session Slot 生命週期。

**把共享 Conversation store 移到 optional-Session Factory。** Header 與 Session body 共享一個 strict-Session handle。將該 handle 同時掛到 `session-maybe` Factory 和 `session` Header 會違反 one-handle-one-scope 規則。

**在每個 parent 下分別註冊同一裝配。** 獨立 registrations 會重複 definition 及其 child 宣告。全域貢獻方需要使用平行 child 名稱，或造成宣告衝突。

**維護扁平共享 props 型別。** 這會重複 `children`、`store`、`inject`、`locale` 與 scope 欄位中已有的事實，使宣告與 Component props 可以發生漂移。

**把 React node 或 render callback 作為業務 props 傳遞。** 這些值繞過 renderer 提供的 scope props、store 與 injection 裝配、陳舊權限檢查和區域性 Component 型別檢查。

**讓區域性 slots 具備普通 Slot routing。** 普通 Slots 已經負責多貢獻方 routing。區域性 slot 表示一次 occurrence 的一個呼叫方選擇。

**向 `renderFactorySlot()` 傳遞 Session identity。** occurrence 像普通 Slot 一樣繼承渲染位置的 scope。第二個 identity 參數會產生兩個可能不一致的權威；獨立定址的 Session provider 屬於另一項能力。

## 影響

功能包可以釋出一份可複用 UI 裝配，而消費方無需執行時匯入其 Component。每個 occurrence 可以獲得獨立選擇的區域性 Components 與獨佔狀態，同時保留全域普通 child 貢獻以及現有 scope、locale、injection 和 store 規則。

新增的 registry ledger 與 occurrence 記錄增加了 renderer 複雜度。Factory definitions 必須全域唯一，區域性 slots 有意只支援一個選中 Component，並且該 API 本身不會建立可獨立定址的 Session scope。

Factory 型別與執行時測試是可執行的相容性記錄。Slots 子系統參考以及 `ui-slots` 和 `ui-renderer` 包參考記錄消費方 API。
