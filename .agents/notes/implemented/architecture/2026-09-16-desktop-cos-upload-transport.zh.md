# Agent Note: 透過騰訊 COS SDK 上傳 Desktop 釋出產物

Status: implemented

[English](2026-09-16-desktop-cos-upload-transport.md) | 中文

## 問題

釋出物件此前透過指向騰訊 COS 端點的 AWS S3 用戶端上傳。該用戶端預設的總和檢查碼設定可以用 `Content-Encoding: aws-chunked` 傳送流式請求尾幀；S3 在儲存前會移除該標記，而相容路徑可能把它保留為物件中繼資料。一次面向使用者的應用下載在收到回應頭後立即以 HTTP/2 `RST_STREAM` 失敗，而同一連線上的相鄰下載正常完成；被報告帶有該標記的物件分段下載失敗。這兩項觀察都不能證明唯一原因，但上傳傳輸是本儲存庫自己擁有的部分，而 CDN 提供任何源請求都未產生的中繼資料本身就是缺陷，值得在繼續追查之前先消除。

## 決策

[desktop-cos.ts](../../../../apps/desktop/scripts/desktop-cos.ts)使用官方 `cos-nodejs-sdk-v5` 包建構每個 Desktop COS 用戶端：HTTPS、不保持連線、不跟隨重定向、不切換備用域名、不做時鐘偏移校正，無活動超時為 900 秒。[upload-target.ts](../../../../apps/desktop/scripts/upload-target.ts)與[installed-update-cos.ts](../../../../apps/desktop/scripts/installed-update-cos.ts)都從該工廠取得用戶端，`@aws-sdk/client-s3` 不再是 Desktop 依賴。

所有上傳物件——安裝檔、blockmap 和 YAML 清單，包括很小的字串清單——都以一次 `putObject` 傳送，其請求體是流，並攜帶顯式 `ContentLength` 與預先算好的 `Content-MD5`。正是流使寫入不可重複：SDK 只在請求體沒有 `pipe` 時才重發請求，因此流式 PUT 只會嘗試一次，兩個上傳器自身也不再新增重試。當呼叫方未指定時，SDK 還會注入空的 `Cache-Control` 頭；工廠會移除該頭，因此釋出上傳器仍然把快取策略留給部署基礎設施。

qualification 傳輸保持原有 store 介面與名稱空間檢查不變。它透過 `getObject` 配合一個對已接收位元組計算雜湊的 `Writable` 輸出讀取物件，因此物件從不整體駐留記憶體；只有確認的 `NoSuchKey` 表示物件不存在，其他任何狀態碼，以及早於宣告長度結束的傳輸，都會讓操作失敗。

## 測試

[cos-loopback.ts](../../../../apps/desktop/tests/cos-loopback.ts)把真實 SDK 實例 `before-send` 中的 URL 重定向到每個測試獨立的 loopback 源，並記錄實際收到的位元組，因此測試觀察的是傳輸的序列化結果，而不是它的 mock。[desktop-upload-run.spec.ts](../../../../apps/desktop/tests/desktop-upload-run.spec.ts)與[installed-update-cos.spec.ts](../../../../apps/desktop/tests/installed-update-cos.spec.ts)斷言確切的請求體位元組、`Content-Length`、`Content-MD5`、不存在傳輸編碼與內容編碼、已簽名的 `x-cos-forbid-overwrite` 頭、HTTP 500 與連線中斷時每個物件只發一次請求、讀取 404/403/截斷的處理，以及保留記錄不包含憑證與原始伺服器端訊息。

[cos-operation.spec.ts](../../../../apps/desktop/tests/cos-operation.spec.ts)驗證跨重試的總截止時間、持續返回資料的回應流、未確認 PUT 的取消，以及關閉請求不影響其他操作。測試組合虛擬截止時間計時器與真實 socket 和流觀測。

## 考慮過的替代方案

**保留 S3 用戶端並在兩條路徑上都設定 `requestChecksumCalculation: WHEN_REQUIRED`。** qualification 傳輸原本已使用該設定，它能抑制尾幀。但它仍然透過相容層寫入一個廠商已提供受支援用戶端的產品，釋出路徑也會依賴於某項設定始終正確，而不是依賴編碼根本不會產生。官方 SDK 消除的是這一層，而不是調整它。

**對小體積 YAML 清單改用 Buffer 請求體。** 對幾百位元組而言 Buffer 更省事，也不需要流處理。但它會重新啟用 SDK 固定的四次重試，使一次結果不確定的清單寫入可能靜默重複一個可變物件。統一的流式 PUT 保持單一寫入路徑和單一保證。

**使用 SDK 的 `uploadFile` 佇列或分塊上傳。** 這些路徑可並行處理大物件並提供進度上報。它們也會把單個物件拆成多個分塊，帶來分塊級重試與上傳狀態，擴大一個必須恰好寫入一次的產物的重複面。釋出上傳器對每個物件只發一次請求。

**只替換髮布上傳器，qualification 傳輸繼續使用 S3。** qualification 傳輸寫入同一系列 bucket，若把它留下，相容路徑就會繼續存在於最可能用於與生產行為對照的物件上。

## 結果

物件寫入不可重複，這正是本次故障所需的性質，傳輸也不再依賴 S3 相容行為。代價是每個物件只有一次請求：超大安裝檔不會並行，也沒有進度上報，與它替換掉的單請求行為一致。qualification 版本查詢的所有 SDK 嘗試共享 30 秒總截止時間；物件讀取與 PUT 的總截止時間為 15 分鐘。每次操作獨立擁有用戶端與取消訊號。[cos-operation.ts](../../../../apps/desktop/scripts/cos-operation.ts)透過 SDK 傳輸將訊號傳給底層 HTTP 請求，並在返回前等待請求的關閉事件，超時也不例外。持續返回資料不會延長截止時間，過期訊號會阻止後續重試建立連線。釋出上傳器保留獨立的無活動超時。

該 SDK 的依賴樹源自已停止維護的 `request` 包，會引入較舊的 `http-signature`、`tough-cookie` 和 `form-data` 版本；lockfile 的供應鏈檢查接受它，替代方案是自行實作 COS 請求籤名。

已經帶有該保留編碼標記的既有物件及其快取副本不受本次改動影響。刪除或重新上傳它們，以及任何 CDN 快取重新整理，仍是單獨的操作動作；本記錄不包含任何雲端操作。

「結果不確定的寫入必須保持為一次可檢查的嘗試」這一發布決策由[打包與更新決策](2026-08-25-electron-desktop-packaging-and-updates.zh.md)負責；本記錄改變的是實作它的傳輸。
