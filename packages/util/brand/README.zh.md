---
description: "供擁有易混淆領域值的包使用的名義字串與數字型別及無狀態建構函式。"
kind: "package-library"
---

# @deepseek-ai/dsh-brand

[English](README.md) | 中文

## 概述

`dsh-brand` 讓結構相同的字串或數字在型別層面不可互換：`SessionId` 無法傳給期望 `ToolCallId` 的位置，事件序號也無法傳給需要日誌偏移量的位置。`brandString<T>()` 與 `brandNumber<T>()` 在不持有共享執行時狀態的情況下應用名義品牌，讓所屬包可以定義領域型別，而無需匯入不相關的能力。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當領域值跨越包邊界，並可能與使用同一原語表示的另一個值混淆時，為其新增品牌；並非每個字串或數字都需要品牌。品牌化值是給 TypeScript 呼叫方的約定：它只會進入期望該領域的函式，不同品牌會在編譯期被拒絕。

### 為字串新增品牌

在所屬包中宣告品牌化型別，並在該包準入字串的位置應用品牌：

```ts
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

export type SessionId = Branded<'SessionId'>

const sessionId = brandString<SessionId>('session-1')
```

`brandString()` 只改變靜態型別，不執行執行時驗證。所屬型別若有領域文法，應在呼叫前完成驗證。新增品牌後，該 id 在比較、日誌記錄、JSON 序列化和協定傳輸中仍表現為普通字串。

### 為數字新增品牌

在所屬包中宣告數字品牌，並且僅在該包準入數字之後應用品牌：

```ts
import { brandNumber, type BrandedNumber } from '@deepseek-ai/dsh-brand'

export type SessionSeq = BrandedNumber<'SessionSeq'>

const seq = brandNumber<SessionSeq>(7)
```

`brandNumber()` 原樣返回數字，不執行驗證。所屬包會在新增品牌前驗證非負安全整數範圍等要求。比較、算術、日誌、JSON 序列化與協定傳輸保留普通數字行為；算術會產生未品牌化數字，所屬包必須重新准入該數字，才能讓它再次進入領域。

### 何時新增品牌

為跨包邊界且可能被混淆的值新增品牌——`dsh-llm` 中的 `ToolCallId`、`dsh-session` 中由 agent（智慧代理）和工作階段共享的 `SessionId`、`dsh-jobs` 中的 `JobId`，以及 `dsh-session` 中的 `SessionSeq` 與 `SessionLogOffset`。保持區域性或無法混淆的值不需要這種抽象。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

該包定義兩個交叉型別：`string & { readonly [BRAND]: B }` 與 `number & { readonly [BRAND]: B }`，其中 `BRAND` 是模組私有的 `unique symbol`。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 品牌化字串與數字型別及其無狀態建構函式 |
| — | 不釋出執行時不變數配套入口；這個純工具不擁有事件流或可變執行時資料；其值代數由單元測試保障。 |

### 值為何可移植

私有 symbol 在執行時不存在：TypeScript 會將其擦除，因此品牌化值沒有標籤或 prototype。`brandString()` 與 `brandNumber()` 都原樣返回輸入。因此，彼此獨立安裝的副本無需共享註冊表或 constructor identity，也會生成可互換的值。

### 為何保持無依賴

把這些 helper 放在獨立包中，意味著 `dsh-jobs` 可以為 `JobId` 新增品牌，而無需匯入不相關的能力包；每個能力仍然擁有其具體 id 的含義與驗證。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要這些原語所品牌化的值或圍繞它們的型別約定時，閱讀以下頁面。

- [核心子系統](../../../docs/subsystems/core.zh.md)——共享 `SessionId` 品牌與型別規則的記錄位置。
- [LSP 子系統](../../../docs/subsystems/lsp.zh.md)——建置在本原語之上的品牌化提供者 id `LspProviderId`。
- [jobs 包](../../jobs/jobs/README.zh.md)——由 jobs 能力擁有的 `JobId` 品牌。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
