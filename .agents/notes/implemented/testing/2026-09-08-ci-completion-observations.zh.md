# Agent Note: CI fixture 的完成與隔離

Status: implemented

[English](2026-09-08-ci-completion-observations.md) | 中文

## 問題

參考 CI 執行 (run 34206953049)報告：輪詢一秒後 webhook 建立的 Session 仍不存在，五秒讀取期限內 PowerShell 輸出為空。HTTP 接受、UI 投影狀態、程序啟動和持久化完成是不同的觀察。測試需要明確的完成條件，並用對照阻止中間狀態滿足該條件。[完成等待決策](2026-09-08-ci-readiness-and-completion.zh.md)擁有這些條件與 lane 預算；這些 fixture 透過受控延遲使順序與清理可觀察。

## 決策

[GitHub 評審瀏覽器測試](../../../../apps/web/tests/github-ready-review.e2e.ts)在 HTTP 202 後阻塞真實 Workspace 建立，驗證 Agent 和模型請求均不存在，再釋放建立並等待對應 Session 的 `turn/end`。即使測試超時，清理也會釋放屏障、恢復方法並移除事件監聽器。Workspace 歸屬、請求數量、提示詞內容和瀏覽器預期保留原有斷言。

[PowerShell 執行器測試](../../../../packages/shell/pwsh-local/tests/executor.spec.ts)用私有檔案屏障控制啟動與消費式讀取。測試決定後續輸出何時可用；最終 stdin／環境變數輸出在 `done` 後讀取。輪詢使用目前測試預算，每個建立的 Context 都在外掛初始化前登記。清理在等待釋放前同時取得 Context 與目錄，完成釋放後才刪除目錄。

[排隊圖片測試](../../../../apps/web/tests/queue-image.e2e.ts)分別阻塞接納和附件讀取，再捕捉已接納行中載入完成的縮圖。清理共享一個 Promise，釋放保留的請求，並在關閉瀏覽器前等待其 handler 完成。

[詳情 Session 生命週期測試](../../../../apps/web/tests/details-session-lifecycle.e2e.ts)在關閉狀態出現後等待框架已捕捉的動畫 Promise，再檢查軌道寬度為零。取消的過渡同樣進入該斷言；動畫結束不能讓持續非零的軌道透過。

[整佇列 steering 測試](../../../../apps/web/tests/steering.e2e.ts)等待 steering 操作可用以及 composer 顯示佇列 steering 提示。模型流屏障在測試觀察 steering 時阻止後續問題 composer 接管。清理在關閉瀏覽器前釋放該屏障。

[Workspace 管理測試](../../../../apps/web/tests/workspace-management.e2e.ts)在下一次目錄對話方塊操作前等待恢復後的 composer 焦點。歸檔案例透過 Session controller 為已知 seed id 設定顯式使用者標題，再用該精確標題跨過載定位行。無關的恢復行無法匹配該定位器；持久化歸檔斷言仍檢查 seed id 和保留的日誌。

[Node 執行時測試](../../../../packages/ptc-runtime/ptc-runtime-node/tests/runtime.spec.ts)執行真實受管程序、繫結傳輸、經過時間截止與取消。[沙箱 Node 決策](../architecture/2026-09-11-sandboxed-node-ptc-runtime.zh.md)取代 worker ELU 預算及其受控樣本測試；真實程序與傳輸證據仍然必要。

[分離啟動測試](../../../../packages/host/open-in-app/tests/launch-detached.spec.ts)控制觀察時間，並透過真實 launcher 登記的回呼傳送遲到程序事件。測試檢查僅完成一次、僅 unref 一次且不終止子程序。[Resolver 測試](../../../../packages/host/open-in-app/tests/resolver.spec.ts)保留真實程序的環境變數和提前退出案例。

[LSP 背壓測試](../../../../packages/lsp/lsp-stdio/tests/instance.spec.ts)保留真實暫停讀取的 fixture 與大型原生管道寫入。接受 abort 錯誤前，測試驗證待處理寫入回呼已完成、捕捉的子程序也已結束；`instance.dead` 在釋放開始時就可能為真。

### 已建置 Client 的匯入分類

[Node import sweep](../../../../packages/experimental/webworker-runtime/tests/compile/transform-corpus-check.ts)只有在 Node 針對某個 `.css` 檔案報告 `ERR_UNKNOWN_FILE_EXTENSION` 時才接受 Dockkit bundle，其他每個錯誤以及每個意外成功的豁免匯入都會失敗；該豁免覆蓋哪些樣式表由[樣式表豁免決策](../bug-fix/2026-09-10-built-bundle-css-exemption.zh.md)擁有。限定範圍的 resolve/load hook 覆蓋預期 CSS 失敗、其他樣式表、其他副檔名、任意失敗、其他錯誤碼和陳舊豁免，不修改共享建置產物。

## 考慮過的替代方案

**生產超時、重試或套件序列化。** 拒絕，因為均不能建立缺少的完成觀察。

**從接受或預覽推斷完成。** HTTP 202 和樂觀圖片可能早於被斷言的操作。

**用受控樣本代替真實執行。** 不採納，因為僅靠定時器樣本無法驗證程序啟動、控制傳輸或受管清理。

## 影響

每個 fixture 擁有自己的時鐘、屏障、回呼、程序和臨時路徑。受控觀察補充真實 worker、子程序、瀏覽器和持久化路徑。產品行為、生產時序、基準預算、CI 排程和錄製預期均保持不變。
