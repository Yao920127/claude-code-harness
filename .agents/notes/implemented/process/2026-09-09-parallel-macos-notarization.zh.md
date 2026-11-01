# Agent Note: 基於隔離 App 副本的並行 macOS 公證

Status: implemented

[English](2026-09-09-parallel-macos-notarization.md) | 中文

## 問題

Desktop 釋出同時提供用於安裝的 DMG 和用於更新的 ZIP。等待 App 公證完成後才建立 DMG，會讓兩次 Apple 提交序列執行。代理可以提高上傳吞吐量，但不能讓兩個獨立的服務等待過程重疊。釘票會修改 App，因此並行公證和打包不能安全地共享同一個可寫目錄。

## 決策

固定目標安裝檔命令先組裝一個 App，寫入並驗證其中的 `app-update.yml`，隨後簽名，再透過 `ditto` 建立兩個獨立副本。必須顯式寫入該設定，因為初始建置只有目錄目標時，electron-builder 會跳過 macOS 更新設定掛鉤，而後續 `--prepackaged` 呼叫不會重新組裝 App。App 路線公證其副本並釘票，驗證簽名、票據、Gatekeeper 接受狀態與更新設定，再由 electron-builder 生成 ZIP 和更新中繼資料。DMG 路線驗證其副本的更新設定，隨後立即封裝副本、簽署映像，再透過現有 artifact-completion hook 公證映像、釘票並驗證。每個 electron-builder 程序都透過 `--prepackaged` 接收真正的 `.app` 路徑、獨立的輸出目錄和 `--publish never`。

ZIP 包含已單獨釘票的 App。DMG 包含已簽名但未單獨附加票據的 App；根據 Apple 的[容器說明](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)，外層票據覆蓋內嵌程式碼。Apple 還說明了 [Gatekeeper 檢查外層容器時接收票據的行為](https://developer.apple.com/forums/thread/125512)。單獨提取未釘票 App 依賴線上或快取票據；ZIP 則提供內嵌票據。僅生成目錄的命令仍會公證 App 並釘票。

錯誤傳播和臨時目錄清理前必須等待兩路均結束。只有兩路均成功且使用已設定更新源時，才允許移入 DMG、ZIP、ZIP blockmap 和頻道中繼資料。已釘票的 App 替換籤名目錄建置，呼叫方最後寫入釋出完成記錄。App 更新設定缺失或不匹配會在移入前失敗；任何錯誤都會使該記錄保持缺失，現有上傳驗證因而會拒絕不完整發布。獨立輸出目錄還避免了 electron-builder 診斷檔案與頻道中繼資料的並行寫入。

本決策細化了 [Desktop 打包決策](../architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md)中的公證順序；原決策繼續負責釋出身份、簽名、更新歸屬與釋出要求。

## 考慮過的替代方案

**兩路共享一個 App。** DMG 讀取可能與 `stapler` 寫入重疊，使 bundle 內容不確定。獨立副本使每條路線中提交與分發的位元組保持穩定。

**只公證 DMG。** ZIP 更新獨立分發，需要已釘票的 App。保留兩次提交可以明確維持這項獨立驗收。

**保留序列公證，僅使用代理。** 同一個 214.84 MiB DMG 直連上傳耗時 203.83 秒，透過所測系統代理上傳耗時 38.59 秒，但兩種網路路徑都不能消除 Apple 提交間的序列依賴。代理設定仍由建置主機負責；打包腳本不修改主機網路設定。

**App 公證結束前，在同一次 electron-builder 呼叫中執行兩個目標。** ZIP 必須讀取已釘票副本。獨立的 prepackaged 呼叫可以保留 electron-builder 自己的歸檔、blockmap 和中繼資料實作，無需修改目標排程或給依賴打補丁。

## 影響

2026-09-09，在同一臺 Mac、同一系統代理下，arm64 完整打包在並行公證時耗時 490.78 秒，序列時耗時 751.33 秒，縮短 34.7%。兩條產物路線相隔 8 毫秒啟動，App/ZIP 耗時 307.36 秒，DMG 耗時 268.54 秒。Apple 接受了兩次提交，兩者上傳完成時間僅相差約一秒。每種設定只有一次完整建置樣本，快取與 Apple 佇列變化使我們不能將全部差值歸因於並行。

兩個臨時 App 副本與獨立產物目錄增加了磁碟峰值佔用。兩次上傳可能爭用網路頻寬，Apple 也可能分別排隊處理；階段計時記錄實際行為，不構成 CI 延遲預算。一路失敗後會等待另一路結束再清理，這可能延遲錯誤報告，但能避免刪除仍由子程式持有的檔案。

[編排測試](../../../../apps/desktop/tests/package-macos.spec.ts)透過同步屏障驗證重疊執行、票據隔離、收集兩路錯誤、強制檢查更新設定，以及拒絕移入不完整產物。聚焦設定測試覆蓋固定更新源的寫入，並拒絕缺失、不匹配或欄位不完整的設定。受控的序列迴歸會使重疊斷言失敗。真實簽名 macOS 打包、ZIP 解壓後驗證、DMG 完整性與內嵌簽名檢查、最終上傳計劃驗證用於驗收平臺工具；跨版本已安裝應用更新和乾淨 Mac 上的離線安裝仍屬於釋出驗收工作。
