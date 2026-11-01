---
description: "生成的 Typert 產物所用的 Loader 整合：已掛載的包如何自動把主機側反射與 schema 貢獻給執行時註冊表。"
kind: "package-reference"
---

# @deepseek-ai/dsh-typert-loader

[English](README.md) | 中文

## 概述

掛載 `dsh-typert-loader` 後，Loader 組合中每個掛載的包都會自動把其生成的 Typert 反射與 schema factory 貢獻給執行時註冊表——並在包或本外掛解除安裝時自動撤銷。沒有該匯出的包會被跳過，因此在任何 Loader 組合中掛載它都是安全的。顯式 `packages` 用於覆蓋巢狀在另一 Loader 設定項之下的外掛，這些外掛的 fiber 不攜帶可解析的包說明符。它是僅支援 Node 的外掛，需要設定樹解析錨點才能解析包。

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

在載入釋出生成 Typert 產物的包的 Host Loader 組合中掛載本外掛。註冊表本身來自 `dsh-typert-registry`；本外掛只負責發現與註冊。

### 最小設定

載入註冊表與 loader；loader 預設發現每一個 Loader 設定項：

```yaml
- name: '@deepseek-ai/dsh-typert-registry'
- name: '@deepseek-ai/dsh-typert-loader'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `packages` | `[]` | 為巢狀在另一 Loader 設定項下的外掛額外註冊的包產物；每個包都必須能從設定樹解析，並匯出 `./typert` |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-typert-loader)是所有受支援欄位的完整真源。

### 註冊什麼

每個符合條件的 Loader 設定項都會把其生成的主機側反射與 schema factory 貢獻給執行時註冊表。註冊跟隨設定項生命週期：設定項或本外掛解除安裝時撤銷；在設定項或本外掛任一方解除安裝後才結束的匯入操作會被丟棄。

### 可觀察行為與失敗

沒有該匯出的包會被靜默跳過。解析結論與已匯入的 manifest（中繼資料清單）會在整個程序生命週期內快取，因此新增 `./typert` 匯出後必須重新啟動。已掛載設定項對應的產物格式錯誤時，啟用會明確報錯；之後才發生的失敗按包記錄日誌，不會阻止無關包完成註冊。無法從設定樹解析、或缺少該匯出的顯式 `packages` 條目會明確報錯並指名該包。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 loader 如何掃描、驗證與註冊；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

本外掛是一個增量掃描器，與 client-modules 的 Node 側實作對稱：每次 Cordis `internal/plugin` 事件都會把該 fiber 的設定項名稱標記為髒，微任務 flush 會針對即時 Loader 設定項逐一調和每個髒名稱；啟用階段用所有目前設定項填充同一髒集合。

### Manifest 驗證

`validateTypertManifest()` 是模組／檔案邊界：manifest 從建置產物進入型別化註冊表，因此每個欄位都會被檢查。manifest 必須指名匯出它的包、攜帶 `host` face、持有 schema factory，並保持服務、事件、物件、成員、型別與文件記錄格式正確；呼叫描述符必須使用帶 factory 的嚴格編解碼器。每次失敗都會指名包與缺陷。

### 快取與歸屬

結論（可解析說明符、是否匯出）與已匯入的 manifest 按包名快取且永不過期。註冊按設定項名稱鍵控，並透過 `ctx.typert.register()` 返回的同一資源釋放函式撤銷；進行中的任務按設定項跟蹤，因此遲到的匯入不可能在其所有者消失後註冊貢獻。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config`、掃描器、manifest 驗證、註冊裝配邏輯 |
| — | 不釋出執行時不變式伴生入口；Loader 設定項的生命週期直接持有每個對應的註冊表資源釋放函式，整合測試會觀察註冊與移除。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；這些頁面從 loader 開始，依次介紹它註冊的內容及其生成方。

- [Typert 註冊表](../registry/README.zh.md)——本外掛所供給的服務。
- [Typert 生成器](../generator/README.zh.md)——產生 loader 所匯入產物的包。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-typert-loader)——`packages` 欄位宣告及其 JSDoc。
- [Typert 組地圖](../README.zh.md)——完整的型別反射流水線。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 loader 整合只註冊生成的產物；任何模型可見投影均由消費方負責。

#### KV Cache 影響

無直接影響；註冊變更只有透過讀取註冊表的消費方才會影響請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 loader 不會發現或註冊什麼；它們是目前包約束，不是任務積壓。

- **僅主機側**——發現機制只會匯入主機側 `./typert` 產物；在為用戶端執行時新增等價的發現機制之前，需要先有獨立的組合所有者。
- **巢狀外掛需要顯式條目**——Loader 設定項會被自動發現，但巢狀在另一設定項之下、或完全不經 Loader 載入的外掛，需要顯式加入 `packages`，或由其所有者直接呼叫 `ctx.typert.register()`。
- **快取結論永不過期**——程序中途新增 `./typert` 匯出的包需要重新啟動後 loader 才會註冊它。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
