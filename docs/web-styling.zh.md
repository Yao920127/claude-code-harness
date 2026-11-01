# Web UI 樣式參考

[English](web-styling.md) | 中文

本文規定瀏覽器用戶端包的樣式職責歸屬與元件規則。目前 token 值位於 [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/)；本文不重複這份由原始碼生成的清單。

## 職責歸屬

[`ui-theme`](../packages/client/ui-theme/README.zh.md) 負責 `--dsw-*` 靜態色階、語義別名、排版、動效、漸變、陰影、捲軸樣式以及明暗主題偏好。[`ui-layout`](../packages/client/ui-layout/README.zh.md) 將解析後的主題快照應用到文件。功能包使用語義別名，不得另行定義全域主題。

全域樣式表歸 `ui-theme/src/styles/` 所有。元件樣式以 CSS Modules 形式放在元件旁。當某個值屬於該元件的佈局或呈現約定時，元件可以定義區域性自定義屬性；共享顏色、排版、層級和動效屬於主題包。

<a id="component-rules"></a>
## 元件規則

- 重新設計控制元件樣式之前先複用控制元件：[ui-primitives 元件目錄](../packages/client/ui-primitives/README.zh.md#component-catalog)是唯一跨功能包的通道，有意的視覺差異應作為那裡的一個 prop，而不是另起一份複製（[決定](../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.zh.md)）。
- 使用 CSS Modules 和 `clsx`；不得新增元件庫或 Tailwind。
- 功能元件使用 `--dsw-alias-*` 語義 token。不得複製靜態色板值或在其中寫入顏色字面量。
- 功能元件 CSS 不得包含主題選擇器。明暗主題覆蓋屬於主題所有方。
- 字型大小必須與行高配對；已有角色匹配時使用主題排版變數。
- 當元件約定要求保留列結構時，原始碼文字、終端輸出和 diff 行不得換行；使用共享捲軸樣式，不得定義元件專用捲軸選擇器。
- 呈現規則寫在 CSS 中。React 內聯樣式可以傳遞元件區域性自定義屬性值，但不得編碼主題分支。
- 新增過渡動畫或僅懸停可見的控制元件時，保留清晰可見的鍵盤焦點和減少動態效果行為。
- 支援的引擎上，圓角繼承 ui-theme `corner-shape.css` 的全域超級橢圓平滑。每個正圓 `border-radius`（`50%`、`100%` 或膠囊半徑）必須配對 `corner-shape: round`，使圓形與膠囊保持圓弧；ui-theme 的 corner-shape spec 強制這一配對。
- 高層級表面（選單、浮層、對話方塊、面板、懸浮按鈕、輸入框）設 `border: 0` 並使用 `box-shadow: var(--dsw-elevation-panel)`、`var(--dsw-elevation-prominent)` 或輸入框專用的 `var(--dsw-elevation-soft)`（更大模糊、更低透明度）：0.5px 髮絲描邊是第一層投影，`--dsw-elevation-stroke-color` 可按表面或狀態重綁或抑制描邊。不得將 `--dsw-alias-border-*` border 與 lv/elevation 投影配對——ui-theme 的 elevation spec 會拒絕；狀態色 border（warn 面板）保持真 border。
- 存量和新增的下拉選單、上下文選單、子選單及選擇選單使用 `Menu`，自定義內容用 `MenuSurface` 包裹。材質由主題的 `--dsw-menu-surface-fill` 和 `--dsw-menu-backdrop-filter` 組成；功能及平臺 CSS 不得覆蓋兩者。ui-theme 選單檢查拒絕未使用共享容器的 menu/listbox 渲染、材質覆蓋和 token 重定義。計劃任務自有的 `TaskMenu` 與 `ClockPicker` 是明確例外，保留現有容器和材質（[所屬包](../packages/client/ui-schedule/README.zh.md)）。
- 設定、確認框等模態彈出視窗保留黑色半透明遮罩，不模糊背景。主題將 `--dsw-mask-blur` 設為 `none`；Desktop 自有模態浮層也不對父頁面施加模糊。
- 選單背景模糊繪製在獨立圖層上，保證巢狀選單和 fixed 浮層的定位及背景取樣。macOS 上，`MenuSurface` 僅在各選單範圍內、頁面內容後方新增實色底層，使 Chromium 能在原生透明材質上模糊頁面內容；CSS 錨點跟隨位置及尺寸，解除安裝時移除底層。沒有該底層的浮層使用 `--dsw-specific-menu`，主題在 macOS 上將其設為 94% 不透明度，防止下方文字透出。其他使用該填充的浮起表面也須配套同一模糊；包含 fixed 浮層時，將兩者繪製在獨立背景層上。
- 使用中性 `--dsw-alias-border-*` token 的平面邊框與分割線一律 `0.5px`——按鈕、輸入框、卡片、行分割線，以及以填充盒繪製的分隔線（選單分隔、對話標題欄接縫、markdown `hr`、豎向軌道線）共用髮絲線粗細，Chromium 將其繪製為一個裝置畫素。dashed 記號與狀態色 border 保持 1px；spinner 圓環經 spec 的顯式豁免保留原寬度。更寬的中性 solid border 會被 ui-theme elevation spec 拒絕。
- 可點選產物連結（Markdown 錨點、正文件案引用、網頁來源與抓取連結、產物 chips、workflow 成員連結）經 `--dsw-alias-link` 著色、`font-weight: 500`，預設無下劃線，hover/focus 時為 3px offset 的點狀下劃線。緊湊 Thinking Markdown 保持 tertiary 文字色和預設點狀下劃線（[緊湊展示](../.agents/notes/implemented/bug-fix/2026-09-17-thinking-markdown.zh.md)）。帶文字的錨點另以 ui-primitives 的 `LinkIconMedium` 分類圖形（隨 `currentColor`）作前置；目的地是已知外部站點時改用該站點自己的標記而非地球；workflow 成員連結與只包圖片的錨點不帶圖形，工具行檔案連結保持其灰色點線示能。

<a id="corner-radii-and-settings-cards"></a>
## 圓角與設定卡片

圓角尺度、元件尺寸對映、正圓與膠囊例外、巢狀 hover，以及設定卡片的底色與描邊統一由 [DSH 統一圓角規範](ui-radius.zh.md)定義。

## 變更系統

在所屬 `ui-theme` 樣式表中新增或修改共享 token，然後在功能包中使用其語義別名。公共樣式約定發生變化時，更新所屬包的參考文件。視覺行為遵循[測試策略](testing.zh.md)；[樣式系統 Agent Note](../.agents/notes/implemented/process/2026-07-19-web-styling-system.zh.md) 記錄框架依據。
