# 二進位制 Office 測試檔案

[English](README.md) | 中文

`preview.doc`、`preview.xls` 和 `preview.ppt` 包含 `Office preview 中文文件`。它們來自 [LibreOffice Kit](https://github.com/deepseek-harness/libreoffice-kit/tree/main/test/fixtures) 的 `one-page.doc`、`one-sheet.xls` 和 `one-slide.ppt`，由 Harness 編寫的 OOXML 透過 LibreOffice 26.8.0.3 的 Word、Excel 和 PowerPoint 97 過濾器匯出。源文件保留 Harness 的 MIT 許可證。

瀏覽器迴歸讀取這些檢入的 OLE 檔案，驗證真實轉換和可選取的 PDF 文字。檔案不含使用者文件，測試期間不需要 Office 應用或檔案生成器。它們覆蓋簡單的舊格式匯入，不代表複雜文件的保真度。
