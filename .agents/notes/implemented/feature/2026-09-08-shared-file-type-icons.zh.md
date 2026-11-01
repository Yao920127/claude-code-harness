# Agent Note: 共享檔案型別圖示

Status: implemented

[English](2026-09-08-shared-file-type-icons.md) | 中文

## 問題

用戶端功能外掛只能透過 `@deepseek-ai/dsh-client-ui-primitives` 共享 React 元件，但檔案卡片沒有共享的檔案型別呈現。本包擁有唯一一份副檔名分類表，併為 `LinkIconMedium` 將細分檔案型別有意摺疊為六種連結類別；附件卡片、已傳送訊息附件、排隊檔案和工作區檔案行使用細分檔案圖形。在其他位置增加精細檔案圖示，需要再複製一份副檔名錶或讓功能外掛之間產生執行時 import。

## 決策

`ui-primitives` 統一擁有一套 Cordis-free 的檔案分類與渲染 API。`fileExtension(path)` 對兩種路徑分隔符采用共享的 basename 與最終點號語義。`classifyFileType(path)` 不區分大小寫，並返回閉合的 `FileType` 聯合：傳統的 `code`、`excel`、`folder`、`html`、`image`、`markdown`、`other`、`pdf`、`ppt`、`video`、`word` 類別，以及由 `CodeFileIcon` 渲染的細分 `CodeFileType` 集合。解析按完整檔名、檔名字首、檔名字尾、可選專案上下文、副檔名的順序執行。路徑分類器返回 `folder` 之外的全部成員；呼叫方確認條目是目錄時，透過 `FileTypeIcon` 的顯式 `kind` 覆蓋指定目錄。未知副檔名、無副檔名和末尾點號退回到 `other`，但共享表識別 `Dockerfile`、`Makefile`、`package.json`、`.gitignore`、`README`、`CHANGELOG` 等具名檔案。

`FileTypeIcon` 接受路徑、共享 `IconProps`、顯式 `kind`和可選的專案檔案快照。傳統檔案型別把所提供的 28px 文件與資料夾輪廓渲染為 inline SVG。表格圖形使用所提供的未縮放 1.2px 表格網格；Markdown、PDF、PPT、Word 的前景標記圍繞自身視覺中心縮放至 122%，其餘帶標記的傳統圖形使用 112%。檔案底板與折角保持源圖幾何，通用檔案不憑空增加中心標記。底板使用實色分類顏色，前景標記與普通折角使用白色，通用檔案使用較深的灰色折角。CSS 透過靜態設計 token 分配所提供的分類調色盤：code/HTML/Markdown 使用 DeepSeek 藍，Word 使用較淺的 DeepSeek 藍，表格使用綠色，folder/PPT 使用兩檔琥珀色，PDF 使用紅色，未知檔案使用中性灰。image 與 video 透過元件本地變數共用所提供的紫色，因為設計平臺沒有匹配的紫色 token。呼叫方可透過 `--dsh-file-type-icon-color` 覆蓋傳統底板顏色。

已識別的程式碼與設定檔把對應的 20px 方形圖稿縮放到請求的圖示尺寸。內嵌靜態表只包含現有 48 個 `CodeFileType` 條目；資源包中額外的圖稿不會新增類別，相鄰 manifest 記錄負責的設計歸屬方與來源摘要。測試會拒絕該表中的腳本、事件屬性、外部引用與重複 id。`CodeFileIcon` 在插入前為本地 SVG id 加上元件實例字首，使重複漸變與裁剪路徑互不干擾。這些技術標記保留自身內嵌的多色填充，是普通 current-color 圖示規則的明確例外。對映讓 React 優先於 TypeScript/JavaScript、Angular 檔名字尾優先於基礎副檔名，並按檔名識別 Docker/Node/Git/Make/CMake；只有可選專案快照包含內容帶 `flutter:` 的 `pubspec.yaml` 時才選擇 Flutter。Markdown 與 SVG 仍由傳統 Markdown 和圖片類別擁有。CSV、TSV、Excel 工作簿與範本、OpenDocument 表格和 Numbers 在檔案卡片、檔案行及預覽標題中使用表格圖示，其可點選連結使用文件類別。`.env` 和以 `.env` 結尾的檔名均使用環境設定圖示。所有傳統與技術 SVG 都是 `aria-hidden` 的，擁有檔案身份的卡片、行或按鈕提供無障礙名稱。

