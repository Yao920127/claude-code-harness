# Agent Note: 工作區檔案二進位制傳輸

Status: implemented

[English](2026-09-17-workspace-file-binary-transfer.md) | 中文

## 問題

文件預覽需要原生位元組。將檔案內容編碼為 base64 會在壓縮前使載荷增加約三分之一，並要求瀏覽器解碼。獨立的檔案 Fetch 路由還會重複 Gateway 的方法分發、Session 查詢和錯誤處理。

## 決策

[Remote 方法架構](2026-08-02-typert-remote-method-calls.zh.md)負責方法分發與生命週期；本記錄規定二進位制成功回應的編碼及 Client 驗證。[工作區檔案服務](2026-09-05-workspace-files-service.zh.md)提供單一的二進位制 `readBytes` Remote。其必填選項物件獨立選擇位元組 `range` 和用於相對目標解析的 `baseFile`。未傳 `range` 時讀取完整檔案。這避免為正交的選擇設定不同方法名，同時保留有界的 `fs.readBytes` 和 `fs.readByteRange` 讀取。

Typert 遞迴識別一元結果型別中的 `Uint8Array`，包括根值、可選欄位和容器。生成的結果 codec 提供 `encode()` 處理型別可能包含位元組的子樹，並透過 `decode()` 驗證還原後的值，不逐位元組遍歷、複製或凍結位元組載荷；Client 宣告將每個位元組緩衝區限定為 `ArrayBuffer`。Gateway 執行生成的 encoder，保持 strict JSON 值不變，併為原始碼模式呼叫執行執行時位元組識別；隨後向 Connection 返回 JSON 相容中繼資料及相對於結果的位元組附件。Connection 負責標準 `FormData` 部分，並在 JSON 中繼資料中保留 RPC 信封和關聯 id；它不檢查業務值，也不依賴 Typert 反射。附件表將位元組部分與 JSON 結果中的路徑關聯，欄位名仍由業務擁有。Client 恢復基於 `Blob.arrayBuffer()` 的 `Uint8Array` 檢視，Gateway 將驗證交給生成的解碼器。普通結果與錯誤繼續使用 JSON 回應。Gateway 負責方法分發、Session 查詢、取消、結果投影及掛載生命週期；功能程式碼無需 multipart 讀取器或專用路由。

## 考慮過的替代方案

- 分立的 `readAll`、範圍和關聯檔案方法混合了路徑與讀取範圍兩個獨立選擇。單一選項物件支援組合，無需再增加方法。
- 工作區專用 Fetch 路由讓二進位制傳輸獨立於 Remote，但需要功能專屬的方法分發、Session 查詢與錯誤解碼。
- 整體結果的二進位制標記或保留的 `data` 欄位會將傳輸與某一種業務結果耦合。按型別生成的 codec 和附件路徑支援獨立命名及巢狀欄位，無需新增整體結果分類。
- 自定義中繼資料字首需要自有的幀格式與長度驗證。FormData 將這些機制交給平臺，代價是 Blob 複製。
- 中繼資料 HTTP 頭會限制較長的 Unicode 路徑。Multipart 欄位將路徑保留在正文中；HTML 仍置於隔離的 Blob iframe，不作為可導航的 Host 回應。

## 影響

位元組範圍僅保留 `maxBytes` 內的請求位元組，不受 `maxFileBytes` 約束。完整讀取保留有上限的整個檔案；這不是流式預覽或零複製最佳化。HTTP 連線斷開後，橋接器中止請求訊號，並排空已準備的回應塊，不再寫入 socket：取消 Node multipart 回應體可能與其生產方競爭，導致未處理的 `ERR_INVALID_STATE` 拒絕。Office 授權探測使用同一 Remote 的單位元組範圍；轉換後的 PDF 仍透過獨立的 Office Remote 傳輸 base64，並使用其有界解碼器。外掛呼叫方遷移到 `readBytes` 選項，並停止將其 data 按 base64 解碼。仍不支援二進位制參數、事件和流條目；遞迴型別要求執行時值無環。不改變 Session 事件或持久化格式。

## 驗證

Workspace 測試覆蓋完整與分段讀取、基準檔案解析組合、上限、Session 查詢、取消以及二進位制 RPC 往返。Connection 和 Gateway 測試覆蓋巢狀及多附件、幀格式、關聯關係、畸形 multipart，以及取消或撤銷的呼叫；Typert 測試覆蓋遞迴結果 codec、Client 宣告，以及對二進位制輸入和流的拒絕。建置後的瀏覽器情境驗證原始 PNG 位元組以及 HTML、PDF、圖片和文字預覽。本機 benchmark 使用相同合成檔案比較完整與分段讀取，並區分傳輸/解碼和完整讀取路徑。
