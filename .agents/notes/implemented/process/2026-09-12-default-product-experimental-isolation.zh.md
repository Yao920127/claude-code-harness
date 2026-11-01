# Agent Note: 將實驗包隔離在預設產品之外

Status: implemented

[English](2026-09-12-default-product-experimental-isolation.md) | 中文

## Problem

在 npm 上公開可用不意味著實驗包屬於預設產品。直接 manifest 檢查會漏掉依賴別名、傳遞安裝路徑、僅宣告為開發依賴的執行時匯入，以及由設定載入的外掛。釋出 smoke 會一起安裝所有 tarball，因此消費者目錄中存在實驗包並不能說明預設產品需要它。

## Decision

[`verify-default-product-isolation`](../../../../scripts/verify-default-product-isolation.ts) 在靜態 CI 和包 hygiene 中執行。它從所有應用與 Python runtime 出發，遍歷執行時依賴、可選依賴和 peer，解析 workspace 與 npm 別名，並按 npm 字首或儲存庫目錄識別實驗包。釋出 denylist 的成員關係不影響此分類。啟動器在 `OPTIONAL_BUNDLES` 裡點名的組合包是唯一宣告的例外（[隨安裝提供的可選組合包](2026-09-15-shipped-optional-bundles.zh.md)）。

原始碼檢查還讀取所選包的執行時匯入、安裝自帶的 profile bundle 列表、bundle patch、隨產品提供的 Agent preset，以及宣告的設定樹。它使用生產 patch 解析器載入預設 Web 各層，並使用啟動時的同一個 patch 引擎完成組合。檢查物件包括最終 entry 和應用 patch 後的 Include 樹，因此僅按 id 覆蓋 group 的 patch 也無法隱藏替換後的外掛。停用的外掛行仍納入檢查；普通外掛設定資料不會被解釋為另一個 Loader entry 列表。預設入口缺失會使檢查失敗。

預設 Web 原始碼圖從實際 HTML 入口中的 module script 出發，包括內聯模組和本地引用的 Worker 入口。獨立的實驗預覽可以存在而不加入此圖；預設入口匯入它時檢查會失敗。原始碼中的 Cordis 設定檔引用會將 Desktop patch 納入同一證明。

[Host 啟動 smoke](../../../../apps/cli/tests/profiles/web/tests/web-default-isolation.expected.e2e.ts) 在獨立 Harness home 中透過建置後的 `dsh` 匯出啟動真實 Web profile。測試專用觀察器在就緒後讀取實際 Loader 行、註冊的 fiber、註冊回呼所屬模組和 Node 已載入模組快取。[Chromium smoke](../../../../apps/web/tests/default-product-isolation.e2e.ts) 啟動實際交付的頁面，讀取真實 Client Loader、registry 和模組快取，並要求所有交付 entry 均已啟用。兩項檢查都會拒絕其顯式負例命令掛載的真實實驗外掛。現有 expected-output 和 Web CI lane 在完整建置後執行這些測試。

建置輸入檢查覆蓋瀏覽器打包的兩個階段。[Client preset](../../../../packages/client/tsdown.client.ts) 在原始路徑被摺疊進 `lib/client.js` 前，拒絕非實驗輸出中的實驗輸入。[Web 圖檢查](../../../../scripts/web-product-bundle-isolation.ts) 從 `index.html` 沿真實 Vite 輸出邊遍歷，覆蓋延遲載入 chunk、Worker、CSS 依賴和資源。獨立 preview 不屬於產品圖。缺少必需的模組或資源輸入記錄會使建置失敗；失敗的 Web 建置無法產生成功的完整 Client 建置記錄。Notices 生成器透過顯式分析標記檢查其部分依賴圖，該標記要求停用輸出寫入。其他記憶體內產品建置仍執行這些檢查。

[`verify-packed-install`](../../../../scripts/release/verify-packed-install.ts) 從 `@deepseek-ai/dsh` 遍歷已安裝依賴圖，透過解析後的 manifest 名稱識別別名和外部傳遞依賴。開發依賴以及安裝在產品旁邊的不相關 tarball 不參與遍歷。缺失必需依賴會失敗；允許省略可選依賴，但其名稱不得指向實驗包。

此檢查執行現有的[實驗包依賴隔離規則](../architecture/2026-08-18-experimental-agent-teams-packages.zh.md)。[釋出策略](2026-09-12-experimental-publication-denylist.zh.md) 獨立決定顯式消費者可以安裝哪些實驗包。

## Alternatives considered

**只檢查直接依賴名稱。** 別名、執行時原始碼匯入和設定載入的外掛可以繞過該檢查。

**拒絕任何已安裝的實驗 tarball。** 釋出 smoke 有意安裝整個釋出族，包括可選啟用的包。只有預設入口的依賴圖能夠回答這些包是否成為產品依賴。

**將全部 Web 原始碼視為預設入口。** 即使預設 HTML 和執行時匯入從未到達獨立的實驗預覽，這也會錯誤拒絕它。

**只檢查最終 Vite 模組路徑。** 穩定的 `lib/client.js` 路徑可能包含前一階段從實驗包打入的程式碼。每個打包階段都必須檢查實際輸入。

## Consequences

實驗包可以釋出而不加入預設安裝或組合。原始碼、最終組合、建置輸入、安裝依賴和執行時 registry 檢查提供相互獨立的證據。SDK 的[原始碼啟動相容 patch](../../../../apps/cli/src/sdk-source.cordis.patch.yml) 透過計算出的檔案路徑選擇，不在靜態設定發現範圍內。執行時 smoke 觀察啟動和 Client 啟用；它們不替代後續每條使用者觸發路徑的測試，也不替代顯式安裝的 profile 擴充功能測試。
