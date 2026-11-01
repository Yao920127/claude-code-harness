---
description: "面向開發者與維護者的工作階段投影註冊表說明，用於向用戶端載體提供日誌派生逐工作階段狀態的完整目前值，或維護驅動約定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-projection

[English](README.md) | 中文

## 概述

當用戶端需要目前的逐工作階段狀態（例如待辦事項、目標或對話統計）而不應自行重放原始事件日誌時，使用 `dsh-session-projection`。領域根據已提交的工作階段事件定義同步投影，用戶端則透過快照與變更通知接收經過 schema 驗證的完整 JSON 值。快照標明所有回傳值共同反映到的最後一個事件，因此載體可以把狀態與對應的歷史切面配對。投影狀態可以透過檢查點加快冷讀，而僅供 host 使用的投影不會暴露給用戶端。

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

在用戶端載體需要日誌派生工作階段狀態的目前值處掛載 `dsh-session-projection`。領域外掛註冊單元；載體讀取快照並訂閱變更流；兩側互不相識。

### 何時選擇

當領域儲存用戶端應看到、但不應自行重新派生的狀態——todo 清單、goal 快照、對話統計——時選擇本包。註冊表在已提交事件上主動驅動單元，因此任何已註冊單元的值按建構即為目前值。當維護的是無用戶端讀取的 host-only 記帳時跳過：不帶 `wire` 塊的單元保持 host-only。host 讀取方要麼在外掛 `inject` 中宣告 `sessionProjections`，要麼在註冊表或必需 key 缺席時明確失敗。貢獻方可以繼續透過 `ctx.inject(['sessionProjections'], ...)` 保持可選註冊。

### 定義投影單元

領域為每個狀態鍵貢獻一個 `ProjectionDefinition`：一個 key、狀態 schema、初始狀態、同步摺疊 `apply(state, event)`、可選的 `wire` 塊（把狀態投影為用戶端檢視），以及狀態欄位或摺疊語義變化時遞增的 `stateVersion`：

```text
const definition = {
  key: 'todo',
  stateSchema: todoStateSchema,
  stateVersion: 1,
  init: (_header, _inheritedEventCount) => ({ items: [] }),
  apply: (state, event) => event.type === 'todo/upsert'
    ? { items: event.data.items }
    : state,
  wire: {
    viewSchema: todoViewSchema,
    view: state => ({ items: state.items }),
  },
}
```

`init(header, inheritedEventCount)` 同時接收輕量中繼資料與精確的 fork 繼承切點；它不得從 `firstLiveSeq` 或 `session/end-seed` 推斷該切點。`apply` 必須同步，且對與單元無關的事件必須返回同一個狀態引用——引用不變意味著零下游工作。註冊表用 `Object.is` 比較相鄰的 `wire.view` 原始結果；物件或陣列 view 若要在僅內部 state 變化時抑制釋出，就必須複用引用，結構相同的新物件仍算變化。攜帶狀態的日誌事件必須攜帶變更後的完整狀態，絕不攜帶裸增量。

### 註冊與讀取

`register(definition)` 安裝單元；具有相同 key 和 `stateVersion` 的註冊方共享其 cell，版本不相容或 `stateVersion` 非法時會 throw。註冊是掛在呼叫方 fiber 上的 effect，因此最後一個註冊方解除安裝後會移除 key 及其快取 cell。載體用 `snapshot(session)` 對每個用戶端可見單元讀取一致的同步切面——`{ asOfSeq, values }`，其中 `asOfSeq` 是所有值共同反映到的最後一個事件的 seq——並用 `onChanged(listener)` 訂閱逐變更通知。`stateOf(session, key)` 讀取一個單元的即時只讀 host 狀態，不計算無關檢視。

```text
const dispose = ctx.sessionProjections.register(definition)
const { asOfSeq, values } = ctx.sessionProjections.snapshot(session)
```

必須使用投影狀態的領域把 `sessionProjections` 宣告為 Cordis 服務依賴；可選貢獻方可以在 `ctx.inject(['sessionProjections'], …)` 下注冊。載體使用 `ctx.get('sessionProjections')`，註冊表缺席時省略自己的塊或幀。

### 持久檢查點

