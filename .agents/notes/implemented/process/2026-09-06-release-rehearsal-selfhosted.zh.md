# Agent Note: 在持久化 Linux 執行器上執行受信任的釋出演練

Status: implemented

[English](2026-09-06-release-rehearsal-selfhosted.md) | 中文

## Problem

依賴佈局檢查和釋出打包演練消耗託管 Linux 分鐘，但不需要 npm 或 API 憑證。將任意拉取請求程式碼或攜帶憑證的釋出任務放到持久化共享主機會削弱隔離；複用未經清理的檢出目錄也會削弱打包載荷驗證。

## Decision

[release.yml](../../../../.github/workflows/release.yml) 的兩個作業和 [release-vendor.yml](../../../../.github/workflows/release-vendor.yml) 的打包作業僅在寫權限維護者控制的儲存庫變數 `DSH_CI_FAILOVER_LINUX` 設為 `selfhosted` 時選擇現有 Linux 自託管池。選擇器要求目前儲存庫為正式儲存庫且觸發者不是 Dependabot，然後只接納 master 推送，或作者不是 Dependabot 的同儲存庫、非 fork PR（Pull Request）。手動觸發始終選擇 `ubuntu-24.04`，其他不滿足條件的上下文也一樣。[故障切換手冊](2026-07-26-ci-failover-runbook.zh.md) 負責按平臺劃分的開關與熱備操作。釋出演練有意與主 CI 共用 Linux 開關：啟用或停用會同時路由兩類負載，不能獨立切換髮布演練。未設定時仍預設使用託管池；只有運維人員選擇 `selfhosted` 期間才節省託管分鐘，無論該選擇用於故障恢復還是持續的成本控制。

執行器標籤為 `[self-hosted, linux, x64, vm-backup]`。執行器註冊共享一臺虛擬機器，不代表獨立機器容量。每個作業在 pnpm 設定前將 Node 編譯快取與 node-gyp 標頭檔案放在執行器私有臨時捲上，pnpm 設定目標路徑包含執行、重試次數和作業標識。`TMPDIR` 也指向 `runner.temp`，因此臨時 npm 消費目錄既在檢出目錄之外，也在執行器清理範圍之內，即使程序被強殺而無法執行 `finally` 也一樣。持久化 pnpm 儲存位於檢出清理範圍之外；只有 GitHub 託管執行器恢復遠端儲存快取。兩個演練工作流都不儲存遠端快取。

檢出操作顯式清理被忽略和未跟蹤的輸出，再執行鎖定依賴安裝與現有建置。完整標籤歷史、打包並行、依賴檢查、壓縮包驗證和產物保留期均保持不變。打包安裝驗證器在檢出目錄外建立全新的消費目錄，用 npm 安裝壓縮包，移除繼承的 Node 解析掛鉤，並在 `finally` 中刪除消費目錄；預熱 pnpm 儲存無法用工作區連結或過期建置輸出代替壓縮包載荷。[npm 釋出決策](2026-08-10-npm-release-sequences.zh.md) 仍負責釋出族與釋出操作。兩個手動釋出工作流全部保留在託管執行器上，本改動不增加憑證，也不改變註冊表。

## Alternatives considered

始終使用託管演練可以避免持久化主機風險，但會保留全部託管分鐘。始終自託管則失去可移植退回。增加排程作業或可複用工作流會多出一個邏輯作業，並隱藏三個簡短的設定序列。允許任意引用的手動觸發，會讓維護者操作獲得比明確事件信任規則更廣的持久化主機存取權限。

## Consequences

取消變數或將其改為非 `selfhosted` 值，會將後續符合條件的作業路由到託管 Ubuntu。這是運維人員選擇的退回，不會自動探測執行器健康，也不會切換已排隊的作業。共享虛擬機器仍可能與其他受信任作業競爭資源；儲存庫寫權限維護者仍對進入持久化信任域的程式碼負責。工作流不安裝主機系統包，也不修改全域主機設定。

[scripts/tests/ci-release-selfhosted.spec.ts](../../../../scripts/tests/ci-release-selfhosted.spec.ts) 使用受信任事件和 fork、Dependabot、其他儲存庫、非 master 推送、手動觸發、缺失 PR 資料、停用開關等負向對照求值已提交的選擇器。測試固定設定順序、檢出清理、僅託管執行器存取遠端快取、釋出隔離和保留命令。真實發布建置與打包安裝執行仍由 PR CI 驗證；選擇器測試不聲稱重現這些建置。
