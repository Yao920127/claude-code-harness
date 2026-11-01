---
description: "領域資料形式（ctx.storageDomain）：面向在儲存後端之上選擇、掛載或排查經過 schema 驗證、發出變更事件的 KV 領域的主機與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-domain

[English](README.md) | 中文

## 概述

使用本包宣告經過 schema 驗證的鍵值領域，並透過 `ctx.storageDomain` 在已設定的儲存後端上開啟它們。讀取同步返回經過驗證的記憶體狀態；每次寫入在完成前都已達到持久狀態，並按順序發出 `domain/changed`。產品包使用領域控制代碼，而不直接存取儲存後端。這些主機側狀態不會新增工具、提示詞或工作階段事件，因此模型與 agent loop（智慧代理迴圈）無法看到它們。

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

當主機包需要持久、經過 schema 驗證的記錄——工作區記錄、工作階段伴隨中繼資料——時使用本包。由所屬包宣告一次領域；消費方開啟它，即可獲得同步讀取與持久、發出變更事件的寫入，而無需觸碰任何後端。

### 何時使用

任何必須跨重新啟動保留、並始終符合 schema 的主機側資料都適合它：領域資料形式在開啟時驗證每條已存記錄，且每次寫入在 resolve 前都已持久。當資料屬於工作階段事件日誌時請避免使用它——那是工作階段持久化 seam 的領域。

### 宣告領域

所屬包用 `defineDomain` 宣告一次領域——名稱、版本與 zod 記錄 schema——並匯出它。名稱非法、版本不是非負整數、或全域 schema 接受 `null` 時，`defineDomain` 會在模組載入時明確報錯。

```text
// Owning package, once:
const workspaceSpec = defineDomain({
  name: 'workspace',
  version: 1,
  tables: { workspaces: domainTable(workspaceRecordSchema) },
})
```

### 開啟並使用領域

消費方透過 `ctx.storageDomain` 開啟已宣告的領域並持有返回的控制代碼；讀取是同步的，寫入是持久的：

```text
const domain = await ctx.storageDomain.open(workspaceSpec)
await domain.table('workspaces').put(id, { path: '/work/demo' })
const record = domain.table('workspaces').get(id) // synchronous, from memory
domain.table('workspaces').update(id, (r) => ({ ...r, path: newPath }))
```

呼叫方擁有控制代碼的生命週期，並在功能關閉時用 `domain.close()` 釋放它（通常作為其自身的 `ctx.effect` 資源釋放函式）；外掛解除安裝時，設施會關閉仍處於開啟狀態的領域。

### 把領域路由到後端

哪個後端服務哪個領域由領域外掛的設定決定——絕非樞紐。`backend` 指定預設路由；`routes` 按領域名覆蓋。路由到未註冊後端的領域會在開啟時以 `backend-not-found` 明確報錯。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `backend` | 必填 | 未顯式路由的每個領域的預設後端名稱 |
| `routes` | `{}` | 逐領域覆蓋：領域名稱 → 後端名稱 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-storage-domain)是所有受支援欄位及其 JSDoc 的完整真源。

### 可觀察行為與失敗

每次寫入都要等後端確認已持久化後才完成，並按寫入順序各發出一次 `domain/changed` 事件。失敗攜帶穩定的 `DomainError` 程式碼：`already-open`（名稱已開啟或仍在關閉）、`facet-unsupported`（已路由後端不提供 `kv` 分面）、`invalid-record`（已存記錄或全域不符合其 schema，並指明表與鍵）、`missing-key`（對不存在的記錄執行 `update`）與 `closed`（關閉後的任何使用）。`version-mismatch` 等後端失敗會原樣直接傳遞。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

領域層是單一實作，而非抽象化的 seam：消費方依賴本包、絕不直接觸碰後端，這把所有領域邏輯——schema 驗證、寫入序列化、變更事件——集中在一處，而不是在每個後端重複一遍。

### 設計理念

