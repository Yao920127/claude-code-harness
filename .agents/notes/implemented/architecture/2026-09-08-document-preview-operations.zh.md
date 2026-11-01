# Agent Note: 文件預覽與檔案地址

Status: implemented

[English](2026-09-08-document-preview-operations.md) | 中文

## 問題

檔案預覽器需要不同的載入策略，同一副檔名也可能對應多種實作。變更流無法同時表達按需讀取而又不把即時資料與可呼叫能力混在一起。HTML 依賴還需要 Host 的檔案系統授權和路徑解析，而非瀏覽器的目前目錄。

## 決策

Document Preview 將資源觀察與內容讀取分開。[資源模型](2026-09-05-client-resource-model.zh.md)只按地址共享觀察：`source(address)`、`pin(address, signal)` 和提供者的 `open(address, { signal })` 均不攜帶消費 Session。提供者返回 `AsyncIterable<RemoteResult<ResourceProtocolMap[P]>>`；`useResource` 只暴露 `{ status, value, failure }`。持有隻控制觀察的啟停，不控制底層檔案或 Session 的生滅。內容透過普通注入的 Preview 回呼讀取。

[Workspace Files](../../../../packages/api/workspace-files/README.zh.md) 保留 Host 的行讀取、位元組視窗、有上限的全文讀取和相對另一檔案目錄的有界讀取。Client `file` 提供者只觀察 `stat` 與 `changes`，`ResourceProtocolMap.file` 直接為 `WorkspaceFileStat`。Host 透過 Session 檔案系統解析每條路徑；檔案讀取繼承該後端的讀取權限，目錄列舉與變更觀察仍限定於工作區。

可讀取的檔案使用 `dsh-resource://file/session/<sessionId>/<path>`。路徑可以相對工作區，也可以是絕對路徑；編碼後的絕對路徑保留前導斜槓。`fileAddressFor` 始終生成這種 Session 地址。提供者與 Preview RPC 只從該地址取 Session，不取目前選擇、首個持有者或 tab 所屬 Session。不帶 Session 的 `absolute` URI 無法讀取；提供者報告 `workspace-file/unknown-workspace`。Session 授權是檔案協定規則，不是額外的 Resource 身份。

[Document Preview](../../../../packages/client/ui-sidebar-documentpreview/README.zh.md) 負責格式選擇和載入策略。中繼資料透過 `ctx.documentPreviews` 註冊；元件單獨註冊到 keyed `sidebar.right.tab.document` Slot。擴充功能註冊優先於內建註冊，其次比較字尾長度和註冊順序。工具欄列出受支援的候選，按 tab 記住手動選擇。未知副檔名及文字相容的渲染器仍可使用純文字。文字相容性由註冊的二進位制字尾決定，與載入方式無關；HTML 和 SVG 不屬於二進位制字尾，保留原始碼檢視。只有一個候選時不顯示檢視器控制元件。註冊宣告為二進位制的字尾不提供純文字；已知二進位制字尾沒有註冊渲染器時不發起讀取，並顯示不支援預覽的空態。子元件收到累積文字或完整原生位元組、原始資源地址，以及標準 `useResource` 和 `useTabInfo` 掛鉤。Preview 透過 `ctx.remote.workspaceFiles.read` 讀取文字，透過 `ctx.remote.workspaceFiles.readBytes` 讀取原生位元組，關聯資源使用 `baseFile`。重新整理仍按 tab 獨立進行，不引入資源 reload、共享 `changed` 確認、額外資源包裝層或內容 Session。

Markdown 和程式碼透過累積的分頁文字複用增量渲染原語。HTML、PDF 和圖片讀取完整 `Uint8Array<ArrayBuffer>` 資料；Host 傳輸使用[工作區檔案二進位制傳輸](2026-09-17-workspace-file-binary-transfer.zh.md)。釋出後的緩衝區只讀借用，絕不持久化進佈局或 Session JSON。PDF.js 在自有 Worker 中執行，字型和解碼資料以相同版本隨包釋出，轉移輸入前先複製，以保留 Preview 的緩衝區。開啟[開發者工具](../feature/2026-09-17-developer-tools-settings.zh.md)時，HTML 在 Blob iframe 中執行，設定 `sandbox="allow-scripts"`，不授予同源、彈出視窗、表單、下載或頂層導航權限。瀏覽器保持正常的外部網路規則。有上限的靜態本地 JS/CSS 讀取由父頁面負責；不透明源 iframe 建立自己的資源 Blob，因為它不能載入父源建立的 Blob。PNG、JPEG、GIF、WebP、BMP、ICO 和 SVG 使用圖片專用 Blob URL，在 `<img>` 靜態圖片上下文中渲染。比面板寬的圖片按縱橫比縮小到面板寬度；較小的圖片保留固有 CSS 畫素尺寸並由 auto margin 居中，較高的圖片擴充功能共享滾動區的縱向範圍。渲染器不提供縮放或拖拽平移。SVG 標記絕不進入應用 DOM 或 iframe，因此腳本保持不可執行，也無法存取父頁面。替換 HTML 或圖片時會撤銷其根 Blob URL。

