---
description: "DeepSeek Harness 主目錄與使用者資料路徑的共享解析，供需要統一根目錄、波浪號展開與穩定監聽路徑的包使用。"
kind: "package-library"
---

# @deepseek-ai/dsh-home-paths

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-home-paths` 讓包作者能夠解析統一的 DeepSeek Harness 資料根目錄，並由它派生子路徑。顯式路徑優先於 `$DSH_HOME`，後者優先於 `~/.dsh`；空白環境變數會被忽略。其公開輔助函式可以在不暴露機器絕對路徑的情況下顯示根目錄，僅展開單獨或目前使用者的波浪號形式，並規範化最終路徑段尚不存在的監聽目標。請把它作為庫依賴直接使用，不要透過 `cordis.yml` 載入。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當包必須與 harness 的其他部分就使用者資料存放位置達成一致時使用這些輔助函式：先解析一次主目錄，再從中派生所有子路徑。

### 解析主目錄

```ts
import { resolveDshHome, dshHomePath, dshCachePath } from '@deepseek-ai/dsh-home-paths'

const home = resolveDshHome()                // configured path, else $DSH_HOME, else ~/.dsh
const settings = dshHomePath('settings')     // join one child onto the resolved home
const cache = dshCachePath('models')         // $DSH_HOME/cache/models, default ~/.dsh/cache/models
```

顯式設定的路徑優先順序最高，然後是 `$DSH_HOME`，最後是預設的 `~/.dsh`。空或僅含空白的 `$DSH_HOME` 視為未設定，因此空白的覆蓋值絕不會把主目錄解析到目前工作目錄。

`dshCachePath(...segments)` 從解析出的主目錄下的 `cache` 目錄派生路徑。不傳路徑段時返回快取目錄本身。傳入首個選項物件 `dshCachePath({ dshHome: home }, ...segments)` 可使用顯式設定的主目錄，遵循相同的優先順序與波浪號展開規則。它返回絕對路徑，不會建立目錄。

### 展示主目錄

面向使用者的路徑請以符號形式渲染根目錄，而不是機器路徑：預設主目錄顯示為 `~/.dsh`，任何已設定的主目錄顯示為 `$DSH_HOME`。展示形式絕不會洩露機器的絕對路徑。

### 展開使用者路徑

`expandHomePath` 針對作業系統主目錄展開開頭的 `~`、`~/` 或 `~\`，其餘內容原樣保留——非波浪號路徑以及 `~alice/...` 等指定使用者的形式不做任何改動。

### 規範化監聽路徑

`canonicalizeWatchPath` 為原生檔案系統 watcher 提供目標路徑的一種規範化寫法：先透過 `realpath` 解析層級最深的現有祖先，再拼回缺失的字尾，因此檔案或目錄在建立之前就可以被監聽。這可以防止 Windows 把普通檔案祖先當作普通缺失處理，也防止 8.3 短名別名與原生 watcher 後端發出的長路徑混用。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包建立在一個原則上：harness 的所有使用者資料都位於同一個根目錄下，其他每個輔助函式都由該決策派生。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 主目錄解析、路徑拼接、展示、波浪號展開與監聽路徑規範化 |
| — | 不釋出執行時不變式伴生入口；這個純工具包不持有事件流或可變執行時資料；其解析規則和值代數由單元測試保障。 |

### 解析規則

`resolveDshHome` 先讀顯式覆蓋值，然後讀 `$DSH_HOME`，最後退回到作業系統主目錄拼接 `.dsh`。選中的值經過波浪號展開並規範化為絕對路徑；`dshHomePath` 用 Node 的平臺路徑規則拼接子路徑段。`dshHomeDisplay` 把解析出的路徑與預設根目錄比較並返回符號標籤，因此已設定的主目錄絕不洩露其絕對路徑。

### 規範化機制

`canonicalizeWatchPath` 從目標向上逐級查詢，直到找到現有祖先，用 `realpath` 解析它、證明它是可列舉目錄，再拼回缺失的字尾。除路徑不存在以外的錯誤都會傳播；缺失字尾的祖先若不是目錄則被拒絕。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要啟動器或依賴統一主目錄根的消費方時，閱讀以下頁面。

- [boot 包](../../boot/app-boot/README.zh.md)——在任何外掛掛載之前解析主目錄的啟動器。
- [shell 環境](../../shell/shell-env/README.zh.md)——`DSH_HOME` 如何到達模型 shell 呼叫。
- [匿名使用者 id](../../identity/anonymous-user-id/README.zh.md)——位於解析後主目錄下的儲存身份檔案。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明這些輔助函式何時不是合適的工具。它們是目前包約束，不是任務積壓。

- **展開範圍刻意保持狹窄**——只有單獨的 `~`、`~/...` 和 `~\...` 使用目前作業系統主目錄；`~alice/...` 等指定使用者的形式、環境變數與 shell 表示式保持不變。
- **規範化只讀不改**——`canonicalizeWatchPath` 執行 `realpath` 探測並傳播除路徑不存在以外的錯誤；呼叫方仍負責目錄建立、權限，以及對結果路徑應用信任策略。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
