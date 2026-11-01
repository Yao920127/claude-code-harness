# Agent Note: 保持 Loader 更改非事務化

Status: implemented

[English](2026-09-09-nontransactional-loader.md) | 中文

## 問題

事務化設定過載會在編輯失敗後保留舊外掛代次，但要求 Loader 負責候選匯入、生命週期結算、復原、選項物件身份和 Include 序列化。這些更改使 vendor 實作與固定來源產生顯著差異。應用啟動和 profile patch 監視也隱式依賴該結算行為。

## 決策

撤銷 #932 中的五個提交，解決包移動衝突並保留後續獨立行為。記錄的合併提交屬於更大的 #936 依賴鏈；撤銷其第一父提交差異還會刪除無關的儲存庫外掛支援。[Vendor 修改記錄](../../../../vendor/README.md#local-modifications) 按不變的固定來源記錄每項保留的原始碼更改。

Loader 立即更改條目選項。EntryGroup 並行啟動同級條目並記錄應用失敗；EntryTree 等待未完成的工作，但不因失敗的 fiber 而拒絕。兩者均不恢復舊外掛或設定。Include 保留解析總和檢查碼 patch 重應用，但外掛失敗可能留下部分應用的設定樹。

應用消費者負責完成檢查。CLI 在安裝即時 patch 監視器前等待其退回 HMR 服務。目錄選擇器檢查其掛載的條目。選擇器和瀏覽器包執行器在移除條目前取得首次 fiber 釋放的結果，並等待該結果後才報告拆卸完成。預設掛載等待其子樹，並報告匯入、啟用和缺少服務的失敗。[應用啟動](../../../../packages/boot/app-boot/README.zh.md) 負責精確 patch 檔案監視、啟用檢查和部分上下文清理。Web 啟動在列印 URL 或開啟瀏覽器前檢查啟用狀態。這些適應維持應用反向補丁後已有的消費者行為。

Fiber、Entry 和 isolate 保持上游的更新返回行為。App boot 透過現有的 `internal/update` waterfall 觀察被丟棄的重新啟動 promise，並在檢查 patch 過載前等待 fiber。遊離的匯入完成觀察器處理 fiber 的兩種結果；fiber 仍保留失敗資訊供顯式檢查。Include 的持久寫入在刪除子條目前後均排空，防止後續拆卸寫入掩蓋更早的終止性寫入失敗。

保留兩項 #932 專屬 vendor 改動：Include 中等待初始檔案建立並強制重新讀取，以及 Schemastery 條件匯出。恢復 #932 前的防抖寫入和讀取順序，會在缺失檔案初始化測試中復現 `ENOENT`。保留這兩行可以維持已有 `initial` 選項，而無需在應用側增加檔案寫入器或另一份 YAML 序列化邏輯。移除 Schemastery exports 後，Web preset 測試在啟動時復現 `ERR_REQUIRE_ESM_RACE_CONDITION`：並行 ESM 匯入使 Node 退回到 CJS 入口。HMR 注入裝飾器、條件 patch 克隆及更新回傳值採用 #932 前的行為。顯式 `workspace:` 依賴使 #932 的 workspace 連結開關與專用鎖檔案檢查不再必要。

## 考慮過的替代方案

**保留事務化 Loader 更新。** 它們能從被拒絕的外掛候選自動恢復，但會保留本次刪除的 vendor 生命週期機制。解析失敗可以獨立於外掛復原進行處理。

**逐字恢復所有 vendor 檔案。** 這還會刪除延遲注入設定求值、條件停用條目、生命週期釋放修復、持久寫入和模組載入器相容性。這些更改具有獨立消費者，並繼續記錄在 vendor 修改記錄中。

**將通用復原移入應用啟動。** 這會在另一歸屬下保留相同的候選代次與恢復義務。應用改為報告失敗，並允許後續有效編輯恢復。

## 後果

外掛啟用失敗可能保留新選項和失敗的 fiber。要求外掛處於啟用狀態的呼叫者必須在結算後檢查；僅等待 `Loader.create()` 不能證明啟用。自動外掛復原需要後續獨立決策，並證明其恢復收益值得額外的生命週期實作。

[即時 patch 測試](../testing/2026-09-09-user-patch-hmr-test-delivery.zh.md) 保留受控事件投遞和原生監視覆蓋，同時斷言不復原時的失敗報告。[終端釋放策略](../bug-fix/2026-07-31-fail-loud-releases-the-terminal.zh.md) 仍適用於致命錯誤和部分啟動拆卸。Web preset 組合與真實 CLI webhook 建立的模型 Session 提供手動掛載外掛之外的應用級驗證。
