# Agent Note: 把視窗拖拽覆蓋變成契約

Status: implemented

[English](2026-09-19-window-drag-coverage-contract.md) | 中文

## Problem

macOS 桌面視窗的可拖區域被寫了兩遍。佈局決定 chrome 行在哪——它們多高、裝了什麼；手寫的 app-region 宣告決定什麼能拖：每個 chrome 行一條行宣告（側欄頂條與 logo 行、ui-dockkit 的 strip 行、工作階段 header、外掛管理的頁頭、Platform 浮層的返回欄），加上散落在 ui-web、ui-settings-general、ui-sidebar-right 的逐盒減除。兩份描述靠人肉保持一致，於是會漂：盒子與 band 不匹配的行，要麼有 chrome 落在拖拽面之外（就是回饋裡的"header 能拖，但有些空白與控制不能"），要麼有內容落進拖拽面（點偏幾個畫素就變成拖視窗，雙擊那裡還會觸發系統標題欄行為）。

## Decision

覆蓋變成由四部分組成的、可執行的契約：

1. ui-web 的 `window-drag/regions.ts` 把合成規則釋出成可執行模型——當包含某點的最後一個 app-region 盒宣告 `drag` 時該點可拖，這正是原生視窗施加的"按 DOM 順序的幾何合成"——並行布 `INTERACTIVE_SELECTOR`，作為 ui-web base.css 互動減除的唯一來源。base-styles spec 斷言樣式表宣告的正是該列表，兩者無法漂移。
2. 外殼只宣告一次 darwin 拖拽面：ui-web base.css 裡的 `html[data-platform='darwin'] [data-window-drag]`。每個 chrome 行在 markup 裡給自己的元素打標，於是該行自己的盒子就是視窗的可拖幾何，不需要任何固定 band 去匹配行高。ui-theme 的 app-region 門禁持有一份清單，把每行的 markup 標記與其樣式表、類選擇器和寫死的高度配成一條，並拒絕清單未點名的元素上的標記——行不再打標、新增未打標的行、把標記打在內容容器上，都會在同一條門禁上失敗。
3. 瀏覽器車道增加 `window-drag-coverage`：以 `data-platform='darwin'` 在 Chromium 裡啟動真實組合，用模型斷言沒有任何互動盒落在拖拽面內，並對各 chrome 行逐一探測，另加一個"頁頭行打標、其可滾動正文保持內容"的頁面。
4. 外殼持有唯一那個重收集 watcher——ui-web 的 `window-drag/recall.ts`，由引導核心安裝。在表面可能移動期間，它每幀測量每個被打標的行，凡該幀幾何發生變化就在 body 上打 `data-window-drag-recall`；幾何在一段很短的寬限視窗內保持不動之後才清掉，這樣在 CSS transition 真正移動任何東西之前到達的一次報告，不會在它第一幀未測到變化時就終止迴圈。它會報告表面可能移動的每一種原因：觸及被打標行或承載它的容器的 DOM 變化、被打標行的盒子尺寸變化，以及持有被打標行的元素上開始的 transition 或 animation。任何 chrome 行都不再自帶脈衝。

原生那一半——一次按下到底是拖視窗還是到達頁面——仍是清單，因為沒有無金鑰 CI 車道能到達視窗伺服器：對本層的任何改動都要走下面的狀態矩陣。

## Alternatives considered

**用 JavaScript 測量矩形並行布合成 drag 盒。** 幾何得按指標節拍重新推導，而一幀陳舊正是這項工作要消除的吞點選類別；CSS 推導的區域在建構上不可能陳舊。

**全域背景拖拽（`movableByWindowBackground` 的讀法）。** 只要不是控制元件就能拖，會破壞文字選擇與空白處點選。

**每個行在自己的樣式表裡各宣告一條 drag。** 這是本項工作最初的樣子，並配一份清單釘住每行高度與覆蓋它的 band。那樣每個樣式表都要複述視窗幾何，而且只在佈局裡移動的盒子仍得在 CSS 裡重新宣告；改成"markup 打標 + 外殼一條規則"後宣告只有一處，清單則繼續把標記與門禁能查的幾何配起來。

**把目前覆蓋釘成一張金標準快照。** 那會把兩類故障和正確行為一起凍住；清單把不變數（不得吞掉控制元件）與缺口（只許縮小的預算）分開。

## Consequences

