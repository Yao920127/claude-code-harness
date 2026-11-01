# Agent Note: 透過發現機制取得包清單，而非維護靜態列表

Status: proposed

[English](2026-06-20-discover-package-inventory.md) | 中文

## 問題

包與門禁清單在 TypeScript project references、包文件和 CI 描述中反覆出現。大多數只是重述包佈局、manifest（中繼資料清單）資料或聚合命令內容。因此每新增一個包都會產生本可避免的同步點。

[包層級結構](../../archived/architecture/2026-06-20-package-hierarchy.md)已經手動消除了其中若干：`scripts/publint-all.ts` 現在從 `packages/<group>/<pkg>` 佈局推導列表，兩份 `tsconfig` 的 `paths` 對映也合併為一個 `@deepseek-ai/dsh-*` 萬用字元——該合併此後已被退回為「每包一條、由生成器託管並有門禁把關」的顯式別名，因為按順序試候選的解析開銷主導了原始碼啟動時間（[顯式 workspace 路徑別名](../../archived/process/2026-08-27-explicit-workspace-path-aliases.md)）。剩下的是無法用 glob 消除的清單，主要是聚合設定（`tsconfig.host.json`、`tsconfig.client.json`）中的專案引用（`references`）——TypeScript 要求它們是顯式陣列（沒有萬用字元形式）。

當靜態列表編碼的是策略時，它們是合理的；當它們只是重複 `package.json`、workspace glob 或包層級結構中已有的 manifest 資料或佈局事即時，就是不必要的摩擦。

## 提案

讓剩餘的包與門禁清單可被發現。唯一真源，即 `packages/<group>/<pkg>` 層級結構加上包 manifest，應當驅動聚合設定的 `references`、模組圖以及任何全量包列表，並配合一個生成加驗證步驟（沿用現有的 `gen-module-graph` / `gen-cordis-catalog` 模式：生成器寫出產物，`--check` 模式在 `hygiene` / `doc-sync`（文件同步門禁）中發現已提交副本陳舊時失敗）。模組圖生成已經在讀取包 manifest。`doc-sync` 應當成為定義並列印其子門禁的唯一命令，文件連結到該命令，而非重述第二份列表。

層級結構不需要編碼關於包的所有事實，但應當編碼寬泛的維護策略：core/product 包、整合包、能力 seam 包與 support/test/example 包不應在腳本能區分它們之前先要求一份手工維護的例外列表。

## 驗收標準

- 聚合設定的專案引用（`references`）由層級結構生成（生成器輸出它們；`--check` 門禁在提交副本陳舊時報錯），而非手工維護。
- 新增一個包時，不需要為任何門禁編輯靜態包列表。
- 文件描述真源，而非重複生成的清單。
- CI 呼叫聚合命令，由這些命令自行管理其子門禁列表。

## 風險

發現腳本可能變得過於精巧。實作應當保持樸素：讀取 manifest、按顯式欄位過濾、列印解析後的列表，並在出錯時明確失敗。收益在於消除手工清單的漂移，而非發明一套建置系統。

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
