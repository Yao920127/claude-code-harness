---
description: "建置時 Typert 生成器：原始碼型別分析、與編譯器無關的模型與產物生成，供接入 Typert 釋出或消費生成產物的維護者閱讀。"
kind: "package-library"
---

# @deepseek-ai/dsh-typert-generator

[English](README.md) | 中文

## 概述

`dsh-typert-generator` 讓維護者把公開的 TypeScript 型別轉換為建置產物和與編譯器無關的模型。包透過 `./typert` 和可選的 `./client/typert` 匯出選擇加入；如果宣告、釋出清單、Remote 匯出或 Zod 投影無法被正確表示，生成過程就會失敗。儲存庫建置會生成可執行 schema factory 與配套宣告，工具也可以呼叫 `WorkspaceAnalyzer` 完成檢查或目錄生成而不釋出產物。生成過程只在建置時執行，絕不會進入即時 agent（智慧代理）工作階段。

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

本包供把 Typert 生成接入建置或消費生成產物的包維護者與儲存庫維護者使用。釋出是選擇加入的：宣告匯出入口、執行建置，產物即出現在 `lib/` 中；靜態分析則不需要產物。

### 從包中釋出 Typert 產物

參與貢獻的包在 `package.json` 中宣告主機側產物匯出；同時貢獻兩側的包還要宣告 `./client/typert`，含 Remote 方法的包還要宣告 `./remote`：

```yaml
exports:
  "./typert":
    types: "./lib/typert.host.d.ts"
    default: "./lib/typert.host.js"
files:
  - "lib/typert.host.js"
  - "lib/typert.host.d.ts"
```

建置完成後，`lib/typert.host.js` 與 `lib/typert.host.d.ts` 即存在，[loader](../loader/README.zh.md) 會在 Loader 組合中註冊該貢獻。生成的宣告檔案把 `TYPERT` 暴露為 `unknown`，因此參與貢獻的包永遠不會依賴執行時註冊表。當宣告缺失、指向錯誤檔案，或在沒有 Remote 方法的情況下發布 Remote 產物時，生成器會使建置失敗；不支援的 Zod 投影會以 `TypertEmitError` 指明具體建構並失敗，而不會展平或弱化源型別。

### 靜態分析工作區

靜態消費方直接針對工作區的 `tsconfig.host.json` 與 `tsconfig.client.json` 聚合設定呼叫 `WorkspaceAnalyzer`，選擇 face 與包子集，並在不生成或載入執行時產物的前提下讀取生成的 `FaceModel` 與型別圖。`analyzeInBatches()` 透過有界的編譯器程式處理大批次包選擇，模型形態保持一致；`discoverPackages()` 無需建置型別檢查程式即可找出參與貢獻的包。

### 在 tsdown 建置中執行生成

