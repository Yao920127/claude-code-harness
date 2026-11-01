---
description: "本次執行環境的不可變快照，記住每個值來自哪一層；供必須以不信任壓平 process.env 的方式解析面向使用者值的包使用。"
kind: "package-library"
---

# @deepseek-ai/dsh-launch-environment

[English](README.md) | 中文

## 概述

使用 `@deepseek-ai/dsh-launch-environment` 解析啟動時的環境值，無需信任壓平的 `process.env`。它會凍結繼承的程序值、呼叫目錄的 `.env` 和 Harness 主目錄的 `.env`，再按固定可信順序返回勝出的值及其來源。呼叫方可以在敏感查詢中排除某些層；無論之後順序如何變化，被省略的層都不可達。快照不可變，但每一層仍會被複制到 `process.env`，因此它不隔離子程序。請把它作為庫匯入；不能從 `cordis.yml` 掛載它。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當各層並非同等可信時，透過快照而非 `process.env` 解析面向使用者的值——例如呼叫方絕不能從專案目錄取得的憑證覆蓋值。

### 解析一個值

```ts
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

declare const ctx: import('@deepseek-ai/cordis').Context
const endpoint = launchEnvironmentOf(ctx).get('DEEPSEEK_BASE_URL')?.value
```

`get(name)` 按可信度從高到低搜尋所有層。`getFrom(name, sources)` 只搜尋指定的層，不改變這一可信順序——絕不能接受某一層的呼叫方不把它列進去，因此後續任何重新排序都無法讓它回來。

`launchedThroughSsh(snapshot)` 僅在繼承的程序層中存在非空 `SSH_CONNECTION` 或 `SSH_TTY` 時返回 true。Web 瀏覽器喚起、自適應目錄選擇器與 Open In 共用此判斷；專案與使用者 `.env` 中的值不作為 SSH 工作階段的依據。

### 各層的優先順序

| 層 | 它是什麼 |
|---|---|
| 繼承的程序環境 | 啟動 shell、CI 任務或容器傳入的內容——本次執行的明確意圖 |
| `<invocation cwd>/.env` | harness 被啟動於其中的專案；產品信任它設定自己的 agent（智慧代理） |
| `$DSH_HOME/.env` | 使用者自己的機器級預設值 |

變數名按平臺自身的規則匹配：POSIX 上精確匹配，Windows 上不區分大小寫。在 Windows 上做大小寫敏感的查詢會選錯層——shell 裡的 `deepseek_api_key` 與專案 `.env` 裡的 `DEEPSEEK_API_KEY` 對作業系統而言是同一個變數。

### 沒有啟動器引導這棵樹時

當產品 CLI（命令列介面）引導了這棵樹時，`launchEnvironmentOf(ctx)` 返回啟動器的快照；否則返回只含繼承環境的那一層。該退回並不削弱規則：SDK 主機或裸 `cordis.yml` 從未發現過任何檔案，因此它擁有的一切就是它被啟動時的環境。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

快照建立在一個分離之上：啟動器決定存在哪些檔案，快照決定值如何排序。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `createLaunchEnvironmentSnapshot`、`launchEnvironmentOf` 與 `ctx.launchEnvironment` 槽位 |
| — | 不釋出執行時不變式伴生入口；快照在任何 fiber 啟動前即已凍結，並且本包不擁有任何事件流或可變執行時資料；單元測試會強制檢查其查詢與拒絕規則。 |

### 快照如何保持凍結

`createLaunchEnvironmentSnapshot` 在建構時複製每一層的值，因此之後對源物件的修改無法改變快照。無論建構順序如何，查詢都按規範信任順序進行；在 Windows 上，名字在儲存前摺疊為大寫，因此大小寫變體無法拆分優先順序。

### 省略意味著什麼

`getFrom` 按規範順序過濾，絕不按呼叫方列表的順序。省略一層就是拒絕：該值在該呼叫中不可達，這正是呼叫方在某個決策絕不能被某層影響時使用的機制。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要建置快照的啟動器或透過快照解析的消費方時，閱讀以下頁面。

- [boot 包](../../boot/app-boot/README.zh.md)——在任何設定項掛載之前填充 `ctx.launchEnvironment` 的啟動器。
- [憑證儲存](../../credentials/credentials-local/README.zh.md)——針對快照各層解析已儲存的憑證。
- [DeepSeek 提供者](../../llm/llm-deepseek/README.zh.md)——透過啟動環境讀取提供者設定。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明快照何時不是安全邊界。它們是目前包約束，不是任務積壓。

- **快照不是子程序邊界**——每一層同樣會被物化進 `process.env`，因此專案裡的普通變數會按 [`dsh-subprocess`](../../subprocess/subprocess/README.zh.md) 的清洗規則抵達子程序；產品啟動器的 [`.env` 約定](../../boot/app-boot/README.zh.md) 會在物化之前拒絕 bootstrap 變數。
- **沒有按工作區劃分的層**——專案層是呼叫目錄，在啟動時固定；之後在 Web UI 中選擇的工作區不貢獻任何內容，這是刻意的，因為跟隨它等於讓模型自己的工作區在工作階段中途改變 harness 環境。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
