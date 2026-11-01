# Agent Note: 使用 Electron 作為 Desktop 的 Node 執行時

Status: implemented

[English](2026-09-11-desktop-electron-node-runtime.md) | 中文

## 問題

在 Electron 之外攜帶上游 Node 可執行檔案會重複分發 JavaScript 執行時。Desktop 需要讓 Host 和包腳本共用一個執行時，無需使用者安裝 Node。

## 決策

Desktop 透過自己的 Electron 可執行檔案執行共享 Web Host 和內建 pnpm，並設定 `ELECTRON_RUN_AS_NODE=1`。應用不攜帶獨立的上游 Node 可執行檔案。目標 Electron 分發包同時作為打包輸入，以及準備和驗證生產依賴的執行時；釋出中繼資料記錄其實際 Node 版本。開發模式使用已安裝的 Electron 分發包。

此決策替代[打包決策](2026-08-25-electron-desktop-packaging-and-updates.zh.md)和[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)中的獨立 Node 選擇。獨立外掛儲存和普通資源目錄佈局仍然適用。[Web 薄殼](2026-09-10-desktop-web-wrapper.zh.md)保留共享 profile runner 和 HTTP 傳輸。

## 後果

Host 和 pnpm 啟動時傳入 `--expose-internals`：內建 Cordis 載入器使用 Node 內部 ESM 載入器，而其原生 builtin 存取器無法在 Electron 44 中找到所需符號。顯式參數使載入器可用，無需修改 Cordis。RunAsNode fuse 保持啟用。

Host 繼承呼叫者的 PATH，不加入 Desktop 私有的 `bin` 目錄，因此 PTC 和 agent shell 不會透過該目錄解析內部啟動器。`DSH_DESKTOP_NODE_EXECUTABLE` 僅為包安裝注入。包腳本環境在 PATH 前新增一個小型 `node` shell 啟動器，把參數轉發給目前 Electron 可執行檔案。這支援沒有系統 Node 的 shell 生命週期腳本。Windows 上它是 `node.cmd`，並非替代的 `node.exe`；第三方程式碼若繞過 shell 直接啟動名為 `node` 的可執行檔案，必須使用 `process.execPath` 或提供自己的執行時。子程序繼承 RunAsNode；worker 執行緒繼承 Host 參數。Desktop 不模擬上游 OpenSSL 行為，也不自動重編譯任意第三方原生擴充功能。

Electron 的 Node 補丁和原生 ABI 屬於釋出相容性責任。打包原生 smoke 在 PATH 不含系統 Node 的情況下驗證 pnpm shell 腳本，並驗證 Windows shell 終端輸出、Koffi、Sharp 和 HTML 轉換。Host smoke 載入共享 Cordis 的外部外掛，透過真實 Web 應用提供其路由。各平臺仍需完成簽名和已安裝應用驗收；Windows 結果不能證明 macOS 相容性。Windows Token 簽名序列執行並保留首次失敗，阻止排隊任務重複提交被拒絕的 PIN。

## 考慮過的替代方案

獨立 Node 可執行檔案可以讓 Host 與 Electron 執行時分離，但會增加另一份二進位制檔案、下載、簽名和版本選擇。Electron RunAsNode 消除這一重複。將生產包移入 ASAR 是另一項涉及原生模組、包解析和子程序路徑的改動；Host 繼續載入普通資原始檔。
