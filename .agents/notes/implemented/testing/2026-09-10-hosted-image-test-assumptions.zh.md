# Agent Note: coverage 套件裡的託管映像假設

Status: implemented

[English](2026-09-10-hosted-image-test-assumptions.md) | 中文

## 問題

[故障切換支路](../process/2026-09-09-blacksmith-failover-leg.zh.md)會把這套測試跑在本儲存庫不擁有的池上——Blacksmith 的臨時映像，以及自有的 `vm-backup` 與 `dsh-win-ci` 備用池。在託管映像上，coverage 各通道的失敗來自案例從未點明的主機屬性：主機是否提供可用的使用者級 systemd scope，決定了被 mock 的 PTY 退出會與哪種 containment 競爭；受管 scope 在 ACP 拆卸時報告訊號失敗；讀端被搶佔時會把非法 UTF-8 殘餘案例假定為獨立分塊的寫入合併成一個分塊；以及 Windows Server 映像直接拒絕 `CoCreateInstance(CLSID_FileOpenDialog)`。

## 決策

這些案例明確宣告各自依賴的主機屬性。

`packages/subprocess/subprocess-local/tests/local.spec.ts` 中模擬 PTY 退出的案例明確選擇 fallback containment。不驗證平臺選擇的案例使用 `internals = { platform: 'darwin' }`。終端釋放生命週期案例不設定平臺，並讓 `probeLinuxNative` 返回 false，以驗證主機預設平臺的選擇，同時避免啟動真實 Linux scope。兩種安排都避免了模擬退出與 scope bootstrap 競爭。平臺固定時再 mock 探針屬於冗餘，因為固定平臺會繞過該探針。

`disposal contains a spawn-failure rejection that races teardown` 斷言結算契約，而不是這場競爭的某一方獲勝：已經發布其 pre-exec 失敗的 bootstrap 以該失敗 reject，先停住 bootstrap 的 teardown 則以被請求的 `SIGTERM` 結算。只有 Linux scope 會記錄停止這一支，因為 win32 job owner 會把被取消的啟動轉成 rejection，fallback 啟動器則因目錄缺失而 reject。

`plugin-config dispose graces reach the real ACP run` 設定 5000ms 的 dispose 寬限。該案例的 mock 按設計既拒絕 stdin EOF 也拒絕 `SIGTERM`，因此案例會等滿兩個寬限（約 10s），並自帶 30s 的案例預算，高於本地單測入口授予的 5000ms 預設值。採用這些寬限時仍會發生 scope 訊號失敗，增加寬限不能證明終止已完成。[直接程序停穩決策](../bug-fix/2026-09-12-linux-scope-direct-kill-settlement.zh.md) 規定了 fallback kill 成功或獨立證明直接程序不存在後所需的程序事件與新取得的 scope 證據。

`packages/experimental/ptc-runtime-python/tests/runtime.spec.ts` 的兩個非法 UTF-8 殘餘案例都用 `time.sleep(0.001)` 控制寫入節奏：`os.sched_yield()` 會讓被搶佔的讀端把多次寫入合併成一個分塊，而被包裹的 `Buffer.concat` 測量的正是該分塊（在正確實作下，託管映像測得 2563，超過了 2048 的界）。兩個案例的載荷都保持在該界之上——`0xFF` 案例 3200 位元組，CESU-8 案例 1100 個 `ED A0 80` 序列（3300 原始位元組，超過按原始位元組計費會觸及的 3072 位元組預算）——因此少計仍然會在 2048 之上觸發 flush。兩者各自帶有 20s 的案例預算，容納帶節奏的寫入與直譯器啟動。

`packages/experimental/ptc-runtime-python/tests/stray-fragments.spec.ts` 的原生輸出分塊封存測試保留真實 Python 子程序，但把 stdout 讀取拆成單位元組事件。作業系統的管道合併無法保證達到封存一塊所需的 1024 個片段：run 34465259316 的全部斷言透過，卻未覆蓋該分支。可控讀取覆蓋反覆封存和末尾換行合併；精確輸出與複製總量上限檢測位元組丟失和字首反覆複製。

Linux coverage 通道授予 `DSH_COVERAGE_TEST_TIMEOUT_MS: '90000'`，與 Windows coverage 通道一致，因為當該通道的分割槽、worker 與同級門禁共用一個主機時，`subprocess-local` 與 `bash-sandbox` 的處置案例會超過 5000ms 預設值。

Windows 資料夾對話方塊冒煙測試改為透過 PowerShell 探測 `CoCreateInstance(CLSID_FileOpenDialog)`，而不再按 `process.platform` 分流。回答 `CLASS_E_CLASSNOTAVAILABLE`（0x80040111）的映像會跑乾淨的拒絕案例並跳過真實對話方塊案例，因此 `win32-dialog.ts` 在沒有可開對話方塊的主機上仍保有檔案覆蓋率。該啟用過程丟擲的任何異常都按拒絕解讀，因此因其它原因探測失敗的主機只會失去真實對話方塊案例；完全無法執行的探測則保留 win32 假設。

## 備選方案

**把 coverage 通道排除出託管支路。** 否決：該支路的意義就是把同一套測試跑在另一個池上，而這些失敗點出的是真實的主機依賴，不是一個該池無法支撐的套件。

**只抬高通道的每案例預算。** 否決：更寬的預算改變不了那些成本或行為確定的案例——被 trap 的 ACP 子程式仍然會等滿兩個寬限，被合併的讀端仍然會抬高測得的峰值。

**同時固定平臺並 mock 探針。** 因冗餘而否決：固定平臺會在原生探針被呼叫前選擇 fallback。驗證主機預設平臺選擇的測試則不設定平臺，並控制探針結果。

**削減非法 UTF-8 的載荷以讓案例更快。** 否決：低於 2048 的界之後，斷言再也無法為它所點名的少計而失敗，等於讓該回歸失去守護。

## 後果

釘死選擇的 fixture 避免了非預期的 containment 選擇：`linux-scope` 與 win32-job 兩條路徑仍由各自的專用案例覆蓋，而不是經由這些案例抵達。ACP 處置案例每次執行約 10s 牆鍾，每個殘餘案例約 3.5s，還需加上主機排程與原生清理的額外開銷。託管映像證據：run 34449848541 在這些案例上失敗，run 34457655892 在本改動加 90000ms 通道預算下轉綠，`windows node 24 / coverage` 在連續五次託管執行中為綠，其中探針報告拒絕（`clsid-probe=refused`）。
