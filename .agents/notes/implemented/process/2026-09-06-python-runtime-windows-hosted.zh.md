# Agent Note: Windows Python runtime CI 保留在 GitHub 託管 Windows 上

Status: implemented

[English](2026-09-06-python-runtime-windows-hosted.md) | 中文

## 問題

當 #3629 加入故障切換選擇器與作業私有的 Windows 工具鏈後，[build-exe-for-python-sdk.yml](../../../../.github/workflows/build-exe-for-python-sdk.yml) 中的 Windows x64 目標開始對受信任的 PR CI 透過 `DSH_CI_FAILOVER_WINDOWS=selfhosted` 解析執行器。共享的 `dsh-win-ci` 池並未讓該通道更可靠。2026-09-06（所有時間均為 UTC；每次執行都執行 #3629 遷移工作流的選擇器，該選擇器自 07:56 合併起生效）：安裝後 wheel 冒煙測試在 09:12 於 `dsh-win-ci-16` 上為PR #3640（`ci/benchmark-standard-runner`）的最初實測修訂 (run 34023970384)透過，隨後 10:06 在 `dsh-win-ci-21` 上為PR #3337（`feat/visualizer-host-plugin`） (run 34026500701)失敗，10:46 在 `dsh-win-ci-04` 上為PR #3640 的最終實測修訂 (run 34028339888, job 101473395734)失敗——`smoke_sdk_profile_plugin` 打包的 `dsh plugin add` 子程序無輸出即退出，而該次執行的 Linux 與 macOS 單元均透過；11:29 的作業重試再次出現相同的無聲死亡。遷移提案（#3629）保持 `proposed`，因為其吞吐量與共享負載驗收標準從未實測。

## 決策

Windows x64 目標始終使用託管的 `matrix.runner`——PR CI 為 `windows-2025`——配以標準 setup-python 工具鏈、pnpm 快取恢復與 pkg 快取。來自 #3629 的故障切換選擇器、作業私有 Python 準備步驟、自託管依賴安裝與後置清理、私有準備腳本及路由測試均被移除。`DSH_CI_FAILOVER_WINDOWS=selfhosted` 再次只重定向 [ci.yml](../../../../.github/workflows/ci.yml) 中的原生 Windows 作業；[故障切換手冊](2026-07-26-ci-failover-runbook.zh.md)與 [python/development.zh.md](../../../../python/development.zh.md) 描述僅託管的 runtime 建置。遷移中的 UTF-8 模式匯出之所以存在，是因為持久主機使用 GBK 預設內碼表；託管映像提供該通道此前執行的區域設定。

## 已考慮的替代方案

**保留故障切換路由。** 不採用：共享池同一天兩次復現相同的安裝後 wheel 子程序無聲死亡，而遷移清單的吞吐量驗收仍然懸置；並且把正確性通道路由進故障切換狀態，會使其耦合到無關的池故障開關。

**改為修復共享池。** 交由池運維者處理：觀測到的失敗是無輸出即退出的子程序，而非映像前置條件缺失；同一映像還服務原生 Windows 故障切換作業。

**在託管映像上保留作業私有工具鏈。** 不採用：私有 uv/Python 下載的存在理由是不修改持久共享主機；一次性託管映像已提供遷移前通道使用的已註冊 Python 3.10 工具鏈。

## 後果

每個符合條件的拉取請求再次為 runtime 建置支付 GitHub 託管 Windows 容量，作業私有準備與清理機制（包括有界檔案系統重試）隨通道一同移除。交換來的是每次建置執行在帶標準工具鏈與託管快取的一次性主機上，且 Windows 故障切換開關只覆蓋遷移前文件所述的原生 Windows 作業。未來的自託管嘗試必須在任何路由變更前，對實際池重新驗證吞吐量與失敗可復現性，並且必須重建已退役 #3629 提案記錄的約束：setup-python 的 Windows 安裝器會刪除匹配的機器/目前使用者安裝記錄併為所有使用者安裝（私有工具快取無法隔離這些註冊表狀態），每個建置快取與臨時測試根目錄必須作業私有並使用複製匯入而非共享 store 連結，清理必須在成功、失敗與取消路徑上以有界 Windows 檔案系統重試執行，且只有 Windows x64 目標可移植——Linux 目標的 manylinux 檢查需要 Docker。
