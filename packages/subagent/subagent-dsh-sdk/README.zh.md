---
description: "面向使用者與維護者的程序外 SDK subagent 後端，用於選擇委派提供者、設定子 Harness 執行時，或排查本地巢狀子 agent（智慧代理）的執行問題。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-dsh-sdk

[English](README.md) | 中文

## 概述

`dsh-subagent-dsh-sdk` 在全新的 DeepSeek Harness 子程序中執行每個委派任務，子程序擁有自己的 profile、工作階段、模型路由與工具。父級提供任務與工作目錄，每個子程序使用其已設定的執行時，並與父級對話保持隔離。父級只會收到子程序最終的 assistant 文字或安全錯誤；中間訊息與工具流量保留在子程序內。當委派需要完整的 Harness 執行時而不是共享程序內狀態時，選擇此後端，並接受每次執行都要啟動新程序的成本。

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

當委派應以完整 Harness 執行時在獨立程序中執行時，掛載本提供者。常用路徑是顯式的：掛載 seam、掛載本提供者，按需設定 `dshBin`，並選擇子級 `profile` 與有序 `patches`。

### 何時選擇

當子程序必須是完整的 harness 對等體——擁有自己的組合、工作階段持久化、模型路由與工具——而不是共享父程序的 agent 時，選擇此後端。當子程序必須共享父級組合或遵守父級強制的非路由能力時，請選擇程序內後端：本提供者接受 agent 路由選項，但會拒絕結構化輸出、深度上限、工具過濾或 persona，而不是靜默省略。

提供者宣告 `agentOptions: true`，同時保持 `outputSchema`/`depthLimit`/`toolFilter`/`persona` 為 false，並且 `inheritsParentContext: false`。不可變的 `agentRouteDefaults` 會在模型覆蓋與確切路由預檢前，把設定的 provider／model 基線公開給 `dsh-tool-subagent`；`start()` 則為直接呼叫方獨立應用同一份設定預設值，包括 `maxTokens`。agent 路由值透過顯式白名單跨越 SDK 協定；子程序仍是另一程序裡的全新執行時，唯一從父 agent 本身派生的值是工作區 cwd。基於本提供者的 `dsh-tool-subagent` 部署應設定 `maxDepth: 'provider-managed'`——子 harness 擁有自己的遞迴預算。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `providerName` | `dsh-sdk` | `ctx.subagents` 上的註冊表名稱 |
| `dshBin` | SDK 依賴 | 顯式 dsh CLI（命令列介面）模組，在外掛載入時解析並驗證；省略則使用 SDK 依賴 |
| `profile` | `sdk` | 具名子 profile |
| `patches` | `[]` | 每次啟動的有序 profile patch 檔案，在外掛載入時解析並驗證 |
| `dshHome` | 必填 | 每個巢狀子程序的絕對隔離 Harness home |
| `cwd` | 父工作階段 cwd | 子程序及其 SDK 工作階段的工作目錄覆蓋值 |
| `provider` | `deepseek-official` | 寫入子程序 `initialize` 的提供者路由 |
| `model` | `deepseek-v4-flash` | 寫入子程序 `initialize` 的模型 |
| `maxTokens` | 介面卡／提供者路由預設值 | 寫入子程序 `initialize` 的單次請求輸出 token 上限 |
| `env` | `{}` | 疊加在已清理憑證的父環境之上的顯式子環境 |
| `shutdownTimeoutMs` | `1000` | dispose（資源釋放）期間協定 `shutdown` 交換的時限 |
| `disposeEofGraceMs` | `6000` | stdin EOF 之後、平臺終止之前的寬限 |
| `disposeGraceMs` | `3000` | 終止後的退出確認寬限 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-dsh-sdk)是每個受支援欄位及其 JSDoc 的窮盡式真源。

請求 `agentOptions` 會分別覆蓋 `provider`、`model` 與 `maxTokens`。`reasoningEffort` 沒有提供者實例預設值：請求省略時保持預設，由所選子模型解析自身預設值。面向模型的 subagent 工具可在每次呼叫時選擇提供者／模型／推理強度；`maxTokens` 仍由工具設定或本提供者預設值在部署側控制。

```yaml
- id: subagent-dsh-sdk
  name: '@deepseek-ai/dsh-subagent-dsh-sdk'
  config:
    providerName: dsh-sdk
    profile: sdk
    patches: ['./profiles/research-child.cordis.yml']
    dshHome: !!js dshHomePath('children')
    maxTokens: 49152
    env:
      DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config: { provider: dsh-sdk, toolName: subagent, maxDepth: 'provider-managed' }
```

### 你會得到什麼

成功的執行會把子程序最終的 assistant 文字（或取消後累積的部分文字）作為結果輸出返回。子程序的模型路由、工具與工作階段來自子執行時自身——父級提供任務、工作目錄與 `initialize` 路由。子程序最後一個持久化 `turn/end` 會對映進 seam 詞彙：`completed` 與 `max-tokens` 原樣透過，`blocked` 變為 `refusal`，意外終態或缺少終態變為 `error`。`aborted` 結果保持中止；只有子程序側 `disposed` 原因會附加 `child-disposed` 診斷。

### 失敗與恢復

