---
description: "包身份、執行時要求和 DSH 外掛中繼資料的共享 TypeScript 宣告。"
kind: "package-library"
---

# @deepseek-ai/dsh-package-manifest

[English](README.md) | 中文

## 概述

使用 `DshPackageManifest` 描述包中繼資料、`DshManifest` 描述 `dsh` 下的公共欄位，以及 `DshClientManifest` 等成員型別描述單個領域。各讀取方負責 JSON 解析、總和檢查碼預設值解析。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

從包根匯入型別。僅檢查自己的原始碼時使用開發依賴；若釋出的宣告檔案引用這些型別，則使用生產依賴。

```ts
import type { DshClientManifest, DshPackageManifest } from '@deepseek-ai/dsh-package-manifest'

const client: DshClientManifest = { platform: 'web' }
const manifest: DshPackageManifest = {
  name: 'example-dsh-plugin',
  version: '1.0.0',
  engines: { node: '>=24', dsh: '0.1.5-alpha.1' },
  dsh: {
    manifestVersion: 1,
    bundle: { patch: './cordis.patch.yml' },
    client,
  },
}
```

`DshPackageManifest` 描述 DSH 使用的 package.json 欄位，其中 `name` 和 `version` 必填；它不是完整的 npm schema（模式）。本地 profile 讀取方使用 `Partial<DshPackageManifest>`，因為 profile 無需釋出版本。`DshManifest` 僅描述 `dsh` 下的公共作者欄位。`DshBundleManifest.patch` 是一個 patch 檔案路徑，或一個有序的路徑列表，均相對於包根目錄；launcher 按列表順序把它們作為同一個組合包層應用。TypeScript 檢查範例並刪除 `import type`；這些介面不解析 JSON，也不寫入檔案。

以下中繼資料欄位均可選。省略時，格式版本或相容的主機版本保持未宣告狀態；讀取方不推斷預設值。

| 欄位 | 含義 |
|---|---|
| `dsh.manifestVersion` | manifest（中繼資料清單）格式標識；宣告的格式為 `1`，獨立於 npm 包版本和 Session 格式版本。 |
| `engines.dsh` | 作者宣告的相容 DSH 版本，使用 SemVer 範圍，也可填寫精確的預釋出版本。此欄位與 `engines.node`、`engines.npm` 並列；engines 物件可省略 `dsh`。 |

`LocalizedText` 攜帶字面文字或帶必需英文退回值的語言對映。`PluginLocalizedMeta` 攜帶已安裝外掛的可選展示標題、描述、從 `package.json.icon` 解析的圖片 data URL，以及元資訊診斷。[App boot](../../boot/app-boot/README.zh.md) 讀取這些值；本包只提供其型別。

公共組合宣告定義在 [`src/types.ts`](src/types.ts) 中。內部 `configTrees`、`sessionFormatMigration` 和生成的 `moduleFallback` 中繼資料分別由映像打包器、目錄生成器和啟動器讀取方擁有；公共型別不暴露這些欄位。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

包根僅重新匯出 [`src/types.ts`](src/types.ts) 中的宣告。本包不釋出執行時不變數伴隨模組，因為它沒有執行時狀態或可獨立觀察的關係。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Profile 啟動器](../../boot/app-boot/README.zh.md#profiles)——manifest 載入與組合。
- [公共包中繼資料](../../../.agents/notes/implemented/architecture/2026-09-10-public-package-manifest.zh.md)——欄位位置與讀取方歸屬。

<a id="model-experience"></a>
## 模型體驗

無，因為本包僅匯出型別。

#### KV Cache 影響

型別宣告不增加模型輸入，因此不影響提供者的快取複用。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

- **僅提供靜態型別。** 消費方讀取並驗證所需的 JSON 欄位，再將共享宣告適應為執行時資料。本包不提供解析器、getter helper、檔案檢查或預設值。
- **相容性僅作宣告。** 目前安裝器和載入器不強制檢查 `dsh.manifestVersion` 或 `engines.dsh`；宣告範圍不會拒絕不相容的主機，也不會驗證 SemVer 語法。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
