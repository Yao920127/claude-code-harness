---
description: "面向組合作者與能力消費方的子程序服務（`ctx.subprocess`）說明：啟動、觀察並終止受管子程序與終端工作階段。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess

[English](README.md) | 中文

## 概述

`ctx.subprocess` 可解析可執行檔案、啟動顯式指定的子程序或真實終端工作階段、流式讀取或有界收集輸出，並終止完整的受管程序範圍。每個組合設定一個 subprocess 實作，並根據命令執行位置選擇本地或遠端執行。每次請求都指定 argv、工作目錄、stdio、環境覆蓋、終止寬限期與取消訊號，不會新增 shell 解釋或隱藏的執行預設值。子程序環境會先移除環境中的憑證與 `DSH_*` 值，再應用顯式覆蓋；時限、拆卸策略與面向模型的渲染由呼叫方負責，收集的輸出在程序退出後仍可讀取。

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

在需要執行子程序的組合中掛載一個 subprocess 提供者，並從擁有該命令的能力呼叫 `ctx.subprocess`。常用路徑是顯式的：解析可執行檔案、用完全明確的請求 spawn、讀取你要的輸出，並在工作完成時終止受管範圍。

### 掛載服務

每個組合由唯一一個提供者註冊 `ctx.subprocess`；把它與經由它 spawn 的消費方放在一起載入——bash 執行器、LSP 主機、PTY shell 後端或程序外 subagent 後端。載入第二個提供者會快速失敗（每個上下文只有一個服務，這是 Cordis 的標準行為）。

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-bash-local'
```

### 啟動受管程序

請求完全明確：程式與參數、工作目錄、每條流一種 stdio 處置方式、終止寬限期、可選的中止訊號與可選的環境覆蓋。目標與受管範圍標識保留在提供者內部。`done` 以直接命令的退出事實（`exitCode` 與 `signal`）resolve，並在 spawn 或提供者失敗時 reject；收集輸出在退出後仍可讀取。

```text
const executable = await ctx.subprocess.resolveExecutable('bash')
const handle = ctx.subprocess.spawn({
  argv: [executable, '-c', 'echo hello'],
  cwd: '/workspace',
  stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: 'inherit' },
  graceMs: 5000,
})
const { exitCode, signal } = await handle.done
const output = handle.collected.stdout?.readFrom(0)
```

### 選擇輸出投遞方式

- `'pipe'` 把原始流交給你做自己的協定分幀——LSP 主機用 JSON-RPC，ACP（Agent Client Protocol）後端用 ndjson。
- `'inherit'` 讓子程序直接寫父程序自己的流，用於直通診斷輸出。
- 收集物件（collect object）在記憶體中緩衝一段有界尾部；加上 `spill` 上限後，完整流還可以從 spill 檔案中恢復。

讀取基於偏移量且從不消費：後臺讀取與最終批次讀取可以共享同一條流，而不會搶走彼此的位元組。

<a id="using-a-control-pipe"></a>
### 使用控制管道

設定 `stdio.control: 'pipe'` 後，`handle.control` 會返回獨立的原始 `Duplex`。Node 子程序透過 `@deepseek-ai/dsh-subprocess/control` 的 `openInheritedControlChannel()` 開啟 fd 7；該輔助函式會消費提供者擁有的 `DSH_SUBPROCESS_CONTROL=pipe` 標記。呼叫方不能透過 `env` 提供該標記。控制位元組不會進入 stdout/stderr 收集器。消費方負責分幀、驗證、背壓和關閉自身端點；提供者銷燬時會在程序拆卸後銷燬仍存在的端點。省略請求則返回 `control: undefined`。該通道僅適用於普通程序，不授予繞過工具審批的權限。

### 管理程序生命週期

終止與等待使用同一個由提供者管理的範圍。`terminate()` 會啟動提供者記錄的流程，具有冪等性，並在該範圍為空後成為空操作；請求的中止訊號會啟動同一流程。`waitForExit()` 觀察同一範圍，只在提供者證明它完全停穩後 resolve，因此直接命令結束不會掩蓋仍存活的後代。所選 owner 無法再證明完全停穩時，它會 reject。提供者記錄其 native owner 與較弱 fallback；時限、拆卸階梯與原因分類歸呼叫方所有。

### 執行終端工作階段

對於互動式程式，`spawnTerminal` 分配真實 PTY：寫入文字、讀取 UTF-8 輸出、檢查目前前臺程序組並向其傳送訊號，以及等待一次 `terminate()`，讓提供者仍可觀察到的每個工作階段成員完全停穩。就緒狀態、scrollback 與提示符策略仍歸 PTY 消費方所有。

終端請求可顯式啟用 `shellActivity`。`inspectActivity()` 結合支援的 shell 生命週期訊號與自有任務觀察，返回 `idle`、`busy` 或 `unknown`，以及控制代碼內的 revision。不支援或不完整的觀察不能推出空閒；輸入會使已有提示符證據失效。啟用後，根 shell 退出時繼續持有剩餘工作，不把該退出視為終止後代程序的許可。保活和清理期限由消費者決定。

### 每個子程序起步時的環境

子程式永遠不會隱式繼承 harness 的環境秘密：形似憑證的名稱與環境中的 `DSH_*` 事實都會被清除，呼叫方顯式的 `env` 在該清除之後合併。有意轉發的憑證或目前的 `DSH_*` 部署事實仍會到達子程式；顯式的 `undefined` 墓碑值則移除一個普通的環境項。

### 可能出錯的地方

無法解析可執行檔案時，服務會明確報出穩定的錯誤。從未啟動成功的 spawn 會讓 `done` reject；從未執行過的程序沒有任何緩衝輸出。提供者無法證明所選範圍為空時，`waitForExit()` 也會 reject；提供者 fallback 可能無法擁有逃離其程序組或已觀察工作階段的後代。當傳輸擁有自己的 spawn（SDK 用戶端、MCP）時，請繞開本服務並直接匯入 `scrubbedParentEnv`，讓環境策略保持單一來源。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 seam 背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

本 seam 建立在一個分離之上：服務負責程序座標與生命週期；消費方負責定義程序的含義，以及決定塑造該程序的每一項預設值。正因如此，spawn 請求完全明確——沒有任何隱藏的子程序服務預設值——`SubprocessOutcome` 也只攜帶退出事實：時限、拆卸階梯與原因分類歸呼叫方所有。`dsh-shell` 的 request/spec 拆分是這條規則的所屬範本。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：抽象 `SubprocessRuntime`、`ctx.subprocess` 註冊、共享的 `scrubbedParentEnv` 清除 |
| [`src/types.ts`](src/types.ts) | 詞彙：spawn spec、stdio 模式、控制代碼、讀取器、結果、`DSH_*` 名稱空間 |
| — | 不釋出執行時不變式伴生入口；這個無狀態 Service Definition 負責 spawn spec 與控制代碼型別，觀察則由 Service Providers 負責。 |

### 資料模型與流程

spawn 會立即返回活動控制代碼，而不公開目標身份。`done` 獨立報告直接命令的結果或失敗，`waitForExit()` 則報告受管範圍是否完全停穩。請求的中止訊號驅動與 `terminate()` 相同的終止流程。收集模式的讀取器無遊標：偏移量是呼叫方擁有的全流位元組座標，因此獨立讀取器不會消費彼此的輸出，偏移量滑出記憶體尾部的讀取標記為 `lossy`，並在 spill 檔案存在時指向它。`spawnTerminal` 是一項底層原語，因為普通管道無法分配控制終端或清理終端工作階段成員。

### 生命週期與不變式

每個上下文只註冊一個實作；載入第二個會拋錯（Cordis 標準行為）。服務自身的 dispose（資源釋放）會終止所有仍在執行的受管程序並等待其退出，因此程序生命週期在消費方過載後依然延續。`argv` 絕不經過 shell 解釋；需要 shell 的消費方自行傳入 `['bash', '-c', command]`。終端分配的取消（spec 訊號）與已釋出控制代碼的生命週期相互獨立。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從窮盡式型別參考逐步進入各提供者，以及 seam 背後的決策證據。

- [子程序子系統](../../../docs/subsystems/subprocess.zh.md)——spawn spec、輸出讀取器、結果與完整的 `DSH_*` 環境。
- [dsh-subprocess-local](../subprocess-local/README.zh.md)——實作本約定的本地主機提供者。
- [dsh-bash-local](../../shell/bash-local/README.zh.md)——最大的消費方：經由本服務執行 bash 命令。
- [subprocess seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md)——程序部分為何成為獨立的 seam，以及隨之遷移的內容。

-----

終端消費者透過 `terminalEnvironment()` 讀取 provider 平臺和首選 shell，透過 `resolveExecutable()` 驗證候選。確定未找到可執行檔案時丟擲 `SubprocessExecutableNotFoundError`，傳輸故障仍單獨報告。`spawnTerminal` 要求 `terminalType` 和初始尺寸，返回的 handle 透過 `resize(cols, rows)` 調整尺寸，不重新分配程序。

<a id="model-experience"></a>
## 模型體驗

透過消費方 seam（例如 bash 執行器家族）間接影響，它們負責程序輸出與生命週期的全部面向模型渲染。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適，或何時把工作留給消費方。它們是目前包約束，不是對比或任務積壓。

- **由 SDK 管理的 spawn 仍在服務之外**——擁有內部 spawn 的傳輸（SDK 用戶端、MCP）無法把該呼叫路由到本服務；它仍可匯入 `scrubbedParentEnv`，使環境策略保持單一來源。
- **拆卸階梯歸消費方所有**——該 seam 只提供訊號動詞與受管範圍等待，不提供現成的完全停穩序列；每個程序外消費方自行編碼其子程序的配合方式（ACP 後端以 stdin EOF 打頭的階梯是儲存庫內範本）。
- **可觀察性取決於提供者**——native 提供者可以透過 systemd scope 或 Windows Job 擁有逃逸後代，fallback 提供者則只暴露較弱的程序組、程序樹或工作階段可見性。該 seam 不新增持續的程序表監視器。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

未來：非 shell 執行器。該 seam 拆分的目的就是讓直接 argv 執行器或 worker supervisor 無需深入 bash 內部即可消費它；目前尚無任何實作交付，終端原語也把就緒策略留在其消費方。

</details>
