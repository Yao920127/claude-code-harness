# Agent Note: 確定性測試、回放不變式 fixture 與競態壓力測試

Status: proposed

[English](2026-06-11-deterministic-and-stress-testing.md) | 中文

[CI 測試可靠性 Skill](../../../skills/dsh-ci-test-reliability/SKILL.md) 提供目前的測試編寫與診斷指引，但沒有實作本提案中的 lint 規則、通用回放 fixture 或 nightly stress job。這些機制仍處於提案狀態。

## 問題

若干 agent loop（智慧代理迴圈）測試透過 `setTimeout(30)` 睡眠來同步——這是一筆不穩定性債務，浪費 agent 的重試週期，還可能掩蓋時序 bug。另外，我們的核心架構承諾（任何工作階段日誌回放後都能得到相同的派生歷史）目前只在兩個測試中斷言，但在*所有*測試中斷言的成本極低。此外，inbox 喚醒競態只被手動驗證過一次，沒有任何機制持續複驗。

## 提案

三項措施：

1. **測試中禁止掛鐘睡眠。** 將 `setTimeout(N)` 等待替換為事件驅動等待（既有的 `waitForIdle` 模式，擴充功能為 `waitForStatus`、`waitForEvent(n)`），或在需要測試時間本身時使用 vitest 的 fake timer。透過 lint 規則禁止 `setTimeout`，適用範圍是 `packages/*/tests`，白名單輔助模組除外。
2. **通用回放 fixture（測試前置資料）。** 一個共享測試輔助函式包裝 agent loop harness，使每個測試結束後，agent 的工作階段日誌被回放到一個全新的 Session 中，並自動斷言 `deriveMessages()` 相等。這樣該不變式在每次 CI 執行中會被套件產生的所有情境檢查數百次，而非僅兩次。
3. **夜間競態壓力測試。** 一個 CI job 以 `vitest --repeat=200`（加 `--shuffle`）執行 agent-loop 和 inbox 套件，以暴露排程依賴的失敗；發現的任何不穩定現象都視為需要修復的 bug，絕不靠重試掩蓋。

## 計劃

措施 1 和 2 一起落實（它們改動相同的輔助模組）；在套件消除所有睡眠後再新增夜間 job，以確保重複執行速度快。

## 驗收標準

- 不再使用 `setTimeout`；lint 規則在 `packages/*/tests` 中強制執行，白名單輔助模組除外。
- 共享 harness 將每個測試的工作階段日誌回放到全新的 `Session` 中，並自動斷言 `deriveMessages()` 相等，覆蓋整個套件。
- 夜間 job 以 `--repeat` 和 `--shuffle` 執行 agent-loop 和 inbox 套件；發現的不穩定現象一律按 bug 分診，絕不透過重試消除。

## 風險

Fake timer 與 agent loop 中的 Promise 排程存在微妙互動——優先使用事件驅動等待；僅在測試 timer 服務行為本身時才使用 fake timer。

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
