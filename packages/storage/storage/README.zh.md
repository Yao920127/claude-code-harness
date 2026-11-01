---
description: "儲存樞紐（ctx.storage）：面向選擇、掛載或排查具名儲存後端與資料形式設施的組合方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage

[English](README.md) | 中文

## 概述

使用 `dsh-storage` 持久儲存型別化應用資料，而不將其加入工作階段歷史。將它與受支援的儲存介質和領域設定一同掛載後，呼叫方即可透過公共 `ctx.storageDomain` API 存取記錄。工作區記錄、工作階段伴隨資料或其他必須在重新啟動後保留且不應成為工作階段事件的應用狀態適合使用它。它僅供主機程式碼使用，對模型沒有可見影響；無需此類資料的組合可以省略它。

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

使用本包為組合提供持久的非工作階段儲存：把它與後端和資料形式包一起掛載，主機包即可透過 `ctx.storageDomain` 讀寫經過驗證的記錄。樞紐自身不增加任何可觀察行為——它是讓整個家族運轉起來的交匯點——以下內容就是組合從它得到的一切。

### 何時使用

當組合中任何包需要持久化工作階段事件日誌以外的資料——工作區記錄、工作階段伴隨資料——時就掛載樞紐。領域資料形式與兩個內建後端都依賴它，因此組合的儲存行是 `storage` 加一個後端加 `storage-domain`。沒有任何此類資料的組合可以省略整個組；agent loop（智慧代理迴圈）永遠不需要它。

### 最小組合

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
```

這些行載入後，`json` 後端註冊自身、`domain` 資料形式掛載；諸如 `dsh-workspace` 之類的消費方隨後在已路由後端上開啟自己的領域，並透過 `ctx.storageDomain` 讀寫記錄。多個後端可以並排保持掛載；哪個後端服務哪個領域由領域資料形式的設定決定，絕非樞紐的全域選擇。

### 你能得到什麼

- 已掛載的後端按名稱解析，因此同時掛載兩個內建後端的組合可以把每個領域按設定路由到任一種介質。
- 已掛載的資料形式解析為 `ctx.storage.<form>`；領域資料形式還直接以 `ctx.storageDomain` 對外服務。
- 錯誤設定會以穩定的 `StorageError` 程式碼明確報錯，而不是靜默推遲：未知的後端名稱、在其所有者掛載前讀取資料形式、或重複註冊都會丟擲異常。

### 失敗與恢復

- `backend-not-found`——領域資料形式路由到未掛載的後端；請新增後端包。資料形式會等待所有已設定後端註冊，因此行序不會造成失敗。
- `form-not-mounted`——消費方在 `dsh-storage-domain` 載入前讀取 `ctx.storage.domain`；請把領域行放在消費方之前。
- `duplicate-backend`／`duplicate-mount`——同一名稱或形式註冊了兩次；這是組合錯誤，會明確報錯。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

樞紐是一張純註冊表，擁有兩個面，設計目標是後端與資料形式可以獨立替換，而樞紐無需瞭解它們的內部實作。

### 設計理念

- **後端擁有介質，資料形式擁有語義。** 樞紐從不執行 IO；它只持有名稱 → 後端表和形式名 → 設施表。後端包註冊其介質所有者，資料形式包掛載其設施，雙方都不需要對方的細節。
- **多個後端並排共存。** 哪個後端服務哪個消費方由消費方自身的設定決定（領域資料形式的路由表），絕非樞紐全域的二選一。
- **註冊與掛載都是 effect。** `register()` 與 `mount()` 返回資源釋放函式；釋放只移除該次註冊的貢獻，且不會關閉後端——由所屬外掛在登出後關閉。
- **啟用不會與註冊競爭。** 每個後端外掛還會釋出一個僅用於生命週期的服務鍵（`storage.backend.<name>`）；資料形式提供者注入這些鍵，因此領域資料形式只在所有已設定後端註冊後啟用，而呼叫方仍透過樞紐按名稱解析後端。

### 後端約定

[`src/backend.ts`](src/backend.ts) 是後端實作者的規範性約定，由 `tests/contract.ts` 中的共享一致性套件逐條款檢查。一個後端只擁有一種介質，並暴露可選的資料形狀分面；`kv` 是唯一的分面，開啟單元即可獲得一個帶版本、全域單例的 schema 控制代碼，其每次呼叫均具備原子性，並在完成時保證持久化。單元名與表名必須匹配 `UNIT_NAME_RE`；記錄鍵是任意字串，絕不進入檔案路徑。單元不對並行寫入做序列化——順序由呼叫方負責——介質上記錄的版本與描述符不同時拒絕 `version-mismatch`（不做遷移）。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Storage` 服務、資料形式掛載、`StorageForms` 表 |
| [`src/registry.ts`](src/registry.ts) | `BackendRegistry`：名稱 → 後端表、註冊資源釋放函式 |
| [`src/backend.ts`](src/backend.ts) | 後端約定：分面、單元、`UNIT_NAME_RE` |
| [`src/error.ts`](src/error.ts) | 樞紐與每個後端共享的 `StorageError` 程式碼 |
| — | 不釋出執行時不變式伴生入口；樞紐是純註冊表（名稱 → 後端、形式 → 設施），其一致性完全由呼叫點強制保障（重複項或缺失項會同步明確報錯）；它既沒有事件流，也沒有可變介質可供交叉檢查。 |
| [`tests/contract.ts`](tests/contract.ts) | 針對每個後端執行的共享一致性套件 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當樞紐視角不夠用時閱讀以下頁面：子系統參考是權威約定，Agent Note 記錄了家族設計與延期工作。

- [儲存子系統](../../../docs/subsystems/storage.zh.md)——後端約定、領域語義、變更事件與生成的 API。
- [儲存包對映](../README.zh.md)——家族的各包及其在儲存庫中的位置。
- [領域 KV 儲存 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——樞紐、領域資料形式與工作階段後端遷移背後的設計。

-----

<a id="model-experience"></a>
## 模型體驗

### 後端與形式註冊

#### 模型看到什麼

無。`ctx.storage` 是主機側註冊表：樞紐不註冊工具、不注入提示詞，也不寫入工作階段事件，因此任何請求欄位都不會攜帶本包的資料。

#### Token 影響

每次請求都不會直接增加 token。

#### KV Cache 影響

與即時請求相互獨立：樞紐絕不觸碰請求字首，因此無法使提供者快取複用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義了樞紐不能做什麼。它們是目前包約束，不是任務積壓。

- **`kv` 是唯一的資料形狀**——後端只實作一個分面；面向工作階段事件日誌的 `log` 分面被推遲到工作階段後端遷移（[Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)）。
- **資料形式按需解析**——在領域外掛掛載前讀取 `ctx.storage.domain` 會丟擲 `form-not-mounted`；組裝會按相應順序排列外掛，而不是靜默推遲。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
