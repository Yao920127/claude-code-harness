# Agent Note: 獨立打包引擎的 Node Office 轉換

Status: implemented

[English](2026-09-11-node-office-kit.md) | 中文

## 問題

二進位制 Office 和 OOXML 檔案需要經過文件排版才能預覽。轉換必須留在裝置上，不能開啟 Office 應用，也不能將源位元組加入模型對話。原生引擎需要按平臺分發，而瀏覽器轉換會在 Host 和 Client 兩側重複字型傳輸、worker 生命週期與資源限額管理。

## 決策

[文件渲染能力](../../../../packages/document/README.zh.md)將轉換委託給獨立釋出的 `@deepseek-ai/libreoffice-kit` Node API。[kit 歸屬決策](2026-09-14-independent-libreoffice-kit.zh.md)負責原始碼維護、相容版本和 npm 分發。DSH 負責 Session 檔案授權、轉換並行、私有臨時檔案、輸出限制和 Remote 傳輸。[Web bundle](../../../../packages/bundle/web-app/README.zh.md)使用穩定 ID 宣告轉換服務與共享文件預覽入口。服務負責帶授權的轉換 Remote 方法，其描述符由 `api/remotes` 掛載；Office UI 共享文件預覽的 Loader 生命週期。

[平臺引擎決策](2026-09-15-platform-office-engines.zh.md)要求使用 kit 已宣告的原生目標引擎，未宣告原生目標時使用 WASM。缺失或無效的必需引擎會拒絕轉換。共享的[有界提供者](2026-09-15-bounded-office-conversion.zh.md)負責准入、轉換複用以及持續到臨時檔案清理完成的取消。預覽消費該提供者，不註冊另一個轉換器，也不依賴 Office 創作 skills。

服務和 Remote 方法接受 DOC、DOCX、XLS、XLSX、PPT 和 PPTX。Client PDF 預覽透過此路徑顯示 Word 和 PowerPoint；[瀏覽器表格預覽](../feature/2026-09-16-browser-excel-preview.zh.md)獨立讀取 XLSX、XLS、CSV 和 TSV。LibreOffice 匯入前，kit 驗證 OOXML 輸入的有界 ZIP 成員和內容型別，以及二進位制 Office 輸入的 OLE 複合檔案頭。將文字改為 Office 字尾不能透過驗證。kit 不提取二進位制格式的字型表，因此這些格式不返回缺失字型診斷。kit 在呼叫方擁有的私有目錄中獨佔建立新的 PDF。DSH 讀取並驗證完整輸出後才刪除臨時檔案。[服務的 Remote 方法](../../../../packages/document/office-to-pdf/README.zh.md)透過 [Workspace Files](2026-09-09-workspace-file-read-authority.zh.md)授權原始檔存取，保留源路徑和版本，並返回 PDF 位元組。原始檔讀取上限與生成 PDF 上限相互獨立。讀取權限探測和延遲讀取（包括超限失敗後的複查）採用同一個源路徑／版本快照，防止轉換將位元組釋出到另一個源身份下。預覽位元組不會進入 Session 儲存或持久快取。

converter 複用首個轉換 Worker 返回的字型中繼資料；原始字型緩衝區和解碼後的字元覆蓋範圍仍只屬於單次轉換。Worker 讀取字型時驗證索引中的檔案。已安裝字型族的精確匹配優先於設定的替代字型，完整的字型族、樣式、字重、斜體、寬度、字距、語言與碼點請求保留各自的匹配結果。WASM 回呼將包含完整字型集合的原始字型檔案匯入 MEMFS。原生引擎還保留各平臺的字型發現能力。兩條路徑均不下載或安裝字型；原生作業系統管理的字型記憶體不受顯式匯入預算約束。字型變化後，重新建立 converter 會重新整理中繼資料。

