---
description: "dsh Web 用戶端的主題與正文字號設定：--dsw-* token 樣式表、ThemeRuntime 狀態、「通用」設定行與外掛前引導。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-theme

[English](README.md) | 中文

## 概述

`dsh-client-ui-theme` 讓 Web GUI 使用者在設定中選擇 `light`、`dark` 或 `system`，並把工作階段正文字號設為 12 至 17 px。迴環用戶端把兩個值存入 `ui-theme` 設定名稱空間，本地提供者預設將其持久化到 `$DSH_HOME/cordis.patch.yml`。外掛透過 `prefers-color-scheme` 解析 `system` 並行布不可變的 `ThemeSnapshot`；ui-layout 把每份快照應用到文件。本包還提供 `--dsw-*` token 樣式表，並注入同步引導，使所選調色盤與字號在外殼載入前生效。第三方主題可透過 `ctx.theme` 註冊別名 token 覆蓋。

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

使用者從設定（「通用」分割槽）的兩行中切換配色方案與正文字號；在迴環瀏覽器上，兩個選擇都會跨重新啟動持久化。功能外掛透過 `ctx.theme` 消費目前快照，並在 CSS 中讀取 `--dsw-*` token；它們不自行管理主題狀態。

### 外觀與字號

外掛在「通用」分割槽註冊外觀偏好方塊與字號步進器。步進器接受 12 至 17 px 的整數，預設值為 14 px。它以相同增量調整工作階段標題與基礎文字，包括使用者氣泡與 composer 草稿；流內行的標題、摘要與表格跟隨比正文低一檔的字號，小號文字和程式碼保持固定字號。每次透過的變更都經 Host settings API 寫入。連續快速變更按操作順序攜帶名稱空間 revision 序列寫入，最新寫入被拒時重新載入持久值。非 loopback 頁面把兩個選擇都保留在程序內。

### 註冊主題

組合可以透過 `ctx.theme` 註冊帶別名 token 覆蓋的第三方主題 id；覆蓋層按註冊順序折入活動快照的 token 中。移除其中一個絕不會覆蓋最後一個持久化的內建偏好。第三方主題 id 仍是程序內擴充功能，不會跨越內建 settings schema。

### 外掛前調色盤

當主機組合包含 HTTP 伺服器時，主機側會把已註冊的 `ui-theme` 設定或 schema 預設值嵌入每份 index 回應。head CSS 會在任何腳本執行前選擇文件畫布的配色方案，其中 `system` 偏好使用 `prefers-color-scheme` 查詢；隨後，body 腳本會在載入頁面和應用腳本之前設定 `body[data-ds-dark-theme]` 與 `--dsh-content-font-size`，因此首幀繪製就採用所選調色盤與字號。

-----

<a id="understand-the-implementation"></a>
## 理解實作

