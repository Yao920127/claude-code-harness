---
description: "用戶端資源模型：按協定註冊的提供者把 URL 地址解析為即時值，任何 slot 元件都透過 useResource 標準掛鉤讀取。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-resources

[English](README.md) | 中文

## 概述

當元件只知道即時資料的 URL 地址，而資料由另一個用戶端包擁有時，請使用用戶端資源；例如 tab 記錄、連結或提及。資源地址使用 `dsh-resource://<type>/…`；需要作用域的協定把作用域編進路徑。元件透過公開的 `useResource` 掛鉤接收目前值與後續更新。不支援的協定與非資源 scheme（例如 `sidebar://guide`）不指向任何資源。

## 目錄

- [使用本包](#use-this-package)
  - [讀取資源](#read-a-resource)
  - [提供協定](#provide-a-protocol)
  - [釘住資源](#hold-a-resource-open)
- [理解實作](#understand-the-implementation)
  - [生命週期](#lifecycle)
  - [失敗](#failures)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

掛載無需任何設定：外掛提供 `ctx.resources`，並透過 `ctx.slots.provideRoot` 貢獻 `resource` 根 keyed 掛鉤，因此每個 slot 元件不論作用域都能收到它。

<a id="read-a-resource"></a>
### 讀取資源

每個 slot 元件都在 props 上收到 `useResource`。`useResource<P>(address)` 以型別參數命名協定，返回 `{ status, value, failure }`：地址協定沒有提供者（或地址不是 `dsh-resource://` URL）時為 `none`，提供者尚未產出值時為 `loading`，`live` 攜帶最新一個 `ok` 幀的值，`failed` 表示最新一幀報告了失敗，失敗放在最後一個值旁。透過掛鉤訂閱就是釘住資源的方式；另一個持有者讓資源保持存活時，新掛載的元件立刻讀到最新值。

<a id="provide-a-protocol"></a>
### 提供協定

協定所屬的用戶端包在 `ResourceProtocolMap` 宣告其值型別，並以自有 effect 註冊一個提供者。`open` 產出 `RemoteResult` 幀：先是目前內容，之後每次變化一幀，失敗以 `ok: false` 幀而非拋錯表達；必須在 `signal` 中止時停止：

```ts ignore-check
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { note: NoteView }
}

export const inject = ['resources']

export function apply(ctx) {
  ctx.effect(() => ctx.resources.register<'note'>({
    protocol: 'note',
    async *open(address, { signal }) {
      yield await readNote(address, signal)
      for await (const change of followNote(address, signal)) yield change
    },
  }), 'my-notes: note resource provider')
}
```

一個協定恰有一個提供者；第二次註冊會拋錯。提供者註冊時若其協定的地址已被持有，則立即開流；提供者 dispose（資源釋放）時結束這些流並讓它們回到 `none`。

<a id="hold-a-resource-open"></a>
### 釘住資源

`ctx.resources.pin(address, signal)` 在不訂閱的情況下讓資源保持開啟，直到 `signal` 中止。右側 Sidebar 在 tab 記錄的存續期內釘住每個已開啟 tab 的地址，因此切換 tab 解除安裝正文不會關閉其流，切回時讀到最新值。`ctx.resources.source(address)` 是掛鉤背後的裸 observable，供 React 之外的呼叫方使用。

<a id="understand-the-implementation"></a>
## 理解實作

<a id="lifecycle"></a>
### 生命週期

每個地址一條記錄，持有一個快照儲存、一個持有者計數（掛鉤訂閱者加 pin）與執行中流的 `AbortController`。第一個持有者開啟提供者的流；之後的持有者共享它；最後一個持有者釋放時中止流並把快照重置為空閒（有提供者為 `loading`，沒有為 `none`）。記錄在頁面存續期內保留，使 `source()` 在 React 從渲染到訂閱的視窗期以及 StrictMode 重掛載期間保持引用穩定。

<a id="failures"></a>
### 失敗

失敗是幀而非拋錯：提供者產出 `{ ok: false, error }`，資源變為 `failed` 並把該錯誤放在最後一個值旁；下一個 `ok` 幀將其清除。自行結束的流保持其最後狀態。在中止流的那次釋放之後到達的幀都被丟棄，並歸還迭代器。提供者流內的拋錯是程式設計錯誤，不會被捕捉。

<a id="model-experience"></a>
## 模型體驗

無，因為本包在瀏覽器外掛之間搬運值，不註冊任何面向模型的內容。

#### KV Cache 影響

無；資源流不會組裝模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **記錄在頁面存續期內保留**——地址的記錄在最後一個持有者離開後仍留在註冊表中，只丟棄其狀態。記憶體隨讀取過的不同地址數增長，而非隨讀取次數增長。
- **中止合規由提供者負責**——註冊表會丟棄已釋放的流仍產出的幀，但忽略 `signal` 的提供者會一直工作到它的下一幀。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。提供者歸屬與持有者計數只有註冊表這一個擁有者，沒有可供比對的獨立執行時來源；註冊的 dispose 與開啟/關閉生命週期由行為測試斷言。
