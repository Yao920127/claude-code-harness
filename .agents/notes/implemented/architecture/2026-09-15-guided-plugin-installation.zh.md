# Agent Note：引導式外掛安裝

Status: implemented

[English](2026-09-15-guided-plugin-installation.md) | 中文

## 問題

安裝對話方塊把 spec 直接交給 `pnpm add`，並把 pnpm 的終端當作全部說明：打錯字、已裝過的包、不存在的路徑、註冊表不可用，最後都是同一個紅色結束代碼，人得去讀 pnpm 輸出才知道是哪一種，而且一旦開始就停不下來。失敗的執行，或者裝進來一個沒有組合包 patch 的包，會把依賴留在 profile 裡，列表上卻沒有任何東西能顯示或移除它。啟用是一個在知道要裝什麼之前就得勾的選項，裝完的包散在列表某處。

## 決定

**主機先讀 spec，再安裝。** `PluginManager.inspect` 用 `parseInstallSpec` 把 spec 分成註冊表名、絕對路徑、git 地址、壓縮包，拒絕 pnpm 或註冊表不會接受的寫法，再透過 `pnpm view` 問註冊表、或讀目錄的 `package.json`，得到名字、版本、描述和組合包宣告。`pnpm view` 在 profile 目錄裡執行，讓註冊表和代理設定與安裝一致。沒有組合包 patch 的包在這一步、在 pnpm 執行之前就被拒絕：管理器只安裝組合包。答覆帶七種 problem 之一；用戶端把每一種渲染成輸入框下的一句話，spec 保留可改。列表裡已有的名字由對話方塊直接拒絕，不問主機。

**失敗或被取消的安裝恢復 profile 檔案。** `installBundle` 在 pnpm 執行前快照 `package.json` 與 `pnpm-lock.yaml`，在 pnpm 失敗、執行被取消、或 pnpm 裝入的包沒有宣告組合包 patch 時把它們放回去。這隻針對安裝反轉了[管理器的決定](2026-09-14-current-profile-plugin-management.zh.md)中"保留部分改動"的部分：沒有產出可用組合包的安裝，不能留下一個頁面無法顯示的依賴。刪除仍沿用那個決定。已下載檔案可能留在 `node_modules` 與 pnpm 快取中。

**失敗在事實所在處分類。** `classifyInstallFailure` 依據執行的結束方式和 pnpm 的輸出——它的 `ERR_PNPM_*` 碼和 Node 的 errno 名——給出 `packageResult.kind`。被管理器終止的執行，不論訊號留下什麼退出狀態都歸類為 `timeout`，因此安裝會還原檔案，刪除則報告失敗而不會讀成成功（[執行上界](../bug-fix/2026-09-23-bounded-pnpm-runs.zh.md)）。用戶端把 kind 顯示成一句話，把 pnpm 輸出摺疊進詳情。對日誌的解析只存在於這一個函式，用夾具驅動的測試釘住。

**GitHub 連線失敗在安裝前有單獨的短時限。** 主機透過只讀的 `git ls-remote` 檢查連線，沿用 profile 的 Git 與代理設定，`githubConnectionTimeoutMs` 預設為 5000 毫秒。這次檢查停用憑證助手和認證提示，避免認證過程佔用連線預算。只有網路失敗與超時會阻止 pnpm 啟動；認證、HTTPS 到 SSH 的退回、ref 解析及完整安裝仍由 pnpm 負責。時限不約束下載或建置。已有的失敗型別與 `failedAt: 'spec-host'` 讓用戶端顯示連線失敗或超時，並提供國內映像供使用者輸入另一個包名。取消安裝或銷燬管理器會先終止檢查及其子程序，再結束操作。

**取消屬於管理器，不屬於訊號。** 對話方塊為每次執行生成一個 request id；主機在它之下流式轉發執行的輸出與階段，`cancelInstall` 只在 pnpm 退出且檔案恢復後才答覆。對話方塊等到這個答覆才把 spec 重新交回；中止的 RPC 或斷開的連線都不算確認。只有檢查末尾接受 `AbortSignal`：返回編輯或關閉會丟掉一次註冊表查詢，沒有人等它的結果。

