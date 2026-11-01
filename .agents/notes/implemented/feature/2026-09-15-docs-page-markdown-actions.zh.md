# Agent Note: 文件站頁面 Markdown 操作

Status: implemented

[English](2026-09-15-docs-page-markdown-actions.md) | 中文

## 問題

讀者需要可見的入口來取得單頁文件的 Markdown。釋出的文字必須保留目前語言和投影后的連結。瀏覽器請求在開發環境中還與 Vite 頁面模組匯入共用 URL，因此將所有 Markdown 請求都作為原文處理會破壞導航。

## 決策

[投影器](../../../../scripts/project-doc-site.ts) 根據釋出 manifest（中繼資料清單）為普通內容頁提供 `rawMarkdownPath`。[主題](../../../../website/.vitepress/theme/index.ts) 將該路徑與站點 base 組合，在正文上方提供複製和檢視操作。目錄頁使用完整的 `index.md` 路由，使相對連結在開發環境和靜態建置中保持相同的位置。首頁重定向和缺失頁面不顯示操作。原文輸出不包含投影中繼資料。

伺服器端渲染的頁面提供原文連結。用戶端掛載後將其替換為複製按鈕和選單，使 MPA 建置及未執行 JavaScript 的頁面保留可用操作。主按鈕直接複製頁面，並透過 `aria-disabled` 和 `aria-busy` 在複製期間保留鍵盤焦點。旁邊的展開按鈕開啟帶圖示、操作標題和說明文字的選單，使常用操作保持可見，並將 Markdown 選項放在一起。選單項支援方向鍵、Home、End 和啟用操作；Escape 將焦點恢復到展開按鈕，外部指標操作和焦點離開會關閉選單。選單按下時保留焦點直至點選執行，也適用於按下控制元件時不轉移焦點的瀏覽器。選單狀態及其外部指標監聽器歸屬於頁面實例。

[開發中介軟體](../../../../website/raw-markdown.ts) 接受帶有顯式 `?dsh-raw=1` 標記的瀏覽器請求，對未釋出的原文路由返回 404。腳本匯入始終交給 Vite。檢視連結在新標籤頁開啟普通原文 URL；複製按需讀取相同的投影正文。生成的 Markdown 檔案攜帶 UTF-8 BOM，因為靜態託管可能省略回應字元集，導致瀏覽器直接存取時錯誤解碼中文等非 ASCII 字元。Fetch 解碼會在複製前移除 BOM。兩種操作都不從渲染後的 DOM 重建 Markdown。

[複製元件](../../../../website/.vitepress/theme/page-markdown-actions.ts) 在點選手勢內呼叫 `clipboard.write`，並提供由 Promise 承載資料的 `text/plain` ClipboardItem。先等待網路會在要求使用者啟用的瀏覽器中丟失該啟用狀態。每個路由和語言組合都有獨立的、帶 key 的元件實例，因此舊寫入無法改變新頁面的回饋。釋放時取消未完成的資料讀取。已經消費資料的系統剪貼簿寫入無法撤回。請求失敗和剪貼簿失敗提供在地化的手動複製指引，成功提示在寫入完成後顯示。被拒絕的寫入可能完全不消費資料 Promise，因此該 Promise 有獨立的拒絕處理器。

## 考慮過的替代方案

**根據瀏覽器地址推導原文 URL。** 簡潔 URL、目錄索引、語言字首和部署 base 使這種方式不如投影器已知的路由可靠。

**將所有 Markdown 請求都作為原文處理。** Vite 將相同的 URL 匯入為 JavaScript 模組。顯式請求標記區分原文取得，同時靜態託管仍可直接返回已生成的檔案。

**先取得正文，再呼叫 `writeText`。** 這種方式可能在 Chromium 中有效，但其他瀏覽器會在網路等待後丟失最初的手勢。由 Promise 承載剪貼簿資料可保留該手勢，無需預取頁面。

## 影響

自動複製接受 `text/markdown` 或 `text/plain` 回應。託管方必須為 `.md` 檔案指定其中一種內容型別；缺失型別和 `application/octet-stream` 會觸發失敗及手動複製指引。白名單還會拒絕 HTML 退回頁面和 JavaScript 頁面模組。自動複製需要瀏覽器在安全上下文中提供非同步 ClipboardItem 寫入 API。寫入不受支援或被拒絕時，檢視連結仍可用於手動複製。頁面複製狀態是臨時狀態，歸屬於單一路由；它不建立 Session 資料或模型請求。

[元件測試](../../../../website/tests/page-markdown-actions.spec.ts) 在所屬目錄中固定在地化的可存取輸出，並驗證延遲讀取、寫入拒絕和導航時的資源清理。[中介軟體測試](../../../../website/tests/raw-markdown.spec.ts) 覆蓋請求分發。兩者都透過單元測試、`docs:check` 和 `doc-sync` 執行。[Mermaid 檢視器決策](2026-09-14-docs-mermaid-viewer.zh.md) 保留獨立的渲染與資源生命週期規則。

**CI 覆蓋缺口。** DOM 測試模擬剪貼簿，不執行原生使用者啟用規則、實際貼上或回應式佈局。因此仍需在開發服務和靜態預覽中進行瀏覽器驗證，覆蓋兩種語言和站點 base。此靜態文件功能不涉及真實模型輪次。