包的 `./tsdown` 子路徑為根 tsdown 設定提供 `typertPlugin()`：它在打包前轉換 TypeScript 依賴中的標準裝飾器，並在包輸出根目錄生成模型驅動的 face 產物。`package` 模式只生成目前打包的包；`workspace` 模式對每個顯式貢獻方各生成一次。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋生成器如何得到與編譯器無關的模型以及它生成什麼；可觀察的建置行為已在[使用本包](#use-this-package)中說明。

### 設計理念

生成器遵循一項核心分離原則：提取與生成透過與編譯器無關的模型解耦。`WorkspaceAnalyzer` 讀取以 face aggregate tsconfig 為種子的 TypeScript 程式，產出 `FaceModel` 與 `TypeGraph` 資料；`FaceModelEmitter` 只消費該模型，絕不接收編譯器節點。模型保留宣告標識、泛型參數及應用、顯式繼承、條件型別與對映型別、匯入屬性、abstract 修飾符與原始碼 JSDoc，並排除建構函式、靜態成員與非公共成員。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 公共 API：分析器、生成器、工作區生成器、渲染器、目錄投影 |
| [`src/analyzer.ts`](src/analyzer.ts) | `WorkspaceAnalyzer`：face 程式、check/write 模式、分批、發現、原始碼索引 |
| [`src/model.ts`](src/model.ts) | 與編譯器無關的模型型別 |
| [`src/emitter.ts`](src/emitter.ts) | `FaceModelEmitter`：Zod schema 與宣告生成、Remote 宣告 |
| [`src/workspace.ts`](src/workspace.ts) | `WorkspaceTypertGenerator`：發現、生成、匯出與檔案清單驗證 |
| [`src/tsdown-plugin.ts`](src/tsdown-plugin.ts) | tsdown 外掛面：裝飾器轉換與產物生成 |
| [`src/cordis-catalog.ts`](src/cordis-catalog.ts) | 生成 Cordis 目錄所用的目錄投影 |

### 分析與 face

Host 與 Client 是兩個獨立的 TypeScript 程式。直接專案引用確定編譯器 face 的成員歸屬，`dsh.client` 包子路徑則確定執行時 face 的貢獻；`package.json#exports` 劃定所有跨包公開邊界，跨 face 的邊只能來自匯入或重新匯出。解析到本包內部模組的相對匯入會沿該模組的重新匯出繼續追蹤，直到出現包說明符，因此包內轉發模組保留原始宣告引用；解析到其他包的相對匯入會失敗。`check` 模式遇到語法或語義診斷、缺失的公開型別標註、跨包私有引用，以及模型無法無損保留的可達宣告合併時都會失敗；`write` 模式插入型別檢查器推匯出的標註，並返回無診斷的 check 模式模型。NPM 依賴擁有的型別繼續以 `external` 引用表示，不會被展開。流方法的返回型別可以是 `Iterable<Out>`、`AsyncIterable<Out>` 或協定包的 `RemoteStream<Out, In>`，後者與標準庫包裝器一樣按符號名與宣告所在包識別；第二個型別參數不為 `never` 時產出描述符的上行編解碼器，生成的 Client 簽名則返回 `RemoteStreamHandle<Out, In>`。

### 生成與釋出約定

`FaceModelEmitter` 輸出包含只快取成功結果的 Zod schema factory 與 `TYPERT` 貢獻的可執行 JavaScript，以及把 factory 透過包的公開匯出標註為返回 `z.ZodType<SourceType>` 的宣告檔案；不支援的 Zod 投影會失敗。含 Remote 方法的 Host face 還會額外為 Client 生成 Host Remote 約定的 `typert.remote-client.*` 投影。`WorkspaceTypertGenerator` 驗證每個貢獻方的 `package.json`：`./typert` 與 `./client/typert`（存在 Remote 方法時還有 `./remote`）必須指向精確的生成檔案，且 `files` 清單必須包含它們。

[一元二進位制結果](../protocol/README.zh.md)在泛型型別解析後被識別。其 codec 驗證位元組陣列型別與 JSON 中繼資料，不遍歷、複製或凍結位元組載荷；生成的 Client 宣告保留原有中繼資料型別，並將位元組的底層緩衝區收窄為 `ArrayBuffer`。

### 目錄投影

執行時型別閉包索引匯出的 workspace 宣告和被引用的框架 enum。Vendor 宣告不參與業務 API 發現；公共結果引用其中 enum 時，目錄仍提供其定義。

根匯出包含本儲存庫 Cordis 目錄使用的模型驅動提取邏輯、完整性檢查與確定性文字渲染器。它們接受 `CordisCatalogPolicy`；由儲存庫持有的型別連結、基礎型別／豁免分類與繼承的 Cordis 條目仍位於 `scripts/gen-cordis-catalog.ts`，由呼叫方顯式傳入，因此本包只包含投影機制，不會隱式複製儲存庫的文件分類體系。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從生成模型逐步進入執行時與 Remote 呼叫路徑。

- [Typert 子系統參考](../../../docs/subsystems/typert.zh.md)——生成器建模的 Remote 約定與註冊表介面。
- [Typert 協定](../protocol/README.zh.md)——生成產物所擴充功能並消費的宣告。
- [Typert 註冊表](../registry/README.zh.md)——生成產物所供給的執行時儲存。
- [API 閘道參考](../../../docs/api-gateway.zh.md)——生成的 Remote 描述符如何端到端被呼叫。
- [與編譯器無關的模型 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-27-compiler-independent-typert-model.zh.md)——模型設計、備選方案與後果。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為建置時生成器在任何 agent 執行時之外執行，不觸及任何模型請求。

#### KV Cache 影響

無直接影響；生成產物只有在消費方將其放入請求時才會觸及請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明生成器無法建模或生成的建構；它們是目前包約束，不是任務積壓。

- **包匯出模式會被跳過**——參與貢獻的包需要具體的匯出目標；萬用字元匯出模式不會被分析。
- **跨 face 的名稱空間重新匯出會失敗**——具名與星號重新匯出會生成連結，但在 `TypeTargetModel` 能夠不經展平表示模組名稱空間之前，名稱空間重新匯出無法表示。
- **Zod 生成器只支援有意限定的子集**——泛型 schema 宣告，以及以條件型別或對映型別為 schema 根的計算建構，都會失敗，直到存在明確的 schema 工廠策略。
- **沒有生成的 schema 跨 face 匯入**——跨 face 連結會在模型中表示以供分析，但生成的 schema 均不需要跨 face 的執行時 Zod 匯入。
- **發現範圍只覆蓋具體公開匯出**——既未匯出、也未由可達圖匯入的宣告按設計排除在包模型之外。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。原始碼專案分析器與建置時 emitter 均不在任何 Cordis 執行時中執行；模型快照、可執行產物與消費方包的型別檢查會強制執行其輸出約定。
