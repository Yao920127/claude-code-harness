# Agent Note: Workspace 依賴釋出範圍

Status: implemented

[English](2026-09-22-workspace-release-ranges.md) | 中文

## Problem

DSH 包共享同一次產品釋出。Cordis、其 vendored 庫和 Node Addon System 獨立釋出；消費者需要接收它們的補丁更新，而不自動接納新的次版本。

## Decision

每個 workspace 消費者對 DSH 目標使用 `workspace:*`，對 `vendor/` 下或 `native/system` 包族中的目標使用 `workspace:~`。規則覆蓋根目錄工具、應用、peer、開發依賴以及原生入口的可選平臺依賴。消費者不因目錄位置而獲得豁免。

打包時替換為目標包的目前版本：Cordis 為 `4.0.3` 時，`workspace:~` 轉為 `~4.0.3`；Node Addon System 為 `0.1.2` 時轉為 `~0.1.2`。DSH 引用仍為精確版本。原生包族的成員仍以同一版本釋出，但已安裝的入口可以解析到後續的平臺包補丁版本。

這套範圍策略細化了 [npm 釋出序列](2026-08-10-npm-release-sequences.zh.md)和[釋出依賴門面](2026-08-26-published-dependency-faces.zh.md)。它們的獨立釋出族和依賴區段分類保持不變。

## Alternatives considered

**Vendor 使用 caret 範圍。** 對 Cordis 這類穩定版本的包，caret 範圍也會接納後續次版本。

**Vendor 和 native 使用精確範圍。** 每次接納補丁釋出都需要修改消費者的依賴宣告。

## Consequences

Vendor 和 native 的補丁釋出必須保持面向消費者的 API 和二進位制介面相容。範圍轉換不改變本地 workspace 連結及鎖檔案解析結果。Workspace 門禁拒絕 DSH 的 tilde 範圍，以及 vendor/native 的 caret 或精確範圍；打包清單測試驗證最終輸出的版本。
