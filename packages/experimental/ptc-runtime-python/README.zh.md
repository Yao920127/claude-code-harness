---
description: "CPython 子程序 PTC 執行時：為 Python 模型程式碼實作 dsh-ptc-runtime seam，及其使用的 fd-3 wire 協定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-ptc-runtime-python

[English](README.md) | 中文

## 概述

這個實驗包可讓顯式組合在每次請求時都用全新的 CPython 3.10+ 子程序執行模型生成的 Python。程式可以使用頂層 `await` 和 `return`、呼叫已設定的 binding、正常寫入 stdout/stderr，並獲得明確的完成或失敗結果。資源預算和程序組拆卸會約束失控的工作，但子程序不是安全邊界：直接 Python 操作沒有檔案系統沙箱，執行之間不保留狀態，且沒有已釋出 profile 啟用此 runtime。

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

僅在顯式組閤中選擇這個已釋出的實驗包。將 `PythonPtcRuntime` 與 `dsh-tools` 一起註冊後，`run(resolve(request))` 會在全新的 CPython 3.10+ 子程式中執行每個程式；成功時以 `result.value` resolve，失敗時以 `result.error` resolve（正交的 `PtcRunFailure.kind` 分類涵蓋解析失敗、丟擲異常、無效完成值、輸出溢位、預算到期、中止與執行基底終止）。僅有 seam 誤用會 reject——binding 名稱空間不合法，或在 dispose 後呼叫。設定在載入期拒絕：非 Unix 平臺；不是可執行普通檔案的顯式 `pythonBin`，或無法在 `PATH` 上解析的裸名；非 CPython、低於 3.10 或探測失敗的直譯器；非正或非整數預算；低於截斷標記下限（64）的 `maxLogBytes`；會被 `setTimeout` 截斷的定時器值；超過有效 fd-3 幀上限的預算（主機堆無法安全解析接近上限的幀時，該上限會降低）；或最壞峰值會突破 `RLIMIT_AS` 的 `addressSpaceMb`／輸出預算組合。

`resolve(request)` 接受絕對 `cwd`，並使用提供者設定的 `maxWallMs` 截止時間（預設 600,000 ms）。顯式 `timeoutMs` 覆蓋與沙箱策略不受支援，會在執行前拒絕。本提供者不宣告 `sandboxMode`，也不返回約束事實。

### 你得到什麼

包的預設匯出是 `PythonPtcRuntime` 外掛。其公開面還重新匯出主機側協定詞彙：`validateChildFrame`（重建每條入站幀）、無損 JSON codec 與計量器（`encodeJsonPlain`、`checkDoneValue`、`hasUnsafeIntegerToken`、`hasNonLosslessNumber`）、`logTruncationMarker`（共享截斷標記文字），以及 `resolvePythonBin`（對照目前 `PATH` 的直譯器查詢）、`readProcessStart`（供測試用的程序啟動統計）、`detachResidual`（已結算執行的資源清理測試 seam）與 `hostFrameParseCeiling`（給定堆上限可容納的堆推導幀解析上限）。每個上限都是帶預設值並經驗證的 `Config` 欄位：`cpuSeconds`（60）、`maxWallMs`（600000）、`addressSpaceMb`（512，Darwin 上不生效）、`maxLogBytes`（65536）、`maxValueBytes`（32768）、`graceMs`（3000）與 `pythonBin`（`python3`，在載入期解析、檢查可執行性，在五秒強制終止期限內探測版本並固定）。每個子程序只接收 `TMPDIR`；環境中的憑證、`PATH`、`HOME` 與其他主機狀態均不可見。

### wire

