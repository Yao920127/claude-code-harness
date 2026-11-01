# Agent Note: 保持頁面實例的 Desktop 瀏覽器 webview

Status: implemented

[English](2026-09-20-desktop-browser-webview.md) | 中文

## Problem

iframe 無法提供跨域導航狀態, 也無法顯示拒絕嵌入的站點. 如果 Tab Body 因選中項或容器變化而解除安裝, Electron guest 就會丟失表單、滾動位置與原生 history. 頁面生命週期因此必須獨立於可見性和佈局變化.

獨立的 per-tab 儲存也會阻止同一 Workspace 內相關頁面共享站點登入態。頁面生命週期與儲存需要不同的所有者。

## Decision

Desktop 透過 `ElectronWebViewImpl` 使用 `<webview>`; Web 保留顯式啟用的 iframe 載體. [Sidebar Browser 決策](2026-09-16-sidebar-browser.zh.md)負責共享 Tab 行為與 iframe 限制; 本文負責 Desktop 載體.

[Sidebar 穩定掛載決策](../architecture/2026-09-20-sidebar-retained-tab-layout.zh.md)負責真實 CSS 佈局中的保活工作階段與 Tab 容器。guest 基礎安全設定仍由本文負責。

- `BrowserController` 負責地址命令與可恢復的展示狀態。原生 history 留在 guest 內；真實 URL 與標題觀察更新持久化地址。
- 控制器註冊表按 DSH Session 索引，不依賴呈現繫結的存活期。重新繫結只替換儲存寫入方，不重建頁面。
- `electron/pages.ts` 組裝 Electron 導航提供者和呈現物件. `ElectronWebViewImpl` 負責 guest 租約與原生導航; `ElectronWebviewPresentation` 建立標籤並掛載到 Sidebar 持有的內容容器內.
- Desktop Browser 型別宣告 `keepMounted`。Sidebar 在隱藏和停靠切換時保留其 DOM 祖先，CSS 負責佈局與裁剪。停靠手勢期間停用 guest 指標輸入，Body 內的放置提示使用普通層疊。物理解除安裝會取消未完成的掛載並釋放 guest，之後重新掛載時從已知地址重建。
- tab occurrence 取消、外掛解除安裝與視窗銷燬會釋放 guest。guest 崩潰留下可重試的失敗狀態；重新整理建立新 guest。應用重新啟動展示儲存的標題與 URL，等待顯式恢復；使用者恢復或提交地址之前不建立 guest。不恢復頁面記憶體或原生 history。

標準 `./types` 子路徑透過僅指向宣告檔案的 `types` 條件匯出共享的租約、申請結果、開啟請求與橋接宣告，Desktop 消費方使用 `import type`。這些宣告沒有執行時 default、額外 JavaScript 產物或提前進行的 Host 打包。preload 只暴露限定範圍的操作與回呼，不暴露原始 IPC 或 Electron 物件。

Browser 分別擁有 Host 與 Client 編譯程式。Desktop 和 Host 聚合設定只引用 `tsconfig.host.json`，編譯包根與共享橋接宣告；Client 聚合設定透過 `tsconfig.client.json` 編譯瀏覽器實作。包根 tsconfig 只作為 solution。這樣，依賴生成 `/remote` 宣告的 Client 消費方不會進入 Typert 生成之前的 Host 編譯階段。

### Storage ownership

[共享持久登入決策](2026-10-07-desktop-browser-shared-sign-in.zh.md)取代了本節按 Workspace 劃分的分割槽：現在每個 guest 都使用一個由所有 Workspace 與 Session 共享的持久分割槽，Client 不再解析 Workspace 儲存帳號。本文記錄當初為何選擇按 Workspace 共享而非按 tab 隔離。

關閉 tab 只釋放它的 guest，不清空分割槽的 Cookie 或儲存。Cookie、localStorage、IndexedDB、Service Worker 與快取由 partition 持有，並繼續遵循普通 origin 規則。DOM、原生 history 與 sessionStorage 仍由頁面持有。

### Initial guest policy

只有主應用視窗啟用 `webviewTag`。主程序只接受該視窗應用頂層 frame 發起的 guest 申請，並在放行前驗證一次性租約、partition 與無活動內容的初始 `about:blank` 文件。主程序替換 renderer 提供的偏好：不啟用 Node integration、guest preload、巢狀 webview、plugin、不安全內容、模態對話方塊或拖放導航；sandbox、context isolation 與 Web security 保持開啟。

guest Session 不註冊應用協定，也不繼承應用的認證請求轉發。權限請求與檢查、裝置存取、螢幕捕捉、下載、原生彈出視窗與 HTTP 認證提示全部拒絕。透過檢查且不帶 POST body 的直接 HTTP(S) 彈出視窗請求，透過活動租約路由為新 Sidebar Tab；腳本操作空白視窗和 POST 彈出視窗流程仍不支援。導航接受不帶內嵌憑證的 HTTP(S)；請求過濾拒絕本地檔案、特權協定與已知 DSH Host 地址，包括常見 loopback 別名。這不是通用的私有網路或 DNS rebinding 防火牆。

Desktop toolbar 沒有關閉 sandbox 的開關。實作不增加遠端除錯埠或 browser-use 整合。未來的自動化提供者需要經過認證、限定 target 的 broker，而不是存取全部應用 target。把 target/生命週期控制代碼與導航命令分開的方式，與 Playwright 的 Android WebView 和 Page 物件區分相同；裝置級輸入屬於另一項職責。

## Alternatives considered

**在按可見性掛載的 tab body 內渲染 guest。** 解除安裝會斷開 guest；直接掛載需要 Sidebar 提供 Body 保活與穩定祖先機制。

**在可見與隱藏 DOM 容器之間搬移 guest。** Electron 44 的 `WebViewElement.disconnectedCallback` 會 detach guest 並重置內部實例。保留元素引用或 React key 不能保留該實例，因此父節點保持固定。

**每個 tab 使用獨立 partition。** 這會隔離相關頁面的站點帳號。Workspace 所有權提供所需的共享，同時不共享應用 Session；每個 tab 仍擁有獨立 guest。

**修改活動 webview 的 partition。** Electron 在首次導航前確定 partition。選擇其他隔離粒度需要替換 guest，並明確已有站點資料的處置策略，而不是即時切換屬性。

## Consequences

Sidebar 持有的穩定祖先保留頁面，無需 Browser 自行處理幾何或遮擋。隱藏 guest 保留頁面記憶體，也可能繼續聯網；目前沒有空閒回收策略。可選擇的隔離級別與權限授權 UI 留作獨立工作。

定向測試覆蓋原生導航錯誤恢復、preload 監聽範圍和已遷移的 iframe 行為。這些測試不能確認真實 Electron 的掛載時序、遮擋、焦點、平臺樣式或儲存隔離；這些仍是執行時驗證缺口。本次變更不附帶 GUI 錄影。此實作不構成完整瀏覽器安全策略已經可以釋出的證據。

包內的 Electron 提供者、呈現介面卡與頁面工廠集中在 `src/client/electron/`. 在原生 Electron 測試環境覆蓋 guest 行為之前, 該目錄暫時不參與逐檔案覆蓋率門禁; 其單元測試仍然執行. 共享 Browser 控制器、恢復 UI、iframe 程式碼和 Sidebar 保活仍遵循現有覆蓋率要求.
