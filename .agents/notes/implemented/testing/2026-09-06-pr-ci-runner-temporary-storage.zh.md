# Agent Note: PR CI 使用 runner 管理的臨時儲存

Status: implemented

[English](2026-09-06-pr-ci-runner-temporary-storage.md) | 中文

## 問題

Linux 故障切換池在同一臺虛擬機器上執行多個 runner 實例。PR 覆蓋率和快照程序使用作業系統臨時目錄存放轉換後的模組與測試夾具。runner 臨時目錄之外的檔案不受作業清理管理，取消執行阻止程序自行清理時也不例外。該共享目錄耗盡會讓無關 PR 在測試執行前就失敗。

## 決策

[PR CI](../../../../.github/workflows/ci.yml) 的靜態檢查、覆蓋率和消費者作業在任何準備或測試程序啟動前，在首個步驟透過 `GITHUB_ENV` 匯出 `TMPDIR=runner.temp`。Node、Vite、tsx 和臨時測試消費者繼承 runner 管理的位置。每個 runner 管理自己的目錄，GitHub Actions 在作業開始和完成時清除其中可刪除的內容；測試夾具仍分配唯一子目錄，並保留自身清理邏輯。

npm 保留設定的持久化快取，在 POSIX 上通常為 `$HOME/.npm`；主 CI 和釋出工作流不設定每作業覆蓋。pnpm store 保持共享於 `$HOME/.local/share/pnpm/store`。兩者依靠包管理器的並行存取支援保留跨 runner 複用；共享快取容量及檔案系統故障仍由運維負責。消費者作業將 Playwright 瀏覽器下載和安裝鎖放在 `RUNNER_TEMP` 旁；託管快取恢復使用同一位置。

[釋出演練決策](../process/2026-09-06-release-rehearsal-selfhosted.zh.md) 對釋出消費者採用相同的生命週期規則。[故障切換執行手冊](../process/2026-07-26-ci-failover-runbook.zh.md) 繼續負責 runner 選擇和共享主機容量。本變更不調整作業目標、不降低並行、不重試測試、不削弱斷言，也不修改僅在 master 上執行的 CI。

## ACP 完成順序的錄製

[ACP 診斷情境](../../../../snapshots/session/subagent-acp-diagnostic/cordis.snapshot.yml) 暫停腳本化的後臺回應，直到 `job_output` 開始等待完成。沒有這種同步，快速子程序可能在錄製的父步驟之間釋出合法的作業通知。情境本地 wrapper 在 jobs 服務註冊完成等待器後釋放子程序；mock 在測試私有 workspace 中監聽獨佔建立的標記，並在釋放後關閉 watcher。夾具在銷燬時恢復被包裝的方法。錄製的 Session 位元組和生產作業通知行為保持不變。

## Workspace 授權夾具的位置

Headless 的 `session-sandbox-root` 夾具宣告 `workspace.parent: outside-temp`，而不是依賴 home 所在檔案系統。分配器在父目錄可寫且避開系統臨時授權時選擇規範化平臺臨時根目錄的同級目錄，否則使用 home，並拒絕已被自動臨時寫授權覆蓋的 cwd。在故障切換 runner 上，這讓測試留在資料卷中，同時不會讓寫入藉助臨時目錄豁免而成功。檔案系統沙箱的包含關係測試使用同一分配器建立 workspace 及被拒絕的同級目錄，並在成功取得目錄後立即註冊清理。原子 workspace 分配、錄製的 Session 位元組以及獨立預期檔案保持不變。

## 線上驗證與瀏覽器夾具輸入

已安裝 wheel 的線上 SDK 測試在要求模型驗證前，由外部將建立的檔案替換為新的、僅主機知道的挑戰值；驗證提示不暴露該值。兩個 turn 必須包含模型請求的工具呼叫，驗證器同時比較回傳值及真實檔案位元組。

Reference-composer 夾具將已知的 home 縮寫 workspace 顯示對映到既有 cwd token，並在選擇前等待目前精確建議集；主機路徑或過時建議都不決定測試結果。共享瀏覽器時區、Inspector 訂閱同步及 PowerShell 完成行為遵循[既有平臺測試決策](2026-09-07-pwsh-ci-observable-completion.zh.md)。

高階 Python 快照僅暫停其匹配的 workflow 子程序首次 pre-step，直到觀察到父 Session 的持久化 workflow 成員事件。夾具支援事件先到或等待先建立兩種順序，並在取消或銷燬時結束未完成等待。這固定了情境的跨 Session 順序，而不排序通知或改變生產排程。

Queue 快照在捕捉前將指標移離 Stop/Send 控制元件，並等待其 Send tooltip 關閉。Workspace-management 測試透過操作按鈕定位唯一非空 Session，而不依賴行位置；在斷言歸檔會移除空的 Ungrouped 分組前，先選中該 Session。Hover 行為、佇列內容、持久化歸檔身份及過載斷言保持不變。並行 spill 隔離測試將每個根目錄與其執行結果關聯，而不假設檔案系統分配完成順序與輸入順序一致。

## 考慮過的替代方案

**由 PR 作業刪除共享臨時檔案。** 其他 runner 可能仍在使用這些檔案。儲存庫作業不得按路徑或檔案年齡回收共享目錄。

**重試測試或增大超時。** 兩者都不能恢復儲存空間，也不能為殘留檔案指定清理責任方。

**將所有作業切換到託管 runner。** 這能避開受影響的虛擬機器，但故障切換路徑的缺陷仍在，也會改變運維人員獨立選擇的執行池。

## 影響

遵循 `TMPDIR` 的輸出隨作業生命週期清理，而不累積於無人管理的主機儲存。包管理器和瀏覽器快取保持持久化。本方案不回收既有共享臨時檔案、不保證檔案系統容量，也不清理 runner 帳號無權刪除的檔案。歷史殘留、磁碟設定以及本 PR 工作流以外的作業仍由運維人員負責。

Linux bwrap 和 Landlock 的 workspace-write profile 允許寫入字面路徑 `/tmp` 和 workspace，而不允許寫入其外部繼承的 `TMPDIR`；受限測試夾具必須將臨時寫入放在這些已授權路徑中。[快照 spill helper](../../../../packages/test-support/session-snapshot/src/harness.ts) 將固定長度的邏輯定位符與原子分配的實際儲存分開。僅用於夾具的介面卡將儲存操作委託給真實的本地 spill provider，並僅將本次執行已儲存的定位符解析到實際檔案。錄製的預覽長度、省略計數及檢索斷言保持不變；邏輯 `/tmp/dsh-acp-snap-*` 字首下不分配檔案。本變更不擴大產品沙箱授權。

[ci-workflow.spec.ts](../../../../scripts/ci-workflow.spec.ts) 的 YAML 解析案例要求三個 worker 都包含該賦值，並拒絕步驟級別的覆蓋。它們在未修改的工作流上失敗。獨立程序 smoke 檢查和重複 PR 執行驗證實際工具鏈；僅有 YAML 斷言不能證明主機容量充足。
