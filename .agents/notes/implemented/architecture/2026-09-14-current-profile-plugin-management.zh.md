# Agent Note：目前 profile 外掛管理共享 CLI 事務

Status: implemented

[English](2026-09-14-current-profile-plugin-management.md) | 中文

## 問題

Web 和 Agent 控制元件需要修改執行中的 profile，同時避免另建包安裝器或覆蓋使用者編寫的 YAML。檔案監聽器可能讀到安裝期間寫入的中間 manifest，也可能在被刪除外掛尚未釋放資源時報告成功。

## 決策

[外掛管理器](../../../../packages/boot/plugin-manager/README.zh.md)與 `dsh plugin` 呼叫同一套非同步包操作。launcher 透過純資料 `ctx.profileContext` 提供 profile 與解析位置、啟動時組合包和呼叫級 overlay。共享函式組合目前檔案；該介面不包含回呼或修改方法。CLI 與 service 修改持有 profile manifest 的寫鎖；[DSH HMR](../../../../packages/boot/hmr/README.zh.md) 透過同一佇列序列執行模組替換、Include 重新整理、profile 重新組合與管理器設定變更。HMR 在自身初始化時註冊 profile 監聽，等待應用就緒後再處理編輯。manifest 通知只比較有序組合包列表；僅依賴欄位變化不會觸發設定過載。最終 YAML 組合決定是否執行 HMR，啟動器不安裝退回實例。pnpm 在 `hmr.runExclusive()` 外執行；只有設定變更和 Loader 更新進入該佇列。HMR 不取得包操作寫鎖，因此安裝不會阻塞其他由檔案變化觸發的設定更新。每次過載重新讀取 manifest、組合包層與使用者 patch，同時保留呼叫級 overlay 的優先順序。

設定監聽預設使用 Chokidar 寫入穩定檢測。普通變化處理器會丟棄 50 ms 內的第二個事件，因此啟用後立即再次寫入可能讓之前的組合包繼續執行。穩定後交付事件會觀察最終檔案；檔案驅動的更新承擔穩定等待，直接管理器事務則不需要。迴歸測試透過 Chokidar 的真實規範化路徑交付連續變化，驗證兩個狀態均被應用。

profile 檔案保持為持久狀態：條目開關只修改最後一條符合條目 id 及模組名稱斷言的覆蓋項中的 `disabled`，沒有匹配項時追加，組合包開關修改有序字串列表。更新依賴不會重新啟用保留的已停用組合包。service 刪除組合包時，先應用去掉該組合包的設定，等待舊 fiber 完成解除安裝後再刪除依賴。已儲存設定、pnpm 完成狀態與執行時啟用分別報告；失敗的刪除保留實際的部分狀態與診斷路徑，失敗或被取消的安裝則恢復它快照的 profile 檔案。

這擴充功能了[profile 組合包決策](2026-08-05-profile-plugin-bundles.zh.md)。startup profile 保留程序組合，Desktop 包管理仍由 shell 持有。Web 控制元件與顯式啟用的 Agent 工具呼叫同一 service。管理操作向呼叫方返回結果，不向存活 Agent 新增訊息。創造模式啟用該 Agent 工具；base 組合包和其他內建預設預設停用。純瀏覽器 worker 預覽沒有主機包安裝器；其模組代理表明確拒絕 `execa` 呼叫，同時保留管理模組用於清單發現。

CLI 呼叫繼承終端和認證環境；service 呼叫保留子程序憑證清理與有界診斷。管理結果提供錯誤碼和參數，由 Web 詞典呈現文案。過載前後比較 entry、fiber、設定與診斷：未變化的已有故障保留為警告，本次影響到的新故障使操作失敗。顯式啟用的目標必須成功啟用。

建置審批在同一個 profile 寫鎖內更新 pnpm 11 尚未決定的 `allowBuilds` 條目，並保留無關 YAML。授權按準確包名持久化，不採用無條件允許腳本的策略。重試只接受仍在待審批列表中的包名，因此過期請求不能覆蓋後續拒絕。包清理保留審批設定，後續重試可以複用授權而不必保留部分安裝的依賴。service 報告僅涉及策略的變化。Agent 工具可以代表使用者授權；工具說明要求使用者在對話中明確同意，而 service 僅驗證待審批包名。審批拒絕 `allowBuilds` 內的錨點和別名，避免共享 YAML 節點改變未請求的權限。

## 考慮過的替代方案

**由 service 啟動另一個 dsh 程序。** 這會重複生命週期協調，也無法確認目前 Loader 已完成解除安裝後才讓 pnpm 刪除檔案。共享操作模組保留單一實作，同時讓呼叫方持有各自的呈現方式。

**失敗後恢復已有包。** 無法僅憑原 manifest 可靠重建包版本、依賴樹和安裝腳本的副作用，因此已有依賴及安裝成功但啟用失敗的包保留原處。失敗或被取消的安裝只恢復 pnpm 執行前快照的 manifest 與 lockfile 文字（[引導式外掛安裝](2026-09-15-guided-plugin-installation.zh.md)）；已下載檔案保留到下一次包操作清理為止。

**包更新時熱替換原始碼模組。** 設定變化可以複用已載入模組快取，替換已安裝 JavaScript 則需要新的程序。替換已有依賴會報告需要重新啟動。

## 影響

同一 profile 可以透過 CLI、Web 和工具管理，操作透過檔案鎖協調並保留 patch 優先順序。運維人員需要根據報告的檔案和診斷修復失敗的包操作。startup 程序必須先停止，才能透過 CLI 刪除其載入的包。管理元件受保護，不能透過 service 刪除。
