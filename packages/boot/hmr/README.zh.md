---
description: "透過統一協調佇列熱過載外掛程式碼和 profile 設定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-hmr

[English](README.md) | 中文

## 概述

在應用執行期間過載外掛原始碼和設定。模組替換、Include 重新整理與 profile 設定變更共用一個佇列。包安裝在該佇列之外執行。`ctx.hmr` 保留現有 Cordis HMR 的設定和事件。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

啟動器提供 `profileContext` 時，base 組合包以 `root: []` 啟用 HMR；沒有該 profile 上下文的主機保留此條目為停用狀態。Headless、SDK 和 ACP 組合包在 YAML 中停用此條目，後續 profile patch 可以重新啟用。停用或省略 HMR 時，更改在重新啟動後生效。如需監聽原始碼模組，在啟動前透過 profile patch 設定 base 組合包提供的 `hmr` 條目：

```yaml
- id: hmr
  disabled: false
  config:
    root: ["."]
```

已有設定將模組名 `@deepseek-ai/cordis-plugin-hmr` 替換為 `@deepseek-ai/dsh-hmr`。繼續提供 `hmr` 服務鍵、`baseDir`、`config`、`getLinked()`、`getOuterStack()`、`hmr/change` 和 `hmr/reload`。工作區保留 vendored 包；DSH profile 使用本包。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `base` | Context 的 base URL | 模組監聽的基準目錄。 |
| `root` | `["."]` | 模組監聽目錄；`[]` 僅保留顯式註冊的設定監聽。 |
| `ignored` | `["**/node_modules", "**/.*", "cache", "data"]` | 排除的模組路徑。 |
| `debounce` | `100` | 合併模組變化的毫秒數。 |

Chokidar 選項（包括輪詢）保持原有含義。精確設定監聽同時觀察新增、刪除及初始不存在的父目錄。它們預設使用 `awaitWriteFinish: true`：編輯後等待 Chokidar 的 2 秒寫入穩定視窗，避免其變化事件節流丟失通知。可透過 `awaitWriteFinish` 調整視窗；停用它可能漏掉快速連續編輯。直接透過 Plugin Manager 發起的操作無需等待檔案事件即可應用。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

`watchConfig()` 註冊會被等待的設定處理器。`runExclusive()` 將設定變更、Loader 更新與自動過載序列化，並拒絕巢狀事務。包安裝和刪除在該佇列之外執行。HMR 不取得包操作寫鎖；manifest 通知僅在有序的 `dsh.profile.bundles` 列表變化時觸發過載。profile 與 home patch 變化也會觸發重新組合。設定事務期間收到的檔案事件在事務結束後處理。 Include 重新整理和 profile 過載都透過普通的 Loader 條目更新到達外掛；僅 volatile 變化由 Loader 就地提交。

App-boot 負責 profile 解析和 patch 優先順序規則。HMR 讀取啟動器提供的純資料 `profileContext`，在初始化時註冊 profile manifest 和兩份使用者 patch 的監聽，並等待應用就緒後處理更改。銷燬 HMR 時會關閉監聽器並取消等待啟動的過載。HMR 也負責模組快取替換和過載排程。設定監聽器在目前事務上下文之外啟動，使後續通知可以進入佇列。不釋出 invariant 伴生入口，因為佇列和監聽註冊沒有獨立的持久投影。

被監聽模組的路徑沿用 Node ESM 解析所用的 `realpathSync()` 表示，包括 Windows 短目錄名，使檔案事件與模組快取匹配。

模組替換實作源自 `@cordisjs/plugin-hmr` 1.0.15，包含 Harness 的 Node loader 和惰性設定修改。保留其 [MIT 許可證](LICENSE)。

</details>

<a id="model-experience"></a>
## 模型體驗

### 被過載的外掛

#### 模型看到什麼

`ctx.hmr` 不新增模型工具或訊息。載入後的外掛決定後續工具和提示詞貢獻。

#### Token 影響

沒有直接的 token 貢獻。

#### KV Cache 影響

過載提供上下文的外掛可能改變後續請求字首；HMR 不改寫對話歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 模組替換需要 Node loader 內部介面。框架依賴變化呼叫主機提供的 `loader.exit()` 掛鉤；HMR 本身不重新啟動程序。
- 透過外掛管理器替換已安裝檔版本仍需要重新啟動。瀏覽器 Client 模組圖保留獨立的瀏覽器側載入機制。

### 開發備註

<a id="dev-note"></a>

無。