- 新控制元件不需要任何 drag 宣告：互動選擇器會減除它。新 chrome 行只需給元素打上 `data-window-drag` 並在清單里加一條釘住高度，無需 band 算術，也不牽動其它樣式表。
- 行自己的盒子就是完整的可拖幾何，內容容器永遠不是。外掛管理的詳情檢視給它們共用的頁頭行打標，而不是給它所在的詳情容器打標：標記容器會讓視窗在它的正文與表單 label 上拖曳；車道會取樣該頁頭下方的正文來守住這一點。
- 不再有任何缺口：每個 chrome 行自持其拖拽段，門禁斷言整個包樹只在兩處宣告拖拽面——外殼的標記規則與 Windows 標題欄行。外掛管理頁頭與其詳情檢視共用的頁頭行都把 48px 避讓量包含在行內，入口頁那條缺口也隨之關閉。
- settings 浮層現在與 Modal primitive 一樣 portal 到 `#root` 之外，並刪掉了它自己那條 no-drag：掛在 root 內的覆蓋層先於各列 chrome，後宣告的 drag 行會蓋掉它的減除；portal 之後由 ui-web base.css 的 `body > :not(#root)` 規則在它與 drag 行重疊處減除。車道在浮層開啟時會斷言這個歸屬。由於 onboarding 步驟的浮層只把 `#root` 置為 inert，onboarding 步驟掛載時面板會自行關閉，而不是留在它背後仍可聚焦。
- Platform overlay 的返回欄只是 darwin 的 drag 行。它原先那條按表宣告的 `app-region: drag` 沒有任何平臺限定，因此 Windows 上也能從這條 48px 欄拖曳視窗；改到唯一那條帶作用域的規則之後，該欄只在 macOS 上宣告 drag，在那裡它就是視窗頂條。Windows 保留原生標題欄行作為拖拽面，且外殼沒有 Linux 桌面目標。人工狀態矩陣會為這條欄增加一格。
- 跨越隱藏/顯示邊界滑動的行不能只靠佈局變化：只有當計算出的 app-region 值變化時，Electron 才會重新收集視窗的拖拽矩形（electron#32341），而 Blink 收集時會跳過隱藏的盒子。watcher 一次性把這個缺口對所有行補上——它在"觸及被打標行的 DOM 變化"或"被打標行的盒子尺寸變化"時重新啟動，隨後在盒子仍在移動的每一幀發脈衝——因此右欄不再自帶任何脈衝。

## Testing

- `packages/client/web/tests/window-drag-regions.client.spec.ts` —— 合成規則，含順序敏感與盒子邊界。
- `packages/client/web/tests/base-styles.client.spec.ts` —— base.css 宣告的正是模型的互動選擇器、唯一那條 darwin drag 規則，以及 recall 標記的減除。
- `packages/client/ui-theme/tests/app-region-styles.client.spec.ts` —— 拖拽所有權、行清單與每行的標記；清單之外的標記或行高變化即失敗。
- `packages/client/ui-dockkit/tests/app-region-styles.client.spec.ts` —— strip 行自己的減除；它的 drag 屬於 markup 標記，因此樣式表一條都不宣告。
- `packages/client/web/tests/window-drag-recall.client.spec.ts` —— 透過兩個 seam 驅動 watcher：什麼會重新啟動它、什麼被它忽略、收斂迴圈、外殼預設值，以及銷燬。
- `apps/web/tests/window-drag-coverage.e2e.ts` —— 真 Chromium：無控制元件被吞、逐行探測、一個頁頭行可拖而正文不可拖的詳情頁，以及右欄滑動期間外殼發出的 recall 脈衝。
- 真機驗收（2026-09-20，雙平臺，HID 級指標輸入 + 視窗矩形讀數）：上面的 macOS 矩陣在真實 `hiddenInset` 視窗上跑過，Windows 各格在 Windows 11 ARM64 虛擬機器上跑過——chrome 行可拖、正文與覆蓋浮層不可拖、控制元件保留點選、右欄 strip 行在滑入後可拖。

## Manual state matrix

對本層的任何改動都要在打包 macOS 應用上跑。每個格子包含兩半：拖該行的空白段（視窗必須移動），點該行的控制元件（必須生效而不是拖曳）。

| 狀態 | 要走的行 |
| --- | --- |
| 側欄展開、選中工作階段、顯示檢視 tab | 側欄頂條、側欄 logo 行、工作階段標題行、工作階段 tab 條行，以及這些行裡的每個控制元件 |
| 側欄展開、選中工作階段、單檢視（無 tab） | 同上，外加 header 之下的轉錄區首行 |
| 側欄收起 | 覆蓋中列的 工作階段 header、`shell.leading` 座的控制元件、重新開啟與新工作階段 |
| 右欄 push | 面板 strip 行及其控制元件、strip 下方的 pane body 段、分欄分隔條的頂部一段 |
| 右欄 fullscreen | 紅綠燈處的面板 strip 行、首格 strip 內邊距、其控制元件 |
| 入口頁（開始頁、外掛管理、設定） | 含 48px 避讓量的頁頭、它的首個控制元件行，以及詳情頁頁頭行與其正文 |
| 視窗全螢幕開關 | 以上各行在紅綠燈隱藏時、兩種側欄狀態各一遍 |
| 在 chrome 行空白段雙擊 | Windows 上 caption 行走系統標題欄行為（最大化/還原）；macOS 上 darwin 行只是 app-region 區域而非標題欄，因此那裡沒有系統動作——只有控制元件保留自己的雙擊 |
