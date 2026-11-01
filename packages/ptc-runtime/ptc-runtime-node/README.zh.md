---
description: "在全新 Node 程序中執行 TypeScript 程式，使用工作階段檔案系統沙箱、受管清理以及可設定的執行與輸出限制。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ptc-runtime-node

[English](README.md) | 中文

## 概述

在與 Bash 相同的平臺沙箱策略下執行模型編寫的 TypeScript，並透過非同步繫結呼叫 Host 提供的函式。每次呼叫啟動一個全新的 Node 程序，返回捕捉日誌、精確 JSON 值或結構化失敗。直接 Node API 在所選限制內仍可使用。經過時間截止、輸出上限和 V8 堆限制約束執行；取消和完成都會終止受管程序範圍。請求受限模式但沙箱後端不可用時，執行失敗。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在提供 `fs`、`subprocess`、`sandbox` 與 `sandboxPolicy` 的組合中掛載本提供者。`dsh-tools` 的 PTC 模式傳入呼叫 Session 的目錄和常設策略；直接執行時消費方在執行前解析這些選項。

### 設定

在所需服務可用後，設定提供者條目：

```yaml
- name: '@deepseek-ai/dsh-ptc-runtime-node'
  config:
    timeoutMs: 120000
    maxTimeoutMs: 600000
    maxOutputBytes: 67108864
    maxOldGenerationSizeMb: 512
    maxMessageBytes: 134217728
    maxPendingCalls: 128
    graceMs: 3000
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `timeoutMs` | `120,000` | 預設經過時間截止，包括巢狀工具與審批等待 |
| `maxTimeoutMs` | `600,000` | 解析器應用的經過時間截止上限 |
| `maxOutputBytes` | `67,108,864` | 序列化日誌與完成值或診斷的合計預算 |
| `maxOldGenerationSizeMb` | `512` | V8 老生代堆上限，單位 MiB |
| `maxMessageBytes` | `134,217,728` | 控制幀、未完成參數位元組和排隊控制寫入的上限 |
| `maxPendingCalls` | `128` | 同時進行的 Host 繫結呼叫數量上限 |
| `graceMs` | `3,000` | 受管終止與輸出排空寬限時間 |
| `nodeExecutable` | 目前 Node 可執行檔案 | 在子程序執行世界中解析的可執行檔案 |
| `bootstrapPath` | 包內 bootstrap | 該執行世界中預先安裝的建置後 bootstrap 的可選絕對路徑 |

[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-ptc-runtime-node)定義可接受的設定欄位。`resolve(request)` 補全 cwd、數值或 null 截止選擇與執行策略；`run(spec)` 接受這些已解析輸入，不補預設值。

### 執行與結果

程式是非同步函式體：支援頂層 `await` 與 `return`，且只接受可擦除 TypeScript。成功呼叫以 `result.value` 返回無損 JSON 值，以 `result.logs` 返回捕捉文字。`result.sandbox` 獨立於程式結果報告所選模式、觀察到的拒絕，以及後端完整或部分的強制能力。

直接檔案系統、網路與子程序操作仍是 Node 操作，受所選 OS 沙箱約束。巢狀 Host 繫結透過控制通道呼叫；PTC 工具呼叫保留註冊表的可見性、排序、日誌和審批規則。執行程式不會改變 Session 的常設策略，也不會在拒絕後自動重放程式。

### 截止時間與取消

PTC 消費方按 [dsh-tools](../../core/tools/README.zh.md#ptc-mode) 的說明公開逐次超時與經審批的沙箱選擇。執行時只讀 `timeout` 描述符向該消費方報告有效預設值與上限。 其 `executionInstructions` 在面向模型的 schema 中說明全新 Node 狀態、直接 Node API、空程式環境和檔案策略。

省略 `timeoutMs` 使用設定的經過時間預設值；數值請求經過驗證並封頂。服務呼叫方可以顯式傳入 `timeoutMs: null` 來省略經過時間定時器，工作流介面卡即如此；`run_code` 仍只接受正數覆蓋值。啟用的截止覆蓋執行時準備和執行，包括等待巢狀工具或審批的時間。它不是 CPU 計量器。超時或取消透過 Host 的受管程序所有者停止同步迴圈；成功完成也會清理該受管範圍。選擇結果後、清理前停止計時器，因此呼叫可能要在執行截止之後等待清理結算才返回。

### 失敗

程式解析錯誤與丟擲異常為 `exception`；截止到期為 `timeout`；取消為 `abort`；畸形或超量控制通訊為 `protocol`；約束不可用為 `sandbox-unavailable`；程序提前退出或受管清理失敗為 `worker-exit`。程序提供者保留與執行基底無關的失敗名 `worker-exit`。有損完成值為 `invalid-output`，外層結果超限為 `output-limit`，並保留能容納的日誌字首。無效或不支援的選項，以及資源釋放後的呼叫，以呼叫方誤用拒絕。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部——點選展開</summary>

Host 負責策略、截止時間、繫結查詢和程序清理。子程序負責程式求值與繫結代理；即使使用預期的控制描述符，模型編寫的程式碼仍是不可信對端。

### 啟動與控制

Host 擦除可擦除型別，在設定的執行世界中解析可執行檔案與 bootstrap，透過 `ctx.sandbox` 等待 argv 限制準備完成，再透過 `ctx.subprocess` 啟動。限制準備完成後會再次檢查取消狀態，因此提供者在取消後返回也無法啟動程式。接管繼承的控制通道後，子程序在 OS 環境中只保留可執行檔案搜尋路徑、Windows 系統路徑和臨時路徑，並將程式可見的 `process.env` 替換為空字典。Windows ACL 初始化接收父程序各自的 `TEMP` 和 `TMP` 值以使用共享授權鎖，然後在啟動程式前將二者替換為私有目錄。這些原生路徑使巢狀程序建立和原生臨時檔案 API 仍可正常工作。Host 僅在子程序啟動時保留 `ELECTRON_RUN_AS_NODE`，使桌面端可執行檔案執行 Node bootstrap；bootstrap 在求值模型程式碼前刪除該選擇變數。堆上限透過 Node argv 或為打包可執行檔案由提供者建構的 `NODE_OPTIONS` 值傳遞；環境中的載入器和偵錯程式標誌會被丟棄。

帶長度分幀的 JSON 與 stdout/stderr 分開傳輸。Host 限制幀與排隊寫入，在分派前驗證呼叫身份和已宣告的繫結名，並拒絕無效通訊。子程序重新整理終態幀後仍保持控制通道開啟，直到 Host 關閉通道。提交終態幀後，子程序忽略後續繫結回覆，不再傳送程式控制訊息。輸出捕捉計量序列化日誌加完成值或診斷；固定結果信封欄位與沙箱中繼資料不計入該帳本。

### 原始碼與建置後 bootstrap

原始碼執行載入僅含可擦除語法的 bootstrap 依賴，不依賴同級包的建置後匯出。建置後執行使用包內 `process.js` 入口。無法對映 Host bootstrap 的執行世界需要預先安裝相容的 `bootstrapPath`；不會假設 Host 路徑對應同一個遠端檔案。

### 原始碼索引

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 設定、解析、策略、繫結與受管執行 |
| [`src/launch.ts`](src/launch.ts) | 可執行檔案／bootstrap 參數與執行世界資源對映 |
| [`src/process.ts`](src/process.ts) | 子程序握手、環境清空與程式生命週期 |
| [`src/bootstrap.ts`](src/bootstrap.ts) | 程式求值、繫結代理與輸出捕捉 |
| [`src/channel.ts`](src/channel.ts) | 分幀、有界寫入與協定失敗 |
| [`src/output-ledger.ts`](src/output-ledger.ts) | Host 外層結果計量 |
| — | 不釋出執行時不變式配套模組；分幀與程序清理跨程序邊界強制執行，不依靠同程序中的獨立觀測。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

直接使用提供者前先讀服務約定；決策記錄解釋策略與消費方職責。

- [PTC 執行時服務](../ptc-runtime/README.zh.md)——請求、已解析 spec 與結果。
- [沙箱 Node 決策](../../../.agents/notes/implemented/architecture/2026-09-11-sandboxed-node-ptc-runtime.zh.md)——安全、生命週期與 timeout 取捨。
- [PTC 基礎](../../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——註冊表呈現與巢狀工具分派。
- [子程序提供者](../../subprocess/subprocess-local/README.zh.md)——受管程序範圍與平臺限制。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tools` 的 PTC 模式與 `dsh-workflow-ptc` 間接提供；它們透過各自的工具結果呈現程式結果。中間繫結通訊不進入模型歷史；外層結果遵循普通工具溢位策略。

