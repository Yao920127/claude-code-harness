# Agent Note: 透過共享 Web 應用執行 Desktop

Status: implemented

[English](2026-09-10-desktop-web-wrapper.md) | 中文

[Electron 執行時決策](2026-09-11-desktop-electron-node-runtime.zh.md)替代獨立上游 Node 可執行檔案的選擇；本文其他決策仍然適用。

## Problem

獨立的 Desktop 組合與請求傳輸需要分別維護設定、模組載入、流式回應與資源服務行為。即使共享渲染介面，這些實作也可能遺漏 Web 功能。Desktop 需要獨立安裝與原生控制元件，但不需要第二套應用後端。

## Decision

私有 Desktop Host 針對獨立歸屬的 Desktop profile 呼叫 CLI 的共享 profile runner。完整 Web 組合負責認證、HTTP 路由、用戶端資源、RPC 與回應流。Electron 在子程序就緒前載入打包靜態 Web 資源。子程序 IPC 承載就緒、結構化啟動注入與關閉。[立即顯示視窗決策](2026-09-09-desktop-immediate-window-and-direct-start.zh.md)規定本地文件 HTTP 轉發與認證 WebSocket 存取；Web 保留應用分派與流幀處理。

共享 runner 負責 profile 與 Harness-home patch、代理設定、遙測預設值、runtime resolution、設定過載和應用生命週期。Desktop 從共享 Web 範本初始化 profile，並在主應用中使用其外掛管理器。Electron 負責視窗、選單、原生目錄選擇、恢復和釋出更新。

[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)保留獨立執行時與外掛儲存、內建 pnpm，以及明確的包歸屬。公開 CLI 繼續拒絕保留的 Desktop profile。Electron profile 準備和原生恢復在 Host 不可用時仍可執行。

獨立包歸屬防止 CLI 與 Desktop 修改彼此的安裝，不代表 Desktop 採用更嚴格的外掛策略。Desktop 將 registry、store、Git、tarball、本地路徑及普通包安裝交給 pnpm，並遵循正常使用者與 profile 設定。Host 繼承 `NODE_OPTIONS`、`NODE_PATH` 及 npm/pnpm 環境變數。使用者建置設定決定哪些依賴生命週期腳本可以執行。這以 Web 使用的相同包管理器和載入器職責取代 Desktop 專用的來源、環境及建置限制。

共享 Web 外掛管理器負責安裝、啟用、錯誤和重新啟動要求。Electron 不提供獨立外掛管理渲染器、preload、shell 資源路由、外掛 IPC 或包變更執行器。打包明確選擇主入口和應用 preload，避免舊建置產物重新帶入已刪除的橋接。

共享 `initProfile` 建立缺失的 profile 檔案並保留現有內容。Host 透過 `createRuntimeResolution` 計算 runtime resolution，並透過 `PluginPackages` 安裝它，不寫入 fallback 連結。pnpm 管理的目錄保持優先。Desktop 不維護第二套執行時狀態、鎖檔案雜湊或連結協調機制。

本記錄部分取代[打包決策](2026-08-25-electron-desktop-packaging-and-updates.zh.md)中的私有組合與無埠傳輸。該設計避免監聽埠，並使用分幀位元組管道避免 Base64 膨脹與跨版本 V8 序列化。共享 HTTP 放棄無埠保證，將服務與認證交給已有 Web 實作。釋出身份、簽名、程序歸屬及原生殼功能仍是有效決策。

本地應用的原生目錄選擇透過窄 preload IPC 呼叫 Electron 的視窗所屬對話方塊。Main 僅接受目前應用視窗中位於 `dsh-app://app` 的主框架請求；shell、遠端頁面和子框架均不能呼叫。並行請求共用待完成的對話方塊，視窗銷燬後丟棄選擇結果。Web 後端選擇和 Host 瀏覽由共享實作負責。

## Alternatives considered

**在 Electron 中使用 Host 作業系統選擇器。** Host 的 macOS AppleScript 對話方塊沒有 Electron 父視窗，無法可靠跟隨應用焦點。Electron 負責本地對話方塊，Web 保留 Host 選擇器；取消和錯誤不會啟動第二個選擇器。

**維護第二套後端組合與傳輸。** 這允許應用不監聽埠，但每項 Web 路由、過載行為、認證變化和流式能力都需要 Desktop 實作或明確省略。只有無法使用 Web 實作、且足以承擔持續維護成本的桌面產品需求，才支援重新引入這種方案。

**合併 CLI 與 Desktop 外掛安裝。** 共享啟動程式碼不要求共享可執行依賴。獨立安裝允許分別驗收發布與外掛版本，共享工作階段和設定則仍由已有資料歸屬方負責。

**保留 Desktop 連結帳本與 manifest 協調器。** 這些機制重複共享 profile 邏輯，並可能因派生中繼資料漂移而拒絕原本可用的安裝。單一 runtime resolution 歸屬方可以保護 pnpm 目錄，無需在外掛 profile 中維護髮布身份。

**保留獨立原生外掛管理頁。** 它可以在 Web Host 不可用時執行，但重複維護包操作、渲染器 IPC、在地化和後端重新啟動處理。原生恢復已能在沒有 Host 時停用第三方 bundle 並備份 profile patch。只有出現此恢復方式無法提供的修復操作時，才應重新引入。

**固定 registry 與 store、過濾執行時環境，並僅允許批准的外掛來源。** 這些規則限制執行和包選擇，卻使同一使用者設定在 Desktop 與 Web 中產生不同行為。獨立安裝歸屬無需這些限制仍然有用。Desktop 專用限制需要獨立的產品需求，不能僅由打包或外掛隔離推導而來。

## Consequences

Desktop 透過相同啟動與服務路徑繼承 Web 功能。HTTP 監聽歸屬與認證仍屬於應用啟動。Electron 使用報告的 Host 地址，並在就緒前後保留現有 Web 文件。共享 Web 載入頁在 Host 啟動前可用；原生恢復在啟動失敗時仍可用。

使用者選擇的執行時選項、包來源和允許的生命週期腳本可能影響 Host 執行、載入第三方程式碼或造成啟動失敗。共享 Web 管理器負責包操作失敗處理；Electron 為致命啟動失敗保留原生恢復。簽名核心執行時不為使用者安裝的外掛程式碼背書。

驗證需要覆蓋共享 runner、認證 HTTP 資源與 API 傳輸、設定過載、原生目錄選擇、子程序關閉及外掛失敗恢復。安裝後平臺驗收與真實模型 GUI 驗收獨立於單元測試；本記錄不聲稱已測得啟動或傳輸提升。
