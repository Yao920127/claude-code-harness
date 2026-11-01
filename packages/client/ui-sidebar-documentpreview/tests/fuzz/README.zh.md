# XLSX 模糊測試診斷

[English](README.md) | 中文

使用 Openpyxl 和 XlsxWriter 生成表格檔案，再將原始碼 XLSX 介面卡的結果與獨立記錄的單元格值、公式和不支援內容類別比較。此診斷任務需要顯式執行，會保留失敗結果並以非零狀態退出；它不屬於預設單元測試集。

## 執行測試

安裝工作區依賴，並準備裝有 Openpyxl、XlsxWriter 和 Pillow 的 Python 直譯器。在 PowerShell 中，將 `$excelFuzzPython` 設定為該直譯器的可執行檔案路徑。從儲存庫根目錄執行，並使用新的輸出目錄：

```powershell
& $excelFuzzPython packages/client/ui-sidebar-documentpreview/tests/fuzz/generate.py .artifacts/excel-fuzz-new --seed 4863 --random-cases 400
pnpm exec tsx packages/client/ui-sidebar-documentpreview/tests/fuzz/run.client.ts .artifacts/excel-fuzz-new
```

種子控制功能組合、數值和位元組變異。ZIP 中繼資料保持固定；復現還依賴 `manifest.json` 記錄的寫入器版本。生成器先驗證內部關係目標，並用 Openpyxl 重新讀取預期單元格，再將工作簿歸類為合法檔案。被排除的候選保留在 `generatorErrors` 中；隨機位元組變異單獨分類。

從已有樣本集重跑選定案例：

```sh
pnpm exec tsx packages/client/ui-sidebar-documentpreview/tests/fuzz/run.client.ts .artifacts/excel-fuzz-new --only openpyxl-table --report table.json
```

執行器為每個輸入設定 10 秒的可終止 Worker 截止時間，並檢查輸入不變性、單元格值、公式快取，以及提示順序和唯一性。`--timeout-ms` 可修改該診斷時限。報告保留全部結果；`repros/` 包含功能組合較少的代表性失敗檔案，不聲稱輸入已達到全域最小。被接受的損壞 ZIP 僅作為觀察結果，需要單獨檢查。

## 對比舊介面卡

`--baseline-ref <commit-or-ref> --report baseline.json` 從 Git 讀取該版本的 `xlsx.ts`，並停用提示比較。它仍使用目前依賴版本和共用轉換輔助函式，安裝補丁後無法復現未修補 ExcelJS 的基線。須保留原依賴狀態下的報告，或在獨立檢出目錄中執行舊版本。Worker 退出後會刪除臨時基線模組。此對比檢查原始碼解析，不覆蓋 FortuneSheet 瀏覽器渲染或釋出的 Web 設定。

## 保留的迴歸案例

[OPC fixture](../fixtures/excel-opc/) 包含從 seed 4863 語料複製的五類獨立失敗檔案，以及一個組合 Openpyxl 工作簿。Openpyxl 3.1.5 生成批註、Table、名稱空間字首和部件名案例，XlsxWriter 3.2.9 生成相對目標案例。組合工作簿加入圖表、條件格式、凍結表頭、隱藏行／列／工作表、合併、樣式、超連結、類似 XML 的字面文字和公式，再應用 `sheet-prefix` 與 `sheet-filename` 變異。Openpyxl 獨立驗證儲存的輸入。單元測試和瀏覽器測試讀取已提交的位元組，無需 Python。

[XML fixture](../fixtures/excel-xml/) 保留一個 XlsxWriter 3.2.9 工作簿及七種等價編碼：UTF-16 工作表或中繼資料 XML、移動工作簿/樣式/共享字串部件、CDATA 文字，以及移動工作表/繪圖目錄。每個檔案都保留公式快取、Unicode 和類似 XML 的文字、批註、Table、樣式、合併、凍結標題、隱藏內容和全部四類提示。升級 ExcelJS 時，應透過 Node 與瀏覽器入口比較完整預覽及批註/Table 中繼資料，再對建置後的 Worker 執行 `apps/web/tests/excel-opc.e2e.ts`。保留原始語料報告；重放時使用新的 `--report` 檔名，並在獨立讀取器驗證之外單獨檢查 ZIP 目錄完整性。

[開啟回歸樣例](../excel-opening-fixture.ts)基於 Openpyxl 組合檔案派生 Strict URI 別名、根目標與部件名大小寫變體，以及孤立 DrawingML。變換保留單元格資料，並透過兩個解析入口、完整預覽比較和實際釋出的瀏覽器 Worker 驗證。ASCII 大小寫等價的歧義條目會被拒絕；非 ASCII 名稱保持區分。

執行 Node 和瀏覽器 bundle 解析器迴歸測試：

```sh
pnpm exec vitest run packages/client/ui-sidebar-documentpreview/tests/excel-opening.client.spec.ts packages/client/ui-sidebar-documentpreview/tests/excel-opc.client.spec.ts packages/client/ui-sidebar-documentpreview/tests/excel-xml.client.spec.ts
```

fuzz 報告記錄每個輸入的 SHA-256、能否開啟以及工作區狀態。`validOpened` 和 `validRejected` 將開啟失敗與值差異分開，嚴格退出狀態仍會拒絕這兩類缺陷。已知的 1904 時間／累計時長偏移和空字串公式快取差異仍作為診斷失敗。解析器接受的損壞輸入繼續作為觀察結果單列。

透過 `pnpm patch` 和 `pnpm patch-commit` 對釋出包維護 ExcelJS 補丁。已安裝的依賴樹包含生成的啟動腳本，不得混入補丁。在依賴快取安裝上的測試結果之前，先用 `pnpm patch --edit-dir <new-directory>` 全新解包，驗證補丁能夠應用。
