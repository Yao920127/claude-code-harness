---
description: "dsh Web 用戶端的右側 Sidebar：每工作階段一個停靠面、兩種呈現形態、導航控制器 ctx.sidebarRight、tab 型別註冊表 ctx.sidebarRightTabs 與 Tab 域。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-right

[English](README.md) | 中文

## 概述

右側 Sidebar：停靠套件與本產品相遇的地方。它為每個工作階段持有一個停靠面，以兩種呈現形態之一把它畫成貼靠框架右列邊緣的一塊麵板，把展開按鈕放進工作階段 header，並擁有導航控制器（`ctx.sidebarRight`）、tab 型別註冊表（`ctx.sidebarRightTabs`），以及告訴每個已開 tab 它是如何被導航到、能活多久的 Tab 域。

## 目錄

- [什麼住在這裡，什麼不住](#what-lives-here-and-what-does-not)
- [呈現形態](#presentations)
- [展開按鈕](#the-expand-button)
- [狀態](#state)
- [擴充功能席位](#extension-seats)
- [`ctx.sidebarRight`](#ctxsidebarright)
- [Tab 域](#the-tab-domain)
- [引導頁](#the-guide)
- [文案](#copy)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="what-lives-here-and-what-does-not"></a>
## 什麼住在這裡，什麼不住

佈局本身——分裂樹、它的操作、拖拽手勢、浮窗——屬於 `@deepseek-ai/dsh-client-ui-dockkit`，並保持與主機無關。本包提供套件拒絕知道的一切：產品文案、tab 的 `kind` 是什麼意思、新格用哪個 tab 播種、停靠面掛在哪裡、其它外掛如何觸達它。

<a id="presentations"></a>
## 呈現形態

普通與全螢幕共用同一棵面板內容樹，切換不會重掛載Tab。普通面板貼靠右欄；全螢幕面板覆蓋視窗並保留寬屏底層列寬。視窗低於768px時開啟右欄自動全螢幕；窄屏退出全螢幕會收起右欄，變寬不重新開啟已關閉的右欄。 全螢幕開啟時，底層列寬保持不變，直到滑入結束後才無過渡地準備普通軌道。 全螢幕面板退場前，關閉先準備全寬工作階段區，恢復先準備普通右軌道；退場期間底層不播放寬度動畫。

| 形態 | 軌道 | 面板 |
|---|---|---|
| `push`（預設） | 面板寬度：工作階段區讓出空間 | 在軌道內；它的左緣與工作階段區的右緣沿框架自己的曲線一起移動 |
| `fullscreen` | 保留寬屏普通軌道；窄屏自動全螢幕不佔軌道 | 覆蓋整個視窗 |

在 Windows Electron 中，`html[data-windows-titlebar]` 讓全螢幕面板保持在頂欄下方及展開側欄的右側。框架的 `--dsh-windows-sidebar-width` 提供該縮排及最大寬度；`--dsh-windows-content-radius` 提供左上圓角。僅全螢幕面板為該圓角裁剪溢位內容。

席位透過 `ctx.layout.openRightbar(track, fullscreen)` / `closeRightbar()` 報告呈現，框架不注入本包。寬屏切換全螢幕不改變中欄寬度；寬度拖拽區只在普通展開態顯示。獨立浮窗及 `float`/`dock` 操作保持可用。

面板沒有標題行。它的兩個控制元件——形態切換與摺疊按鈕——搭在套件 chrome 席位上，位於右上格 tab 條的最末端，因此 tab 條就是面板的整條上邊。每條 tab 條從左到右讀作：在允許時帶關閉按鈕的 tab 膠囊，新增控制元件（只在該格沒有引導 tab 時繪製；它透過 `ctx.sidebarRight.openTab` 在該格開啟引導頁），該格的分欄控制元件，以及右上格里的兩個面板控制元件。窄格里只有 chip 讓位；其後的控制元件從不收縮或被裁切。

<a id="the-expand-button"></a>
## 展開按鈕

快捷鍵速查包含右側欄切換、分欄和麵板全螢幕命令，對應控制元件顯示同一份有效鍵位。分欄與全螢幕要求焦點位於可見的停靠分欄內；焦點在聊天區時不可用。不可分欄時控制元件仍可見，可聚焦的提示顯示目前鍵位，並說明分欄數量上限或寬度要求。檔案和瀏覽器提供者分別註冊自己的命令。開始頁按鈕內以無背景文字顯示有效快捷鍵，不額外彈出重複提示。

面板隱藏時，工作階段 header 角落席位裡的一個按鈕（`conversation.session.header.corner`，在工具組右緣之外，與 Session 日誌控制元件齊平）是回去的路。它的圖形是左側 sidebar 摺疊圖示的映像。它使用公共緊湊 Button，與相鄰更多操作按鈕共用圓角和 hover 底色。它與面板共用一個儲存（slot 執行時允許兩個同作用域席位共用一個 handle）；面板顯示時它什麼也不渲染，角落席位隨之收起。於是摺疊的 Sidebar 不花工作階段區任何代價：沒有軌條、沒有寬度，轉錄的捲軸留在列的邊緣。沒有工作階段就沒有按鈕也沒有面板。

面板取工作階段區的底色與正文字號，而不是自成一層浮起的表面：它是頁面的一列，不是壓在頁面上的卡片。

root 作用域的 `rightbar` 入口透過獨立的 `rightbar.session` 子樹渲染選中的 Session，以及擁有已初始化 `keepMounted` 正文的後臺 Session。每個 View 擁有自身的 Session reference。只有前臺 Conversation 上報框架列寬並繫結公共導航；其他子樹保持隱藏，不刪除 tab 狀態。

<a id="state"></a>
## 狀態

每個工作階段 id 一個 `SurfaceState`——佈局、它記錄的序列、以及它已鑄造的 id 數——儲存在註冊時宣告的儲存裡。每個動作都遵循同一形態：鑄造意圖需要的 id，向套件 planner 詢問由哪些操作承載，記錄它們，然後把該工作階段的整個停靠面賦回去。沒有任何動作就地編輯佈局，這正是讓套件的純函式成為唯一計算佈局之處的原因。

把鑄造計數器帶在停靠面裡，是記錄的序列可回放的原因：操作內嵌它們建立的 id，因此從同一初始狀態回放能復現同一棵樹。每個動作記錄一條歷史，無論它需要多少操作。展開、摺疊與切換形態也都被記錄。

每個動作之後，套件的 settle planner 保證展開的停靠面有內容：最後一個 tab 被搬走或浮出的停靠格會被並掉；根格被清空時填入預設頁。摺疊的停靠面沒有這種回填——工作階段以摺疊且為空的停靠面開始，收起整列的關閉也讓它保持為空——首次會展示空佈局的那次展開才播種預設頁。顯式關閉遵循[預設頁與關閉規則](#the-guide)。展開期間永遠至少有一個 tab，永遠沒有空格——因此沒有單獨的「關閉格」手勢。

停靠面的最後一個 tab 還多帶一條規則，由 store 的 `closeTab` 決定並經 `canCloseTab` 映像給套件：作為唯一停靠 tab 的引導頁不畫關閉控制元件也不畫選單裡的關閉項——它的 chip 呈安靜樣式，在沒有擴充功能條目時次鍵按下也不彈出選單——對它的程式設計式關閉什麼都不記錄；任何其它 tab 獨自留下時，點選關閉會連同整列一起收起，記為一條歷史，佈局保持為空，直到下次展開時建立當時的預設頁。浮動面板不參與這條規則：前臺 Session 的浮窗無論列是否展開都會渲染，其 tab 照常關閉。

store 將每個 Session 的佈局、標籤身份、選中項、分欄比例、浮窗矩形、呈現方式和身份計數以 JSON 儲存到 localStorage 的 `dsh.sidebar-right.v1.<sessionId>`。重新整理時在渲染標籤正文前恢復佈局；不同 Session 的佈局獨立。provider 根據保留的標籤身份和資源地址恢復自身內容。導航參數、資源內容和活動連線不屬於佈局狀態。撤銷歷史只保留在記憶體中，重新整理後清空。採用佈局或啟動探測前會驗證儲存欄位型別、節點成員關係、選中項、身份計數，以及單格或左右兩格的停靠佈局；無效資料只清除對應 Session 的 key。儲存失敗時，目前佈局仍可在記憶體中使用。同源視窗共享每個 Session 最後儲存的佈局；活動視窗在重新整理前保留各自的目前佈局。

`sidebarRight.openTabs` 釋出所有已儲存和已採用 Session 的開啟標籤中繼資料，並保持快照引用穩定。啟動時讀取佈局 key，不掛載非目前內容、pin 檔案或啟用 Agent。已採用的 store 在標籤成員變化時更新自己的中繼資料，永久清除的 scope 刪除對應記錄。其他視窗寫入 storage 不會覆蓋目前視窗的活動成員關係。provider 使用該清單恢復自己的資源生命週期。

<a id="extension-seats"></a>
## 擴充功能席位

tab 型別分兩階段註冊，隨包釋出的引導型別走的正是別的包的型別走的同一條公開路徑（`ui-sidebar-documentpreview` 是活的證明）。兩個階段都在型別自己的 `ctx.effect` 裡，因此註冊與建立它的外掛同生共死。

1. **型別**——`ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide?, keepMounted? })`，一份沒有執行時掛鉤的靜態宣告，返回 disposer。`id` 是這個實作在 tab 系統裡的身份，在全部註冊中唯一（包名是天然取值；隨包引導頁是 `@deepseek-ai/dsh-client-ui-sidebar-right/guide`）：一旦 extension 可以接管 builtin 的 kind，kind 就不再唯一，所以實作要自己命名，同一 `id` 的第二次註冊會 throw。資源型別給出 `patterns`，即作用於 `dsh-resource://` 地址的 glob：含 `:` 的匹配整個地址（`dsh-resource://file/**`）；不含的匹配 URI 路徑的任意深度且忽略大小寫（`*.md`），不是 URI 的地址不匹配任何這類模式。頁型別——引導頁、檔案樹——不給出模式，按 kind 開啟。`canOpen(address)` 否決一次命中。`title(address)` 是 tab chip 的文字，在 tab 開啟時捕捉。`guide` 列出引導頁的入口框；選中一個即把貢獻它的型別作為頁開啟。一個 `kind` 最多承載一份 `builtin` 與一份 `extension` 註冊（extension 生效；它離開後 builtin 恢復）；kind 上的其它任何撞名都 throw。`id` 同時也是該型別正文與標題註冊時用的 key，因此 extension 與它接管的 builtin 各佔一個格位，席位渲染生效的那個。
2. **正文**——`ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)` 透過框架注入的 `useTabInfo()` 讀取 `{ sidebar, panel, tab }`。`sidebar` 提供開合與全螢幕資訊，`panel.id` 命名所在格，`tab` 包含原記錄欄位、`visible`、`navigation`、`signal` 和 `actions`。這些欄位不再作為平鋪owner props傳入；型別自己的store仍使用 `useStore`/`actions`。可選標題註冊及引導替換共享該hook；未註冊標題時使用開啟時儲存的文字。標題包裝保留 tab 與 occurrence 的 DOM 標記，但不引入佈局盒，因此停靠 tab 和浮窗標題中的圖示間距與垂直對齊由 dockkit 控制。

由哪個型別開啟資源遵循編輯器解析器的慣例：`patterns` 命中的型別先按 `priority` 檔排序——`extension`（產品外的型別，最高檔，也是未命名時的預設）、`builtin`、`fallback`（任何更具體的型別都應勝過的通用檢視器）——再按命中模式的長度，再按註冊順序；`canOpen` 會剔除候選。各檔是字串字面量，因此別的包裡的型別不需要從這裡做執行時匯入。`candidates(address)` 返回排序，`claim(address, kind?)` 返回決定；指定 `kind` 時跳過它的 glob 但保留它的 `canOpen`。

另有兩個席位擴充功能已有之物：`sidebar.right.tab.guide`（chain）替換引導 tab 的正文而不替換 tab，`sidebar.right.tab.menu.item`（list）在套件自己的佈局動作之後向 tab 選單追加內容級動作。目前沒有面向格級動作或摺疊態控制元件的席位，因為還沒有東西需要它。

<a id="ctxsidebarright"></a>
## `ctx.sidebarRight`

`openResource(address, options?)` 與 `openTab(kind, options?)` 是導航控制器，進入該列的每條路都呼叫其中之一：工作階段區的檔案連結與工具行的行號引用（`openResource(fileAddress, { params: { line } })`），tab 條的新增控制元件與引匯入口框（`openTab`），檔案樹的行（`tab.actions.openResource`）。資源地址是 `dsh-resource://<type>/…` URI；不帶 `options.kind` 時由註冊表認領（glob 與 `canOpen`，最高檔勝出），帶它時由該 kind 生效的型別開啟。頁按 kind 命名；tab 記錄在本包拼出、別處無人書寫的地址下（`contract/seed.ts`）。兩者以同一組步驟作為一條歷史執行：已展示同一 (kind, contentId) 的資源 tab 被聚焦，不限所在分欄，除非 `revealIfOpened: false`；頁 tab 始終只在目標分欄內去重，不受該選項影響；否則新 tab 落到 `options.replaceTab` 所在的格與位置（並關掉那個 tab），再退而落到 `options.paneId`，再退而落到活躍停靠格；面板展開，因為使用者看不到的內容不算開啟。隨後 Tab 域記錄這次導航——`params` 以 `navigation.params` 抵達正文，`revision` 遞增——不進佈局歷史。`params` 按所開之物定型：某資源型別的檢視器把自己那項併入 `SidebarRightResourceParamsMap`（文字預覽宣告 `{ line?: number }`）；接受參數的頁型別按其 kind 併入 `SidebarRightTabParamsMap`；值約定為 JSON 形狀，執行時不驗證。`dsh-resource://` 之外的地址、無人認領的地址、或未註冊的 kind 都會 throw：那是接線錯誤，不是使用者錯誤。

`preferNewPane: true` 會先按普通的兩格上限與空間規則嘗試分割目標停靠格，無法分欄時退回到該格。`replaceTab` 優先並會停用這項偏好。

`close(tabId)` 關閉一個 tab；`active()` 讀取活動 tab。`isExpanded()` 與 `toggleExpanded()` 讀取並驅動該列的展開；`toggleFullscreen(target)` 對捕捉的停靠分欄執行面板控制元件的顯示模式操作。佈局操作供以程式設計方式安排該列的呼叫方使用，每個都像它替代的手勢一樣被記錄：`focus(tabId)` 聚焦一個 tab 及其格；`split(paneId?)` 在與 tab 條控制元件相同的格預算與空間規則下分欄一個停靠格（預設活躍格），返回新格的 id，做不到時返回 `undefined`——且不記錄任何東西；`float(tabId, rect?)` 把停靠 tab 浮出為浮窗；`dock(paneId)` 把浮窗放回活躍停靠格。不存在的 tab 或格、或已處於呼叫目標狀態的，都原樣不動。該介面只暴露操作：沒有佈局快照、沒有操作日誌、沒有按地址查詢。`_undo()` / `_redo()` 步進已掛載停靠面的歷史；它們是 `@internal`——序列沒有面向使用者的控制元件，這兩個只為測試存在。命令需要一個已掛載的工作階段停靠面；沒有時它們 throw，而不是寫進一個沒人繪製的面裡。`mounted` 是「席位正在螢幕上的那個工作階段」的可觀察值，全域面板替代 Conversation 或沒有選中工作階段時為 `undefined`。要在自己的掛載 effect 裡開啟內容的元件透過繫結的 hook 讀取它，並在它有值後再行動：框架把 Conversation 列掛載在這個席位之前，而席位在同一次提交的 passive effect 裡才釋出繫結，一個假定席位已繫結的 effect 會先執行並 throw。計劃審閱的自動開啟就是這樣讀取它的。

`focusedTarget(element?)` 解析目前 DOM 分欄和標籤頁，也接受嵌入 iframe；焦點位於外部時不返回頁面。`commandTarget(element?)` 另外允許外部開啟動作使用已掛載工作階段的活動停靠分欄。捕捉值包含 occurrence 和導航版本；`isTargetCurrent(target)` 拒絕工作階段變更、已移動或重新開啟的標籤頁，以及期間發生的導航。焦點和指標啟用獨立於持久化的佈局選擇。

<a id="the-tab-domain"></a>
## Tab 域

Tab 域按（Session，Tab id）保留品牌化 occurrence id、導航、中止訊號與繫結動作。私有裝配回呼採用各 Session 的 store，立即對齊恢復的記錄，再跟隨其提交。同一 Session 的 store 重建會替換其 `adopt` 註冊，同時釋放舊訂閱與清理引用。記錄消失或外掛解除安裝才中止 signal，收起和切工作階段不銷燬記錄；undo 恢復的是新 occurrence。`useTabInfo()` 組合框架繫結的 store 與導航 hook，不在元件中手寫訂閱或在渲染時建立記錄。`tab.actions` 始終作用於自己的工作階段；`tab.visible` 區分正文與標題，並排除後臺 Session；前臺浮窗不受整欄收起影響。`adopt` 不在公開控制器上。

型別宣告 `keepMounted: true` 後，已存取正文會在切 tab、切 Session、收起和停靠切換期間保留。每個 View 透過 owner props 提供自身穩定的持有回呼，因此 Session injection binding 重建不會釋放正文。未存取的正文不會提前掛載。

標籤頁所有者透過 effect 註冊 `registerCloseHandler(kind, handler)`。handler 在允許顯式關閉或替換前同步儲存後臺清理任務。資源所有者跟蹤完成和重試，側欄不等待清理。handler 拋錯時保留標籤頁。摺疊、展示方式改變和外掛解除安裝不呼叫關閉 handler；tab abort signal 標識 occurrence 解除安裝，不代表顯式關閉。

關閉與重新整理命令解析聚焦 pane 和 tab occurrence。頁面透過 `tab.actions.bindCommands()` 繫結重新整理操作，並在解除安裝時釋放；已結束的 occurrence 不能重新獲得能力。重新整理不會過載應用。透過快捷鍵開啟頁面、展開側欄或執行分欄操作後，焦點在 DOM 提交後移至選中的停靠或浮動分欄，包括顯示已有單例頁面和替換引導頁。展開側欄時聚焦活動停靠分欄；收起時保留浮動分欄內的焦點。分欄獲得焦點時保留現有文字選區。聚焦的頁面輸入框或 iframe 被替換時，僅在沒有其他元素持有焦點的情況下將焦點交還其可見分欄；外部指標操作或顯式失焦會取消此次恢復。關閉會再次檢查捕捉的身份並執行資源清理。透過快捷鍵或原生選單關閉後，焦點移至同一 Session 中仍可見的分欄，讓連續關閉繼續作用於右欄。過期目標和清理失敗均不會退回為關窗。模態限制遵循[快捷鍵服務](../shortcuts/README.zh.md)。關閉命令優先請求前臺彈出視窗的關閉操作；彈出視窗拒絕關閉、選單或未註冊的對話方塊都會阻止關閉後方側欄或視窗。透過快捷鍵或原生選單關閉唯一的停靠引導頁時，收起右欄並保留引導頁。Desktop 僅在沒有彈出視窗且焦點沒有所屬的右欄頁面時透過快捷鍵服務請求關閉視窗；Web 保留瀏覽器視窗。

<a id="the-guide"></a>
## 引導頁

每個 `guide` 入口具有 provider 內唯一的 `id`。開始頁按目前生效的定義 id 渲染 `sidebar.right.tab.guide.entry`，傳入入口 id、解析後的標題、可選描述，以及框架提供的 `useTabInfo` hook。provider 可按自己的定義 id 註冊自定義卡片；未註冊時使用預設圖示與標題按鈕。側欄負責寬度和排列，自定義元件負責內部結構和互動。引導卡片統一使用 R20，包含懸停底色與提供者自有的分體按鈕。排序或其他註冊變化不會改變入口身份。無背景的快捷鍵文字右對齊。

瀏覽器頁面等需要獨立實例的 tab 型別可宣告 `multiple: true`。每次開啟都會獲得獨立內容地址，因此移動和停靠會保留這些實例；普通頁面仍在每個格內去重。

預設頁取決於已註冊的引匯入口數，不取決於 tab 型別數或已開啟的 tab 數。恰好一個入口時直接開啟對應頁面；沒有入口或有多個入口時開啟引導頁。即使只有一個入口，顯式新增引導頁仍會開啟引導頁。只有作為唯一停靠 tab 的引導頁不可關閉；關閉其它任何唯一 tab 時會同時收起整列。chip、上下文選單與 `close` API 使用同一規則。

引導 tab 是一枚弱化的羅盤，下方是各已註冊型別貢獻的每個 `guide` 條目一個入口膠囊，按 `order` 排列並在正文中居中；引導頁自己沒有文字。膠囊顯示條目的圖示——條目沒註冊圖示時用引導頁自己更淺的立方體預留位置——和標題；列出的條目不超過四個時，註冊了 `description` 的條目在標題下顯示它，更長的列表則去掉所有描述。點選預設膠囊會呼叫 `tab.actions.openTab(entry.kind, { replaceTab: true })`，於是引導頁讓位給它開啟的頁。一個格最多持有一個引導 tab。tab 條的新增控制元件只在該格沒有引導 tab 時繪製，並以 `openTab('guide', { paneId, revealIfOpened: false })` 在該格開啟一個，這樣別的格里的引導頁不會截走這次點選；把引導頁開進已有引導頁的格則改為聚焦它；把引導頁拖入、放入或收回到這樣的格會合並進去——來者關閉，該格自己的被聚焦；對引導頁 `duplicateTab` 不記錄任何東西。分欄、展開且為空的根格、以及唯一 tab 拖到本格邊緣分屏後騰出的格使用相同的預設頁規則，每個新格一個 tab；這種本格邊緣拖放讓被拖的 tab 保持聚焦。普通的 `openTab('guide')` 只在活躍或指定分欄內開啟或聚焦引導頁。對空分欄執行 split 不產生變化，也不返回新分欄。產品最多保留左右兩格，預設均分，分隔條限定在 20%～80%。寬度不足以容納兩格時不允許新分欄；已有兩格時，正文拖放用於跨格移動，不再建立第三格。達到兩格上限時停用分欄控制元件並提供可聚焦的原因提示；關閉回單格後重新啟用。

<a id="copy"></a>
## 文案

該列裡的每個字串都來自 `sidebarRight` 語言名稱空間，包括套件的無障礙名稱。tab 的標題在 tab 鑄造時固定；型別的顯示名跟隨目前語言。

<a id="model-experience"></a>
## 模型體驗

無，因為本包是瀏覽器側 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **佈局儲存在目前瀏覽器。** 佈局不跨裝置同步；provider 專屬狀態需要由該 provider 支援恢復。
- **沒有工作階段就沒有停靠面。** 狀態按工作階段 id 鍵控，因此 hero 畫面右側什麼都不顯示。
- **硬編碼的層疊。** 內容樹使用固定層疊層；浮窗在該層內重排，不會把整層抬到選單之上。
- **保活 Session 的刪除。** 僅從目錄消失不會使已初始化的保活 View 退休；釋放由 tab 生命週期和外掛解除安裝負責。
- **未暴露撤銷。** 記錄的序列只能透過 `@internal` 服務方法步進；產品控制元件是有意缺席的。
- **標題在開啟時固定。** 型別的 `title(address)` 被捕捉進記錄；會變的標題只來自可選的標題席位。
- **沒有內容導航棧。** 後退回放的是佈局操作；編輯器式的「已存取內容」前進/後退尚未建置。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變數：** 不釋出 companion。兩個服務（`sidebarRight`、`sidebarRightTabs`）在同一個 effect 內經 `ctx.reflect.provide` 提供並隨之拆除；席位繫結與 Tab 域 occurrence 的生命週期由本包的 spec 直接斷言，不存在會與之分歧的獨立觀察。
