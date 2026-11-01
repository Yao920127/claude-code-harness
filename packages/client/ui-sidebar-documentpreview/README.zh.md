---
description: "右側 Sidebar 的文件預覽：共享檔案載入與控制元件，可選 Markdown、程式碼、圖片、PDF、Office 和 HTML 渲染器，並以純文字後備。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-documentpreview

[English](README.md) | 中文

## 概述

在右側 Sidebar 預覽檔案，並切換已註冊的渲染器。Markdown 和程式碼支援分頁文字；PDF、HTML、常見圖片和表格接收完整位元組；未知副檔名使用純文字。Word 與 PowerPoint 文件在本地轉換為 PDF；表格在瀏覽器內開啟。tab 提供檔案狀態、渲染器選擇、換行以及自動或手動重新載入。外掛可在頭部和不支援預覽的空態中新增本地開啟控制元件。

## 目錄

- [註冊了什麼](#what-it-registers)
- [地址](#addresses)
- [怎麼讀](#how-it-reads)
- [Excel 預覽](#excel-preview)
- [文字編輯](#text-editing)
- [Office 預覽](#office-preview)
- [導航](#navigation)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="what-it-registers"></a>
## 註冊了什麼

- **型別** —— `ctx.sidebarRightTabs.register(...)`，id 為 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`（這個實作在 tab 系統中的身份，也是其正文註冊所用的鍵），kind `text`，pattern `dsh-resource://file/**`，檔位 `fallback`。`canOpen` 只接受 Session 地址，其中路徑可為相對或絕對路徑；不認領裸 `absolute` 地址。在 `extension` 或 `builtin` 檔以更窄 pattern（比如 `*.png`）註冊的型別接走那些地址；其他受支援檔案落到這裡。整個地址就是內容身份，所以不同目錄下同名的兩個檔案、或同一路徑在兩個工作階段之下，是兩個 tab；解碼後的 basename 是 tab 標題，keyed slot `sidebar.right.pane.tab.title` 會在標題前放置按副檔名選擇的 `FileTypeIcon`。
- **正文** —— keyed slot `sidebar.right.pane.tab`，鍵為型別的 id。固定頭部在可用時顯示 Host 的絕對路徑，否則顯示請求路徑；共享的 [`PathLabel`](../ui-primitives/README.zh.md#component-catalog) 弱化目錄顏色，以左側漸隱保留被裁剪路徑的尾部字元，並在懸停時展示完整值。有多個受支援的渲染器時才顯示下拉選單。僅文字相容的原始檔提供純文字選項；只有一個渲染器時不顯示檢視器控制元件。已知的二進位制容器字尾沒有註冊渲染器時，在路徑頭部下方顯示檔案型別圖示和不支援預覽的說明，並且不會發起讀取。兩個 Session 作用域的 list 子 slot 在檔案中繼資料報出 Host 路徑後把目前檔案交給其他外掛，owner prop 為 `absolutePath`：`sidebar.right.tab.document.actions` 在每個顯示頭部的狀態裡渲染在頭部自有控制元件之後；`sidebar.right.tab.document.unpreviewable` 渲染在不支援預覽的空態裡，以及可讀但本預覽無法渲染的檔案（`not-text`、`too-large`）的空態裡，佔據原本放重試的位置；載體或未分類的讀取失敗仍保留重試，不存在或非普通檔案的路徑只給說明。兩者已釋出的佔位者都是 [`ui-open-in-app`](../ui-open-in-app/README.zh.md)。僅當所選渲染器宣告 `wrap: true` 時顯示換行開關；圖示表示點選後切換到的模式，該偏好按 tab 儲存，初始開啟。重新載入仍在此頭部，不放入 Sidebar 的 tab 條。自動重新整理預設開啟；獨立開關暫時隱藏，狀態、文案、樣式與切換邏輯保留。正文貼合格的每條邊，各渲染器自行提供內容留白，並可擁有內部滾動區。這與 Files tab 右側預留 2px 捲軸間距的佈局有意不同：Preview 使用格的完整寬度，使貼邊 HTML 與程式碼滾動區終止於格的邊緣。
- **共享載入與檢視狀態**，工作階段作用域、按 tab id 分桶。store 持有累計頁或完整位元組、讀取與觀察版本、待處理 Resource 變化、自動重新整理狀態、載入/失敗狀態、渲染器選擇、滾動位置、換行和已回應的導航 revision。普通 inject face 呼叫 Remote 讀取，並經宣告的 store action 寫入。重新載入和載入模式變化會淘汰舊請求；tab 的中止訊號清理其狀態。

文件實作在 `ctx.documentPreviews.register({ id, extensions, binaryExtensions?, priority, title, loading, wrap? })` 註冊中繼資料，並以相同 `id` 向 keyed、Session 作用域的子 slot `sidebar.right.tab.document` 註冊正文。`binaryExtensions` 列出 `extensions` 中不可按文字閱讀的字尾，這些字尾不提供純文字選項。兩處註冊都由 effect 持有，透過 `ctx.slots.inject` 等待子 slot。正文接收 `resourceAddress`、`content`、`wrap`、`scrollportRef`、`addResource`、`setResources` 和標準 `useTabInfo`/`useResource` 掛鉤。依賴成員由 tab 持有的 `ResourceGroup` 管理；替換依賴始終保留根 Resource。內部滾動元素掛載 `scrollportRef`；解除安裝時恢復共享正文的滾動職責。註冊表保留所有匹配備選：`extension`（預設）優先於 `builtin`，隨後按更長的字尾、再按註冊順序排列。所選實作仍可用時，下拉選擇保持不變。HTML、SVG 和未匹配的副檔名保留純文字退回，與載入方式無關。

`loading: 'text-pages'` 和 `'bytes-complete'` 使用共享檔案讀取器。選擇 `'renderer'` 時，所選正文在讀取任何位元組前掛載，並接收 `content: { kind: 'renderer', revision, loaded, failed, reload }`。其注入 face 負責內容載入、錯誤、store 更新和取消。`loaded(version)` 記錄已展示的源版本並結束載入。`failed()` 結束載入但不記錄成功版本，使後續檔案變化可以重試；已被替換的 revision 所發出的報告會被忽略。`reload()` 增加 revision，正文據此取消並替換目前請求。正文也在解除安裝和 tab 關閉時取消請求，將已完成內容保留在自己宣告的 tab store 中，並在 tab 結束時釋放。[Office 預覽](#office-preview) 使用此模式，轉換後的位元組和字型中繼資料不會進入共享檔案 store。

<a id="addresses"></a>
## 地址

tab 使用 `fileAddressFor` 建構的 Session 地址，攜帶相對或絕對路徑。`hostFileOf(address)` 僅從地址取得 Session，不接收外部 Session 參數，也不借用目前或 Tab Session。Host 透過 Session 檔案系統解析檔案及關聯路徑，由該後端控制讀取權限。任何 UI（包括 Global 元件）都共享同一完整地址的中繼資料。[Workspace Files README](../../api/workspace-files/README.zh.md) 定義這些規則；渲染器選擇不改變導航地址。

全部文字分頁載入完成後，Markdown 圖片透過已授權驗證的 `/api/file` 路由讀取絕對檔案路徑，以及相對於源文件所在目錄的路徑。相對圖片等待 Host 返回文件絕對路徑。URL 轉義只解碼一次；查詢參數與片段字尾不計入檔名。HTTP(S) 圖片保留原始 URL，載入失敗的圖片顯示 alt 文字。本地圖片要求應用基址為 HTTP(S) URL；圖片檔案不加入自動重新整理依賴。

<a id="how-it-reads"></a>
## 怎麼讀

Web 和桌面端均透過程式碼工作工具選擇 HTML 預覽策略。渲染器從外掛組裝層接收 `interactivePreview`。關閉時，將經 DOMPurify 清理的完整靜態文件放入不授予沙箱權限的 iframe：CSP 禁止腳本、外部資源、連線、表單和巢狀框架；所有 `href` 和 `xlink:href` 屬性、重新整理指令及宣告式 Shadow DOM 均在重新解析前被移除。行內樣式和 data 圖片仍可顯示，不讀取關聯檔案。開啟時使用下述支援腳本的 Blob 預覽。切換模式會解除安裝之前的框架並中止其待處理關聯檔案讀取。靜態預覽釋放 CSS/JS 的 Resource 訂閱，根檔案繼續監聽。其他文件格式保持各自策略。

兩種 HTML 模式均將 iframe 初始名稱設為 `dsh-sidebar-html-<tab-id>`，供 Desktop 快捷鍵路由關聯目標。這種關聯不授予預覽存取父文件的權限。

正文透過 `useTabInfo().tab` 讀取記錄、導航和生命週期。`useResource<'file'>(tab.contentId)` 提供中繼資料，普通 inject 回呼提供內容讀取：

- 資源快照僅包含 `status`、`value` 和 `failure`；`value` 是 `WorkspaceFileStat` 中繼資料。提供者可用後，內容讀取無需等待首個中繼資料幀。觀察失敗優先於 Preview 的變更提示顯示；中繼資料不可用時保留已載入內容。
- **文字頁** —— 純文字、Markdown 和程式碼透過 inject 回呼呼叫 `remote.workspaceFiles.read(sessionId, path, { offset }, signal)`。首次掛載讀取第一頁；滾動到正文末尾或點選 **載入更多** 會讀取下一頁，直到 `eof`。owner 以 `{ kind: 'text', text, pages, eof }` 提供累計字首，包含原始碼偏移和行數。Markdown 和程式碼增量渲染此字首，不把每頁當成獨立文件。第一頁之後到達的更新版本頁會使讀取從頭開始，避免混合版本。尚無內容時，失敗會以檔案型別圖示、說明和該失敗對應的出路（重試、unpreviewable 子 slot，或什麼都不給）填滿正文；較晚的失敗保留已有內容並在其下提供重試。
- **完整位元組** —— PDF、HTML、常見圖片和表格呼叫 `remote.workspaceFiles.readBytes(sessionId, path, {}, signal)`。二進位制 Remote 直接返回 `data: Uint8Array<ArrayBuffer>`，供 `{ kind: 'bytes', data }` 使用。Host 的 `maxFileBytes` 上限拒絕超大檔案，不截斷。PDF 和表格渲染器在傳給 Worker 前複製保留的位元組，使 Preview 緩衝區仍可使用。位元組僅儲存在臨時檢視狀態中，絕不進入持久佈局或 Session JSONL。載入模式變化會淘汰先前結果。
- **重新載入** —— 手動重新載入僅讓目前 Preview tab 透過自己的 Remote 回呼重讀，保留滾動偏好並淘汰舊請求。`ResourceGroup` 成員變化後，自動重新整理使用相同回呼。各成員首次中繼資料僅建立基線，不觸發重新載入或首讀版本對帳；後續在讀取期間收到的變化仍會留待下一次重新整理。讀取既不重新整理共享中繼資料，也不清除其它 tab 的提示。

開啟程式碼工作工具時，HTML 以貼合正文四邊的 Blob iframe 執行，沙箱屬性嚴格為 `sandbox="allow-scripts"`，不含 `allow-same-origin`；腳本無法存取父應用的源或檔案讀取介面。渲染器透過注入的 Remote 回呼，載入直接宣告的相對 `.js` 經典腳本和 `.css` 樣式表；固定安全上限為單個資源 4 MiB、總計 32 MiB、64 個不同資源。Host 程式碼解析關聯路徑，帶 `baseFile` 的 `readBytes` 返回原生位元組。依賴 Resource 在讀取返回後加入，使用返回的 `absolutePath`，失敗時則使用字串型別的 `error.details.path`；沒有 Host 路徑時，Client 不自行猜測。在渲染器內部，base64 僅用於把 iframe 引導載荷嵌入腳本文字。`<base href>` 將依賴解析交給瀏覽器，HTTPS 資源也由瀏覽器處理。本地模組 import、CSS `url()`/`@import` 和動態 `fetch` 不使用 Host 檔案存取。讀取失敗、無效 UTF-8 或超出上限都使預覽失敗，不釋出部分資源包。替換或解除安裝文件會釋放其 Blob URL。

PNG、JPEG、GIF、WebP、BMP、ICO 和 SVG 透過 Blob URL 在 `<img>` 靜態圖片上下文中渲染，帶 12px 內邊距和圓角。圖片預設適應寬度，但不會放大小於面板的內容；100% 使用圖片的固有 CSS 畫素寬度。共享縮放控制元件可產生橫向和縱向滾動，但不提供拖拽平移。縮放不會替換 `<img>` 或 Blob URL，因此動畫圖片會繼續播放。點陣圖超過固有尺寸後可能變虛，SVG 則繼續使用瀏覽器的向量渲染路徑。SVG 標記絕不進入應用 DOM 或 iframe，因此其中的腳本無法執行，也無法存取父頁面。替換或解除安裝圖片會撤銷其 Blob URL。

共享文案來自 `sidebarDocumentPreview`；各內建渲染器擁有自己的在地化標籤。PDF 與轉換後的 Office 預覽在淺色模式下使用冷調淺灰底色，在深色模式下使用啞黑底色，頁面帶有輕微陰影並保留文件原色。PDF 與圖片預覽共用浮動控制元件，提供**適應寬度**、25%、50%、100%、150% 和 200% 選項，並在 25%–400% 固定範圍內按 25% 逐級縮放。適應寬度是預設模式並跟隨面板尺寸；100% 表示 PDF 的 96 DPI 頁面尺寸或圖片的固有 CSS 畫素尺寸。在精細指標裝置上，控制元件初始隱藏；指標進入底部 72 個 CSS 畫素時向上滑入，離開 420 ms 後向下退出；控制元件懸停、鍵盤焦點、選單展開和手勢進行期間保持顯示，無 hover 的裝置則始終顯示。Chromium 將 macOS 觸控板捏合對映到與 Ctrl+滾輪相同的即時指標錨定路徑；控制元件同步顯示手勢比例，靜止後的值在正文重新掛載後繼續保留，直至 tab 關閉。HTML 預覽不顯示縮放控制元件。縮放穩定或適應寬度發生變化後，視口附近的 PDF 頁面按最終縮放比例乘以裝置畫素比重繪。新點陣圖完成前保留原有畫面和可選文字層；螢幕外的頁面在接近視口時更新。

首次讀取及渲染器準備（包括 Office 轉換）共用居中的 28px ongoing `StateDot`，下方顯示在地化狀態文字“文件渲染中...”。狀態向輔助技術提供相同的名稱，並遵循減少動態效果偏好。追加文字頁時使用緊湊的行內轉圈，同時保留已顯示的內容。PDF 正文僅在 PDF 預覽掛載時載入包內 `client.pdf.js` chunk；PDF.js、Worker 原始碼和內嵌支援資料不會進入啟動 `client.js`。PDF 與轉換後的 Word/PowerPoint 頁面組成縱向序列，頁間距與四周留白均為 12px，露出目前主題的文件背景色；適應寬度會預留此留白，頁面在接近視口時惰性渲染；未渲染的頁以安靜的 3:4 佔位塊保持位置。PDF.js 官方 TextLayerBuilder 在與畫面重合的文字層上管理選區邊界和複製文字規範化。配套樣式不高亮空白換行；對齊同時考慮 PDF 頁面單位、頁面旋轉與視口寬度變化，頁面釋放時取消兩層渲染。純圖片 PDF 不包含可選取的文字。程式碼預覽使用 tertiary 色的語言名稱和帶提示的複製圖示；換行仍由文件工具欄控制。預設顯示原始碼行號，但複製文字不包含行號；純文字與程式碼使用相同字號和行高。程式碼直接坐在分欄自身的背景上，而不是工作階段卡片的填充色；複製條與佔滿剩餘高度的內部滾動區相鄰，因此橫縱捲軸都從複製控制元件下方開始。

<a id="excel-preview"></a>
## Excel 預覽

直接在瀏覽器中開啟 `.xlsx`、`.xls`、`.csv` 和 `.tsv`，支援工作表標籤、單元格選擇、複製和只讀公式欄。XLSX 保留字型、純色填充、邊框、數字格式、富文字、合併單元格、行列尺寸、隱藏行列及工作表，以及凍結標題。XLS 保留已儲存的值、公式、數字格式、合併及可用的行列中繼資料；不支援字型、邊框和凍結窗格。工作簿顯示已儲存的公式結果而不重新計算；缺少的結果保持為空，公式欄旁的緊湊提示會標記顯示結果可能不完整或不準確的工作簿。工作簿檢視填滿預覽面板，並隨面板尺寸變化自動調整，無需重新載入工作表或選擇狀態。工作表標籤從左側邊緣開始排列；標籤溢位時可用觸控板橫向手勢或左右按鈕滾動，縮放控制元件獨立佔位。表格控制元件在應用的明暗兩種主題下均保持淺色背景和深色文字。觸控板的畫素位移可同時平移表格的橫縱兩個方向，包括斜向平移，移動距離跟隨手勢；凍結標題保持固定。到達工作表邊緣後反向移動，仍會保留下一次手勢的位移。隱藏選區統計欄及無效的工作表選單箭頭。凍結標題在滾動時保持固定，不顯示凍結分隔線和拖拽條。表格預覽不呼叫 Office 轉換服務。

XLSX 預覽在解析前從記憶體副本中移除 DrawingML 部件，並忽略工作表的繪圖引用。原檔案和工作表 XML 保持不變。表格上方的提示列出實際檢測到但未展示的圖表、圖片、形狀和條件格式，並建議使用系統應用開啟工作簿。未檢測到這些內容的檔案不顯示此提示；公式提示保持獨立。

CSV 和 TSV 預設使用表格檢視器，也可選擇純文字；CSV 還提供帶語法高亮的 Code 預覽。兩者分別以逗號和製表符分隔欄位，支援引號內分隔符、轉義引號、多行欄位、空欄位和不等長行。首行仍作為資料。值保持為字面字串，包括前導零、日期、布林值和類似公式的文字。文字檔案支援 UTF-8 或帶 BOM 的 UTF-16；無效編碼會顯示轉換提示。引號欄位格式錯誤會使表格預覽失敗，不會靜默丟棄資料。

在同一個 `ui-sidebar-documentpreview` 條目上設定 `excel`。這些限制補充 Host 的完整檔案讀取限制，但不限制瀏覽器程序記憶體或解壓分配量。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `excel.maxBytes` | `16777216`（16 MiB） | 最大原始檔位元組數 |
| `excel.maxCells` | `250000` | 所有工作表矩形區域的最大合計單元格數，包含空單元格 |
| `excel.timeoutMs` | `15000` | 解析 Worker 的最長存活時間，單位毫秒 |

惰性 Excel chunk 打包 FortuneSheet、用於 XLSX 的 ExcelJS、用於 XLS 的 SheetJS CE，以及用於 CSV/TSV 的 PapaParse。包內獨立於 React 的適應層將解析結果直接對映為 FortuneSheet 單元格，並複用單元格格式化和初始選區。第三方許可證文字保留在釋出的 chunk 中；SheetJS CE 保留其 Apache-2.0 條款。每次解析擁有一個獨立可釋放的 Worker，並傳輸所保留檔案位元組的副本；內容替換、解除安裝、失敗或超時都會終止該 Worker。樣式表僅作用於 Excel 預覽區域。暫不支援圖表、繪圖/圖片、資料透視表、條件格式、編輯、重新計算和匯出；字型可用性、Excel 列寬近似和主題色明暗近似會影響保真度。超連結顯示為文字，不載入目標地址。ExcelJS 會再次解碼 XLSX 字串公式快取結果中的實體寫法；儲存的字面文字 `&lt;` 會顯示為 `<`。

只讀公式欄以單行按字面顯示公式和單元格文字，長內容可橫向滾動。複製時保留 HTML 表格，並轉義單元格內容，包括已儲存的公式結果。[FortuneSheet 補丁決策](../../../.agents/notes/implemented/feature/2026-09-16-browser-excel-preview.zh.md)說明升級依賴時保留這些行為與工作表選區的要求。

固定版本的 [ExcelJS 補丁](../../../patches/exceljs@4.4.0.patch)透過包內關係解析工作簿、樣式、共享字串、工作表、批註、Table 和 VML，支援絕對及相對目標，以及 ASCII 大小寫等價的部件名，並按名稱空間 URI 識別 SpreadsheetML 和 VML 名稱。Strict OOXML 的 SpreadsheetML 和關係 URI 對映到相同的已支援預覽功能；這不代表完整支援 Strict 標準。XML 部件支援 UTF-8 及兩種位元組序的 UTF-16；CDATA 按字面文字讀取。繪圖和條件格式提示按關係查詢內容，不依賴部件目錄。未被引用的 `xl/drawings/*.xml` 部件及其關係檔案也會被移除，但不會產生提示；批註 VML 保持不變。缺失引用部件或存在大小寫等價的歧義 ZIP 條目會使預覽失敗。解析保留批註和 Table 中繼資料，但預覽器沒有專門展示它們的控制元件。補丁同時覆蓋 Node 原始碼和 `dist/exceljs.js`，瀏覽器入口選擇已修補的 bundle。升級依賴時必須保留兩個入口的行為，並透過[獨立寫入器迴歸測試和 fuzz 診斷](tests/fuzz/README.zh.md)。

<a id="text-editing"></a>
## 文字編輯

純文字檢視器能顯示的每個檔案，都會在檢視器選單中提供**編輯**，並在標頭提供鉛筆切換按鈕；該選項從不自動選中，因此檔案總是先以預覽開啟。再次點按已按下的切換按鈕會回到自動選擇的檢視器。編輯器是 CodeMirror，在某個 tab 第一次選擇它時載入，並按檔名為常見語言提供語法高亮。它透過 `workspaceFiles.readBytes` 載入完整檔案，在 tab 保持開啟期間保留其未儲存文字，並透過**儲存**或 Mod-S 呼叫 `workspaceFiles.write` 儲存，同時傳入載入文字時的版本。檔案在載入後被修改時，儲存會被拒絕，提示提供**重新載入檔案**或**仍然儲存**；編輯器持有未儲存文字時磁碟上的變更會顯示相同的選項，文字已儲存時的變更則直接重新載入。標記為 `textAlternative` 的註冊會在提供純文字的地方加入檢視器選單，排在所有其他選項之後。

<a id="office-preview"></a>
## Office 預覽

將 `.doc`、`.docx`、`.ppt` 和 `.pptx` 開啟為 PDF 預覽，使用與 PDF 檔案相同的載入狀態、縮放控制元件、取消和文字選擇能力。[Host 提供者](../../document/office-to-pdf/README.zh.md)負責本地轉換，併為其他消費者保留電子表格轉換 API。受支援的無效檔案、轉換失敗和超時會顯示在地化訊息。缺少 Host 服務時顯示設定引導。

[Web bundle](../../bundle/web-app/README.zh.md) 以 `ui-sidebar-documentpreview` 掛載本包。透過該條目的 `office` 設定設定臨時 Office 快取；[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-ui-sidebar-documentpreview)定義可接受的值。設定注入到每個頁面；修改 YAML 後重新載入瀏覽器頁面。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `office.maxCachedEntries` | `8` | 最多保留的已完成 PDF 數量 |
| `office.maxCachedBytes` | `67108864`（64 MiB） | 最多保留的二進位制 PDF 位元組數，按緩衝區 `byteLength` 計算 |
| `office.maxPending` / `office.maxReaders` | `8` / `32` | 未完成轉換 RPC 數量 / 含中繼資料查詢的讀取方數量 |

開啟 Office 檔案時按需請求轉換。每次讀取都先檢查渲染 generation 和已授權的原始檔中繼資料，再共享進行中的轉換或複用成功的 PDF。快取以渲染 generation、Session、原始檔絕對路徑和源版本作為身份；透過淘汰最久未使用的 PDF，使保留量符合兩項限制。失敗和超過位元組限制的 PDF 不會被保留。轉換後 PDF 的返回渲染 generation 與快取身份一致時，才會保留該 PDF。取消一個讀取方後，共享轉換會繼續執行，直到最後一個讀取方離開。連線重置會清空快取位元組並取消待完成讀取；外掛解除安裝還會等待未結束的請求完成。PDF 從不持久化；傳輸字串、解碼儲存和 PDF.js 渲染記憶體不計入快取限制。

後臺請求為前臺工作保留最後一個在途請求槽和讀者槽；將任一限額設為一會拒絕後臺讀取。渲染器替換後會重新執行一次代次查詢與授權檢查。重試期間再次替換會顯示在地化的繁忙提示。

目前 Office 預覽缺失字型時，文件工具欄的重新整理按鈕前顯示黃色圓角三角形警告。懸停或鍵盤聚焦時顯示缺失字型數量；點選後開啟錨定字型列表。按 Escape、點選關閉或點選外部會關閉列表，警告圖示和文件位置保持不變。重新載入會關閉舊詳情；沒有缺失字型的預覽不顯示警告。不保留已讀或關閉提示的狀態。

<details>
<summary>Office 實作——點選展開</summary>

Office 註冊、載入、快取和字型提示位於 `src/client/office/`。注入的 Office face 透過已宣告的 store action 寫入轉換後的 PDF 位元組、字型中繼資料和失敗。Office 正文觸發載入，將取消繫結到自身生命週期，並宣告巢狀 PDF slot，複用惰性 PDF 正文及其 tab 閱讀狀態。keyed slot `sidebar.right.tab.document.action` 將渲染器操作放在重新整理按鈕前。Office 操作與正文共享 store，僅讀取目前 revision 的字型中繼資料。Host 渲染器缺失時，註冊仍然可用；可選的 `remote.officeToPdf` 和 `remote.workspaceFiles` 注入提供轉換與版本檢查回呼，移除後恢復不可用提示。註冊和 tab 狀態保留都遵循 effect 生命週期。[轉換服務](../../document/office-to-pdf/README.zh.md)擁有 Host Remote 方法，由 `api/remotes` 掛載。

Office Remote 透過 Connection 的 multipart 二進位制傳輸返回原生 `Uint8Array` PDF。渲染器以只讀方式借用保留的位元組，並在傳給 Worker 前複製。

頁面重新整理快捷鍵複用所選預覽的過載操作，包括舊請求失效與滾動位置保留。頭部過載 Tooltip 和 ARIA 組合隨有效快捷鍵繫結更新。

</details>

<a id="navigation"></a>
## 導航

`ctx.sidebarRight.openResource(address, { params: { line } })` 透過 `file` 參數攜帶 1 起算的原始碼行號。在 `text-pages` 模式下，owner 順序載入到該行或 EOF。純文字與程式碼渲染器提供原始碼行錨點；Markdown 不提供。所選渲染器沒有錨點時，導航保持待處理；使用者切換到純文字或程式碼後執行。程式碼導航直接滾動內部原始碼視口。位元組模式渲染器不消費原始碼行導航。每個完成的導航 revision 只回應一次。不帶 `revealIfOpened: false` 開啟同一檔案時聚焦已有 tab，並送達新 revision。

<a id="model-experience"></a>
## 模型體驗

無，因為預覽是純瀏覽器側的檢視器，不註冊工具、提示詞段或工作階段事件。

#### KV Cache 影響

無直接影響；使用者在這裡讀到的東西永不進入模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>
- **只能編輯純文字。** **編輯**選項透過 `workspaceFiles.write` 儲存工作區內的 UTF-8 文字檔案；Office、PDF、表格和圖片檔案仍只能預覽，檢視器不共享搜尋介面，目錄地址以 `not-regular-file` 失敗。未知副檔名使用純文字讀取，仍受其 UTF-8/NUL 檢查限制。關閉帶有未儲存修改的 tab 會直接丟棄這些修改，不會詢問。
- **Office 轉換限制。** 預覽不啟動原生 Office 編輯器，也不下載引擎。二進位制 `.doc` 和 `.ppt` 檔案不返回缺失字型診斷。轉換保真度與資源限制由 [LibreOffice 提供者](../../document/office-to-pdf/README.zh.md)負責。
- **文字順序分頁，完整檔案受限。** 定位到較深處的原始碼行需要先載入此前各頁；PDF、HTML 和圖片必須取得 Host `maxFileBytes` 上限內的完整結果。
- **PDF 柵格分配有上限。** 每頁點陣圖最多為 16,777,216 畫素；超大頁面或高畫素密度螢幕上的高比例縮放仍可能低於裝置解析度。
- **位元組檢視不恢復滾動位置。** PDF、HTML 與圖片的渲染器重新掛載或重新載入時可能回到頂部；固定 PDF 與圖片縮放可產生橫向滾動，HTML iframe 的滾動屬於其不透明瀏覽上下文。
- **本地 HTML 依賴集合有限。** 只打包直接引用的經典 `.js` 腳本和 `.css` 樣式表。瀏覽器解析的資源仍受瀏覽器源與網路規則限制；iframe 不獲得執行時檔案讀取橋接。
- **滾動寫入未節流。** 每次滾動事件都把偏移記進 store；行塊已 memo 化，於是由此引發的重渲染交還給 React 的是同一批元素。
- **PDF chunk 載入失敗後需要重新整理頁面。** React 會在頁面生命週期內快取被拒絕的 lazy import；已載入正文中的普通 PDF 開啟或渲染失敗仍可重試。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。渲染器中繼資料、文件載入和檢視狀態歸本地註冊表與宣告的 Slot store 所有，沒有可比對的獨立執行時來源；註冊釋放和 tab 生命週期由行為測試覆蓋。