PDF.js 官方 TextLayerBuilder 在適應寬度的 canvas 上負責選擇邊界和複製規範化，共享頁面清理，並使用由元件擁有的 resize observer。回應式尺寸適應使用獨立的 CSS `scale` 屬性，與 PDF.js 的頁面旋轉和平移變換組合。其內容結束標記和堆疊規則限制空白區域中的選擇；換行高亮被抑制。逐頁取消使用 builder 的清理操作，而不 abort 第一頁的訊號，因為官方選擇監聽器跨頁面共享。

## 考慮過的替代方案

**透過預覽中繼資料中的回呼載入轉換內容。** 這種回呼會讓共享檔案 store 同時持有原始檔位元組和格式專屬的轉換結果。由渲染器自行載入可將轉換快取、錯誤和字型中繼資料留在 Office，同時保留共享檔案身份和工具欄控制元件。定義宣告 `loading: 'renderer'`；正文接收與格式無關的載入 revision，並將讀取與 store 更新交給其私有注入 face。face 向共享 owner 報告已展示的源版本或載入失敗。重新載入或替換實作會增加 revision，過期報告會被忽略，正文在替換或解除安裝時取消待處理工作。Office 在 tab 生命週期內保留已完成的內容，並組合自己的 PDF 子 slot。

**把方法掛到 Iterator 或其值上。** 這會混淆觀察與命令，並在資料幀中重複能力身份。幀攜帶資料和失敗；顯式 Preview RPC 回呼負責讀取。

**核心公開投影工廠，或在 `open` 內做同樣的組裝。** 分開的流值、operations 組合與公開介面增加了組裝步驟，沒有另一個目前消費方需要它。Preview 的共享 RPC 適應已讓渲染器無需處理 Session 定址和位元組傳輸。Resource 不提供與提供者無關的命令介面，也不提供繫結於開啟實例的命令生命週期；增加任一種都需要檔案預覽之外的消費方證據。

**把 UI Session 作為額外 Resource 身份，或由首個持有者、目前選擇決定授權。** 保留的 tab 可以屬於不同於目前選擇的 Session，UI 所在位置也不能標識地址指向的檔案。將所需 Session 編入檔案地址，既保留 Host 授權，也讓同地址的所有讀者共享觀察。

**讓所有資源提供檔案讀取方法。** Chat 與終端資源的資料和操作語義各自獨立，只有觀察的註冊和生命週期是共用機制。

**預覽資源包裝層、內容 Session 或第二個資源 Hook。** 這些方案重複了 Resource 和 Workspace Files 已提供的定址、取消、訂閱和歸屬。載入策略屬於預覽所有者。

**本地伺服器、虛擬主機或 `file:` iframe。** 這些方案需要額外託管或檔案系統權限。預覽面向靜態生成頁面，而非完整應用執行時；模組、動態檔案系統請求和任意巢狀資源圖不在支援範圍內。

**清理 SVG 後放入應用 DOM 或 iframe。** sanitizer 會增加第二套 SVG parser 和一套持續演進的主動內容策略，之後仍要把不可信標記放進可互動文件。`<img>` 靜態圖片上下文保留瀏覽器原生 SVG 渲染與固有尺寸，同時不給標記一個能執行腳本的 DOM。

## 影響

替換渲染器不需要改變 Tab 或檔案協定。全文格式承擔有上限的整檔案記憶體成本，PDF 增加隨包釋出的 Worker、字型和解碼器位元組。格式選擇和檢視狀態僅屬於目前頁面，不是持久 Session 資料。Preview 獨立於中繼資料觀察，擁有 RPC 取消和原生緩衝區。tab 保留讀取版本及讀取開始時捕捉的觀察版本；重新整理它既不丟棄其他 tab 的內容，也不清除其變更提示。檔案讀取仍非事務，不透明版本只比較相等性、不排序。[錄製的瀏覽器情境](../../../../apps/web/tests/document-preview.e2e.ts) 覆蓋共用工具欄、增量文字、隔離的 HTML 依賴、按寬度適應的點陣圖與 SVG 渲染、不可執行的 SVG 腳本，以及惰性連續 PDF Worker 渲染。
