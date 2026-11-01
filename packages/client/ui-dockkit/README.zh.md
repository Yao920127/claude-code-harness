---
description: "dsh Web 用戶端的停靠佈局套件：帶可逆操作的標籤格分裂樹、planner、線性歷史，以及渲染並驅動它的元件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dockkit

[English](README.md) | 中文

## 概述

一套停靠佈局套件：由帶可逆操作的標籤格組成的分裂樹，以及渲染並驅動它的元件。Harness Web 用戶端是它的第一個嵌入方；這裡的程式碼對此一無所知。

> **內部引擎。** 本包之所以釋出，是因為 Sidebar 以靜態連結方式使用它，而非作為穩定 API：它的匯出——`LayoutState`、`LayoutOp`、各 planner、`DockIntents`、`DockLabels`、`DockMode`——在任何版本都可能變化，並且沒有任何一個出現在服務介面裡（`ctx.sidebarRight` 只暴露操作，從不暴露布局快照或操作日誌）。

## 目錄

- [兩層結構](#the-two-layers)
- [如何嵌入](#embedding-it)
- [值得保留的互動規則](#interaction-rules-worth-keeping)
- [建置形態](#build-shape)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="the-two-layers"></a>
## 兩層結構

**引擎**是純邏輯——沒有 UI 框架、沒有 DOM、沒有主機概念。

- 一棵歸一化的遞迴分裂樹：按 id 索引的 `nodes`、指向停靠根的 `rootId`、自底向上排列的 `floats`。`PaneId`、`SplitId`、`TabId` 是帶 brand 的字串：只有 `Mint`（或庫自己的 DOM 往返）能產出，因此 pane、split、tab 三種 id 彼此不可互換，也不能拿裸字串充數。浮窗不是第二個概念——它就是 `host` 為 `'float'` 的格，容量一個 tab，繪製時不帶 tab 條。
- `applyOp(state, op)` 返回下一狀態**以及撤銷它的操作**。逆操作在操作執行時捕捉，因為到撤銷時操作前的狀態已經不存在了。
- 每個操作都攜帶它建立的 id，因此 `replay(initial, ops)` 能復現同一棵樹。引擎不讀時鐘，也不讀隨機源。
- `Sequencer` 維護一條線性歷史，每個意圖一條記錄：一次手勢或命令產生的操作一起後退、一起前進，連續的純焦點記錄作為一步，後退後的新記錄會丟棄前進分支。
- `planSettle` 是可選加入的規則，保證意圖之後每個停靠格都有內容：被意圖清空的格會被並掉，被清空的根格透過嵌入方的工廠重新播種——不傳工廠則只並格、讓根格保持為空。想要空格的嵌入方只需不呼叫它，或不帶工廠呼叫。`planDropTab` 接受同一工廠：帶工廠時，唯一 tab 放到本格邊緣會分欄，工廠的 tab 回填它騰出的格（被拖的 tab 保持聚焦）；不帶工廠時這種釋放不改變任何東西。
- `DockController` 是意圖層，也是一個可觀察源（`subscribe` + `getSnapshot`，其引用只在佈局變化時才變）。

**元件**渲染布局快照並上報已落定的意圖——每次手勢一條，絕不上報拖曳幀。拖曳過程中在本地狀態裡預覽，手勢自身的事實留在它的閉包裡；鬆手時淨結果透過一次 `DockIntents` 呼叫離開——在標籤條上鬆手上報的是按繪製順序數出的插入槽位（被拖的 chip 也計入），由 `planPlaceTab` 換算成重排或移動。正是這一點讓嵌入方能為每次手勢記錄恰好一條歷史。標籤條遵循 WAI-ARIA tabs 模式的手動啟用：選中的 chip 在 Tab 鍵序裡；左右方向鍵（迴圈）、Home、End 只在 chip 之間移動焦點而不選中；Enter 或空格選中目前聚焦的 chip，走與點選相同的意圖。chip 是一個膠囊，攜帶唯一的控制元件——它的關閉按鈕；上下文選單（在 chip 上的次鍵按下）攜帶同樣的關閉項加上嵌入方的條目——一個連一項都沒有的選單絕不展示——並渲染在按 chip 定位的 portal 裡，因為 chip 盒會故意裁掉溢位（見下文）。chip 之後是新增控制元件，它請嵌入方（`DockIntents.addTab`）安放其種子 tab；嵌入方的 `canAddTab(paneId)` 按格決定是否繪製該控制元件。複製 tab 沒有套件控制元件——那是嵌入方的 API——而浮出就是把拖曳鬆手在停靠區之外。

標籤上下文選單隻顯示關閉操作名，不顯示快捷鍵：選單操作針對被點選的標籤，快捷鍵則可能作用於其他焦點分欄。無修飾鍵的 Esc 關閉前臺標籤選單而不關閉標籤，並將選單項的焦點交還標籤，不繪製焦點外輪廓線。Tab 和方向鍵導航保留標籤頁的可見焦點提示。輸入法組合輸入和長按重複事件不關閉選單。

<a id="embedding-it"></a>
## 如何嵌入

一切主機相關的東西都透過 props 進入：

| 約定 | 承載內容 |
|---|---|
| `DockLabels` | 每一個渲染出來的字串，已在地化，含無障礙名稱 |
| `TabRenderer` | 一個 tab 的正文（`renderTab`），貼著格的邊緣和（不帶邊線的）tab 條底邊繪製、自己決定留白，以及可選的 chip 或浮窗頭部顯示的標題（`renderTabTitle`，退回到記錄的 `title`）；嵌入方按 `tab.kind` 分發 |
| `DockIntents` | 每次手勢落定的結果 |

`DockController` 原樣滿足 `DockIntents`，因此嵌入方可將它交給 `DockLayout` 來保活 Sidebar 佈局，或交給 `DockSurface` 來渲染遞迴分割樹。經由自己 store 路由的嵌入方則實作同名方法。有三個 props 承載的是控制策略而非手勢：`canSplit`（整面有效，即格預算；用 `splitPaneDisabled` 停用分欄控制元件）、`canAddTab(paneId)`（按格，省略新增控制元件；不傳則每格都畫）與 `canCloseTab(tabId)`（按 tab，把 chip 的關閉控制元件和選單的關閉項一併收起；不傳則每個 tab 都可關閉）。隱藏新增控制元件不會移動 tab 條裡的其它任何東西，收起關閉也不會移動 chip 裡的任何東西——關閉控制元件壓在標題末端之上而非並排。某格僅剩的一個 chip 在關閉被收起時畫成安靜樣式——沒有膠囊底色，沒有懸停填充——因為既沒有別的 tab 可供選擇，也沒有任何可對它做的事。套件自己再加一條策略，即下文的空間規則，它用 `splitPaneNarrow` 停用某格的分欄控制元件；`onRoom(fits)` 上報其讀數，讓以程式設計方式分欄的嵌入方能遵守同一規則。

`dropZones="horizontal"` 提供左右兩個半區提示；預算或寬度不允許再拆時，正文整格接收移動。提示是一張內縮 8px 的虛線卡片，顯示該落區的圖形和 `labels.dropZone[zone]`；預覽層覆蓋全部 tab 正文，指標所在的卡片取強調色，另一張保持安靜的輪廓。`minPaneFraction` 控制預覽的最小比例，`planResizeSplit` 接受相同最小值以約束提交；Sidebar使用0.2並在自己的store限制兩格。通用引擎仍保留原有樹與其它分割方向。 `hideSplitWhenBlocked` 在分欄被阻止時（窗格預算已滿或格太窄）直接隱藏分欄控制元件而不是渲染停用態，預設值為 false。

tab 的 `kind` 是不透明字串。種子 tab 是工廠（`DockControllerOptions`），因此新格里放什麼由嵌入方決定，與本包無關。內容身份是二元組（`kind`、`contentId`）：`findContentTab(state, contentId, kind?)` 在任意位置找到展示它的 tab，`findPaneContentTab(state, paneId, contentId, kind?)` 在一個格內找；`planOpenContent` 會聚焦該 tab 而非再開一個，除非被告知 `revealIfOpened: false`；顯式的 `index` 把新 tab 放到 tab 條的某個位置而非末尾。

Sidebar 使用的 `DockLayout` 在選中項變化、跨格移動與浮動期間，把每個 tab 保留在穩定的 DOM 容器中。它接受一個停靠格或左右兩個格，由 CSS Grid 計算寬度。`keepMounted(tab)` 保留已存取正文，`active` 控制 Session 可見性，不改變內容的父子關係。

`DockSurface` 是獨立遞迴渲染器的停靠區。它周圍的 chrome——軌道、摺疊形態、任何歷史控制元件——屬於嵌入方，由嵌入方讀取 `state.expanded` 後自行決定；套件不自帶撤銷/重做控制元件。嵌入方確實想放到面上的整面控制元件透過 `chrome` prop 傳入，套件把它放在右上格 tab 條的最末端（每個橫向分裂的最後一個子節點、每個縱向分裂的第一個子節點），因此停靠面不需要自己的標題行。`FloatLayer` 擁有自己的手勢並以視口座標定位浮窗，因此可以掛在任何位置，包括 portal 裡。

<a id="interaction-rules-worth-keeping"></a>
## 值得保留的互動規則

分欄控制元件接收嵌入方傳入的在地化提示文字、`splitPaneKeys` 獨立按鍵及 ARIA 組合。關閉控制元件透過 `closeTabKeys` 接收按鍵。停用控制元件由可鍵盤聚焦的容器承載，說明分欄數量或寬度限制。停靠與浮動面板容器支援程式設定焦點，不進入正常 Tab 順序，也不繪製焦點外框；內部控制元件保留各自的鍵盤焦點提示。標籤導航和選擇只使用無修飾鍵組合，輸入法按鍵交回其所屬輸入區域。

這些不是風格偏好；每一條都修復了在真實瀏覽器裡發現的缺陷。

- **手勢開始時捕捉指標。** 不捕捉的話，指標經過的任何滾動容器都可能接管手勢，瀏覽器會將其報告為指標取消和拖曳中止。捕捉是加固——無論如何都由 window 監聽器承載手勢，所以沒有該 API 的環境照樣可用。
- **chip 讓位；tab 條末端的控制元件永不讓位。** chip 盒是 tab 條裡唯一會收縮的部分（`flex: 0 1 auto; min-width: 0; overflow-x: auto`）：chip 先縮到 80px 下限，再在盒內隨滾輪橫向滾動、不畫捲軸，且盒在每個藏有 chip 的一側把 chip 在 24px 內漸隱（`data-dockkit-strip-scroll`，在每次提交、滾動與尺寸變化後由盒的滾動讀數寫入）。每當活動 tab 或 chip 的排列變化，盒會滾動到讓活動 chip 避開漸隱帶；已在視野內的 chip 不動。chip 的標題從不加省略號：`TabTitle` 拿文字寬度對照它的盒子，文字更寬時置 `data-dockkit-tab-clipped`，讓文字在末端 16px 內漸隱。chip 的關閉控制元件在 chip 活動、懸停或持有焦點時顯示，壓在標題末端 14px 之上、標題在其下漸隱，因此 chip 寬度兩種情況下都一樣。活動 chip 兩側的槽不畫細線，讓填色膠囊立在裸 chip 之間。新增、分欄與 chrome 控制元件都是 `flex: none`，因此在任何不窄於它們自身的格里（帶 chrome 約 130px，不帶約 72px）都保持寬度與位置。停靠面的 `min-width: 0` 與格的 `overflow: hidden` 阻止正文裡最長的不換行行把格撐出自己的盒子——正是那種情況把控制元件和正文捲軸推到了螢幕外。
- **chip 盒會滾動，但絕不認領手勢。** 橫向滾動容器會把按下並移動的手勢據為己有並取消指標；盒、chip 與 tab 條都設 `touch-action: none`，手勢又捕捉了指標，所以在 chip 上按下並移動是拖曳，只有滾輪滾動盒子。
- **分欄需要給兩個可用的半格留出空間。** 格被等分成兩半，因此每一半都必須容得下不可收縮的部分：tab 條的固定部分——按 tab 條寬減去 chip 盒與填充條測得，即內邊距、間隙以及該格繪製的每個控制元件（含它自己的 chrome，所以右上格要求更多）——加上一枚最小尺寸的 chip——`.tab` 在 content-box 上宣告 `min-width: 80px`，所以它的足印是 80px 加 10px + 10px 內邊距，即 100px，從已渲染 chip 的計算樣式讀取（讀不到時用樣式表數值）；兩半之間的分隔條取其渲染厚度（0——它的細線畫在接縫上、不佔佈局空間，因此正文自己畫的分隔線能不斷線地穿過接縫）。縱向分欄只由邊緣落下產生，它要求每一半容得下 tab 條（34px）加 48px 正文：正文自留的 12px 內邊距內一行 13px、行高 1.6 的次級文字——格的正文容器本身沒有內邊距，tab 的正文直接貼到 tab 條底邊和格的邊緣，由自己留白。`geometry.ts` 裡的 `halvesFit` 是算術；`measure.ts` 在每次提交後與停靠面尺寸變化時讀取矩形，因為佈局狀態只攜帶比例、從不攜帶畫素，引擎的 planner 也保持如此。沒有空間的格保留分欄控制元件，以 `splitPaneNarrow` 停用（開啟 `hideSplitWhenBlocked` 時改為隱藏），並且在該軸上不提供邊緣落區（鬆手就不是移動）。開啟 `hideSplitWhenBlocked` 時，分欄控制元件自己的佔位——它的盒子加 tab 條的間隙——不計入固定部分：隱藏控制元件讓 tab 條卸下的恰是這份佔位，把它算進去的讀數會隨控制元件的可見性來回翻轉、無限重渲染；不計入也正是被詢問的那一半會承載的量，因為窄到無法分欄的一半會隱藏自己的控制元件。使用者隨後拖窄的格——透過拖曳分隔條或嵌入方的列——會保持原尺寸：規則只決定它的下一次分欄。
- **焦點落在 click 而不是按下。** 在 `pointerdown` 與第一次 `pointermove` 之間的狀態變化會重建被按下的子樹，而被替換的元素會取消指標。這也避免拖曳先記錄一條多餘的焦點操作。chip、標籤條各控制元件以及嵌入方 chrome 上的 click 都止於標籤條：它們各自上報的意圖已決定了活動格，或本就是嵌入方自己的事，所以格自身的點選聚焦不再多記一條。浮動面板的切入點與角柄同樣透過手勢上報——原地鬆開的按下是一次 click，抬起面板；真正的拖曳只記錄移動或縮放，由該操作自己抬起面板——而按在面板主體上則直接抬起它。點選本已活動的格、點選或按鍵選中該格本已選中的 chip，或按下本已活動且在最上層的面板，什麼都不改變，也什麼都不記錄。
- **巢狀在可拖曳 chip 裡的控制元件要攔住自己的按下。** 否則按下會開始拖曳、捕捉指標，巢狀控制元件的 click 就永遠落不下。
- **強調色用平臺的強調 token，絕不用 `--dsw-alias-brand-primary`。** 本平臺把 `brand-primary` 繫結到近黑（淺色）或近白（深色）的前景色，因此落點游標與落區提示都用 `--dsw-alias-brand-primary-new-colorprimary-new-color`，與軌跡檢視一致；懸停的分隔條改用 caption 文字色，讀起來是把手而不是高亮。浮窗不畫邊框——選單同款陰影（`--dsw-elevation-prominent`）已勾出它的輪廓——活動浮窗也不加重邊框：它本就在最上層、投同樣的陰影；圍它一圈更深的邊框讀起來像缺陷。

<a id="build-shape"></a>
## 建置形態

本包靜態連結：tsdown 的 `staticLinked` 預設在 `lib/index.js` 產出一個瀏覽器 ESM bundle（所有裸說明符保持為 import，sourcemap 鏈回原始碼），並把樣式表按其相對 `src` 的路徑放到 `lib/` 下；Web 外殼按包名解析並自行打包該產物，因此 vite 仍是 class 雜湊的唯一擁有者。有一個後果至關重要——套件只保留**一張**樣式表 `dockkit.module.css`，因為消費方按檔名去重注入的樣式表，撞名會靜默丟掉一張。

<a id="model-experience"></a>
## 模型體驗

無，因為本包是瀏覽器側停靠佈局引擎與元件集，不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **尺寸語義刻意保持精簡**：比例權重加一處最小尺寸夾取。沒有吸附、優先順序或首選尺寸，因此完整 splitview 的級聯擠壓行為不存在。
- **觸控未調優。** 手勢基於 pointer 事件，並在滾動容器可能干擾處設定了 `touch-action`，但沒有做過觸控專項調優。
- **無障礙不完整**：分隔條沒有 `separator` 角色，也沒有鍵盤路徑去分欄、移動或浮出。
- **沒有釋出樣式表約定。** 消費方拿到的是雜湊化的模組類名；套件除讀取的 `--dsw-*` 自定義屬性外不暴露任何主題 API。

<a id="dev-note"></a>
### 開發備註

選單採用共享 `MenuSurface` 材質，包括用於背景模糊的 macOS 底層；自定義內容遵循[選單規則](../../../docs/web-styling.zh.md#component-rules)。

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

嵌入方為標籤和浮動面板的關閉控制元件提供有效關閉鍵帽及 ARIA 組合。關閉控制元件在懸停和鍵盤聚焦時顯示相同 Tooltip。分欄的上下文選單開啟時，該分欄的標籤關閉 Tooltip 保持隱藏。

</details>

**執行時不變數：** 不釋出 companion。引擎是作用於純資料的純函式，元件只上報意圖；操作序列的可逆性與 settle 規則由本包的引擎 spec 直接斷言，不提供也不觀察任何 Cordis 服務。
