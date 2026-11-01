# Agent Note: 從儲存庫門禁中移除 Knip

Status: implemented

[English](2026-08-19-remove-knip.md) | 中文

## 問題

Knip 從靜態原始碼圖推導未使用檔案、export 和依賴。DeepSeek Harness 還會從包 manifest（中繼資料清單）和設定中裝載 Cordis 外掛、向 `lib/` 生成 Typert 契約面、拆分 Host 與 Client 程式，並宣告僅由生成程式碼或執行時裝載程式碼消費的依賴。因此，儲存庫必須維護 workspace 專用入口列表和忽略依賴例外，才能讓受支援路徑透過掃描。包與測試佈局變化還必須維護這份對可執行圖的第二重近似描述。

儲存庫已經為視作釋出約定的故障提供了更窄的檢查：TypeScript 與 Oxlint 驗證原始碼 import，workspace 約束驗證 manifest，`verify-optional-dependency-imports` 驗證可選 import，`verify-runtime-closure` 驗證執行時依賴，`verify-client-packages` 驗證 Client 打包，publint 驗證釋出包。通用未使用程式碼結果只是建議，而其例外卻是必需維護項。

## 決策

Knip 不再是儲存庫依賴或品質門禁。根 manifest 不含 Knip 腳本或 devDependency，門禁圖和 `hygiene` 命令不呼叫它，儲存庫也不攜帶 Knip 設定。包指南和註解直接描述執行時或生成程式碼要求，不再講解 Knip 例外。

儲存庫沒有檢查全倉未使用檔案、export 或依賴的靜態門禁。維護者需要從呼叫點、manifest、設定、生成產物、測試、文件和 Cordis Loader 路徑證明一項刪除是安全的。

## 考慮過的替代方案

**保留 Knip 及其例外清單。** 這會保留一項寬泛的建議訊號，但每條受支援的動態或生成路徑都需要設定，而這些設定會重述 manifest、建置設定和包專用檢查已經擁有的事實。這份例外清單使普通包變更依賴一個無法表示組裝後應用的原始碼圖。

## 後果

CI 和 `hygiene` 少執行一個命令，包變更也不再更新一份並行的入口與依賴例外清單。儲存庫放棄自動生成寬泛的未使用程式碼與未使用依賴報告；評審與簡化工作必須根據真實裝載路徑證明刪除安全。

未來的未使用程式碼檢查必須理解 manifest 驅動的 Cordis 裝載、生成輸出與 Host/Client 拆分，且不需要逐 workspace 忽略清單。在此之前，缺少原始碼 import 的依賴本身不能證明該依賴是死程式碼。
