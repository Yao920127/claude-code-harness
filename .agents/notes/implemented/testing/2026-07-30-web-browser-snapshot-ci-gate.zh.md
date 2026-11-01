# Agent Note: Web 瀏覽器預期輸出的必需 CI 門禁

Status: implemented

[English](2026-07-30-web-browser-snapshot-ci-gate.md) | 中文

## 問題

[無金鑰 Web 瀏覽器 e2e 車道](2026-07-24-web-gui-browser-e2e-lane.zh.md)只由本地 `pnpm run test:web` 執行，PR CI 不比較 `snapshots/web/` 或 `apps/web/tests/expected/` 下的 Web 預期輸出。因此，改變使用者可見 Web 輸出的 PR 可以在漏刷預期輸出時保持綠色；後來任意分支顯式執行 `DSH_SNAPSHOT=refresh`，都會替前序變更補帳併產生與本分支無關的 diff。普通本地執行已經預設使用只讀 replay，缺口是 PR 級的強制執行，而不是禁止 refresh 寫入。

## 決策

Linux PR 的 `node 24 / snapshots and artifacts` 必須執行完整 Web 瀏覽器 replay/compare。設定 `DSH_WEB_SNAPSHOT_WORKERS` 後，`scripts/run-gates.ts` 把 `test:web:ci` 登記為 `ci-consumers` 門禁，並顯式注入 `DSH_SNAPSHOT=replay`；CI 永不以 `record` 或 `refresh` 模式執行，因此提交的預期輸出與目前組裝應用不一致時測試直接失敗，不會在 runner 內靜默改寫後透過。

消費方 job 在[消費方獨立建置](../../archived/process/2026-07-30-independent-ci-consumer-build.md)中負責唯一一次 Linux 建置，因此 `apps/web/dist` 和包的 `lib/` 目錄會保留在其工作區中，供瀏覽器套件使用。Chromium 執行完整套件；模型與推理強度選擇情境還在 WebKit 中執行，以覆蓋原生滑鼠焦點行為。在託管執行器上，CI 按鎖檔案中的 Playwright 版本安裝這兩種引擎及其系統依賴。在持久化故障切換 VM 上，映像負責預裝兩種引擎的 Linux 系統軟體包，CI 只安裝瀏覽器程式，避免每次執行都透過 `apt` 改動系統。PR 恢復以作業系統和鎖檔案為鍵的瀏覽器快取，使必需路徑無需承擔壓縮和上傳開銷，並可在鎖檔案變化時按作業系統字首退回。沒有任何 master 作業生成這些 hosted 快取，因此恢復只能命中仍有歸檔的舊條目，直至其被逐出。自託管熱備執行相同的比較，但不執行託管快取操作。

本地 `pnpm run test:web` 仍先建置，再序列執行完整瀏覽器套件；`test:web:built` 是已有建置產物的序列執行入口。開發者只在確認使用者可見輸出有意變化後顯式執行 `DSH_SNAPSHOT=refresh pnpm run test:web`，評審每一處預期輸出 diff，再以 replay 模式複驗不再寫檔案。

CI 的 `scripts/run-web-snapshots.ts` 單獨執行會修改建置產物的 `hmr-live.e2e.ts`。隨後由一個六 worker Vitest 池執行其餘檔案，包括歷史 Cordis 卡片渲染。所有子程序繼承 stdio，由 `run-gates` 流式轉發輸出。

對 PR 而言，門禁僅在 Linux 消費方 job 中執行：這些情境面向 POSIX，其他 PR job 不會同時安裝這兩種引擎。自託管的預設分支 Linux 序列熱備也包含該比較，而 macOS 和 Windows 序列 job 仍不使用瀏覽器（不存在託管的 Linux 序列聚合）。PR 的 `all checks passed` 已依賴消費方 job，因此瀏覽器比較失敗會阻止合併，無需新增 branch-protection check 名稱。

完整本地 replay 中，6-worker 瀏覽器命令耗時約 65–71 秒。12-worker 對比約為 50 秒，因此把瀏覽器 worker 預算減半隻增加約 15–20 秒，而不是讓牆鍾時間翻倍。門禁排程器會在 `built-package-invariants` 成功後立即啟動瀏覽器快照，並行執行彼此獨立的門禁，因此既不需要專用 job 超時，也不需要手動制定 YAML 順序規則。

## 曾考慮的替代方案

**繼續只要求本地執行。** 已否決：執行依賴開發者記憶，正是陳舊 golden 跨 PR 漂移的原因，不能保證產生行為變化的 PR 自己攜帶預期輸出 diff。

**讓 CI 以 `refresh` 模式執行後檢查工作樹。** 已否決：寫後比較把斷言機制變成生成器，若工作樹檢查接入有誤，就可能把迴歸變成能夠透過的預期輸出更新；replay 直接比較已有 golden，失敗面更小。

**新建獨立 browser job 並重新建置全倉。** 已否決：它會重複依賴安裝和釋出建置。現有 Linux 消費方 job 已負責該建置，並已被統一的 required verdict 聚合。

**在並行池中執行 HMR。** 拒絕，因為它會修改共享建置產物。其他瀏覽器 fixture 擁有隔離狀態，共用一個有界池。

**用 jsdom 快照代替真實 Chromium。** 已否決：jsdom 不覆蓋瀏覽器、HTTP/SSE 承載及真實用戶端外掛包的組合；它仍可用於快速的下層回饋，但不能替代組裝後的瀏覽器鏈結。

## 後果

每個 PR 都在合併前證明目前 Web 組裝與所有已提交的瀏覽器預期輸出一致；漏刷會在改變該組裝的同一個 PR 中失敗。成本是消費方 job 需要安裝 Chromium 和 WebKit、序列執行 1 個情境並執行 1 個有界 6-worker 池；消費方獨立建置與瀏覽器快取避免重跑時重複建置和下載。並行檔案的失敗會立即流式顯示，但 worker 預算的任何變化仍需要完整端到端測量，而不能依據執行中耗時猜測。門禁不聲稱跨平臺瀏覽器一致性，Playwright 或瀏覽器升級若改變 ARIA 格式，升級 PR 必須顯式 refresh 並評審 churn。
