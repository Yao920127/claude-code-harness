---
description: "dsh Web 用戶端共享的 React UI 原子元件：控制元件、圖示、Markdown 與數學公式渲染，以及終端/讀取/差異/搜尋/網頁輸出卡片（零 Cordis）。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-primitives

[English](README.md) | 中文

## 概述

使用 `dsh-client-ui-primitives`，透過共享 React UI 建置 Web 用戶端控制元件並渲染 agent 輸出。它提供標準控制元件、圖示、錨定浮層，以及用於帶 TeX 公式的 Markdown、終端輸出、檔案讀取、差異、搜尋、網頁檢索和 JSON 的渲染器。這些渲染器會丟棄原始 HTML、限制連結並解析 ANSI 轉義序列，以處理不受信任的模型輸出。元件不 import Cordis 執行時；呼叫方提供在地化 label，主題相關顏色使用 `--dsw-*` 設計 token。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`Toast` 在淺色和深色模式下均使用主題的系統提示背景與文字顏色。`Menu` 資料條目與 `MenuItemButton` 元件條目接收功能 owner 提供的有效快捷鍵，並在末端以無背景的淺灰色文字對齊顯示，子選單也採用同一呈現。`ShortcutKeys` 預設以無方塊的按鍵文字顯示選單和行內提示。`tooltip` 變體在深色氣泡上使用稍淺的鍵帽，以加號連線的組合則共用一個填充色塊。`Tooltip.shortcutKeys` 將鍵帽與可選的在地化操作文字垂直居中排列，標籤為空時只顯示按鍵。可選的 `className` 供呼叫方設定互動狀態樣式。`Modal` 與設定外殼透過 `useModalLayer` 共用頂層 Esc 和 Tab 處理，關閉時恢復先前焦點。`closeTopModal(document)` 請求前臺彈出視窗目前的關閉操作；上層選單或未註冊的對話方塊會阻止關閉其後方彈出視窗。元件透過 `isBehindModal` 避免將焦點移到巢狀彈出視窗後方。選單先消費自己的 Esc，再由模態層處理關閉。 `observeComposition` 為區域性彈層和錄鍵處理提供相同的 composition-end 與舊版 IME 保護；呼叫方隨互動生命週期釋放其 document 監聽。

彈出視窗自動進入及彈出視窗、選單回焦，包括透過 Esc 和應用關閉快捷鍵觸發的回焦，均使用 `focusWithoutRing(element, options?)`，在 Tab 或方向鍵導航恢復正常焦點樣式前抑制外輪廓線。彈出視窗容器仍不繪製焦點外框。原有邊框、陰影和錯誤狀態保持不變。用 `data-modal-autofocus` 標記彈出視窗的初始控制元件，讓模態層先儲存觸發控制元件，再移動焦點。隨彈出視窗掛載的控制元件不得使用 React `autoFocus`，因為它會在儲存觸發控制元件前執行。彈出視窗容器獲得焦點時，Tab 和 Shift+Tab 分別進入第一個和最後一個可聚焦控制元件。