系統透過 `checkpoint(session)` 為每個單元的狀態建立檢查點，client-visible 與 host-only 一視同仁；同級包 [session-projection-cache](../session-projection-cache/README.zh.md) 持久化這些檢查點，使冷讀跳過全量日誌載入。檢查點水位使用 `SessionSeqCursor`（空日誌為 `-1`），回放起點使用 `SessionLogOffset`；`restoreFloor` 與 `restore` 實作讀取流程，且不會混淆已有事件與日誌間隙。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節說明驅動機制與單元約定；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計理念

本包是能力 seam 的 Service Definition 與驅動角色：框架負責驅動，領域負責計算。註冊表只訂閱一次 `session/event`；每個已提交事件都會主動經過每個已註冊單元的 `apply`（cell 在首次觸達時惰性建置）。第一層 `Object.is` 閘門在 state 引用不變時跳過 view 工作；live drive 的雙槽快取複用前一個原始 view，第二層 `Object.is` 閘門在原始 view 引用不變時抑制釋出。載體在切出頁面切片的同一 tick 內讀取 `snapshot()`，`asOfSeq` 之所以是一個一致切面正繫於此；誤寫成非同步的 view 會返回 Promise，並被 `wire.viewSchema.parse` 拒絕。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SessionProjectionRegistry` 服務、`ProjectionDefinition`、快照與檢查點機制 |
| [`src/types.ts`](src/types.ts) | 可合併擴充功能的 `SessionProjectionMap` 與 `SessionProjectionStateMap` 型別表 |
| — | 不釋出執行時不變式伴生入口；註冊表自身的約定（拒絕重複鍵和非法 stateVersion、隨 effect 移除、以 `Object.is` 把守變更）由服務同步強制執行並經其規範驗證；驅動關係若要檢查就必須重新執行驅動，從而重複實作邏輯；所服務值之間的關係由載體協定路徑負責。同步單元紀律則儘可能由邊界 `schema.parse` 強制執行。 |

### 驅動與檢查點流程

一個已提交事件按註冊順序驅動每個已註冊單元；原始 view 透過 `Object.is` 判定為變化的用戶端可見單元會以經 schema 驗證的檢視與致因 seq 通知變更流。live drive 保留前後兩個原始 view；snapshot 與冷讀仍是彼此獨立的完整讀取。`checkpoint(session)` 為持久快取返回每個單元一份獨立的 `(key → {ver, seq, val})` 行；`restoreFloor` 把尾部讀取錨定在最低可用水位之前一個事件處，使縮短的日誌可被檢出；`restore` 把持久行在儲存字尾上重新摺疊，丟棄任何 `ver` 不匹配或聲稱越過儲存末尾的行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從單元約定逐步進入讀模型子系統與持久快取。

- [工作階段投影子系統](../../../docs/subsystems/session-projection.zh.md)——投影單元約定、驅動語義與生成的服務 API。
- [工作階段持久化子系統](../../../docs/subsystems/persistence.zh.md)——投影摺疊其上的事件日誌。
- [工作階段投影快取](../session-projection-cache/README.zh.md)——讓冷讀跳過全量日誌載入的持久檢查點。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、標題與遙測包。
- [工作階段投影 RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.zh.md)——投影與命令日誌的設計理由。

-----

<a id="model-experience"></a>
## 模型體驗

無——註冊表只為已入日誌的工作階段狀態提供面向用戶端的讀模型，不註冊任何模型可見內容。

#### KV Cache 影響

無；投影從不組裝或傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明投影註冊表在大規模下何時需要特別處理。它們是目前包約束，不是任務積壓。

- **每個尾頁攜帶每個 client-visible key**——尚無逐 key 的 opt-out 或惰性 key 請求形狀；在值都是 UI 量級的全量狀態時可以接受，若某領域的值變大再重議。
- **單元表是程序級的，因此 key 是否存在不能當作逐工作階段的能力訊號**——任何 agent preset 註冊的 key 都會出現在每個工作階段的快照裡；用戶端必須讀值，不能把 key 缺席當作功能缺席。
- **主動驅動逐事件觸達每個單元**——按建構開銷很低（全量值規則與 state/view 引用閘門），但若出現熱點路徑，可加按單元的事件型別預過濾。
- **註冊表 cell 只活在記憶體裡**——重新啟動後首次觸達時靠摺疊日誌重建；掛載了 `dsh-session-projection-cache` 的組合改由持久行播種該摺疊。
- **單元同步紀律只有部分可機械把關**——`wire.viewSchema.parse` 能拒絕返回 Promise 的 view，但阻塞的 `apply`、或讀取撕裂的非工作階段狀態的 `apply`，只能靠評審把關。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
