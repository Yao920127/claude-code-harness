---
description: "用於即時組合的執行時不變數檢查：執行包自有檢查的註冊表服務，供使用者和維護者選擇、設定或排查。"
kind: "package-reference"
---

# @deepseek-ai/dsh-invariants

[English](README.md) | 中文

## 概述

`dsh-invariants` 在 DeepSeek Harness 組合中執行包自有的執行時檢查——不變數：任何包都可以釋出一個 `./invariant` 配套入口，在組合執行期間驗證其自身的持久關係（權威事件流與可變快照）。檢查自動執行，失敗的檢查會報告歸因到擁有被違反關係的包的 `InvariantError`。需要帶全域開關與包名過濾器的自檢診斷時選擇它；標準 agent（智慧代理）組合已掛載它及四個核心配套入口，而單獨載入服務不會安裝任何檢查。

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

當組合需要驗證自身執行時約定時掛載註冊表，然後決定執行哪些包的檢查。服務暴露 `ctx.invariants`；配套入口以其包的精確 npm 名稱註冊檢查，每次失敗都會攜帶所屬包名。

### 何時使用

需要即時診斷的組合請使用註冊表。[`dsh-sdk-minimal`](../../bundle/sdk-minimal/README.zh.md) 掛載它及四個核心有狀態配套入口——`dsh-session`、`dsh-agent`、`dsh-scope` 與 `dsh-agent-loop`；`dsh-base` 刻意省略執行時診斷。自定義組合掛載註冊表，併為任何其他已載入、且希望檢查其約定的包新增配套入口。單獨載入註冊表不會安裝任何檢查：它自身不攜帶任何產品檢查，因此從不掛載配套入口的組合不會觀察到任何診斷行為。

### 啟用檢查與選擇包

註冊表預設啟用，並在沒有過濾器的情況下檢查每個已註冊的包。用 `enabled` 作全域開關，用 `package_allowlist` 只接納指定包，用 `package_blocklist` 在 allowlist 匹配之後排除包——blocklist 匹配優先於 allowlist 匹配。模式是區分大小寫的 JavaScript 正規表示式源（除非自帶 `^` 與 `$`，否則不錨定）；無效、空白或重複的條目會使服務啟動失敗，而不是被跳過。