已取消的請求會在路徑解析或 spawn 之前失敗。路由、spawn、握手或釋出前取消失敗通常只在子程序被回收後拒絕；如果初始化與清理均失敗，有序安全事實會保留兩項失敗，而不會宣稱已完全停穩。子執行時在釋出後失敗時會透過執行本身結算，而不是拒絕；部分輸出與安全診斷保持分離。診斷只公開提供者、`initialize`、`session-run` 或 `shutdown` 階段，以及固定類別。SDK 訊息、stderr、路徑、任務內容、環境值、憑證和協定載荷絕不會複製到診斷中。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋後端如何驅動子 Harness 執行時，以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **完整 harness 對等體。** 每個子程序都是獨立程序中的完整 Harness 執行時——擁有自己的組合、工作階段、模型路由與工具；只有解析後的工作目錄與 `initialize` 路由從父級跨越。
- **每次執行一個執行時。** 每次執行都 spawn 全新執行時程序；沒有程序池。
- **JSON-RPC 協定格式（wire format）是序列化邊界。** 同程序 subagent 值不會為防禦目的克隆；協定才是驗證不可信輸入的地方。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：config schema、提供者註冊 |
| [`src/run.ts`](src/run.ts) | SDK 執行生命週期、答案提取與停止原因對映 |

### 執行流程

一次啟動會在 spawn 前解析子程序工作目錄與一條程序級 SDK 路由。`request.agentOptions` 中每個已宣告欄位（`provider`、`model`、`reasoningEffort` 或 `maxTokens`）都會覆蓋對應的提供者實例預設值；省略時保留已設定的提供者／模型與可選上限，而推理強度只有在請求提供時才會出現。隨後，提供者透過 SDK 用戶端 spawn 執行時，並在履行前完成 `initialize` 握手，其中包括確切模型與推理強度驗證。路由、spawn、握手或釋出前取消失敗時，只會在子程序被回收後拒絕；工作目錄解析失敗則會在尚未 spawn 任何內容時拒絕。釋出後，提供者擁有一段 SDK 活動，並從子工作階段事件中讀取答案：最後一條完整且非空的 `assistant/message`（記錄 usage 的空內容訊息會被跳過）；若沒有這類訊息，則取累積的 `text-delta` 流。dispose 是冪等的：先在本地把結果確定為 `aborted`，發出有界的協定 `shutdown` 請求，再經 stdin EOF → SIGTERM → SIGKILL 升級到實際退出。

### 停止原因對映

子程序最後一個 `turn/end` 的原因會對映進共享的停止原因詞彙，實作見 [`src/run.ts`](src/run.ts)。

### 程序邊界

子程序環境以子程序 seam 中已清除憑證的父環境為基礎，並在清除之後合併顯式 `config.env` 值。子程序由 SDK 用戶端 spawn，而不是經由 `ctx.subprocess`——這是 SDK 託管傳輸的文件化例外——因此本後端會自行執行環境清理。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本後端逐步進入它接入的 seam 與它驅動的 SDK。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供者約定與終態結果語義。
- [dsh-subagent seam](../subagent/README.zh.md)——本提供者註冊於其上的註冊表與啟動 API。
- [ACP subagent 後端](../subagent-acp/README.zh.md)——經 Agent Client Protocol 的兄弟程序外提供者。
- [TypeScript SDK 用戶端](../../sdk/client/README.zh.md)——本後端用以驅動子程序的 stdio JSON-RPC 用戶端。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-dsh-sdk)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什麼

子執行時的模型會收到作為使用者訊息的獨立任務，以及該執行時自身設定的系統提示詞、工具和全新工作階段。它不會收到父級對話。父級工具呼叫可以為本次執行選擇子級提供者、模型與推理強度；所選路由和由部署控制的可選輸出上限會固定到這個新子程序。persona、工具過濾、深度強制與結構化輸出仍不受支援，並會被拒絕而不是靜默省略。

#### Token 影響

子執行時會為獨立的完整上下文及其多步驟歷史消耗 token。這些 token 絕不會進入父級上下文。

#### KV Cache 影響

與父級請求快取相互獨立。每個 SDK 子程序只能複用其自身提供者、模型、組合和歷史均相同時的字首；除此之外，子 agent 的步驟僅追加增長。

### 父級工具結果（間接）

#### 模型看到什麼

經由 `dsh-tool-subagent`，父級只會收到子執行時最終的 assistant 文字（或累積的部分文字），或該消費方給出的精確停止原因錯誤；不會收到中間訊息或工具流量。帶診斷的非完成結果會先呈現安全診斷，再單獨呈現保留的部分 assistant 輸出；啟動與 shutdown 錯誤使用同一固定事實，不公開原始 SDK 文字。

#### Token 影響

父級輸入只增加最終結果或錯誤，其大小取決於資料，並保留到壓縮（compaction）為止。本提供者自身不會向父級新增任何 schema。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本後端何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用 SDK 對比或任務積壓。

- **每次執行都使用全新的執行時程序**——不使用程序池；harness 執行時需要啟動完整的外掛樹，因此每次執行的 spawn 成本高於 ACP 後端通常使用的子程序。
- **不支援路由之外的啟動時能力**——父級可以選擇子 agent 路由，但無法在子程序內強制執行 `outputSchema`、深度限制、工具過濾或 persona；應改為設定所選子 profile 及其有序 patch。
- **子程序的 transcript（文字記錄）保留在其自身的工作階段根目錄中**——父級日誌只記錄委派工具呼叫與結果；流式 `session.event` 通道只用於提取輸出，不會橋接到父級日誌中。
- **僅支援本地子程序**——解析出的工作目錄是本地路徑；遠端執行時需要獨立的後端。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包程式碼為準。

- **Spawn 成本**——每次執行載入完整外掛樹是徹底隔離的代價；池化會改變這一權衡。
- **遠端執行時**——遠端執行時需要獨立的後端與工作區對映。

</details>

**執行時不變式：** 不釋出伴生入口。run 生命週期配對由 subagent seam 的不變式檢查；本後端自身的狀態位於子程序中，不在目前上下文的事件流內。
