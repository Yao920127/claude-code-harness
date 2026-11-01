# Agent Note: 獨立 LibreOffice kit 的歸屬

Status: implemented

[English](2026-09-14-independent-libreoffice-kit.md) | 中文

## Problem

LibreOffice 編譯、原始碼補丁、平臺資格驗證和大型二進位制釋出的維護週期不同於 Harness 外掛。將它們放在應用工作區會擴大常規 CI，並讓引擎修復依賴 monorepo 包規則。

## Decision

`deepseek-harness/libreoffice-kit` 儲存庫維護可複用的 `@deepseek-ai/libreoffice-kit` Node API、Worker、字型處理、引擎選擇、建置配方、補丁、測試和釋出。API 不依賴 Cordis。Harness 負責將自己的 `OfficeToPdf` 服務適應到此 API，以及 Session 授權、轉換生命週期、傳輸、Web UI 和應用打包。

kit 釋出流程獨立於 Harness 釋出流程。kit 儲存庫驗證並以統一版本釋出 Node API 和引擎 npm 包，起始版本為 `0.0.1`。Harness 消費精確的 npm 版本，並在 `pnpm-lock.yaml` 中提交依賴解析結果；Harness 釋出既不建置也不釋出 kit 包。

上游 API 將平臺引擎宣告為可選依賴。[平臺引擎決策](2026-09-15-platform-office-engines.zh.md)取代最初強制攜帶 WASM 退回引擎的策略。Desktop 將 kit 作為外部 npm 依賴安裝。Python sidecar 將 Worker、所選引擎及其依賴閉包保留在真實檔案系統中，位於可執行檔案的虛擬檔案系統之外。轉換無需下載或 GitHub 憑證。

kit 儲存庫負責引擎資格驗證和對應原始碼材料。API 和引擎攜帶 MPL-2.0 宣告、可存取原始碼及再分發宣告；Harness 打包時保留這些材料。再分發宣告檢查僅在許可為 MPL-2.0 時接受 API、WASM、macOS ARM64/x64 和 Windows ARM64/x64 的精確包標識；無關包和改變後的許可條款仍被拒絕。

## Alternatives considered

**將公開 API 和 Core 建置放在 Harness。** 這能同步原始碼變更，卻讓應用維護承擔耗時的引擎建置和特殊包規則。Cordis provider 是應用整合點；可複用轉換 API 應與引擎測試放在一起。

**安裝前準備 GitHub Release 歸檔。** 這需要單獨的授權驗證、雜湊、解壓、工作區 overrides 和分發重打包。已釋出的 npm 包使用應用常規的依賴安裝與平臺選擇流程。

## Consequences

更新 kit 需要在其獨立儲存庫驗證並行布新版本，再更新 Harness 依賴版本和鎖檔案。必需的 npm 包缺失時安裝失敗；Harness 不透過編譯引擎恢復。原生和 WASM 轉換冒煙驗證已安裝的包，Desktop 與 Python 檢查覆蓋應用打包。
