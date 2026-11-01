---
description: "受管 DSH_* shell 環境，供選擇、設定或擴充功能每次模型 shell 呼叫所執行環境的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-shell-env

[English](README.md) | 中文

## 概述

`dsh-shell-env` 提供每次模型 shell 呼叫——bash 或 pwsh——所執行的受信 `DSH_*` 環境：內建事實如 `DSH_HOME`、`DSH_SHELL=1`、agent（智慧代理）的 `DSH_SESSION_ID`，以及所啟動 profile 的 `DSH_PROFILE` 與 `DSH_PROFILE_DIR`。外掛作者可以註冊自己的事實，帶宣告鍵、按每次執行收集，並隨外掛釋放；重複所有權或未宣告的執行時鍵會明確報錯，而不是靜默覆蓋。註冊表不會改變模型看到的其他任何內容——shell 工具擁有各自的 schema 與提示詞。任何掛載了模型 shell 工具的組合都適合選擇它；設定只決定 Harness 主目錄。

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

在任何掛載模型 shell 工具（`dsh-tool-bash` 或 `dsh-tool-pwsh`）的組合中載入本外掛：此後每次前臺或後臺 shell 呼叫都會執行在新收集的受管環境中，而不是程序繼承來的任意 `DSH_*` 值。

### 每次 shell 呼叫都會收到什麼

每次呼叫都會收到 `DSH_HOME`（Harness 主目錄的絕對路徑）、`DSH_SHELL=1`，agent 呼叫還會收到 `DSH_SESSION_ID`（呼叫方工作階段的 id）。啟動器提供了 profile 上下文時，每次呼叫還會收到 `DSH_PROFILE`（profile 名）與 `DSH_PROFILE_DIR`（其絕對目錄；其 `node_modules` 只存放 profile 自行安裝的包，harness 自帶的組合包從 dsh 安裝目錄解析）；不帶 profile 啟動的組合則兩者都沒有。

### 新增你自己的環境事實

其他外掛透過註冊一個 contributor 來貢獻事實，需要提供穩定名稱、它可能返回的完整 `DSH_*` 鍵集合、每個鍵的描述，以及為一次執行計算取值的 resolver：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell-env'

export const inject = ['shellEnv']

export function apply(ctx: Context): void {
  ctx.shellEnv.register({
    name: 'deployment-region',
    variables: { DSH_DEPLOYMENT_REGION: { description: 'Current deployment region.' } },
    resolve: execution => execution.agent === undefined ? {} : { DSH_DEPLOYMENT_REGION: 'cn-north' },
  })
}
```

contributor 必須宣告它返回的每個鍵；返回未宣告或非字串的值會讓該次呼叫失敗。註冊隨註冊外掛的釋放而釋放，因此熱過載外掛會移除它的事實。

### 選擇 Harness 主目錄

唯一設定欄位決定暴露為 `DSH_HOME` 的主目錄；預設解析順序為 `dshHome` 設定、環境變數 `$DSH_HOME`，然後是 `~/.dsh`。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `dshHome` | `$DSH_HOME`，然後 `~/.dsh` | 暴露為 `DSH_HOME` 的 Harness 主目錄絕對路徑 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-shell-env)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 可能出什麼問題

兩個 contributor 宣告同一個鍵，或 contributor 聲稱擁有保留內建鍵（`DSH_HOME`、`DSH_SHELL`、`DSH_SESSION_ID`、`DSH_PROFILE`、`DSH_PROFILE_DIR`），都會導致外掛載入時明確報錯。`DSH_*` 鍵必須全大寫並帶下劃線（例如 `DSH_REGION`），缺少描述也會讓註冊失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋註冊表背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **受信名稱空間，每次呼叫重建。** 環境是歸 Harness 所有的 `DSH_*` 名稱空間：shell 執行器丟棄繼承的 `DSH_*` 值，併為每次執行合併註冊表的目前快照，因此巢狀 harness 與並行的父子 agent 無法洩漏陳舊身份，`process.env` 也永不被修改。
- **宣告所有權，衝突明確報錯。** contributor 預先宣告鍵，使重複所有權在第一條命令之前就被發現；resolver 只能返回已宣告的鍵。
- **內建鍵留在這裡。** `DSH_HOME`、`DSH_SHELL`、`DSH_SESSION_ID`、`DSH_PROFILE` 與 `DSH_PROFILE_DIR` 為註冊表保留；contributor 不能聲稱擁有它們。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口、`ShellEnvRegistry` 服務與內建事實 |
| — | 不釋出執行時不變式伴生入口；環境註冊表會在每次註冊和收集時驗證所有權與收集值，也不釋出可供伴生入口交叉檢查的獨立快照。 |

### 收集

`collect(execution)` 從內建鍵出發，當執行攜帶 agent 時加入工作階段 id，再按 contributor 名稱排序合併每個已註冊 contributor 解析出的值。結果是一個凍結、按鍵排序的快照，透過 `ShellExecRequest.dshEnv` 傳遞。`list()` 列舉宣告而不執行 resolver，因此無法反映依賴執行的值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 shell 家族逐步進入執行器 seam 與生成目錄。

- [shell 包對映](../README.zh.md)——bash 能力家族及其角色。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md)——工具執行所經由的 `ctx.shell` seam。
- [tool-bash](../tool-bash/README.zh.md)——消費本環境的 bash 工具。
- [tool-pwsh](../tool-pwsh/README.zh.md)——消費本環境的 pwsh 工具。
- [home paths 包](../../util/home-paths/README.zh.md)——`DSH_HOME` 如何解析。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-shell-env)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

透過 shell 工具（`dsh-tool-bash`、`dsh-tool-pwsh`）間接產生影響；這些工具把本註冊表的受管 `DSH_*` 事實暴露在每次 shell 工具呼叫中。

#### KV Cache 影響

受管環境永遠不會進入請求字首，因此不會使提供者快取複用失效；任何字首變更都取決於 shell 工具定義與目前請求信封。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明註冊表何時不合適或需要小心使用。它們是目前包約束，不是任務積壓。

- **`list()` 只列舉外掛貢獻的變數**——註冊表自有的內建鍵（`DSH_HOME`、`DSH_SHELL`、`DSH_SESSION_ID`、`DSH_PROFILE`、`DSH_PROFILE_DIR`）不包含在內，因此診斷、提示詞或 UI 程式碼不得把 `list()` 當作完整的環境目錄。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