- **spec 物件是唯一真源。** `defineDomain` 固定 spec 的字面型別，並在所屬包的模組載入時、任何介質被觸碰之前驗證其欄位。記錄 schema 使用 zod，因此 `z.infer` 可避免重複定義消費方型別；外掛 `Config` 仍由 schemastery 負責。
- **記憶體具有最終決定權；介質是持久投影。** 讀取同步取自經過驗證的記憶體狀態。每次寫入都在每個領域一條的寫入鏈上排隊：先到達後端持久狀態，再變更記憶體，然後發出 `domain/changed`——被拒絕的後端寫入不會觸碰記憶體，因此讀取永遠不會與介質分叉。
- **每個領域一條寫入鏈。** `put`、`delete`、`update` 與 `global.set` 都在其上排隊；`update` 的變換在鏈上自己的槽位執行，因此並行更新絕不會交錯。記錄是普通不可變資料——回傳值就是已存物件本身，絕不能原地修改。
- **寫入在提交點之後發出。** `domain/changed` 是通知，不是事務參與者：監聽器丟擲異常時，系統會隔離該異常並記錄警告，而不會讓已經持久的寫入被拒絕。

### 開啟順序

`DomainFacility.open(spec)` 按嚴格順序執行，任一步驟失敗都會讓整個呼叫失敗：拒絕已開啟或仍在關閉的名稱（`already-open`）；解析路由（`backend-not-found`）；要求 `kv` 分面（`facet-unsupported`）；開啟單元（後端 `version-mismatch`／`malformed-medium` 直接傳遞）；載入並根據 spec 的 schema 驗證每條已存記錄與全域（`invalid-record`）；建構領域。呼叫方持有控制代碼；設施會在解除安裝時關閉任何仍開啟的領域，已關閉領域的名稱只在資源銷燬完成後才能重新開啟。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`DomainFacility`、路由、`Config`、資料形式掛載 |
| [`src/spec.ts`](src/spec.ts) | 領域宣告：`defineDomain`、`domainTable`、描述符投影 |
| [`src/domain.ts`](src/domain.ts) | 已開啟領域的執行時：寫入鏈、表與全域控制代碼、關閉 |
| [`src/events.ts`](src/events.ts) | `domain/changed` 事件詞彙 |
| [`src/error.ts`](src/error.ts) | `DomainError` 程式碼 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：每條 `domain/changed` 與記憶體狀態一致 |

### 不變式

`storage-domain-invariant` 伴生外掛註冊這條所屬關係：每條 `domain/changed` 事件在發出時都必須與所屬領域的權威記憶體狀態一致——出現分叉意味著某條寫入路徑跳過了寫入鏈或發出了陳舊值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當領域層視角不夠用時閱讀以下頁面：子系統參考是權威約定，Agent Note 記錄了設計與延期工作。

- [儲存子系統](../../../docs/subsystems/storage.zh.md)——領域約定、後端約定、變更事件與生成的 API。
- [儲存包對映](../README.zh.md)——家族的各包及其在儲存庫中的位置。
- [領域 KV 儲存 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——領域為何存在、workspace 消費方，以及跨程序變更推送等延期工作。
- [Workspace 子系統](../../../docs/subsystems/workspace.zh.md)——領域資料形式的第一個消費方。

-----

<a id="model-experience"></a>
## 模型體驗

### 持久領域狀態

#### 模型看到什麼

無。本包不註冊工具、不注入提示詞，也不追加工作階段事件；它在 `ctx.storageDomain` 後面儲存非工作階段資料，只發出程序內 `domain/changed` 事件。只有消費方透過自身有文件說明的介面渲染該事件時，它才會到達模型。

#### Token 影響

為零：本包的文字不會進入任何模型請求。

#### KV Cache 影響

相互獨立：領域讀寫絕不觸碰請求字首，因此這裡沒有任何內容能使提供者快取複用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明領域層何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **變更只在單程序內可見**——`domain/changed` 是程序內事件；在跨程序修訂模式落實前，第二個主機程序或重新連線的 GUI 無法觀察變更（[Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)）。
- **沒有跨表事務、二級索引或多段鍵**——每次寫入只觸碰一條記錄；這些擴充功能列在 Agent Note 的範圍外清單中。
- **沒有資料遷移**——領域的已存版本與 spec 不同時，開啟操作會被拒絕（`version-mismatch`）；修改 schema 需要手工遷移已存資料。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
