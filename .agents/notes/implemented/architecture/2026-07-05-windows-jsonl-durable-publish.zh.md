# Agent Note: Windows 原生持久 JSONL 釋出

Status: implemented

[English](2026-07-05-windows-jsonl-durable-publish.md) | 中文

## 問題

`dsh-session-persistence-jsonl` 在首次追加時延遲釋出工作階段日誌。POSIX 協定會寫入臨時檔案，對其執行 fsync，將其連結至最終名稱，對父目錄執行 fsync，然後移除臨時連結。對父目錄執行 fsync 是永續性約定的一部分：名稱空間變更後發生崩潰時，已經提交的最終名稱不能丟失，否則呼叫方會誤以為工作階段日誌已經物化。

Windows 具備原子名稱空間操作，但 Node 沒有暴露與 POSIX 等價的父目錄 fsync 約定。如果把 Windows 目錄同步失敗視為成功，就會在無提示的情況下削弱持久化後端。因此，Windows 路徑需要採用不同的釋出原語，而不是在 POSIX 的 `syncDir` 輔助函式中新增條件分支。

## 決策

JSONL 後端會在 `materialize()` 內部、任何名稱空間變更之前分流。共享程式碼計算工作階段目錄、最終日誌路徑，以及編碼後的 header 和初始事件批次；隨後 POSIX 與 Windows 分別執行各自的釋出協定。

POSIX 保留現有協定：建立根目錄、專案目錄與工作階段目錄，並對其父目錄執行 fsync；寫入臨時檔案並對其執行 fsync；使用 `link()` 釋出，確保絕不覆蓋已有的最終日誌；對工作階段目錄執行 fsync；最後移除多餘的臨時硬連結。

Windows 透過持久的暫存釋出來建立缺失目錄：建立一個以固定的 `.dsh-mkdir-` 為字首的隨機同級目錄，其名稱與目標基本名無關；隨後使用 `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` 將其釋出為最終目錄名稱，且不使用 `MOVEFILE_REPLACE_EXISTING` 或 `MOVEFILE_COPY_ALLOWED`。檔案物化先寫入臨時日誌並對其執行 fsync，再以同一個啟用寫穿透的 `MoveFileExW` 呼叫將臨時檔案釋出到最終路徑，並且同樣不允許替換。`koffi` 是覆蓋這組 API 所需的最小 Win32 橋接層；`pnpm-workspace.yaml` 允許執行它的安裝腳本，因為該包會分發原生 loader 和預建置的平臺模組。

## 考慮過的替代方案

**忽略 Windows 目錄同步失敗。** 不予採納，因為這會在沒有強制將已釋出的名稱空間條目寫入穩定儲存時，就把首次追加報告為持久化成功。

**使用 `CreateHardLinkW`。** 不予採納，因為硬連結依賴檔案系統、不能釋出目錄，並且沒有提供寫穿透選項。

**使用替換或事務型 API。** `ReplaceFileW` 的替換語義與拒絕同一 id 衝突的要求相悖，而新應用設計不應使用 Transactional NTFS。

## 影響

該後端在各平臺上維持同一項外部約定：首次追加要麼把完整日誌釋出到最終名稱，要麼失敗且不覆蓋已有日誌。平臺分流只是實作細節；`SessionPersistence` API 和 JSONL 邏輯記錄格式均不改變。後續的 [Zstandard 編碼決策](2026-07-19-zstandard-jsonl-session-logs.zh.md)會先作用於不透明位元組，然後才由任一平臺執行釋出。

Windows 測試會在原生 Windows 上執行真實的 Win32 釋出路徑。斷電行為屬於 API 約定屬性，單元測試無法證明；可測試的不變數包括：Windows 物化不會呼叫目錄 fsync、最終路徑衝突會失敗、達到最大長度的目標路徑元件仍可物化、臨時日誌在釋出前已經執行 fsync，並且生成的日誌可以正常載入。

兩個平臺的追加和修復仍使用普通檔案控制代碼 fsync。追加失敗後，系統會關閉僅追加控制代碼，以讀寫模式重新開啟日誌，將檔案截斷到追加前的大小，並對復原結果執行 fsync，因為 Windows 不允許在僅追加控制代碼上呼叫 `ftruncate`。