#### KV Cache effect

不直接失效；具名消費方負責請求字首的任何變更。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

這些限制界定執行保證與保留的輸出。

- **約束繼承所選後端的限制**——完整與部分強制能力分開報告；沙箱策略與受管程序約束是不同保證。
- **堆上限不是程序樹記憶體限制**——原生分配與後代程序記憶體不屬於 V8 老生代上限。不提供程序樹 CPU 計量器。
- **清理繼承子程序的可觀測範圍**——使用 fallback 的平臺上，逃逸的後代可能仍在受管範圍之外；參見子程序提供者宣告的限制。
- **執行是一次性的**——沒有 yield/wait API、即時結果流或跨呼叫保留的程式狀態。
- **輸出上限拒絕超量內容，而不保留每個位元組**——溢位只能儲存本提供者交付的有界結果。
- **繫結在傳輸接納時受限**——控制限制不約束 Host 繫結生成結果期間分配的記憶體。
- **console shim 有五個方法**——`log`、`info`、`warn`、`error` 與 `debug`。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

[timeout 討論](../../../.agents/notes/implemented/architecture/2026-09-11-sandboxed-node-ptc-runtime.zh.md#deferred-timeout-design)記錄 yield、總生命週期、審批等待計時和程序樹 CPU/RSS 上限的開放選擇。這些選擇不改變數值截止的預設值或顯式的不設截止服務選項。

</details>
