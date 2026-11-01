# Agent Note：由 consumer 持有啟動嚴格語義

Status: implemented

[English](2026-09-09-consumer-owned-startup-strictness.md) | 中文

## 問題

Best-effort Loader reconcile 會保留可用 plugin，但應用仍需一組最小 capability。HTTP 應用沒有 listening server 就不算執行，而一個 tool 不可用時可以僅省略該 tool，剩餘應用仍然可用。Cordis 無法從 plugin 實作或依賴狀態推斷這一區別。

## 決策

DSH 在 vendored Cordis 之外持有啟動嚴格語義。App-boot 用一份全域穩定 entry id list 審計已結算的初始 tree。List 中存在、啟用且未 active 的 entry 會使啟動 reject，並拆卸應用。List 中缺失或停用的 id 不產生影響。Bootstrap Include 按 entry 身份被視為 required，因為根設定缺失或無效會阻止應用組裝。其他 inactive entry 輸出一次 warning，並讓成功 sibling 繼續執行。

Required id 為 `agent-loop`、`webserver`、`modules`、`connection`、`headless-runner`、`acp` 和 `sdk-jsonrpc-server`。它們分別代表共享 Agent 執行、應用 endpoint，以及 Web 啟動與傳輸。即使 HTTP server 不依賴它們也能監聽，Web 仍需要用戶端模組註冊表和經過認證的連線。透過注入已成為必需項的 provider 不需要單列：它們缺失時，已列出的消費方會保持 pending 或失敗。

審計將 `disabled` 表示式丟擲的異常視為 entry 失敗，而不是 entry 已停用，因為求值未能確定是否跳過它。該失敗遵循相同的 optional/required 策略。

該審計只在應用首次啟動時執行。之後的 config HMR 仍採用 best effort，並保留 failed candidate 供後續修復。

該策略適用於 [Web host 啟動](2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)，包括其 [client 外掛名冊](2026-07-23-client-plugin-loading-model.zh.md)。[按工作階段的 preset](2026-09-18-declarative-agent-presets.zh.md)持有獨立的嚴格子樹審計。

## 考慮過的替代方案

- **給 vendored Loader 增加 transactional 與 best-effort mode。** 拒絕，因為嚴格語義屬於應用或資源 owner，而一個 Loader group 包含互不相關的 plugin。Mode 還會擴大 vendor patch，並要求 caller 為每個 group 選擇 policy。
- **在每個 profile 中宣告 required entry。** 拒絕，因為相同應用 endpoint 會在 profile data 與 custom profile 中重複。全域 list 會忽略缺失 id，同時讓穩定的隨附 id 保持權威。
- **把所有啟動失敗都視為 optional。** 拒絕，因為無法暴露所選應用 endpoint 的程序必須報告啟動失敗。

## 後果

穩定的 required entry id 是應用 assembly 的一部分。重新命名時必須同步更新 list 與測試。Optional plugin failure 會保留在 Loader state 和 stderr 中，但不會拆卸 active sibling。Required failure 將所有 inactive entry 合併到一份診斷中，區分失敗外掛與等待服務的外掛，並標記 required entry。App-boot 拆卸 root 後，`StartupError` 仍以 cause 保留原始失敗。CLI 僅輸出其訊息一次，並以結束代碼 1 結束，避免重複的包裝堆疊，同時保留外掛堆疊、巢狀原因和聚合錯誤成員。CLI 將原始錯誤、未啟用條目的中繼資料及啟動警告、錯誤記錄儲存到直接位於 `$DSH_HOME/logs/` 下的唯一報告中，保留簡潔終端輸出省略的匯入錯誤和錯誤屬性。寫入失敗時，完整報告退回到 stderr，結束代碼仍為 1。其他異常繼續作為未處理異常丟擲。

簡潔的終端報告突出失敗外掛；單獨檔案儲存原始診斷，不受預設 logger 緩衝區記錄數限制。原始錯誤值保持完整，因此報告附帶分享提醒，不會靜默脫敏欄位。獨立的 exporter 生命週期覆蓋應用的非同步資源釋放。CLI 等待 stderr 寫入完成後明確退出，因為失敗外掛可能留下 stdin 或其他開啟的控制代碼。

## 測試

App-boot 單元測試覆蓋缺失和停用的 required id、optional import failure、config evaluation failure、同步和非同步 `apply()` failure、pending dependency，以及 required failure teardown。單元預期輸出固定診斷分組、原始錯誤物件與匯入日誌的保留、exporter 清理、完整診斷值、私有檔案建立、並行報告命名以及寫入失敗退回行為。建置後的 Web-profile acceptance 斷言埠衝突堆疊只輸出一次且不包含 Node 包裝輸出，驗證已儲存的診斷檔案及其 stderr 退回，並會在 optional failure 存在時繼續提供完整 UI，並在 required HTTP port 被佔用或 `modules`、`connection` 無法啟用時以非零碼退出，且不報告就緒。

[Web 程序矩陣](../../../../apps/cli/tests/profiles/web/tests/web-failure-matrix.expected.e2e.ts)分別驗證啟動時和原生補丁檔案修改後的 optional 與 required 失敗。經過認證的 HTTP 請求和外掛生命週期檔案區分可用應用與僅存活的程序。這些無需金鑰的程序檢查與[受控事件投遞單元測試](../testing/2026-09-09-user-patch-hmr-test-delivery.zh.md)互補：單元測試隔離設定協調失敗，程序測試還要求隨附啟動器、原生監聽器和有界關閉流程協同工作。

矩陣啟用 Chokidar 的 `awaitWriteFinish`，在每次過載前確認檔案內容已穩定；否則它的短暫 change 事件抑制視窗可能丟棄下一次測試編輯。測試仍然依賴原生事件，並等待觀察到啟用或失敗，而不是固定時長的休眠。這是顯式測試設定，不能證明預設監聽器的時序行為。
