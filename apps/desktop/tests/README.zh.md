# Desktop 本地更新驗證

[English](README.md) | 中文

## 概述

本地下載和強更彈出視窗證據與生產後端聯調、視覺驗收、已安裝應用升級分開記錄。執行 [Desktop README](../README.zh.md) 中的命令可生成新的隔離報告。

已安裝應用驗收可顯式啟用 `DSH_DESKTOP_UPDATE_JOURNAL_DIR`，使用安裝目錄樹之外、兩個版本共同保留的絕對路徑。每個主程序將已安裝版本、狀態轉換和人工操作標記重新整理到單獨的 JSONL 檔案。原始診斷和請求資料被排除；儲存錯誤會向上傳播。[日誌決策](../../../.agents/notes/implemented/testing/2026-09-14-desktop-installed-update-journal.zh.md)定義證據的侷限。單元與主入口測試覆蓋該日誌；簽名安裝版升級仍未驗證。

## 目錄

- [原生浮層可見性](#verification-overlay)
- [驗證證據](#verification-evidence)
- [手動演練](#verification-interactive)
- [待驗證事項](#verification-open)

<a id="verification-overlay"></a>

## 原生浮層可見性

在 macOS 上，編譯 Desktop Host 原始碼後複用快取的 Electron 執行時：

```sh
pnpm exec tsc -b apps/desktop/tsconfig.host.json
apps/desktop/.desktop-build/targets/mac-arm64/electron/Electron.app/Contents/MacOS/Electron apps/desktop/tests/fixtures/update-overlay-visibility.mjs
```

夾具使用獨立 profile，在 `.desktop-build/qualification/update-overlay-*` 下寫入 `result.json`。它對照所屬測試目錄中的預期輸出，檢查父視窗隱藏／顯示、父視窗隱藏期間文件就緒兩種順序中的原生可見性、父頁面不受模糊影響及監聽清理。它不使用網路、產品登入或 dsh Host。這項驗證覆蓋原生視窗恢復，不覆蓋完整的首次登入流程。

<a id="verification-interactive"></a>

## 手動演練

實際安裝、啟動後釋出、失敗重試與重新啟動證據使用[已安裝應用更新人工清單](installed-update/README.zh.md)。下方互動式執行器攔截安裝，屬於另一類驗收。

Host、用戶端與 Desktop 產物建置完成後，在 Windows 儲存庫根目錄執行 `node --import tsx apps/desktop/scripts/test-workspace-updates.ts --interactive`。真實工作區持續開啟，並提供獨立控制視窗。其選單可選擇普通或強制更新、保持和放行下載、注入下載失敗，以及新增或清空測試任務。失敗模式須在開始下載前選擇。確認安裝並完成任務收尾後，fixture 訊息提示安裝器呼叫已被攔截；確認訊息結束演練。關閉控制視窗也會退出。每次執行獨佔私有 profile 和迴環伺服器；載荷不是安裝器。重新執行命令開始新一輪。省略 `--interactive` 則執行自動化情境，保留 120 秒截止時間和自動退出；互動模式下載的網路截止時間為十分鐘。

<a id="verification-evidence"></a>

## 驗證證據

本地命令建置 Desktop，並在 Electron 44 中執行真實 HTTP updater、策略用戶端、沙箱預載入和強更頁面。它記錄每個情境，並把報告儲存在 `.desktop-build/qualification/local-updater-*`。安裝器呼叫、外部瀏覽器和剪貼簿均替換為觀測記錄；下載位元組不是可執行安裝器。

打包監督 fixture 控制自己的 Git 中繼資料，並使用真實檔案雜湊和無簽名行為的子程序。Git 提交或工作區變化仍會拒絕打包；並行測試不會改變該 fixture 記錄的 Git 輸入。

| 層次 | 觀測結果 |
|---|---|
| 常規 updater | 同版本／舊版本拒絕、使用者授權完整下載、SHA-512 拒絕、傳輸中斷、清單／下載停滯截止時間、顯式重試、請求合併、同地址清單替換、就緒狀態和獨立安裝交接透過 |
| 強更策略 | 扁平化 `40005`、完整發布頭、遊客請求、無需強更驗證、失敗保留、間隔／退避、超時和 dispose（資源釋放）迴歸透過 |
| 常規排程 | 真實協調器配合模擬時鐘的迴歸驗證有上限的抖動／退避、手動複用、成功重置、不自動重試下載、不受系統時鐘調整影響，以及 dispose。主入口測試驗證聚焦／恢復節流、顯式檢查立即執行和退出清理 |
| 真實強更視窗 | 伺服器端純文字內容、Windows 內嵌 shell frame、不建立額外原生視窗且主視窗保持啟用、Esc 阻塞、直接下載、同彈出視窗任務確認、稍後更新、僅恢復態頁面操作、導航／複製回饋和新策略解除透過；定向測試驗證關閉時退出且不清除策略 |
| 真實常規彈出視窗 | 隔離預載入、380px 卡片、24px 圓角、黑色主按鈕、父視窗模糊、Esc 取消後保留就緒，以及任務警告批准後的安裝交接記錄均透過 |
| 解鎖後的 Windows 互動 | 對真實強更頁面執行系統級點選並截圖，確認 Esc 阻塞、使用者發起下載、就緒、紅色策略錯誤提示，以及彈出視窗解除後父視窗恢復可用。fixture 提供的原生任務警告彈出視窗在選擇稍後更新後回到就緒態；任務活動為模擬，不是完整 Host 工作負載 |
| 主入口 | 已知阻塞拒絕外掛修改和恢復，但不停止 Host；新成功回應關閉阻塞；打包策略忽略環境覆蓋；正常停止後的安裝器失敗在下次確認前恢復 Host，並保留強更阻塞 |
| Host 任務保護 | 替換組合環境後的真實控制器識別執行中的 agent、排隊的 turn／step、全域和 agent job；API 讀取不觸發警告。請求准入鎖定向新請求返回 503，等待已有請求結束並複查任務；解鎖恢復准入 |
| 可見輸出 | 中文強更彈出視窗 DOM 預期輸出和常規更新展示預期輸出透過；帳戶行元件測試覆蓋進度和持久重試 |
| 打包設定 | 中繼資料嵌入設定的應用 ID 和策略；建置後的打包前掛鉤拒絕 HTTP 策略源站，不執行打包或上傳 |

彈出視窗、主入口、設定和側欄的定向執行透過 119 個迴歸案例。五個載體測試覆蓋共享更新狀態源的全部語句、分支、函式和程式碼行。真實 Electron 命令透過 17 個情境，並捕捉常規就緒、任務警告和強更錯誤彈出視窗。這些隔離檢查不認證完整工作區或釋出。全倉門禁結果及環境限制與這些定向證據分開記錄。

Chromium headless shell revision 1228 已安裝在忽略目錄 `.desktop-build/playwright` 中。組裝後的設定和側欄瀏覽器套件透過 18 個案例。[Desktop 工作區瀏覽器情境](../../web/tests/desktop-updates.e2e.ts) 的中英文案例均透過，每種語言捕捉六張截圖，並驗證底部帳戶行位置、緊湊進度及重複點選攔截、頂部展開按鈕提示、帶錯誤懸停詳情的持久紅色重試，以及獨立的就緒操作。展示函式、Host Web 組合、用戶端外掛和 CSS 均為真實實作；Desktop 載體使用替身。這些案例不執行 Electron IPC、選單、任務授權或安裝。

[建置後 Host 情境](fixtures/host-update-qualification.mjs) 使用真實 profile Loader、standard agent 預設、任務服務和 Node 後臺程序。它驗證排隊的輪次／步驟、執行中的模型請求、等待答覆的提問／審批、執行／停止中的全域和 agent job、不會取消任務的准入鎖定、准入恢復，以及 Host 釋放後的檢查拒絕。僅模型回應和人工答覆使用替身。兩個獨立呼叫使用私有 profile 和工作階段資料並行透過；全部自有 agent、job 和 Host 完成後才寫入成功報告。

[Electron 工作區執行器](../scripts/test-workspace-updates.ts) 在私有目錄中執行編譯後的主入口，使用真實預載入、工作區和獨立 Host 程序。它確認首次啟動宣告，並透過 Electron 輸入事件及嵌入式 Windows frame 的 Chromium 偵錯程式輸入操作頁面按鈕。私有應用複用已準備的目標執行時資源。十個情境透過，覆蓋選單回饋、下載失敗與重試、獨立安裝確認、確認期間真實任務建立、推遲安裝、強更阻塞和真實 Host 停止超時。普通與強更失敗均恢復替代 Host，並要求重新確認安裝；恢復不會清除強更策略。分發使用本地伺服器，安裝被攔截；這些不是簽名已安裝應用的驗證結果。

[Windows 驗籤執行器](../scripts/test-windows-update-signature.mjs) 使用已安裝的 electron-builder 中繼資料生成器和 `NsisUpdater` 驗籤器，輸入為公開發布憑證和真實可執行檔案。釋出者屬性匹配時透過；同一有效簽名在預期釋出者不同時被拒絕，未簽名可執行檔案也被拒絕。缺少釋出者的負對照確認驗籤被跳過。單元迴歸覆蓋 DN 轉義、不完整身份，以及顯式或主機預設 Windows 目標；移除釋出者設定會使兩條中繼資料案例失敗。此檢查不下載、安裝或簽名產物。

[簽名下載執行器](../scripts/test-signed-updates.mjs) 連線真實 Electron HTTP、`NsisUpdater`、Windows Authenticode 和建置後的協調器。四個情境透過：雜湊正確但釋出者錯誤時拒絕、雜湊正確但未簽名時拒絕、傳輸損壞先於驗籤被拒絕，以及顯式重試後簽名檔案就緒並單獨交接安裝。被拒絕的可執行檔案快取為空，自動檢查不傳送重試請求，已準備的下載保持可用，原始輸入的 SHA-512 不變。合成清單和測試應用介面卡不證明已安裝版本相容性；不會啟動安裝器或 Host。

提供舊安裝器和兩個原始 blockmap 後，同一執行器還會驗證單段 Range、多段 Range 重建、缺少舊 blockmap 時退回，以及 Range 被拒絕時退回。重建的可執行檔案透過 SHA-512 和 Authenticode 檢查。請求記錄區分差分負載位元組與全量下載；全量退回不能滿足差分成功斷言。這些迴環結果不證明 CDN Range 支援或已安裝應用的快取可用。

<a id="verification-open"></a>

## 待驗證事項

以下事項不是透過證據，review 時必須保持可見：

- Electron `capturePage()` 捕捉單個視窗。Windows 互動觀測包含合成彈出視窗和原生選單選擇，但跨平臺 Figma／佈局驗收與完整錄製仍未驗證。自動化工作區執行器直接呼叫選單處理器。
- 開發啟動器在此 Windows 工作區遇到指向缺失目標的可選 Linux ARM64 依賴 junction；驗收執行器直接連結已有依賴圖，不驗證該啟動器的依賴投影。
- fixture（測試前置資料）不執行安裝器，不覆蓋已安裝應用，也不證明新版本成功啟動。釋出前仍需簽名 Windows 和 macOS 的已安裝版本驗收。
- 兩個隔離 Windows 測試安裝檔透過簽名包檢查，包括內嵌清單設定。安裝後啟動、失敗重試、自動重新啟動和資料保留仍待操作者驗證；檔案檢查不認證釋出。
- 真實策略源站、閘道行為、速率限制、批准的頁面源站和已部署策略設定仍待後端聯調。本地回應不能證明線上服務可用。
- 策略、updater 清單與下載停滯均達到真實截止時間並可恢復。下載寫入的 `ENOSPC` 故障注入已覆蓋；真實卷耗盡與已安裝版本升級的磁碟壓力仍未驗證。差分下載和釋出者拒絕已透過真實 Electron 下載驗證，但尚未在新打包應用的已安裝版本升級路徑中驗證。
- Windows 原生剪貼簿寫入透過。已嘗試啟動預設瀏覽器，但因自動化工具無法可靠識別目前 URL，目標地址驗證停止。macOS 瀏覽器和剪貼簿整合仍未驗證。
- 強更與常規失敗使用在地化摘要和摺疊診斷；複製失敗展示可選擇的地址。常規錯誤懸停提示顯示摘要，不展示原始診斷。Windows／macOS 安裝檔的圖示提醒、通知權限與專注模式行為仍未驗證。
- 完整 `doc-sync`（文件同步門禁）在文件站測試中遇到 Windows 檔案符號連結 `EPERM`。這不是 updater 失敗，也不代表完整文件門禁透過。
