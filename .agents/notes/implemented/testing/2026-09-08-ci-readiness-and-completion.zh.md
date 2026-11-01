# Agent Note: CI 斷言等待所屬操作完成

Status: implemented

[English](2026-09-08-ci-readiness-and-completion.md) | 中文

## 問題

master 空 PR 的執行 (run 34206953049)在等待 Webhook Session 建立一秒、等待 PowerShell 輸出五秒時失敗。兩個測試都不衡量啟動延遲保證。另一次執行 (run 34207864157)在 Desktop worker 就緒測試中暴露了相同的區域性短時限問題，並在輸入框仍保留已提交命令時擷取了回饋確認。

另一次 Windows coverage 執行 (run 34224004885, job 102053583437)報告了 publint 子程序退出狀態為 null，以及 LSP 初始化標記等待超時。對應 helper 在通道的 90 秒測試預算內另設五秒和三秒限制。這些案例驗證釋出內容與取消行為，不衡量冷啟動延遲。

ACP coverage 執行 (run 34242280527, job 102115221228)在傳輸失敗後耗盡一秒的註冊表輪詢期限。斷連清理包含取消、輸出排空、持久化和 owner 處置；僅從註冊表移除不能證明完整拆卸已經結束。

一次 worker runtime coverage 失敗 (run 34248221544, job 102135631932)耗盡了慢 binding 夾具的一秒計算額度。原生 Windows 並行復現在呼叫 binding 前已超過該額度。Worker 初始化會累計所測的活躍時間；延遲的 binding 累計空閒時間。

Windows 覆蓋率執行 (run 34324325375, job 102377982193)報告了 SDK 子程序退出超過測試設定的 200 毫秒確認期限，以及 Inspector Worker 啟動超過十秒預設期限。協定錯誤轉發案例和 Cordis 樹投影案例都不衡量這些延遲保證。

## 決策

[Webhook 瀏覽器測試](../../../../apps/web/tests/github-ready-review.e2e.ts)觀察投遞觸發的模型請求後再檢查 Session 註冊。[回饋測試](../../../../apps/web/tests/feedback-command.e2e.ts)在比較 ARIA 輸出前等待輸入框清空且附件按鈕啟用。連續兩次快照相同不能證明命令 RPC 已完成：事件流可能先發布確認訊息。

[Desktop 事務測試](../../../../apps/desktop/tests/project-manager.spec.ts)為 worker 就緒標記使用目前測試的執行預算。獨立的 `afterEach` 在刪除私有目錄前釋放並等待 worker，包括執行器放棄超時測試體的情況。輪詢觀察執行器的取消訊號，teardown 獨立報告事務失敗，不覆蓋斷言失敗。[PowerShell 測試](../../../../packages/shell/pwsh-local/tests/executor.spec.ts)在初始化外掛前登記每個 helper 建立的 Context，並在刪除臨時目錄前處置這些 Context。後臺輸入案例等待程序完成後檢查完整輸出、完成狀態與結束代碼。消費式讀取仍由獨立的流式測試覆蓋。

[publint runner 測試](../../../../scripts/publint-all.spec.ts)將目前測試預算傳給子程序，並在解釋結束代碼前檢查啟動錯誤和終止訊號。[LSP 實例測試](../../../../packages/lsp/lsp-stdio/tests/instance.spec.ts)用同一預算等待 fixture 標記，在取消前觀察實際尚未完成的 `didOpen` 寫入，並在等待就緒前接住查詢的 rejection。[伺服器 fixture](../../../../packages/lsp/lsp-stdio/tests/fixture-server.ts)在暫停 stdin 後釋出標記。Teardown 在首次 await 前捕捉實例列表、Context 和目錄。

[ACP 斷連測試](../../../../packages/acp/acp/tests/dispose.spec.ts)在 EOF 和傳輸失敗兩種情況下等待真實 Session handle 的 disposer。屏障阻塞處置，供測試檢查所有權，然後釋放屏障，等待完成並檢查兩個註冊表。兩個案例都不呼叫外掛處置來觸發待驗證行為。獨立的 teardown hook 在處置捕捉的 Context 前釋放屏障，包括測試體超時的情況。

[子 Agent 拆卸決策](2026-09-07-subagent-teardown-test-budgets.zh.md)負責生命週期清理預算。[持久 PowerShell 決策](2026-09-07-pwsh-ci-observable-completion.zh.md)負責精確與推斷的終端就緒狀態；一次性程序的完成 Promise 具有不同語義。

[沙箱 Node 決策](../architecture/2026-09-11-sandboxed-node-ptc-runtime.zh.md)取代 worker 活躍時間計量。[Node 執行時套件](../../../../packages/ptc-runtime/ptc-runtime-node/tests/runtime.spec.ts)透過真實受管程序驗證替代的經過時間截止。本說明中其他完成觀測與測試生命週期規則保持有效。

[SDK 子 Agent 協定錯誤測試](../../../../packages/subagent/subagent-dsh-sdk/tests/subagent-dsh-sdk.spec.ts)使用提供者正常的關閉和退出等待時間，並在斷言前登記清理。[Inspector 樹測試](../../../../packages/experimental/inspector/tests/cordis-tree.host.spec.ts)將目前測試預算傳給 Worker 啟動，並在啟動尚未完成時登記清理。取消後的測試不會收到隨後才就緒的實例；清理等待初始化完成，並關閉成功啟動的 Worker。初始化失敗時，啟動操作會在拒絕前終止 Worker。受控的延遲啟動測試透過真實 Worker 的 HTTP 端點驗證取消和關閉。生產預設值不變。

## 考慮過的替代方案

**增大獨立等待時限。** 已有完成 Promise 時不採用。獨立輪詢期限仍會與執行通道的預算競爭。

**重新整理回饋 golden。** 不採用：保留內容的輸入框與停用的附件按鈕描述了尚未完成的提交。已穩定的預期 UI 仍是目標行為。

**序列化 CI 或重試這些測試。** 不採用：兩者都不能建立缺失的完成條件，也不能在斷言失敗後釋放阻塞的子程序。

## 後果

就緒與輸出斷言保留原有的內容和所有權檢查。受控的 Desktop 就緒、Webhook 預檢、命令回應、PowerShell 輸出、publint 啟動及 LSP 初始化延遲可復現原始失敗，並在採用完成等待後透過。阻塞 Desktop worker 的控制案例仍報告測試超時，同時證明 teardown 在刪除目錄前等待子程序退出。執行通道分別限制測試體和清理 hook；PowerShell 和程序清理仍需在原生 Windows 上驗證。
