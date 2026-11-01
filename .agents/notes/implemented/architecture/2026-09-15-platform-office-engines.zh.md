# Agent Note: 每個平臺使用一個 Office 引擎

Status: implemented

[English](2026-09-15-platform-office-engines.md) | 中文

## Problem

在可用的原生引擎之外安裝 WASM，會為應用下載和安裝資源增加第二份 LibreOffice 載荷。[獨立 kit 歸屬](2026-09-14-independent-libreoffice-kit.zh.md)中最初的退回策略要求固定平臺的 Desktop 和 Python 分發物也攜帶這份額外載荷。

## Decision

Harness 從已安裝 kit API 的 `optionalDependencies` 中選擇一個引擎。宣告瞭 `@deepseek-ai/libreoffice-kit-${platform}-${arch}` 的目標要求該原生包，其餘目標要求共享 WASM 包。受支援的原生目標集合由 kit 釋出版本決定，不由 Harness 中的作業系統分支決定。已宣告的原生包缺失表示安裝不完整，不會改選 WASM。provider 不直接依賴 WASM。

Python sidecar 組裝僅複製所選引擎及其依賴閉包。wheel 打包和執行時查詢依據同一份 kit 清單選擇；遷移目錄後的轉換冒煙檢查所選後端。Desktop 在簽名和完整性封裝前將 npm 安裝結果過濾為該引擎。引擎編譯、解析器相容性、npm 平臺中繼資料、資格驗證與釋出仍由 kit 儲存庫負責。

## Alternatives considered

**在每個原生引擎旁保留 WASM。** 這能容忍可選原生包缺失，卻會增大每個支援原生引擎的分發物。固定平臺分發物要求其已宣告的原生引擎存在且經過測試。

**在所有平臺移除 WASM。** 沒有已釋出原生引擎的目標仍需轉換能力。共享 WASM 包為這些目標提供轉換，無需引入新的原生髮布目標。

**將 Python Office 伴隨目錄設為可選。** 執行時承載共享的 `dsh` CLI 及其 Web profile，而不只有預設 SDK profile。強制攜帶目標引擎使已安裝 wheel 具備完整的內建 profile 集合，並在啟動前報告載荷不完整。SDK 和 headless 使用者也承擔引擎的下載與安裝體積。

## Consequences

宣告瞭原生目標的分發物省去 WASM 資源，其餘目標保留 WASM 的資源和字型要求。鎖定的 kit 宣告瞭 macOS/Windows ARM64 和 x64 原生包，因此目前 Linux 分發物選擇 WASM；kit 釋出版本可以新增 Linux 原生目標，無需修改 Harness 的選擇規則。這不擴充功能 Harness 支援的釋出平臺。Harness 的 sidecar、wheel 和執行時解析測試覆蓋已宣告原生目標與 WASM 選擇，包括原生包缺失。新包位元組在釋出前需要 kit 資格驗證和匹配的依賴完整性記錄。

新增引擎包標識還需要更新 `scripts/gen-third-party-notices.ts` 中的 `LIBREOFFICE_PACKAGES`、`pnpm-workspace.yaml` 中適用的 `minimumReleaseAgeExclude` 條目，以及 [kit 歸屬記錄](2026-09-14-independent-libreoffice-kit.zh.md)中的包列表。許可證允許列表仍使用明確的包標識。

[公開 Python 釋出工作流](../../../../.github/workflows/python-release.yml)拒絕任何大於等於 100,000,000 位元組的 wheel。只選擇一個引擎會減少載荷，但不能據此認定執行時 wheel 已滿足此限制；npm 引擎釋出、本地轉換與 wheel 上傳資格是不同的驗證。
