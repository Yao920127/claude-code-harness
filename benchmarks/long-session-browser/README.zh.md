# 長工作階段瀏覽器基準

[English](README.md) | 中文

[long-session.bench.ts](long-session.bench.ts) 中必需的 Chromium 工作流測量開啟包含 240 個輪次的合成工作階段、載入所有較早頁面、存取 Trajectory，以及在有節奏的流式回覆期間輸入下一條草稿。隨產品維護的 Web scaffold 擁有隔離的主目錄、持久化、回放介面卡和迴環監聽器；Chromium 載入建置後的 Web 產物，而非替代開發伺服器。

## 執行

`pnpm run test:bench` 先建置 library、worker 和 Web 產物，再序列執行基準清單。產物已建置時，透過 `pnpm exec vitest run --config vitest.bench.config.ts benchmarks/long-session-browser` 選擇此目錄。首次執行前，透過 benchmark workspace 安裝 Chromium。

## 測量

三個全新瀏覽器程序與 scaffold 環境產生原始樣本及中位數判定。開啟和分頁在預期 transcript（文字記錄）狀態出現且經過兩次動畫幀後結束；這包含一次渲染機會，而非硬體顯示時間戳。分頁報告每一頁，並對各樣本最慢分頁時間的中位數執行預算檢查。流式報告首次可見回覆、受信任的草稿鍵入、完整回覆壁鐘時間和 Chromium 主執行緒任務時間。Enter 從已聚焦的輸入框提交；草稿鍵入保留該焦點，不執行滑鼠點選。回覆標記查詢與輸入事件文字觀察器僅讀取最新 Assistant 步驟，避免重複進行全量歷史文字掃描和無障礙掃描。輸入事件文字觀察器在提交前安裝，首個標記可見後立即開始草稿鍵入，不額外等待輸入前動畫幀。回覆標記在動畫幀上取樣，要求文字在最新步驟內可見。首次觀察在瀏覽器內記錄標記狀態與焦點；診斷在鍵入後取回，不增加輸入前的通訊往返。診斷還包含首個輸入事件的瀏覽器時鐘時間戳與焦點。診斷不會暫停回放；首次觀察或輸入延遲仍可能導致重疊失敗。實際首個輸入事件必須觀察到未完成的回覆；完整回覆的測量會在 Host 結算後等待新 turn-tail 渲染完成。測量後，在 DONE 之後傳送的受信任按鍵必須無法透過同一個重疊斷言。開啟、最慢的較早頁面和首次 Trajectory 使用標準託管預期 900/700/520 ms。共享的 1.25× 餘量分別產生 1125/875/650 ms 上限；流式終點的額外開銷預算不變。強制 GC 後的 heap 與 DOM 數量僅供診斷，不作為洩漏預算。

fixture（測試前置資料）在首條使用者訊息前保留空 system 頭節點，每條使用者訊息都位於其步驟內。它包含混合語言提示詞、正文、推理（reasoning）、20 個圍欄程式碼塊和 40 個合成工具結果。每條歷史 Assistant 都含緊湊流，由生產 accumulator 從匹配的推理、文字、工具參數、usage 和 finish 分片建置。其內容不來自模型、工具、外部網路、錄製工作階段或私有 Harness 主目錄。流式回覆以 16 ms 回放間隔傳送 120 個文字 delta，經過真實輸入框、agent loop（智慧代理迴圈）、傳輸與持久化。

[決策記錄](../../.agents/notes/implemented/testing/2026-09-06-frontend-performance-budgets.zh.md)擁有校準、排除項與替代方案。更大規模的[手動診斷](../../apps/web/tests/complex-history.perf.ts)保持獨立。