`LinkIconMedium` 委託 `classifyFileType` 做副檔名分類，再把精細結果摺疊進原有連結詞彙：code 與 HTML 使用 `code`，圖片使用 `image`，PDF/Word/Excel/PPT 使用 `document`，Markdown、video 與未知檔案使用 `other`。無副檔名檔案在連結語境中仍是 `other`，因此[連結樣式規則](../../../../docs/web-styling.zh.md)定義的 14px 外觀不變。

附件上傳卡片、已傳送訊息檔案卡片、排隊檔案行和工作區檔案行渲染 `FileTypeIcon`。Files 標籤頁標題使用顯式的 `folder` 類別，尺寸為 16px。顯式交付卡片使用 20px 的 `FileTypeIcon`，並透過 `fileExtension` 提供預設中繼資料。兩處中繼資料行統一使用 `fileExtension`；`.env` 這樣的前導點 basename 會顯示 `ENV`，無字尾或末尾點號則不顯示副檔名 label。圖片內容繼續渲染為預覽而不是檔案型別圖形，產物檔案連結與 Markdown 檔案提及繼續使用 `LinkIconMedium`，因為它們屬於連結表面。

## 備選方案

**所有檔案表面都使用 `LinkIconMedium`。** 否決。它的六種類別和 14px outline 圖形用於在文字尺寸下表達連結目標；28px 檔案卡片有空間表達所提供的 HTML、Markdown、PDF、Word、Excel、PPT 與 video 身份。

**在 `LinkIconMedium` 旁保留第二份副檔名錶。** 否決。任一列表增長後，同一路徑可能漂移到不同類別。一份精細表加一個顯式的精細到連結適應，能同時保住兩類消費方的語義。

**把所提供的傳統檔案顏色直接寫入每一條 SVG path。** 否決。傳統 SVG 幾何保持可複用，並遵守圖示集的 `currentColor` 規則；元件樣式表擁有預設分類調色盤，渲染點只需一個 CSS 變數即可覆蓋顏色，不需要重寫 path 填充。技術圖稿是例外，因為其內嵌的多色標記用於識別語言或工具，而不是裝飾通用檔案輪廓。

**為了對稱增加 archive、audio 與 data 類別。** 否決。提供的圖稿與目前消費方都不需要這些圖形。新增 `FileType` 成員必須有已釋出的渲染點，以及在 28px slot 中仍可辨認的圖稿。

## 測試

`ui-primitives` 測試覆蓋不區分大小寫的字尾、兩種路徑分隔符、前導點檔案、無字尾與末尾點號、常見具名檔案、未知退回、全部細分程式碼對映、規則優先順序、Flutter 上下文、精確的 48 鍵圖稿集、被拒絕的資源包額外類別、靜態 markup 安全性、實例安全的 SVG id 與引用、`aria-hidden`、尺寸/class 轉發、不同圖稿、所提供的表格網格、112% 與 122% 前景標記變換，以及不含 SVG 字面顏色的傳統實色底板/對比標記層。樣式表測試釘住每一項傳統類別到顏色的對映、呼叫方覆蓋變數與本地紫色值。`LinkIconMedium` 分類表釘住它的粗粒度輸出，包括 `Makefile` 仍為 `other`。附件、聊天、佇列和側邊欄元件測試覆蓋遷移後的渲染路徑；由於圖形仍是裝飾性的，其無障礙輸出不變。

## 後果

- 用戶端包使用一個檔名解析器與一份精細檔案型別表，不再 import 或重新實作功能包本地邏輯。
- 新字尾只在已有圖形能準確表達它時加入精細表。若它的連結類別與目前適應不同，這次改動還必須決定是否改變 14px 連結外觀。
- 程式碼與設定圖稿保留內嵌調色盤，不接受傳統圖形的 `--dsh-file-type-icon-color` 覆蓋。
- 固定的 48 項圖稿表為共享瀏覽器 bundle 增加約 35 kB 未壓縮體積和 17 kB gzip 體積；新增類別必須證明這份靜態基線成本是必要的。
- primitive 不擁有文案，但擁有預設檔案型別調色盤。消費方繼續擁有無障礙 label 與周圍文字，並可透過 `--dsh-file-type-icon-color` 替換分類顏色。
- 精細類別名稱描述展示意圖，不是 MIME 驗證。字尾只是展示提示，不能證明檔案內容或可信度。