```yaml
- name: '@deepseek-ai/dsh-invariants'
  config:
    enabled: true
    package_allowlist:
      - '^@deepseek-ai/dsh-'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `enabled` | `true` | 所有已註冊檢查的全域開關 |
| `package_allowlist` | `[]` | 接納包名的正則源；為空則全部接納 |
| `package_blocklist` | `[]` | 在 allowlist 匹配之後排除包名的正則源 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-invariants)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 執行哪些檢查

每個配套入口保護其包擁有的關係，且只為可觀察的事件或可變資料關係安裝檢查——絕不針對服務或方法是否存在。已釋出的可執行配套入口覆蓋：

| 配套入口 | 檢查 |
|---|---|
| `dsh-session`、`dsh-agent`、`dsh-scope`、`dsh-agent-loop` | 工作階段日誌包含關係與呼叫/結果跟蹤、agent 狀態轉換、經過作用域過濾的分發主體、loop 所建置請求的重建 |
| `dsh-llm`、`dsh-llm-retry`、`dsh-tools`、`dsh-system-prompt` | LLM（大語言模型）流語法、重試失敗形狀、工具流水線階段配對與凍結結果、提示片語裝章節名 |
| `dsh-compaction`、`dsh-hook-protocol`、`dsh-sandbox-policy` | 壓縮（compaction）流配對、掛鉤呼叫/結果配對、沙箱 mode 值 |
| `dsh-fs`、`dsh-subagent`、`dsh-workflow`、`dsh-tool-workflow` | 檔案系統事件身份、subagent 提供者與開始/結束配對、工作流生命週期身份、工作流記錄形狀 |
| `dsh-goal`、`dsh-goal-round-driver` | 持久 goal 流摺疊與重建的繼續提示詞 |
| `dsh-permission-presets`、`dsh-user-approval`、`dsh-commands` | preset 引用指向活動 preset、審批詢問/決定配對、命令執行/完成配對 |
| `dsh-jobs`、`dsh-tool-todo`、`dsh-time-context` | 任務快照欄位關係、整表 todo 形狀、持久時鐘讀數 |
| `dsh-credentials`、`dsh-settings`、`dsh-storage-domain`、`dsh-workspace` | 提交事件對照活動服務或記憶體狀態、實體快取映像 |
| `dsh-agent-preset-registry`、`dsh-session-title`、`dsh-plan-mode`、`dsh-schedule` | preset 掛載位置、標題來源引用、plan-mode 載荷、schedule 流 |
| `dsh-client-hmr`、`dsh-client-modules`、`dsh-client-runtime` | 瀏覽器/node 側 stat-watcher 生命週期、啟動入口圖、slot 變更版本化 |

其餘工作區包省略配套入口，並在各自 README 中說明包級原因。

### 向自定義組合新增配套入口

配套入口就是掛載在註冊表旁的普通外掛。它宣告所需的服務，並以其包的精確 npm 名稱註冊；註冊表會先完成其設定再完成註冊。

```ts
import type { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SessionInvariant from '@deepseek-ai/dsh-session/invariant'

declare const ctx: Context

ctx.plugin(InvariantRegistry, { enabled: true })
ctx.plugin(SessionInvariant)
```

### 檢查失敗時

違規會從報告它的上下文丟擲 `InvariantError`：它攜帶穩定的 `INVARIANT` 程式碼、所屬包的完整 npm `packageName`，以及以 `invariant violated by "<package>": …` 開頭的訊息。失敗因此可以歸因到某個包，而註冊表無需匯入任何產品程式碼。installer 本身失敗的配套入口會被釋放，其註冊會復原，因此損壞的檢查不會遺留部分監聽器。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋註冊表背後的設計；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

- **與產品無關的註冊表。** 服務不匯入任何 session、agent、scope 或 agent-loop 包，也不包含它們的檢查；配套入口把檢查放在其歸屬者旁邊。
- **真實關係，而非人為斷言。** 配套入口只檢查其包擁有的事件流或可變資料關係；確認方法、外掛名、注入或固定純函式結果是型別、載入或單元測試關注點，絕不是執行時不變數。
- **註冊保留歸屬。** 即使過濾器讓 installer 保持非活動，包名也會被保留，因此兩個外掛永遠不會靜預設領同一個名字。
- **配套入口接線由機械規則強制。** `pnpm run verify-package-invariants` 拒絕空 installer、省略或忽略 reporter 的 installer、錯誤註冊名、不完整的釋出接線，以及省略配套入口後殘留的接線（[省略配套入口筆記](../../../.agents/notes/implemented/simplification/2026-08-28-omit-unneeded-invariant-companions.zh.md)）。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、`InvariantRegistry` 服務、選擇、註冊、`InvariantError` |
| — | 不釋出執行時不變數配套入口；註冊歸屬與子級生命週期本身就是服務的變更邊界；由同一註冊表觀察它們只會重複其實作。 |

### 選擇與註冊生命週期

`register(packageName, installer)` 保留完整 npm 名稱並返回作用域化 disposer。啟用的 installer 在專用子 fiber 中執行；`installer.inject` 宣告該 fiber 可存取的服務，同步或非同步完成都會在註冊成功前被 join。失敗會釋放子級並原子地收回保留。服務擁有每個註冊 fiber，返回的 disposer 同時屬於配套 fiber，因此解除安裝任一側都會移除監聽器、跟蹤狀態與保留——配套入口可以重新載入並再次註冊同一名稱而不保留舊狀態。由工作階段支撐的配套入口從持久事件重建 baseline；僅即時配套入口觀察重新載入後開始的操作。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從生成的服務參考逐步進入決策證據與組地圖。

- [執行時不變數子系統](../../../docs/subsystems/invariants.zh.md)——`Config`、installer、服務與配套入口約定的生成參考。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-invariants)——每個受支援設定欄位及其源宣告。
- [執行時不變數約定 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.zh.md)——執行時不變數可以斷言什麼，以及強制配套入口接線的機械門禁。
- [runtime-diagnostics 組地圖](../../README.zh.md)——相鄰的診斷包。

-----

<a id="model-experience"></a>
## 模型體驗

無。作為觀察者，本包驗證請求但從不改寫其上下文。

#### KV Cache 影響

檢查只觀察已組裝的請求與持久狀態，不修改請求內容，因此提供者快取複用與底層組合產生的結果完全一致。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明註冊表何時不合適或需要特別運維。它們是目前包約束，不是任務積壓。

- **過濾器在服務生命週期內固定**——`enabled`、`package_allowlist` 與 `package_blocklist` 在啟動時編譯一次；更改它們需要執行 Cordis 外掛重新載入。
- **僅即時配套入口會遺漏過載前的操作**——只觀察即時操作的配套入口無法重建自身重新載入前開始的操作；由工作階段支撐的配套入口從持久事件重建 baseline。
- **請求重建只覆蓋 loop 建置的請求**——`dsh-agent-loop` 配套入口只重建 loop 顯式建置的請求；直接一次性 LLM 呼叫即使由呼叫方凍結或附加工作階段 id，仍不在此約定內。
- **沒有配套入口就沒有檢查**——註冊表自身不攜帶產品檢查；只掛載服務的組合觀察不到任何行為。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