幀在子程序 fd 3 上以 JSON-lines 傳輸——每行一個物件——因此 stdout/stderr 留給程式自己的輸出。子程序 → 主機：`boot-ack`、`call`、`log`、`done`。主機 → 子程序：`boot`（首幀，攜帶全部上限與名稱空間宣告）、`run`（`boot-ack` 之後，只攜帶程式體）與每個 `call` 一個 `reply`。偽造幀可在 `done` 上同時攜帶 `value` 與 `error`，因此消費方必須先檢查 `error`，在它存在時忽略 `value`。`log` 幀的 `open` 標誌標記由顯式 flush 提交的未結束行：主機把下一個 log 幀追加到同一條目，因此 `print('a', end='', flush=True); print('b')` 讀回為一條 `'ab'` 條目而不是假換行（拆分計費算術見 fd-3 協定 Agent Note 的 wire-contract 一節）。合併的唯一例外是截斷：當後續超預算幀觸發帳本時，已計費的字首作為獨立條目先提交，截斷 marker 跟在後面（marker 保持末位，無重複計費）。

### 可能出錯的地方

主機側驗證在不拋異常的情況下丟棄垃圾，因此畸形或偽造幀永遠不會讓主機程序崩潰：`validateChildFrame` 對任何不能幹淨重建的內容返回 `undefined`，非數字的 call id 永遠不會被回顯進 reply，偽造的額外欄位永遠不會被帶走。非無損 JSON 或超過設定位元組預算的完成值會被顯式拒絕（`non-lossless`／`over-budget`），而不是被靜默取整或截斷。原始長度超過有效幀解析上限（64 MiB，或當主機的設定堆無法安全解析接近上限的幀時更低——見 `hostFrameParseCeiling`）的 fd-3 幀會讓本次執行以 `worker-exit` 結算（接收路徑在 `toString`/`JSON.parse` 之前限制原始幀，緊湊寬幀不能解碼出遠超其線上位元組的主機記憶體）。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部——點選展開</summary>