kit 維護 serif、sans-serif 和 monospace 的預設優先組，其中包含中文正文字型。西文文字缺少中文字形時，先嘗試同類的常用正文字型，再搜尋其餘字型目錄，避免僅因檔案排序靠前而選用手寫體。provider 的可選 `fontFallbacks` 替換這些有序組，不重複維護預設值。優先規則保留已安裝原字型的精確匹配，並以其他覆蓋字型作為最後後備；它們不是字型白名單。原生介面卡將缺失字型的選擇寫入私有 VCL profile。已安裝的度量相容字型可能在查詢該表前被選中，平臺的字形退回仍然可用。原生平臺的選擇及完整字型集合的匯入要求檢查匯出 PDF 實際使用的字型。

DSH 按可設定解析度匯出柵格圖片，預設 192 DPI，對應共享 PDF 畫布在裝置畫素比 2 時的 96 CSS DPI。文字與向量仍可縮放；JSON 過濾選項替代隱式選項時，顯式書籤匯出保留引擎預設行為。Node WASM 使用 LibreOffice 的 CPU 過濾器降取樣圖片。原生轉換使用獨立的平臺引擎。

[Office 檢視器](../../../../packages/client/ui-sidebar-documentpreview/README.zh.md#office-preview)位於文件預覽的 `client/office/` 目錄，與其使用的載入生命週期、PDF 正文和讀取器型別同屬一個包。這些元件放在同一包中，既減少一個獨立 UI 啟動入口，也無需跨外掛執行時匯入。其有界快取驗證已授權的源中繼資料，在讀取方之間共享待完成轉換，僅在最後一個讀取方離開時取消，不快取失敗，並在連線重置時清空。使用者開啟預覽時才開始轉換。缺失的已宣告字型族隨 PDF 返回，可透過文件工具欄的警告圖示檢視；字型表清單與無關的引擎預設字型不構成警告。共享預覽入口的 `office` 快取設定複用頁面全域注入通道，因為模組啟動圖攜帶包標識而不傳遞 Loader 設定。重新載入頁面後採用更新的 YAML 值。

Office 回應使用 Typert 二進位制結果投影和 Connection multipart 封裝。Client 直接收到一個由 `ArrayBuffer` 支撐的 `Uint8Array`，不會生成 base64 字串或單獨的解碼緩衝區。建置後的瀏覽器情境會同時驗證 multipart 附件和 PDF Worker。快取位元組限制不約束臨時傳輸或檢視器記憶體。

[kit 歸屬決策](2026-09-14-independent-libreoffice-kit.zh.md)定義 npm 分發和隨應用打包的離線轉換。

Desktop 透過現有的目標 Node pnpm 依賴安裝流程安裝 kit，並保留完整依賴樹。Worker 路徑和可執行權限仍由普通包檔案承載。[Desktop 建置指南](../../../../apps/desktop/README.zh.md) 負責目標選擇與打包；每個簽名應用仍需在目標平臺驗收。

[Python 可執行分發](2026-07-10-single-file-executable-sdk-runtime-distribution.zh.md)將 kit、目標引擎及其依賴閉包保留在可執行檔案旁。安裝後的 wheel 冒煙測試會遷移載荷，要求僅存在目標後端，並透過該引擎轉換一次 DOCX。各平臺的打包與釋出限制由[平臺引擎決策](2026-09-15-platform-office-engines.zh.md)說明。

宣告檢查僅放行精確的 API 與引擎包名及 MPL-2.0 條款，繼續拒絕無關 MPL 包或變更後的非寬鬆條款。每位接收者都必須保有存取 kit 對應 LibreOffice 原始碼版本、補丁、建置說明與許可證宣告的權限；引擎包保留各自的第三方宣告。向組織外部分發受覆蓋的可執行檔案時，須滿足 [MPL 原始碼可用性要求](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)。

[純瀏覽器預覽](../../../../packages/experimental/webworker-runtime/README.zh.md)用返回不可用錯誤的轉換器替代 kit 入口，並從 VFS 映像排除其引擎依賴樹。保留 Host provider 的可載入性，可以沿用正常的 Office 錯誤展示，而無需向瀏覽器分發 Node Worker、原生輔助程式或 WASM 轉換資源。

## 考慮過的替代方案

**保留瀏覽器 Worker 轉換。** 這需要向 Client 分發引擎、提供瀏覽器字型 RPC 和設定共享記憶體回應頭。Node 已經擁有授權磁碟存取能力，可以向所有 Client 提供轉換後的 PDF。

**使用已安裝的 soffice CLI 或自動化 Microsoft Office。** 可執行檔案發現和環境中的版本削弱可復現性；Office GUI 自動化還會改變焦點並需要應用權限。隨包輔助程序擁有固定引擎，不要求安裝這兩類應用。

**在 Host 程序中載入原生 addon。** 解析器崩潰或同步阻塞會影響 Host。獨立的原生輔助程序具有可單獨終止的生命週期，其磁碟交換方式也適用於 WASM 適應層。

**任何原生錯誤都觸發退回。** 使用另一引擎重試損壞的包或失敗文件會隱藏釋出缺陷、重複計算，並使輸出取決於失敗時機。平臺選擇要求使用 kit 已宣告的原生目標引擎，未宣告原生目標時使用 WASM；原生失敗後不會使用 WASM 重試。

**返回臨時 PDF 路徑，或將頁面柵格化為 PNG。** Client 需要 PDF 位元組來使用現有檢視器和可選擇文字。暴露臨時路徑會增加授權與租約管理；PNG 則會建立另一條渲染管線並丟失 PDF 控制元件。

**每次渲染重新索引所有字型，或只按字型族快取。** 重複索引主導小文件成本，而僅以字型族為鍵會丟失樣式和字形差異。共享中繼資料與完整請求鍵減少重複解析，無需保留字型緩衝區或引入檔案系統監聽器。

**安裝時編譯、執行時下載引擎或字型，或使用線上轉換器。** 這些方案增加工具鏈或網路要求，並可能將私有內容移出裝置。預建置 tarball 使安裝與轉換不依賴這些操作。

**保留獨立的 Office UI 包。** 其讀取器、快取和字型提示共享預覽生命週期與 PDF 展示消費者。獨立外掛增加包、啟動接線和 Loader 開關，卻沒有獨立演進的 UI 職責。Host 轉換與 Remote 授權仍保留獨立外掛。

**移除共享的 Client 轉換快取。** tab 內狀態無法在讀取方之間共享進行中的轉換或已保留的 PDF。有界快取減少這些重複工作，同時保留各讀取方的取消和已授權版本檢查。

**新增面向模型的渲染工具或持久預覽事件。** 預覽不會提供模型輸入。這樣的工具需要日誌事實及兩套 SDK 投影，仍屬於獨立消費者。

## 後果

原生與 WASM 的保真度仍取決於建置、原始檔格式、已安裝字型及平臺字型發現。沒有覆蓋字型就無法恢復缺失字形。圖片解析度限額不限制圖片解碼或總程序記憶體。WASM 為大型字型集合和 CFF 字型保留有界記憶體增長與受檢查的棧空間；致命執行時中止會阻止後續 C++ 清理呼叫。宏與文件連結更新由實際支援的 LOKit 選項和固定原始碼補丁停用；這不構成作業系統沙箱。

[提供者測試](../../../../packages/document/office-to-pdf/tests/provider.spec.ts)、[Loader 組合](../../../../packages/bundle/web-app/tests/document-preview.spec.ts)和[瀏覽器情境](../../../../apps/web/tests/document-preview.e2e.ts)負責 DSH 生命週期、授權與展示證據。引擎驗收還需要真實 DOC/DOCX/XLS/XLSX/PPT/PPTX 轉換、外部 PDF 文字、字型、頁數與圖片檢查、遷移安裝和損壞包拒絕，以及同輸入的原生/WASM 效能樣本。模擬輔助程序和微基準不能證明這些結果。各目標的真實建置機與 Desktop 安裝檔需要獨立驗收；一個本地架構成功不能證明整個矩陣。