公共選單透過 `MenuSurface` 共享 `--dsw-menu-surface-fill` 和模糊，平臺程式碼須保留這些 token 值。其他浮層使用 `--dsw-specific-menu`，在沒有選單底層時保留 macOS 上接近不透明的填充。原始碼約束見[樣式參考](../../../docs/web-styling.zh.md#component-rules)。 模態遮罩保留黑色半透明填充，不模糊背景。

<details>
<summary>實作細節——點選展開</summary>

服務擁有主題與字號狀態並行布快照。ui-layout 展示轉換器應用這些快照，token 樣式表則擁有顏色與工作階段文字尺度。

### 樣式表

`base.css` 持有共享圓角尺度與設定卡片材質別名。材質別名在 `body` 上隨目前色板解析。元件圓角選擇遵循 [Web 樣式參考](../../../docs/web-styling.zh.md#corner-radii-and-settings-cards)。

`src/styles/` 下有八張樣式表，由 ui-theme 的動態用戶端 entry 依次匯入：`base.css`、`corner-shape.css`、`design-platform.css`、`focus.css`、`onboarding.css`、`scrollbar.css`、`gradient-shadow-text.css` 與 `shiki.css`。用戶端 bundle 將其編譯並注入為外掛持有的全域樣式，因此解除安裝與 HMR（熱模組替換）會隨 ui-theme 一同移除。`scrollbar.css` 消費 `--dsw-alias-scrollbar-*` token，必須排在宣告這些 token 的 `design-platform.css` 之後。狀態標記使用各自的語義狀態 token。`design-platform.css` 還負責程式碼差異底色的別名及其靜態透明度色階，以及檔案對比所用的 `--dsw-alias-file-diff-*` 程式碼區、行號區和標記配色；`shiki.css` 負責語法顏色。

[`focus.css`](src/styles/focus.css) 提供 `:focus-visible` 後備：透過 `var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))` 宣告焦點環顏色，並透過 `--dsw-focus-ring-width` 宣告標準寬度，但不宣告輪廓樣式——因此停用輪廓的控制元件仍然不繪製，而沒有自有焦點環的控制元件保持標準幾何，而不是落到 Chromium 的 `auto 1px`。主題將該藍色解析為淺色模式的 `#4176E6` 和深色模式的 `#7AAAFF`。元件輪廓與焦點環陰影使用同一顏色表示式，包括後代和偽元素上的環。`--dsw-focus-ring-width`（2px）是標準寬度；密集表格與工具欄可以保留 1px，offset 仍由元件決定。

指標模態下，`html[data-input-modality='pointer'] body :focus-visible:not(:read-write)` 將焦點環顏色設為透明。後代與偽元素繼承該值；規則不清除 `box-shadow`，因此 elevation 陰影與選中態邊框獨立於焦點環可見性。匹配 `:read-write` 的可編輯文字控制元件在點選時保留自身焦點回饋。[輸入模態](../ui-primitives/README.zh.md#input-modality)決定何時恢復鍵盤焦點樣式；它不移動 DOM 焦點。

選單圖示使用 `--dsw-alias-menu-icon`：淺色模式為 neutral-bluish 800，深色模式為 `label-primary-dimmed`。

`base.css` 僅抑制[基礎控制元件焦點工具](../ui-primitives/README.zh.md)透過 `data-dsh-automatic-focus` 標記的聚焦元素外輪廓線；正常鍵盤焦點樣式、邊框、陰影及錯誤狀態保持不變。

系統提示使用 `--dsw-alias-toast-bg` 和 `--dsw-alias-toast-label`，在各呼叫方之間統一背景與文字顏色。文件預覽配對使用 `--dsw-alias-bg-document-preview` 與 `--dsw-alias-label-document-preview`，使底色與狀態文字遵循相同主題。Tooltip 鍵帽使用 `--dsw-alias-tooltip-key-bg`，由各主題的 tooltip 背景派生稍淺的填充。

`brand-font.css` 匯出本地 Montserrat Light、Regular 和 Medium 字型（正體、字重 300、400 和 500），`lib/styles/` 同時提供 `montserrat-light.woff2`、`montserrat-regular.woff2`、`montserrat-medium.woff2` 及其 SIL Open Font License。Desktop 將同一份樣式表、字型和許可證打包，用於歡迎頁品牌文字的離線顯示；普通介面保留系統字型棧。

`corner-shape.css` 平滑所有圓角：在 `@supports (corner-shape: superellipse(1.5))` 內定義 `--dsw-corner-shape`，並透過通配選擇器應用到所有元素及其 `::before`/`::after`，因此不支援 `corner-shape` 的引擎保持普通圓弧。正圓形狀——`border-radius: 50%` 的圓與膠囊半徑——因超級橢圓會使其變形，須在所屬元件樣式表中把 `corner-shape: round` 與半徑宣告配對；corner-shape 樣式表 spec 跨全部包樣式表強制這一配對。

`gradient-shadow-text.css` 從 `--dsh-content-font-size` 派生 `--dsh-content-font-delta`，並以該增量移動 Markdown 標題與基礎文字階梯。它同時派生低一檔變數 `--dsh-content-font-size-secondary`（設定 ≤14 時為設定值 −1，>14 時為設定值 −2；預設設定下為 13 px）及配套的 `--dsh-content-font-delta-secondary`，供表格變體與比正文低一檔的流內行使用。緊湊的小號文字與程式碼變體保持固定字號。階梯之外，使用者氣泡與 composer 草稿直接讀取正文字號變數對，流內行的標題及摘要讀取低一檔變數對。該表還持有陰影階（`--dsw-shadow-lv*`）、半透明選單使用的 `--dsw-menu-backdrop-filter` 與 elevation token：`--dsw-elevation-stroke` 經可重綁的 `--dsw-elevation-stroke-color` 畫 0.5 px 髮絲描邊，`--dsw-elevation-panel`/`--dsw-elevation-prominent`/`--dsw-elevation-soft`（composer 專用的更大模糊、更低透明度檔）在描邊之上疊兩層極淡柔光，因此高層級表面設 `border: 0`，不會產生佔佈局的輪廓；派生 token 逐元素重宣告，使表面對描邊色的重綁真實生效。繪製 `--dsw-specific-menu` 的高層級表面還會應用 `backdrop-filter: var(--dsw-menu-backdrop-filter)`。 深色選單使用不透明度為 45% 的灰色底與 `border-l3` 描邊；淺色選單保留 `border-l1` 描邊。

`brand-font.css` 引用隨包提供的 `montserrat-regular.woff2` / `montserrat-light.woff2` / `montserrat-medium.woff2`，其中包含 Montserrat Regular、Light 和 Medium 字型，SIL Open Font License 與樣式表和 WOFF2 一同隨包儲存在 `lib/styles/`。`--dsw-font-family-brand` 為品牌文字選擇該字型，普通介面仍使用系統字型棧。原始檔來自 Google Fonts 的 Montserrat 釋出。Web 入口匯入包的 `./brand-font.css` 匯出，由 Vite 輸出並解析字型資源，Web 建置也包含其許可。Web 應用（包括 Desktop 引導）可離線載入字型；原生憑證歡迎頁保留系統字型。

`onboarding.css` 管理引導強調色、以紫色/藍色/青色命名的漸變，以及卡片、核取方塊和次要操作的淺色與暗黑配色。卡片陰影的偏移與模糊尺寸由業務元件管理。

### 捲軸重新繫結

`scrollbar.css` 在 `body` 上把 `--dsh-scrollbar-thumb` 與 `--dsh-scrollbar-thumb-hover` 繫結到 l1 基礎表面 token；高層級表面（選單、浮層、對話方塊）在自己的容器上把它們重新繫結為 l2 token；這組變數的另一個合法目標是 `transparent`（ui-sidebar 在指標不在欄內時就這樣重新繫結自己的列）。WebKit 系瀏覽器預設使用 5px 的 `--dsh-scrollbar-width`，並讀取 `--dsh-scrollbar-thumb-border` 與 `--dsh-scrollbar-track-margin`；滾動表面可重新繫結它們，在較窄的可見滑塊外保留較寬的拖曳區域，或讓軌道避開圓角兩端。兩條渲染路徑在建構上互斥：Firefox 走 `@supports not selector(::-webkit-scrollbar)` 內的標準細捲軸，WebKit 系引擎走偽元素，因此幾何與 hover 定製只經由偽元素路徑生效。

### 偏好持久化

在 loopback 瀏覽器上，服務先以 schema 預設值立即提供自身，隨後載入 `ui-theme` 名稱空間，並把每次透過的主題或字號變更經 Host settings API 寫入。收到推送的設定變更時或重連後都會重新拉取該名稱空間。非 loopback 頁面不會建立該 Host-backed scope。該持久化邊界由 [Host 支撐的偏好筆記](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.zh.md) 擁有。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋佈局展示轉換器、token 消費方與樣式規則。

- [ui-layout](../ui-layout/README.zh.md)——應用解析後主題快照的展示轉換器。
- [ui-sidebar](../ui-sidebar/README.zh.md)——捲軸重新繫結約定的消費方。
- [ui-conversation](../ui-conversation/README.zh.md)——為 composer 席位消費 `--dsh-scrollbar-width` 的消費方。
- [Web 樣式](../../../docs/web-styling.zh.md)——Web 用戶端元件的權威樣式規則。
- [Host 支撐的偏好](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.zh.md)——持久化邊界決策。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義主題擴充功能表面與顏色權威；它們是目前包約束。

- **第三方主題是擴充功能點，不是產品**：註冊主題意味著覆蓋同名別名變數；目前不會驗證一組覆蓋是否完整。
- **token 樣式表是顏色值的唯一權威來源**：設計系統中缺失的值會有意不補入；一律採用最接近的語義 token，設計負責人批准的新增值須在同一變更中以一個靜態尺度層級與一個語義別名的形式進入。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。settings scope 驗證並行布持久 theme section，註冊表與自身變更同步發出 `theme/change`；儲存與註冊表的一致性由本包針對 Host、scope 與服務行為的測試直接覆蓋。