**啟用在事後。** 執行以 `enabled: false` 安裝；完成畫面為它新增的組合包提供**立即啟用**，對話方塊關閉，列表滾動到它。在人看到裝了什麼之前，不會啟用任何東西。

**當下的結果是 toast。** 要等下次啟動的變更、被更高層覆蓋的變更、被取消的執行、被拒絕的操作，各彈一條 toast 後自行消失；頁面上不留任何東西。

**被攔下的安裝腳本在失敗介面批准。** pnpm 11 把依賴腳本留作未決時，失敗的執行報告待決定的包名（[管理器的授權](2026-09-14-current-profile-plugin-management.zh.md)），失敗介面列出它們並以**允許這些腳本並重試**取代普通重試；store 帶著 `approvedBuilds` 用同一個已檢查的 subject 再跑一次，安裝完成介面說明允許了哪些腳本。正因如此，`pnpm-workspace.yaml` 不在恢復的檔案之列。沒有待決定的名字時，失敗退回到手動放行的提示。

## 考慮過的替代方案

**在用戶端驗證 spec。** 否決：規則屬於 pnpm、註冊表和 profile，用戶端無法匯入擁有這些規則的主機包。

**用 HTTP 直接查註冊表而不是 `pnpm view`。** 否決：決定安裝能否成功的註冊表、代理與認證設定都在 pnpm 的設定裡，`pnpm view` 讀得到，直接 fetch 得重新實作一遍。

**透過中止 add RPC 來停止執行。** 否決：斷掉的 RPC 說不清 pnpm 是否停了、manifest 是否已恢復，對話方塊會在一次仍在寫 profile 的執行之上把 spec 重新交回。管理器的 `cancelInstall` 只在清理完成後答覆，對話方塊等它。

**繼續列出不是組合包的依賴。** 否決：管理器管理的是組合包，它拒絕安裝的包無法經由它列出或移除；檢查在寫入任何東西之前就拒絕這樣的包。

## 後果

`inspect`、`cancelInstall` 以及 `plugin-manager/changed`、`plugin-manager/install-log`、`plugin-manager/install-state` 事件加入管理器的 Remote；`listBundles` 攜帶標題、行與覆蓋項；`ChangeResult` 增加 `cancelled`、`bundle` 與 `packageResult.kind`；設定增加 `pnpmCommand`、`inspectTimeoutMs` 與 `githubConnectionTimeoutMs`。對話方塊是圍繞同一張主題卡的四個畫面。

## 測試

`packages/boot/plugin-manager/tests/install-spec.spec.ts` 釘住 spec 形式與失敗分類器的輸入；`manager.spec.ts` 用樁住的註冊表查詢和真實目錄驅動 `inspect`，流式轉發一次執行，停下一次執行並檢查恢復後的檔案，並檢查變更事件；`operations.spec.ts` 覆蓋註冊表查詢。`packages/client/ui-plugin-manager/tests` 覆蓋 store 的階段、經主機確認的取消、裝後啟用、toast 與頁面的四個畫面；`apps/web/tests/plugin-manager.e2e.ts` 經真實主機拒絕已裝名字、不存在的路徑和壞名字，並即時切換一個組合包及其中一行，`plugin-install-cancel.e2e.ts` 從對話方塊停下一個真實子程序、檢查恢復後的檔案，並在第二次嘗試時裝成，`plugin-install-approve.e2e.ts` 用假 pnpm 把腳本留作未決、從對話方塊允許後在重試中裝上。

`github-connection.spec.ts` 用真實 Git 和測試自有的本機網路端點覆蓋立即失敗、超時、取消與非互動認證。`manager.spec.ts` 還透過真實 Git 與 pnpm 安裝本地儲存庫，覆蓋 HTTPS、GitHub 簡寫和 SSH 地址，用自有代理隔離 pnpm 的 HTTPS 請求並驗證其 SSH 退回。`plugin-install-github.e2e.ts` 檢查連線失敗及超時彈出視窗、子程序清理，以及切換映像時不重試原 GitHub 地址。