本包是 Web 殼的建置輸入。靜態 ESM 為 Vite 保留第三方匯入和樣式；獨立消費方自行提供開發依賴（[依賴規則](../AGENTS.md#dependency-declaration)）。

只要 Web 用戶端需要標準控制元件或 agent 輸出渲染器，就用這些原子元件拼裝功能 UI。它們只經 React 渲染，並從主題取得 `--dsw-*` 設計 token，因此無需匯入主題或 slot 系統即可適應任意外掛。

<a id="component-catalog"></a>
### 元件目錄

在功能包裡寫控制元件之前，先查這張表。外掛無法匯入另一個外掛的元件，因此本包是控制元件唯一可以共享的地方：合適的就複用，有意的視覺差異提升成 prop，而不是另起一份複製。

| 匯出 | 是什麼 |
|---|---|
| `Button` | 可點選操作；`variant` 選擇 `primary`、`ghost`、`outline` 或 `toolbar`。ref 指向原生按鈕，供焦點控制與浮層錨定使用。 |
| `Switch` | 36×20 的雙態開關。`label` 必填，控制元件不可能在沒有名稱的情況下發布。 |
| `SegmentedControl` | 兩段或更多等寬分段加一個滑動指示塊的 tablist，用於在幾種模式間切換一張卡片或面板；選中項由呼叫方持有，`label` 為列表命名。`id` 派生每個 tab 的 id（`<id>-<value>`）及其控制的面板 id（`<id>-<value>-panel`），面板由呼叫方渲染並用 `aria-labelledby` 指回 tab；分段可 `disabled` 並帶 `title`，控制元件級 `disabled` 在目前面板有進行中的操作時鎖住全部分段。 |
| `Checkbox` | 帶標籤的原生核取方塊，支援受控狀態、鍵盤互動和停用樣式；呼叫方提供在地化的 `label` 文字。 |
| `Input` | 單行文字輸入，用於搜尋框與行內表單。 |
| `Menu`, `MenuItemButton` | 由 `items` 資料行、分隔線與分組標題構成的下拉選單，支援巢狀子選單；`children` 在同一列表中加入元件行，每行一個 `MenuItemButton`（`separatorBefore` 開啟新分組）。所有行共享樣式、鍵盤走位與焦點歸還；兩類行的關閉都是 owner 狀態的改變。開啟期間 `↑`／`↓`（以及 Home、End）在列表中走位，Tab 選定聚焦行，Escape 或 Shift+Tab 關閉並把焦點還給錨點；選定一行同樣把鍵盤還給錨點——除非擁有者自己移動了焦點。只攔截位於錨點或列表內的鍵盤，`autoFocus` 僅決定開啟時是否聚焦首行。 |
| `Pill` | 可選中的膠囊按鈕，用於檢視切換與篩選器；接受 `active` 與 `onClick`。 |
| `SegmentedTabs` | 受控的等寬分段標籤，支援滑動指示條及左／右方向鍵、Home、End 導航。呼叫方提供文案、標籤與面板 id，以及面板內容。 |
| `Tag` | 只讀膠囊徽章；`tone` 選擇八種配色之一。 |
| `PathLabel` | 單行檔案路徑：目錄使用弱化顏色，檔名使用主色，懸停可檢視完整路徑。空間足夠時靠左顯示；溢位時保留尾部並在左側漸隱，路徑或尺寸變化時更新。 |
| `StateDot` | 10px 槽內的綠色 `done`、琥珀色 `warning`、紅色 `error`、中性灰色 `idle` 圓點，以及 tertiary 灰色 14px 旋轉 `ongoing` loading，其動畫固定到文件時間零點，所以所有可見 loading 同相旋轉。它是 `aria-hidden` 的，名稱由渲染點提供。 `appearance="step"` 以實心勾表示完成、空心圓表示等待。 |
| `ConnectionIndicator` | 行內連線恢復控制元件，覆蓋斷線、重試與已恢復三種狀態。 |
| `DisclosureRow` | 24px 緊湊摺疊行，標題與內容左右排列。使用淺層 prop 比較進行 memo；內容未變時，保持回呼與 React 節點 prop 的引用穩定。 |
| `Modal` | 頁面遮罩之上的居中對話方塊。巢狀對話方塊可透過 `onKeyDownCapture` 在文件級 Escape 處理器之前攔截按鍵。 色層與彈出視窗淡入，背景模糊始終完整生效，並遵循減少動態效果偏好。呼叫方已模糊源頁面時設定 `backdropBlur={false}`。 |
| `RiskConfirmation` | 以顯式核取方塊把關的敏感操作確認。 |
| `Tooltip` | 錨定在克隆子元素上的懸停文字；可透過 `portal` 渲染到外層，避免被容器裁剪，或受祖先層疊上下文限制其 z-index。 |
| `HoverCard` | 指標可停留、可選中的懸停預覽；可選帶複製按鈕。 |
| `ImageLightbox` | 共享圖片浮層，支援焦點恢復與 Esc 關閉。 |
| `Toast` | 頂部居中的瞬時橫幅，保持時長由所有者的 `holdMs` 決定。 |
| `SettingsForm`、`SettingsValueField`、`SettingsChoiceField`、`SettingsSecretField` | 外掛設定頁的框架與控制元件：框架以 `labels` 接收文案，只在按鈕點選時儲存，解除安裝即丟棄；值欄位顯示暫存文字以及已覆蓋標籤和重置；密文欄位每次為空，請求瀏覽器不要自動填入已儲存的密碼，只報告是否已設定。選擇欄位在帶標籤的值之間選擇；第一個選項清除欄位，儲存值不在選項中時仍以原始文字保持可選。 |
| `SettingsFormModel`、`settingsNumberField`、`settingsTextField` | 這類頁面背後基於設定 scope 的暫存編輯模型：草稿先暫存、儲存時寫入，欄位是否被覆蓋看使用者層是否含有它，未落實的儲存保留草稿。 |
| `JsonTree`、`JsonBlock` | 只讀 JSON 檢視。 |
| `MarkdownText`、`MarkdownDelegateProvider`、`CodeBlock` | 不可信 GFM 與 TeX 數學、owner 委託的 HTTP(S) 導航，以及高亮程式碼。`CodeBlock` 可透過 `lineNumbers` 開啟行號；複製的原始碼不含行號欄，`contentRef` 則向需要把穩定原始碼包裝節點用作滾動區的 owner 提供該節點。呼叫方提供自己的語言與複製工具欄時，設定 `showHeader={false}`。 |
| `TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock`、`WebBlock` | 與各類工具結果意圖對應的 agent 輸出卡片。 |
| `icons/*`、`FishLogo`、`BrandWordmark`、`ReferenceIconRegular`/`ReferenceIconMedium`、`LinkIconRegular`/`LinkIconMedium` | 字形與品牌標識。`LinkIconMedium` 用於 14px 的可點選連結分類及已知站點標記。 |
| `PermissionIconReadOnlyRegular`/`Medium`、`PermissionIconWorkspaceWriteRegular`/`Medium`、`PermissionIconFullAccessRegular`/`Medium` | 只讀、工作區寫入與完全存取選項使用的權限模式圖形。 |
| `PluginArtworkTerminal`/`Loop`/`Subagent`/`Search`/`Default` | 固定配色的 36×36 外掛插畫；`Terminal` 為外掛卡片和側邊欄開始頁入口提供淺藍色提示符。`Default` 用於沒有自有插畫的外掛。def id 按實例生成，同一插畫可在一頁中安全重複。 |
| `GuideArtworkBrowser`/`Files` | 固定配色的 36×36 瀏覽器與資料夾插畫，用於側欄引匯入口。 |
| `FileTypeIcon`、`classifyFileType`、`fileExtension` | 按類別著色的 28px 檔案或資料夾圖形，以及它背後共享的不區分大小寫檔名對映。程式碼與設定檔使用細分的全綵技術圖形；連結前置圖形使用 `LinkIconMedium`，圖片內容使用圖片預覽。 |
| `languageForPath`、`CODE_HIGHLIGHT_EXTENSIONS`、`useCodeHighlighter` | 程式碼預覽與 diff review 共用的惰性逐行 token 高亮。檔名 grammar 選擇再匯出自 `@deepseek-ai/dsh-util-code-language`，即 read 卡片持久化短 id `lang` 提示背後的同一張副檔名錶。 |

有四組容易混淆：

- **`Tag` 與 `Pill`。** 11px 膠囊尺寸的只讀徽章用 `Tag`；膠囊可選中（`active` 與 `onClick`，檢視切換與篩選器就是這樣用的），或者必須落在 24px 文字行上時用 `Pill`——`TerminalBlock` 把退出狀態渲染成靜態 `Pill` 正是後一種情況。這裡尺寸和是否可互動同樣是判據，兩者不可互換。
- **`Pill` 與 `SegmentedControl`。** 一排 `Pill` 是一組彼此獨立的 chip——每個各自開關，可以同時啟用多個。`SegmentedControl` 是在幾種互斥模式中選一，畫成帶一個指示塊的 tablist，並自帶 tab 鍵盤模式（方向鍵在分段間移動，只有選中項在 Tab 序列裡）；模型設定頁的新增卡片就用它切換兩張表單。
- **`DisclosureRow` 與卡片。** 該行以固定 24px 把標題與內容左右排列。把名稱疊在描述之上的卡片是另一種佈局，屬於功能包——`ui-settings-plugins` 的 `PluginCard` 是先例，並記錄了原因。
- **`FoldToggle` 與對外匯出面。** 它是包內元件，未匯出；輸出卡片用它做頭尾摺疊。

需求確實特殊時，在自己的包裡寫自己的元件沒有問題。不可以的是複製這裡已有的控制元件——而當第二個包需要同一個控制元件時，它就該住進本包（[決定](../../../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.zh.md)）。

### 控制元件與圖示

上面的目錄說明每個匯出的用途；本節講 props 本身看不出來的行為。產品圖示名稱不含畫板尺寸，以 `Regular` 表示原始 1px 圖形，以 `Medium` 表示同一幾何的 1.3px 描邊；`size` prop 控制渲染尺寸（[決定](../../../.agents/notes/implemented/architecture/2026-09-16-size-neutral-product-icon-weights.zh.md)）。每個產品、引用、連結與權限圖形都會有意保留兩種線重匯出，即使目前產品只使用其中一種，也讓呼叫方無需再次擴充功能 API 就能選擇強調程度；僅填充的成對圖形外觀相同。`IconWarningOutlineRegular`/`Medium` 使用圓形；`IconWarningTriangleOutlineRegular`/`Medium` 使用圓角三角形。`FishLogo` 與 `BrandWordmark` 填充品牌 slot。`FileTypeIcon` 渲染傳統的 28px spreadsheet、folder、HTML、image、Markdown、generic、PDF、PPT、video 與 Word 圖形，併為現有 48 個程式碼和設定類別使用匯入的方形技術圖形。該匯入只替換圖形：資源包中額外的類別不會擴充功能 `CodeFileType`。`classifyFileType` 按完整檔名、字首、字尾、可選專案上下文、副檔名的順序匹配；React 檔名優先於 TypeScript/JavaScript，Angular 字尾優先於基礎副檔名，只有傳入的專案檔案包含帶 `flutter:` 的 `pubspec.yaml` 時 Dart 檔案才使用 Flutter。Markdown 與 SVG 仍分別使用傳統 Markdown 與圖片圖形。表格對映包括 CSV、TSV、Excel 工作簿與範本、OpenDocument 表格和 Numbers；KEY 對映為幻燈片，RTF/ODT/Pages 對映為文件。`fileExtension` 為相鄰中繼資料 label 暴露同一套 basename 與最終點號解析。傳統圖形使用實色分類底板、白色標記和半透明白色折角；通用程式碼圖形使用尖括號與斜線，保留原圖 1.35px 描邊；通用檔案使用灰色底板與較深灰色折角。呼叫方可透過 `--dsh-file-type-icon-color` 覆蓋底板顏色。全綵技術圖形是明確例外，會保留其內嵌調色盤。所有圖形都是裝飾性的，不自帶 label。`LinkIconMedium` 是可點選產物連結的前置圖形——地球、資料夾、程式碼、圖片、文件或紙張，`url` 連結的 `href` 指向已知站點時則改用該站點自己的標記——轉寫內容常引用的開發者站點（GitHub、GitLab、npm、PyPI、Stack Overflow、MDN、Wikipedia、Hacker News、YouTube、X、Bilibili、知乎、掘金、CSDN），以及主流搜尋、影片、社交、購物與參考資料站點（Google、百度、DuckDuckGo、TikTok、Netflix、Spotify、Facebook、Instagram、Reddit、Telegram、WhatsApp、微信、QQ、微博、淘寶、速賣通、eBay、Quora、V2EX、Apple）——`classifyLinkPath` 把共享檔案型別摺疊進原有六類詞彙。`ConnectionIndicator` 可渲染警告色的斷聯操作（常駐重試圖形指明重試動作，斷聯文案由持有方提供）、與文案使用相同警告色的共享 ongoing loading 加一至三個點以獨立於 retry 時序的 500ms 節奏推進的連線中狀態，或成功色的恢復狀態。點選任一警告狀態都會請求立即重連；沒有任何懸停互動會改變文案。藥丸出現時淡入、解除安裝前淡出 150ms，寬度隨目前 label 自適應。它的持有方提供可見性、恢復駐留時間、在地化 label 與立即重連回呼；該原語不使用原生 title tooltip。`useAnchoredPosition` 與 `useAnchoredMaxHeight` 讓浮動面板與底部錨定浮層始終鉗制在視口內並跟隨錨點；`useAnchoredMaxHeight` 與 portal 模式的 `Menu` 會把 12px 的視口頂部邊距加寬到框架釋出的 `--dsh-frame-top-clearance`。`HoverCard` 透過指標離開寬限期讓採用 portal 的預覽在跨過錨點間隙時仍可觸及，並可透過 `copyText` prop 提供複製按鈕。其 `preview` 變體使用 anchor 或 `widthAnchorRef` 元素的寬度減去 48px，左右各內縮 24px，並在視口內放置於行的上方或下方。浮層避開框架頂部保留區，高度最多 420px，會跟隨內容及 anchor 尺寸變化；Escape 或透過滑鼠和鍵盤啟用錨點可將其關閉。整個浮層的淡入和淡出各持續 100ms；關閉中的浮層停止接收指標輸入，淡出後解除安裝。在淡出期間移回錨點可恢復顯示。減少動態效果偏好會停用過渡動畫。只有啟用複製時才必須提供複製標籤。錨點中巢狀的 `Tooltip` 在顯示懸停或焦點標籤時隱藏該預覽；巢狀提示釋放、停用或解除安裝後，仍處於開啟狀態的預覽會恢復。`Toast` 使用呼叫方的 `holdMs` 同時控制淡出延遲與停留加淡出的總時長。`holdMs` 未變時，父元件重渲染不會重新啟動該生命週期；完成時呼叫最新回呼，完全淡出的操作不能接收輸入。新的元件 key 會重新開始橫幅週期。`rankByName` 是 `/` 選單命令源與 skill（技能）源共享的候選排序器：查詢必須是名字的不區分大小寫的有序子序列；字首命中排最前，其次按對齊分數，再按來源順序。 portal 模式的 `Menu` 列表會在拖曳和 CSS 變換期間跟隨錨點，並在關閉時停止跟蹤。`Menu.autoFocus` 聚焦首個啟用項，支援上下方向鍵與 Home/End 導航，並在 Escape 時聚焦 anchor 內的第一個按鈕；操作選單可顯式啟用。

`Tooltip` 在懸停或鍵盤聚焦時讀取錨點位置，再根據 `ResizeObserver` 提供的邊框盒尺寸調整氣泡。首次定位前氣泡保持隱藏；橫向移入視口留白，僅在另一側容得下時上下翻轉。標籤尺寸與視口變化複用錨點座標；定位不會同步測量氣泡，也不會觸發 React 渲染。

### 渲染 agent 輸出

最近的 `MarkdownDelegateProvider` 提供可選的 `openExternalLink` 和 `openFile` 導航回呼。巢狀 Provider 替換外層能力，回呼變化無需重新建置 Markdown 即可到達已渲染連結。其 `openFile` 使本地 Markdown 連結在落定後可點選。絕對路徑和工作區相對路徑支援百分號轉義以及 `#L24` / `#L24-L30` 片段；範圍定位到起始行。檔名中的字面 `?` 和 `#` 必須百分號編碼。懸停提示使用解碼後的路徑，並在標籤為空時提供可存取名稱。回呼接收解碼後的路徑和可選行號，渲染器保留標籤並顯示檔案圖示。不傳回呼時，本地連結仍為文字。URL 協定、查詢串、不支援的片段及格式錯誤的目標不會傳給檔案開啟器。

`MarkdownText` 渲染不可信的 GFM 與 TeX 公式、阻止不安全的連結與圖片，並可把已解析的檔案提及轉換為顯式控制元件。外層 `MarkdownDelegateProvider` 會接收普通點選產生的已淨化 HTTP(S) URL；帶修飾鍵的點選和 Provider 外的連結保留原生外部 anchor 行為。當 owner 傳入 `pathImages` 詞表時，本地媒體路徑的圖片目標只在落定渲染階段重寫為可展示 URL（與 file mentions 相同的流式門）；不傳詞表時本地目標保持惰性 alt 文字。重寫後的圖片支援 HTTP(S)、data、blob 及桌面端 `dsh-app://app/api/file` 路由；正文直接書寫的桌面端 URL 仍保持惰性。載入或解碼失敗後，圖片替換為作者的 alt 文字；alt 為空時顯示原始目標路徑；`fileImages` 還提供在地化的失敗提示字首。圖片源變化後可重新載入。回覆流式輸出時，它凍結已完成的塊、按已完成行推進頂層未閉合 fence，並從儲存的 Shiki grammar state 為該 fence 增量高亮。已完成的 token 行進入固定大小的 React 分組，後續分片只 reconcile 正在增長的分組；最終全量解析解決跨文件語法時，未變化的 fence 會保留該 DOM。`TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock` 與 `WebBlock` 把對應的工具結果意圖渲染為帶複製控制元件、溢位處理及適用時 ANSI 處理的卡片。`JsonTree` 與 `JsonBlock` 以只讀方式檢查 JSON 值；`projectUserText` 把已傳送的使用者文字投影為行內普通文欄位與引用 chip，供訊息氣泡和排隊行使用。引用名稱繼承呼叫方的換行規則：長名稱在氣泡內換行，排隊預覽保持單行佈局。傳入 `UserTextReferences` 時，檔案和 skill 引用成為支援鍵盤操作的預覽按鈕，複用正文件案連結的懸停和聚焦樣式；第一次指標點選可以開啟預覽，後續點選和已有選區保留原生選擇行為。鍵盤啟用在存在選區時仍可開啟預覽。

`MarkdownText` 預設為 `variant="body"`。次級內容使用 `variant="compact"`：其 13px 字號與 20px 行高跟隨內容字號設定，各級標題保持同一字號並使用 600 字重，段落與列表採用更緊湊的間距。正文、連結和程式碼均保持 tertiary 顏色，以點狀下劃線區分連結。程式碼標題欄隨程式碼塊滾動。表格和公式仍然啟用，使用周圍文字的字號，並在可用寬度內橫向滾動。兩個變體共享解析器與流式快取。

`CodeBlock.toolbarLabels` 啟用共享程式碼卡片的標題欄和間距。`ReadBlock` 與 `DiffBlock` 使用相同的標題欄：tertiary 色的語言名稱與檔名、secondary 色的複製與換行圖示，以及懸停或鍵盤聚焦時的提示。語言缺失或不受支援時顯示呼叫方提供的在地化程式碼塊標題；混合語言的 Diff 也使用該標題。程式碼卡片共用字型和內容內邊距；在兩種主題下，標題欄和正文都使用相同背景。讀取卡片的行號欄容納返回視窗中的最大行號，Diff 底色覆蓋完整可滾動行。換行按鈕保留固定的無障礙名稱，以 `aria-pressed` 表達狀態；提示文字說明下一步操作。換行設定僅屬於目前掛載的卡片，不改變複製的文字；程式碼圍欄預設換行，讀取和差異卡片則在啟用換行前保留原始碼列位置。緊湊 Markdown 共用此工具欄、間距和程式碼字型排版，同時保留單色文字。原始碼預覽傳入 `toolbarLabels` 後，可用 `wrap` 跟隨所屬檢視的換行設定，僅顯示語言和複製圖示；所屬檢視的 CSS 保留原始碼佈局。

`DiffBlock` 按行比較新舊內容。它顯示實際增刪行及兩側最多三行中性上下文，用 `⋯` 分隔遠距離改動，工具摘要的統計不計入共享上下文。卡片在差異正文後結束。若一個片段需要超過 256 次行新增或刪除，則停止精確比較；該片段按完整新舊內容顯示和統計為粗粒度替換，包含共享行。複製包含完整顯示 diff 及其字首。末尾換行視為行終止符；僅末尾換行不同不會顯示為改動。

`JsonTree` 把摺疊字串限制為 `collapsedStringLines` 行（預設三行）。展開後顯示原始文字、保留同級逗號，並限制在視窗與外層滾動容器內；尺寸變化和祖先滾動事件會更新此限制。行複製回饋獨立於 JSON 值渲染更新；尚未完成的剪貼簿寫入不會更新另一行或已解除安裝的樹。

`ImageLightbox` 是共享原圖浮層，支援焦點恢復與 Esc 關閉。包內縮圖渲染器由呼叫方提供載入及失敗文案。`HoverCard.inline` 使檔案連結保持在文字流內，並使用共享選單材質、鍵盤可見焦點，並在錨點上方或下方定位而不遮擋錨點。即使焦點位於其他位置，Esc 也會關閉已開啟的縮圖；後續 Esc 按鍵繼續傳給 owner。`MarkdownDelegateProvider.fileImages` 提供已解碼路徑解析器與完整圖片文案：訊息落定後的圖片連結支援懸停預覽，獨立圖片支援點選放大。僅包含圖片的連結保留單一導航目標。解析器僅恢復完整、未轉義、獨立成段且帶明確圖片副檔名的含裸空格本地圖片引用；程式碼與有歧義的目標保持原文。

### 在地化文案

這些原子元件無法讀取應用 locale，因此每段面向使用者的文案都必須透過 label prop 提供。`HoverCard`、`TerminalBlock`、`JsonTree`、`CodeBlock`、`MarkdownText`、`JsonBlock`、`ConnectionIndicator`、`Modal`、`DiffBlock`、`ReadBlock`、`SearchBlock` 與 `WebBlock` 接收完整的在地化 label。本包不擁有語言退回；遺漏會導致型別檢查失敗，各功能會把帶型別的 `t` 席位對映到 primitive 的 label 介面。

-----

<a id="understand-the-implementation"></a>
## 理解實作

`Button` 的 `md` 使用 H36/R12，`sm` 使用 H28/R8，包含描邊控制元件。選單與卡片遵循[共享圓角規則](../../../docs/web-styling.zh.md#corner-radii-and-settings-cards)；功能樣式保留控制元件幾何。

`Menu.listClassName` 獨立控制選單卡片樣式，不影響入口容器，也適用於 portal 模式。前置圖示使用 `--dsw-alias-menu-icon` 文字色；破壞性操作圖示保留錯誤色。

`Menu` 將卡片材質交給 `MenuSurface`，自定義選單也使用該元件。`MenuSurface` 轉發 div 屬性和 ref，採用透明填充及模糊，`compact` 使用較小圓角。預設相對定位使材質層限制在容器內；呼叫方的類可以設定 fixed 或 absolute 定位。macOS 上，不接收互動的底層透過 CSS 錨點跟隨卡片，並隨卡片解除安裝；該底層要求 Web 外殼隔離 body 的層疊上下文。功能類控制佈局和層級，元件負責材質和外圓角（[選單規則](../../../docs/web-styling.zh.md#component-rules)）。 模態遮罩保留黑色半透明填充，不模糊背景。

<details>
<summary>實作細節——點選展開</summary>

本包只做一件事：提供零 cordis、零 slot 知識、僅經 `--dsw-*` token 設定樣式的純 React 原子元件，而所有功能專屬的關注點（locale、工作階段資料、組合）都留在拼裝它們的外掛中。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 原子元件公開匯出 |
| [`src/markdown/`](src/markdown/) | Markdown 與數學公式流水線：micromark 解析、KaTeX 排版、增量流式渲染器、`CodeBlock`/`JsonBlock` |
| [`src/TerminalBlock.tsx`](src/TerminalBlock.tsx) | ANSI 轉義解析（`anser`）與終端卡片渲染 |
| [`src/ReadBlock.tsx`](src/ReadBlock.tsx) / [`src/DiffBlock.tsx`](src/DiffBlock.tsx) | 讀取與差異卡片 |
| [`src/SearchBlock.tsx`](src/SearchBlock.tsx) / [`src/WebBlock.tsx`](src/WebBlock.tsx) | 搜尋與網頁檢索卡片 |
| [`src/icons/`](src/icons/) | 與尺寸無關的 `Regular` 和 `Medium` 產品圖示元件 |
| [`src/code-highlighting.ts`](src/code-highlighting.ts) | 共享的檔名 grammar 選擇與惰性逐行高亮 |
| [`src/input-modality.ts`](src/input-modality.ts) | 全文件輸入模態，釋出到 `<html>` |
| [`src/plugin-artwork.tsx`](src/plugin-artwork.tsx) | 固定配色外掛插畫，SVG def id 按實例生成 |
| [`src/useAnchoredPosition.ts`](src/useAnchoredPosition.ts) / [`src/useAnchoredMaxHeight.ts`](src/useAnchoredMaxHeight.ts) | 浮動面板與浮層幾何掛鉤 |
| [`src/settings-form/`](src/settings-form/) | 設定頁套件：基於設定 scope 的暫存表單模型、值欄位與密文欄位、表單框架 |

<a id="input-modality"></a>
### 輸入模態

[`input-modality.ts`](src/input-modality.ts) 為 tooltip 跟蹤輸入，並在 `<html>` 上釋出 `data-input-modality`，供[主題焦點樣式](../ui-theme/README.zh.md#understand-the-implementation)使用。`pointerModality()` 在指標輸入後為 true，在任意按鍵後為 false，包括 IME（輸入法）組合輸入按鍵；`Tooltip` 據此決定聚焦時是否可以顯示氣泡。釋出的屬性保持 `pointer`，直到非組合輸入的導航鍵（Tab、方向鍵、Home/End、PageUp/PageDown）到達，或非組合輸入按鍵之後焦點移到不同控制元件。重新聚焦同一控制元件不會恢復鍵盤模態。指標輸入、IME 組合輸入按鍵和 window blur 都會清除待處理按鍵；沒有待處理按鍵的焦點變化不改變模態。監聽器與文件同壽命；從 Node 匯入時不安裝監聽器。 焦點變化規則只觀察傳到 window 的事件；shadow root 內部不向外暴露這些事件的額外導航由元件負責。

### 流式 Markdown

回覆流式輸出期間，`MarkdownText` 增量解析：除末尾兩個塊外全部凍結為快取的 React 元素，每個分片只重新解析其後的源文字尾部，因此每分片的工作量跟隨尾部而非整個回覆。末尾的頂層未閉合 fence 會保留已解析的 code node，只把最後一個已完成行與目前未完成行交給同一套 GFM grammar；閉合 fence 或有歧義的解析會回到普通尾部路徑。高亮同樣從儲存的 Shiki grammar state 續接，並只發布新完成行與可變尾部。`CodeBlock` 把已完成行封入固定大小的 React 分組、複用更早的分組，並在程式碼與語言未變化時跨定稿保留整棵高亮樹。定稿時的全量解析仍會解析跨過凍結邊界的引用。

### 幾何與溢位

輸出卡片共享同一套幾何模型：`white-space: pre` 並橫向滾動，讓按列對齊的內容保持對齊；超過 `maxLines`（預設 16）時摺疊為頭部切片加尾部切片，由展開按鈕控制，長正文不會撐高卡片。`TerminalBlock` 把 ANSI 解析為 React span，並帶逐行列緩衝處理游標移動，遵循行內擦除、製表位與字元寬度。主機可按表層選擇退出共享幾何：把 `--dsl-terminal-command-whitespace` / `--dsl-terminal-line-whitespace` 重綁為 `pre-wrap` 讓命令與輸出完整換行且不橫向滾動；`maxLines: Infinity` 為改用 `--dsl-terminal-output-max-height` 限高滾動的主機停用摺疊；`copyText` 覆蓋複製載荷（並讓控制元件在任何輸出出現之前就保持渲染）；`runStateDot: false` 在外圍行已攜帶同一狀態時省去狀態點，並經 `--dsl-terminal-gutter` 收回其落區。橫幅分割線跟隨渲染出的正文：正在流式輸出的 running 卡片像已結束卡片一樣把命令與文字分隔開。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面說明這些原子元件在用戶端技術棧與設計系統中的位置。

- [ui-renderer](../ui-renderer/README.zh.md)——掛載組裝後應用並繫結 slot 資料的 React 渲染器。
- [ui-tool](../ui-tool/README.zh.md)——拼裝這些輸出卡片的工具呼叫展示層。
- [ui-conversation](../ui-conversation/README.zh.md)——渲染 Markdown 回覆與工具卡片的聊天介面。
- [ui-theme](../ui-theme/README.zh.md)——這些原子元件樣式所依賴的 `--dsw-*` token 體系。
- [Web 樣式](../../../docs/web-styling.zh.md)——Web 用戶端元件的權威樣式規則。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明原子元件在邊緣情況下的行為；它們是目前包約束，不是元件路線圖。

- **Diff 搜尋有上限，輸入處理仍為線性**：編輯距離上限使大量改動的片段採用粗粒度替換，不再精確對齊。規範化、退回行及複製內容仍隨輸入大小增長；高度限制只約束可見行數，不限制這些分配。
- **已知站點標記是固定列表**：只有列名的主機解析為自己的標記，其餘外部主機仍使用地球；要識別任意站點需要透過網路抓取它的圖示。
- **流式期間跨邊界引用解析被推遲**：定義落在增量凍結邊界另一側的引用式連結或腳註，在回覆流式輸出期間渲染為字面文字；定稿時的全量解析會將其解析。
- **長高亮 fence 會保留完整 token DOM**：流式路徑避免重新解析、重新 tokenize 和 reconcile 已完成字首，但不會丟棄舊顏色或虛擬化 token span。因此最終 DOM 數量仍隨 fence 的 token 數增長；巢狀／容器內 fence 與病態的單個超長行仍走通用尾部路徑。
- **魚形標誌是重新繪製的近似版本**：它來自字型字形，而本地設計資料無法匯出其向量幾何；在獲得精確匯出路徑前，使用手工重建版本代替。
- **`Pill` 與 `Input` 沒有設計來源**：兩個原子元件均自行定義；與其相似的側邊欄搜尋欄位和檢視標籤條由消費方組合，不是這些原子元件。
- **`StateDot` 沒有 `Active` 變體**：支援的狀態為 done、warning、ongoing、error 和 idle。
- **面向使用者的文案必須由渲染點提供**：這些原子元件是 zero-Cordis 的，拿不到 `ctx.locale`；各功能必須透過原子元件的帶型別 prop 提供完整在地化 label（見[決策](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)）。
- **`TerminalBlock` 不是終端模擬器**：它渲染已結束或仍在執行的命令輸出，而不是互動式工作階段：SGR 顏色、回車、退格、行內擦除、製表位與字元寬度會被遵循；絕對游標定位、清屏與備用螢幕序列會被剝離。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這些是純 props-in React atom，沒有 Cordis API、事件、service 或跨外掛可變狀態；渲染約定由元件測試覆蓋。
