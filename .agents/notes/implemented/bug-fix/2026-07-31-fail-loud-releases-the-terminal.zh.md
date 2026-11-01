# Agent Note: fail-loud 在退出前釋放終端

Status: implemented

[English](2026-07-31-fail-loud-releases-the-terminal.md) | 中文

## 問題

設定驗證失敗的 `dsh` 啟動會列印診斷資訊，然後把使用者丟回一個損壞的 shell：輸入不可見，下一條命令還會被殘留文字弄亂：

```
dsh: fatal load failure: ValidationError: invalid config:
  - $.providers expected object but got [object Object] (at providers)
$ 1;2;4cecho hello
zsh: command not found: 4cecho
```

Loader 並行掛載各個條目，因此條目失敗的順序並不等於啟動順序。`ui-tui` 會先啟用並呼叫 pi-tui 的 `ProcessTerminal.start()`，它把 stdin 置為 raw 模式、啟用 bracketed paste，並寫出 Kitty 鍵盤協定探測序列——該序列以一個 Device Attributes 查詢（`ESC [ c`）結尾。隨後某個同級條目（這裡是 `llm-pi-ai`）因自身設定而 rejection。

在當時，該 rejection 以未處理 rejection 的形式浮現，而 `installFailLoud` 只寫一行 stderr 就立即呼叫 `process.exit(1)`。（[Loader 啟用檢查](../simplification/2026-09-09-nontransactional-loader.zh.md) 讓設定樹失敗經 `boot()` 報告，由它自行 dispose（資源釋放）部分建置的上下文；release 掛鉤仍然守護 `boot()` 看不到的 rejection——外掛遊離的非同步工作在掛載期間或掛載之後失敗。）沒有任何環節 dispose 這棵樹，因此 `ProcessTerminal.stop()` 從未執行：raw 模式、bracketed paste 和鍵盤協定都殘留在比程序活得更久的 shell 上。終端對 Device Attributes 查詢的回應（`1;2;4c`）在程序退出之後才到達，被 shell 當作使用者輸入讀入——也就是上面那段字面文字。

`/exit` 路徑從不受影響，因為它會 dispose 整棵樹，從而進入 TUI 自身的 `shutdown()`：先 `drainInput()`（吸收尚未返回的回應），再 `ui.stop()`。缺陷在於**啟動失敗**沒有通往這同一套拆卸流程的路徑。

## 決策

`installFailLoud` 新增可選的 `release` 拆卸回呼，在診斷資訊與退出之間被等待：

- 診斷資訊在 release **之前**寫出，因此卡住或失敗的 disposer 無法吞掉失敗原因。
- 使用閂鎖（latch）而非解除安裝監聽器，來保證被報告的始終是第一個 rejection。若在拆卸期間移除監聽器，第二個並行 rejection 就會變成未捕捉錯誤，Node 會在拆卸中途殺死程序——恰好殘留下本次要恢復的終端狀態。後續 rejection（包括 release 自身的）都會落入已掛起的退出流程。
- release 以 `FAIL_LOUD_RELEASE_TIMEOUT_MS`（2 秒）為上限，且其 rejection 被吞掉。卡住或失敗的 disposer 只會延遲致命退出，絕不會取消它。該定時器保持 **referenced**：一旦 `unref()`，Node 就會在事件迴圈清空後、恰恰在報告這次失敗時以 0 退出，因為 `unhandledRejection` 監聽器抑制了預設的致命退出。
- 不傳 `release` 時行為與此前完全一致，因此 ACP（Agent Client Protocol）、JSON-RPC 和各 demo bin 均無變化。
- 自[致命診斷與崩潰報告](../architecture/2026-09-22-fatal-diagnostics-and-crash-reports.zh.md)決定起，同一 handler、閂鎖與 release 也對 `uncaughtException` 生效，診斷同時改為 `util.inspect`。

`dsh` 的 TUI 啟動器傳入的 release 會釋放根上下文，從而執行 TUI 已有的 `shutdown()` 並把終端交還。

啟動器在 `boot()` 的 `prepare` 掛鉤中捕捉根上下文，而不是取其回傳值。rejection 到達時 `boot()` 尚未結算，因此在 `await` 之後賦值的 `app.current` 恰好在回呼需要它的那一刻仍是 `undefined`。`prepare` 在 Loader 安裝之後、任何設定樹條目掛載之前執行，覆蓋了條目可能 rejection 的整個視窗。

## 考慮過的替代方案

**在響亮失敗處理函式裡直接重置終端**（寫 `ESC [ ? 2004 l`、彈出鍵盤協定、清除 raw 模式）。這會在一個並不擁有終端的包裡重複 pi-tui 的拆卸邏輯，並隨 pi-tui 啟動序列的變化而漂移。它同樣無法吸收尚未返回的 Device Attributes 回應——而這正是弄亂下一個提示符的原因，只有在 stdin 仍處於 raw 模式時排空它才能解決。

**在 TUI 中註冊 `process.on('exit')` 終端重置。** exit 處理函式是同步的，無法等待 `drainInput()`，殘留回應依舊會落到 shell；而且這把拆卸掛到全域掛鉤上，而非已經存在的釋放路徑。

**讓 TUI 等整棵樹結算後再啟動。** 這會把刻意並行的 Loader 序列化，併為修復一條失敗路徑而拖慢每一次正常啟動的首次繪製。

**調整設定順序，讓 `llm-pi-ai` 先於 `ui-tui` 掛載。** 順序並不是 Loader 提供的保證，而且未來任何條目都可能在 TUI 掛載之後失敗。

## 後果

啟動失敗現在會在退出前多付出一次樹釋放的代價（上限 2 秒），結束代碼仍為 1。作為交換，設定錯誤的 `dsh` 會交還一個可用的 shell，而不是需要 `stty sane` 或 `reset` 才能恢復的終端。

這項保證屬於**擁有終端的那個 bin**：任何搶佔終端狀態卻不傳 `release` 的介面都會重新引入該缺陷。`installFailLoud` 自身無法察覺這一點，因為它看不到已掛載的外掛對程序做了什麼。

## 測試

`packages/boot/app-boot/tests/app-boot.spec.ts` 覆蓋 release 約定：退出提交前會等待該掛鉤；掛鉤 rejection 時仍退出 1；永不結算的掛鉤會在 `FAIL_LOUD_RELEASE_TIMEOUT_MS` 後退出；以及一連串 rejection 只報告第一個，同時 release 仍能跑完。

這些基於假程序的測試無法觀測到最關鍵的兩種失敗形態——真實事件迴圈下的程序結束代碼，以及退出之後的終端狀態——因此迴歸案例放在 `apps/cli/tests/tui-keyless-smoke.e2e.ts`。它在真實 PTY 中以 `fixtures/tui-invalid-provider.cordis.yml`（`providers` 為列表形狀，正是使用者真實會犯的錯誤）啟動出廠設定樹，期望結束代碼為 1，並斷言捕捉到的位元組流同時包含帶標籤的啟動 rejection（`dsh: plugin tree failed to load:`）與 `ESC[?2004l`。同一案例端到端釘住了啟動路徑：正是它發現了以 13 靜默退出、終端狀態未被恢復的 [HMR（熱模組替換）初始掃描啟動死鎖](../../archived/bug-fix/2026-08-03-hmr-initial-scan-boot-deadlock.md)。

`/exit` 路徑保留其原有斷言，確認正常退出時同樣會出現該重置序列。
