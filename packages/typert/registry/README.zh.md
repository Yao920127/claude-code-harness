---
description: "執行時 Typert 註冊表：儲存生成的包反射、惰性 Zod schema factory 與 Remote 呼叫描述符，並按需為消費方解析。"
kind: "package-reference"
---

# @deepseek-ai/dsh-typert-registry

[English](README.md) | 中文

## 概述

`dsh-typert-registry` 讓生成的 Typert 產物在執行時可按需查詢：每個包的反射、惰性 Zod schema factory 與 Remote 呼叫描述符都儲存在穩定鍵下。消費方首次請求 schema 時才會物化並快取它。註冊是原子且按 fiber 作用域的：貢獻要麼整體落實要麼完全不落實，並在註冊元件解除安裝時自動撤銷。同一服務還託管 Remote 呼叫所經由的 lookup 與作用域 Context 提供者註冊表。它不執行 TypeScript 分析，也不生成 schema；這些由生成器與 loader 負責。

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

在儲存或消費生成 Typert 產物的任何 Host 或 Client 組合中掛載本註冊表；它提供 `ctx.typert`。沒有設定。

### 最小設定

載入註冊表外掛；Client face 由 Client 執行時自身的中繼資料以同樣方式安裝，兩個 face 執行同一實作：

```yaml
- name: '@deepseek-ai/dsh-typert-registry'
```

### 查詢 schema 與反射

消費方用 `get(key)`、`resolve(key)` 或 `list(filter?)` 讀取 schema，用 `getPackage(name, face?)` 或 `listPackages(filter?)` 讀取包反射。首次讀取會物化一個程序 realm 內的 schema 實例，後續讀取複用該實例。`resolve()` 能區分格式錯誤的鍵、未註冊的包，以及已註冊但未以該名稱提供 schema 的包，各自給出不同的錯誤。`toJSONSchema(key)` 把已物化的 Zod schema 投影為 JSON Schema，但不快取該投影。

### 註冊貢獻

生成產物在 Loader 組合中透過 [loader](../loader/README.zh.md) 註冊；其他所有者直接呼叫 `ctx.typert.register(contribution)`，並獲得撤銷它的同一資源釋放函式。重複的包與 face 組合鍵、schema 鍵、呼叫 id 或端點會在提交任何內容之前拒絕整個批次。

### Lookup 與 Context 提供者

Remote 呼叫透過 `ctx.typert.lookups` 與 `ctx.typert.contexts` 解析 Host 物件與作用域 Context。`registerHost()` 安裝 Host wire 宣告及其 wire 到 Context 的 resolver，`configureHost()` 只替換該 resolver。`registerClient()` 為同一個 merge-declared kind 安裝雙向 Client adapter。Host 到 Client 的事件源顯式攜帶領域 identity，而不從 Context 反向投影。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋註冊表如何儲存與擁有貢獻；消費方 API 已在[使用本包](#use-this-package)中說明。

### 設計理念

註冊表建立在一個原則之上：貢獻是一次原子、由 fiber 擁有的提交。`register()` 先驗證包與 face 組合鍵、schema 與呼叫描述符，再在單個 Cordis effect 下提交全部內容，該 effect 的資源釋放函式精確撤銷這一貢獻。重複標識在擁有該操作的所有權邊界失敗，此時任何狀態都未改變。

### 子註冊表

- `ctx.typert.local`——目前環境的呼叫定義，含供原始碼模式退回使用的 `hasSeen()` 歷史。
- `ctx.typert.remotes`——在呼叫方 fiber 中掛載的、由消費方選中的貢獻。
- `ctx.typert.lookups`——lookup 提供者，以及按鍵設定的組合方解析器覆蓋。
- `ctx.typert.contexts`——按作用域鍵設定的 Host Context 提供者與 Client Context 繫結器。

每個子註冊表都會向已訂閱的監聽器釋出 `TypertRegistryChange` 事件；拋異常的監聽器會被記錄日誌，且不會阻止後續監聽器。

### 標識與驗證

鍵是穩定的：反射用 `<package>#<face>`，schema 用 `<package>#<name>`，端點用 `<namespace>/<method>`。驗證會拒絕含 `#` 的名稱、超出 RPC 端點段文法的 wire 名稱、重複鍵，以及在其註冊表生命週期內改變 wire 宣告的 lookup 定義；schema 條目與嚴格編解碼器必須攜帶 factory。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/service.ts`](src/service.ts) | `TypertRegistry` 服務、儲存、驗證、effect 接線 |
| [`src/types.ts`](src/types.ts) | 貢獻、記錄與過濾器型別 |
| [`src/client/index.ts`](src/client/index.ts) | 安裝同一註冊表的 Client face |
| — | 不釋出執行時不變式伴生入口；schema 與 package-reflection record 在 register/dispose 內一起變更，沒有獨立 event 或第二資料來源可供交叉核對；重複 identity 在所屬操作處失敗。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從註冊表逐步進入供給它與消費它的內容。

- [Typert loader](../loader/README.zh.md)——生成主機產物的自動註冊。
- [Typert 生成器](../generator/README.zh.md)——產生註冊表所存貢獻的包。
- [Typert 協定](../protocol/README.zh.md)——註冊表所服務的描述符、編解碼器與提供者約定。
- [Typert 子系統參考](../../../docs/subsystems/typert.zh.md)——字面的 `ctx.typert` 約定。
- [API Gateway 參考](../../../docs/api-gateway.zh.md)——呼叫描述符與提供者的主要消費方。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該執行時型別註冊表的消費方（cordis_inspect、wire faces、門禁）擁有註冊表內容的任何模型可見投影。

#### KV Cache 影響

無直接影響；把反射或 schema 放入請求的消費方負責由此產生的字首變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明註冊表儲存與拒絕什麼；它們是目前包約束，不是任務積壓。

- **不合並圖**——註冊表按 face 儲存生成的反射，但不合並主機側與用戶端側的圖，也不解析 TypeScript 引用；這些是分析器與生成器的事。
- **schema 鍵不含 face**——主機側與用戶端側在不同上下文中執行，因此在同一上下文中註冊來自兩個 face 的同名 schema 會被作為重複項拒絕。
- **JSON Schema 投影不快取**——`toJSONSchema()` 每次呼叫都返回全新文件；需要重複投影的消費方自行負責快取。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