本節解釋後端背後的設計；可觀察行為在[使用本包](#use-this-package)中完整覆蓋。

### 設計概念

單向信任：主機把每條入站幀都視為敵意（模型程式碼可以在 fd 3 上偽造任何內容）並逐欄位重建後才讀取；Python 側信任主機回覆。bootstrap（`py/bootstrap.py`）把程式作為 async 函式體執行，因此頂層 `await` 與 `return` 都可用；binding 呼叫經 fd 3 以 JSON-lines 往返，回覆在 pump 中限速，以免大量大回復釘住主機的 fd-3 可寫緩衝。

### wire 契約

幀為 `boot`／`run`（主機 → 子程序）與 `boot-ack`／`call`／`log`／`done` （子程序 → 主機），以及每個 `call` 對應一個 `reply`（主機 → 子程序）。`log` 幀的 `truncated` 標誌標記的就是子程序帳本自己的截斷標記幀，因此主機在與子程序相同的點停止捕捉，而不是從自己的預算推斷。`log` 幀的 `open` 標誌標記由顯式 flush 提交的未結束行：主機把下一個 log 幀合併進同一條目，因此 `print('a', end='', flush=True); print('b')` 讀回為一條 `'ab'` 條目而不是假換行（拆分計費算術在 fd-3 協定 Agent Note 的 wire-contract 段）。合併的唯一例外是截斷：當後續超預算幀觸發帳本時，已計費的字首作為獨立條目先提交，截斷 marker 跟在後面（marker 保持末位，無重複計費）。`done.error.kind` 為 `exception`、`invalid-output`、`output-limit` 之一；牆鍾／CPU 預算、中止與基底死亡在主機側觀察，不以幀形式攜帶。

### 無損 JSON 跨越

完成值與 binding 實參以精確 JSON 跨越：值無遞迴序列化，因此低於位元組預算的深層載荷存活，而不會死在 `JSON.stringify` 的棧上限；超出安全範圍的整型 double 以精確數字跨越，而不是被靜默取整的 token；`src/protocol.ts` 中的計量器在任何其他程式碼讀取載荷之前強制位元組預算與數字無損性。

### 映像對齊

`tests/protocol-mirror.e2e.ts` 啟動真實 `python3`，對照 `src/protocol.ts` 斷言 `PROTOCOL_FD`／截斷標記文字以及 `py/protocol.py` 中每個 `TypedDict` 的必填／可選 wire 欄位集，因此欄位改名、刪除或一側把另一側必填的欄位變成可選都會使測試失敗。欄位*型別*不跨語言邊界比較；該殘留由評審加後端的真實子程序套件（`tests/runtime.spec.ts`）負責。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`PythonPtcRuntime`——spawn、幀 pump、預算、隔離、拆卸；重新匯出協定詞彙 |
| [`src/protocol.ts`](src/protocol.ts) | 主機側：幀 codec、不可信幀驗證器、無損 JSON 計量器、共享標記文字 |
| [`py/bootstrap.py`](py/bootstrap.py) | 子程序側：fd-3 通道、程式執行、binding 分發、帳本與結算 |
| [`py/protocol.py`](py/protocol.py) | Python 側：`PROTOCOL_FD`、`TypedDict` 幀映像、`log_truncation_marker` |
| [`tests/runtime.spec.ts`](tests/runtime.spec.ts) | 真實子程序套件：預算、隔離、敵意幀、名稱重綁 |
| [`tests/protocol-mirror.e2e.ts`](tests/protocol-mirror.e2e.ts) | 對照真實 `python3` 的跨語言映像測試 |
| — | 不釋出執行時不變式配套項：幀順序、預算計量與拆卸發生在 CPython 子程序或 fd 3 上，因此本包沒有可供 Cordis listener 比較的同程序事件序列或獨立維護的可變關係；協定映像與真實子程序測試覆蓋這些程序邊界行為。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 runtime 契約不夠時閱讀這些。它們從 seam 定義走向設計記錄與配套後端。

- [PTC 執行時 seam](../../ptc-runtime/ptc-runtime/README.zh.md) — 本後端實作的抽象契約。
- [fd-3 協定 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-31-ptc-runtime-python-fd3-protocol.zh.md) — 設計理由與 wire 契約。
- [結算修復 Agent Note](../../../.agents/notes/archived/bug-fix/2026-07-31-code-runtime-python-settlement-fixes.md) — 結算、計量與隔離修復及其迴歸案例。
- [Node 程序後端](../../ptc-runtime/ptc-runtime-node/README.zh.md) — 已釋出的 TypeScript 兄弟。
- [PTC 執行時子系統參考](../../../docs/subsystems/ptc-runtime.zh.md) — 請求／結果詞彙、binding 與失敗分類。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過 `dsh-tools` 中的 PTC mode；當顯式組合掛載本提供者時，它會把程式的完成值或失敗渲染成保留的 `run_code` 結果，且已釋出 profile 均不掛載這個實驗包。

#### KV Cache 效應

無直接失效；指定的消費方擁有任何請求字首變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義本包覆蓋與不覆蓋的內容；它們是目前包約束，不是任務積壓。

- **跨語言 guard 覆蓋執行的表面與幀欄位形狀，而非欄位型別**——mirror e2e 比較必填／可選欄位集，而非 `cpuSeconds` 在兩側是否都是 `int`；型別級漂移由評審加後端的真實子程序套件捕捉。
- **以 `setsid()` 逃出子程序組後代不被組拆卸回收**——`kill(-pid)` 夠不到它；執行仍按 done 幀決定的值結算，若該孤兒持有管道，close 截止後備會強制結算，但孤兒本身在自行退出前一直存活到 fiber 之外。
- **結算後到達的 `log` 幀被丟棄**——執行一旦結算，主機側捕捉即關閉；遲到的 fd-3 `log` 幀（來自比 done 幀存活更久的執行緒）會被丟棄，而不是追加到 `logs`。
- **binding 回覆值沒有 seam 級位元組或深度上限**——`maxValueBytes` 只計量 done 幀的完成值；寬 binding 回覆在主機側重建（`snapshotJsonValue` 遍歷）並整幀編碼，兩側都只受程序記憶體約束（與沒有子程序側預算的 binding 實參一樣）。
- **已釋出 profile 均不掛載本提供者**——keyless `ptc-python-turn` 快照透過真實 Loader 替換 headless PTC 執行時；已釋出 profile 使用沙箱 Node 程序後端。
- **工作流執行需要 Node**——使用本 Python 提供者的組合停用 `workflow-ptc`、`tool-workflow` 和 `tool-ralph`；工作流提供者在載入時拒絕不相容的執行時。
- **跨通道日誌交錯由後端決定**——Python stdout、stderr 與 fd-3 日誌幀彼此獨立傳輸；每個通道保留自身順序，但它們在 `result.logs` 中的總順序可能不同。
- **需要 CPython 3.10 或更高版本**——設定的可執行檔案會在載入期完成解析與版本探測；不受支援的直譯器會在 `ctx.ptcRuntime` 註冊前失敗。
- **診斷與臨時目錄字首省略包名中的 experimental 限定詞**——標記 `[dsh-ptc-runtime-python] log capture truncated at <N> bytes` 與 `dsh-ptc-runtime-python-` 目錄字首獨立於 npm 包名來標識本提供者。協定映像檢查 TypeScript 與 Python 的標記位元組完全相同。
- **`run()` 是一次性的**——`logs` 只有在 `PtcRunResult` resolve 後才能獲得；沒有為執行中程式產生的輸出提供流式日誌或進度介面。
- **執行之間不保留狀態**——每次請求都在全新子程序中執行；持久 REPL 風格核心在某個後端帶來自己的日誌方案之前保持延期。
- **原始長度超過有效幀解析上限的 fd-3 幀會讓本次執行以 worker-exit 結算**——上限為 64 MiB，或當主機的設定堆無法安全解析接近上限的幀時更低（`hostFrameParseCeiling`）；`maxLogBytes`/`maxValueBytes` 在載入期被限制到同一上限，因此誠實子程序的幀總能放得下；模型建構的超過該上限的 binding 實參（一個在 seam 層沒有預算的值）會觸發同一上限——這是該 OOM 防護的已接受殘餘。
- **停止讀取回復的子程序會在回覆積壓超過 1024 幀時以 worker-exit 結算執行**——主機每次寫一條回覆，管道滿時等待 `drain`；只持續傳送呼叫而不消費回覆的子程序會讓保留的積壓（及其釘住的 binding 結果）一直增長到牆鍾，因此積壓上限讓執行提前失敗。binding 結果在 seam 層沒有位元組上限，所以這是計數上限而非位元組上限。
- **向永不結算的 binding 洪泛呼叫的子程序會在 1024 個呼叫在途時以 worker-exit 結算執行**——binding 呼叫在分發前計數、非同步體結算時釋放，否則 promise 永不 resolve 的 binding 會讓每個呼叫幀累積一個非同步閉包直到牆鍾。與回覆積壓一樣，這是計數上限而非位元組上限。
- **組合日誌與值的峰值不被載入門建模**——持續寫入的模型 daemon 執行緒與完成值計量、分幀相加的峰值沒有任何門會放行或拒絕；執行以 `worker-exit` 告終，隔離成立，只有失敗分類降級。
- **1 秒雙限 `ulimit -t 1` CPU 超限被報告為 `worker-exit` 而非 timeout**——當主機在一個與軟限相等的硬 CPU 限下啟動且該限為 1 時，`_clamped` 無法下調軟限，核心在同一 tick SIGKILL 忙迴圈，SIGXCPU 永遠不會送達；隔離成立，只有分類降級。
- **中間 binding 值沒有位元組上限**——實作仍受無損 JSON 序列化成本與程序記憶體約束，提供者或執行器可能應用自己的取得上限。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
