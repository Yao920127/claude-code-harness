# Agent Note: 以機械品質門禁取代行文約定

Status: implemented

[English](2026-06-11-quality-gates.md) | 中文

本記錄中的掛鉤/CI 對稱設計已由[快速本地 Git 掛鉤](../../archived/process/2026-07-22-fast-local-git-hooks.md)取代；CI 仍是執行完整檢查的路徑。

## 問題

本程式碼庫主要由 coding agent（智慧代理）開發。相比行文約定，agent 遵守強制門禁的可靠性遠高得多；而當勞動由 agent 承擔時，「工作量大」不構成成本論據。早期證據：未透過型別檢查的測試被提交（vitest 不做型別檢查），僅在評審中才被發現。

## 決策

每條可機械檢查的 AGENTS.md 承諾都有一個以非零狀態退出的命令。CI 執行完整集合，而 Git 掛鉤將延遲預算留給可低成本發現的本地缺陷：

- 最嚴格的 TypeScript 設定（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 等）；範例、測試和腳本透過根目錄的 no-emit `tsconfig.json` 在 CI 中進行型別檢查，而包/vendor 程式碼保持在各自 project-reference 邊界之後。
- [Oxlint](../../archived/process/2026-07-29-oxlint-linter.md) 配合型別感知的 TypeScript 規則以及 @stylistic 和 SonarJS 相容外掛，強制執行統一程式碼風格和檔案內重複邏輯檢查；vendor 程式碼排除在外。
- jscpd 檢測包的生產 TypeScript 程式碼與儲存庫腳本中的跨檔案克隆；窄範圍的原始碼區間例外用於記錄有意為之的並行實作。
- `packages/*/*/src` 下按檔案 100% 覆蓋率（v8）；不可達的防禦性守衛使用 `/* v8 ignore */ ` 並註明理由，而非刪除。
- publint（包的正確性）、workspace 約束（workspace 規則：private、cordis peer+dev、統一版本、ESM），以及對建置出的包宣告檔案進行 NodeNext 消費方型別檢查。[移除未使用程式碼門禁的決策](2026-08-19-remove-knip.zh.md)說明了靜態死程式碼掃描為何不屬於這套門禁。
- lefthook pre-commit 執行不載入專案的 Oxlint 驗證，並應用帶[一次有界重試](../../archived/process/2026-08-09-oxlint-only-fix-workflow.md)的安全修復，拒絕已暫存的空白問題並檢查 vendor manifest（中繼資料清單）；pre-push 執行增量型別檢查。CI 在 Node 22.19/24/26 上執行完整矩陣，並對 Headless、TUI、ACP（Agent Client Protocol）、JSON-RPC、工作流和 PTC 執行時入口路徑執行已建置應用的冒煙測試。

## 後果

- 約定不會因 agent 更替而失效；可低成本發現的 commit/push 缺陷會在本地觸發失敗，其餘違規會在 CI 的完整檢查中觸發失敗。
- 門禁本身也是需要維護的程式碼；設定變更與其他變更一樣需要評審。
- 100% 覆蓋率的壓力可能催生無斷言的測試——變異測試是計劃中的對策（見[變異測試提案](../../proposed/testing/2026-06-11-mutation-testing.zh.md)）。

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
