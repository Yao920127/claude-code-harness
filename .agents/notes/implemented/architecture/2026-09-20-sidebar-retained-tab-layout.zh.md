# Agent Note: Sidebar 的穩定 Tab 掛載與工作階段保活

Status: implemented

[English](2026-09-20-sidebar-retained-tab-layout.md) | 中文

## Problem

恢復各工作階段的 Tab 記錄和 URL, 並不能保留活的瀏覽上下文. 在 Tab、Pane 或工作階段切換期間解除安裝 Body 或改變其 DOM 祖先, 都會斷開頁面. Electron 44 的 `WebViewElement.disconnectedCallback` 會 detach 並重置 guest, 因此保持 React key 或快取元素引用不能抵消祖先斷開. 內容尺寸、裁剪與重疊也必須遵循真實父節點佈局.

## Decision

Sidebar 負責活 Body 的保留，不依賴 Browser 導航和 Workspace 儲存。保活頁面的 DOM 祖先在切工作階段、選 Tab、跨 Pane 移動、收起、浮動和回停靠時保持連線與身份不變。Browser Presentation 直接掛載到內容容器內，不做佔位元素測量或浮層定位。

### 佈局所有權

- `DockLayout` 用穩定的 Tab 兄弟節點渲染 Sidebar 的一個或兩個水平 Pane。現有遞迴 `DockSurface` 和獨立 `FloatLayer` 仍可用於通用分割樹渲染；佈局引擎和序列化格式不變。
- 每個 Tab 都有穩定的 Grid cell、frame、Header 容器和 Body 容器。顯式 Grid 列決定停靠歸屬，Flex 分配 Header 與 Body 的高度。浮動只把同一個 frame 改為 `position: fixed`，不改父節點或替換 Body。
- 浮動 frame 的零尺寸 Grid cell 在浮窗層建立層疊上下文。CSS `order` 表達該層內的浮窗深度，DOM 順序始終按 Tab 身份排序。大量浮窗置頂不會把層級遞增到選單之上；選中項和 Tab 條排序均不重排內容節點列表。
- 共同祖先不設定 transform、裁剪或包住全部內容的層疊上下文。停靠 cell 負責收起 transform 和顯隱，各 frame 裁剪自身內容。Fullscreen 修改同一個根的寬度和停靠層級。右欄不再自帶視窗拖拽脈衝：由外殼唯一那個 watcher 在表面可能移動時逐幀測量被打標行並自行脈衝 recall 標記，因此沒有佈局程式碼複製內容位置。
- 分欄與浮窗手勢沿用原有測量和操作狀態，更新使用者選擇的分欄比例與浮窗矩形，而非維護第二份 Browser 矩形。視窗縮放和內容尺寸變化由普通 CSS 佈局處理。

### 工作階段與 Tab 生命週期

`SidebarRightTabDefinition.keepMounted` 為型別啟用懶保活。Desktop Browser 啟用它，其他型別繼續按可見性掛載 Body。保活 Body 在首次顯示時建立，隨後隱藏不解除安裝，直到 occurrence 或提供者生命週期結束。該策略不持久化，也不選擇儲存分割槽。

`SidebarSessionView` 使用獨立的 `sidebarView` 來源申請、釋放一個 `SessionReference`，並管理自己的已提交掛載計數和 Body 保活持有。`SidebarSessionViews` 管理選中、保留策略和檢視索引，將生命週期操作委託給檢視，而不修改其計數或釋放其引用。`RightbarRoot` 接收 `SidebarSessionViewSnapshot` 和已有注入回呼，不接收資源所有者物件；它為各檢視分別渲染顯式 `SessionProvider`，保持工作階段 key 穩定，渲染器通用的工作階段重掛載語義不變。

Tab 提供 Body 保活持有，而不獨立申請工作階段引用。View 的穩定 `retainTab` 回呼透過 owner props 傳給席位，因此替換 Session injection binding 不會釋放再重新取得這些持有。這些持有跟隨已有 occurrence signal，包括關閉後撤銷恢復得到的新 signal；檢視不建立第二套 Tab 生命週期。退出檢視列表的檢視仍留在集合的引用索引中，直到自行釋放時移除索引，因此外掛關閉時也能清理尚未結束 React 掛載的檢視。

只有選中的工作階段向 frame 報告佔位、繫結公共 Sidebar 導航。後臺 Tab actions 仍指向自己的已接管儲存。`tab.visible` 包含工作階段和全域面板的可見性，浮動不會讓後臺工作階段變成可見。切工作階段或開啟全域面板隱藏整個內容樹，收起 Sidebar 則只隱藏停靠 cell，前臺浮窗仍可見。隱藏內容不可透過指標或鍵盤存取，隱藏 Body 內的焦點會被移除。

後臺工作階段沒有已初始化的保活 Body 時，從檢視列表移除；等已提交的 React 根解除安裝後再釋放引用，避免仍掛載的子樹下方先銷燬工作階段 scope。外掛釋放會清理全部引用，包括等待解除安裝的已移除檢視。Sidebar 外掛依賴 `sessions` 和 `uiSession`，任一依賴結束時由 Cordis 解除安裝它，繫結失效由 `ui-session` 負責。檢視不向共享工作階段 Context 註冊銷燬回呼。僅在目錄列表中缺項不視為刪除。未存取的 Browser Tab 和無關工作階段不會提前開啟。

### 提供者職責

`BrowserFrame` 仍只負責導航與可觀察頁面狀態。Presentation 建立、掛載載體 DOM，不瞭解 Pane、裁剪或層疊。Electron 提供者接收物理 attach/detach 回呼：隱藏保活內容不觸發這些回呼，真正解除安裝則取消未完成的掛載並釋放 guest；之後再次物理掛載時從已知地址重建。dispose（資源釋放）會等待未完成的建立和 guest 釋放，取消後才完成的申請只釋放、不掛載。

[Desktop Browser 決策](../feature/2026-09-20-desktop-browser-webview.zh.md)繼續負責 guest 安全、共享 IPC 宣告和 Workspace 分割槽所有權。不同 Tab 和工作階段不能因為共享儲存分割槽就共享一個頁面實例。Web 預設仍關閉，顯式啟用時繼續使用 iframe 載體。

### 保活與恢復

| 操作 | 內容處理 |
|---|---|
| 切換 Tab | 隱藏舊的保活 cell，顯示目標已有 Body。 |
| 分欄、排序或移到另一個 Pane | 改邏輯歸屬和 Grid 分配，不搬移 Body。 |
| 浮動、回停靠或置頂 | 改同一個 frame 的 CSS 模式或 cell 繪製順序。 |
| 收起 Sidebar | 隱藏停靠 cell，前臺浮窗保持可見。 |
| 工作階段 A → B → A | 隱藏並重新顯示 A 的原內容樹，而非載入已儲存 URL。 |
| 關閉、提供者解除安裝或真實 generation 結束 | 釋放 Body 和 guest；撤銷關閉建立新 occurrence。 |
| 應用重新啟動或視窗重新整理 | 展示儲存的標題和 URL，顯式恢復或提交地址後才載入。 |
| guest 崩潰 | 透過提供者重試；頁面記憶體和原生 history 不持久化。 |

[佈局與提供者恢復](2026-09-14-sidebar-layout-provider-recovery.zh.md)仍然獨立：持久化的 Tab 身份、位置和地址支援冷啟動，而不是序列化 DOM。隱藏頁面可能繼續執行腳本、播放媒體或聯網。

## Alternatives considered

**只隱藏 Pane。** 可以覆蓋收起，但跨 Pane 移動或進入獨立浮動 Portal 仍會改變內容祖先。

**只保留前臺工作階段的 Body.** 工作階段 slot 重掛載會斷開頁面, 導致切工作階段時丟失頁面執行狀態.

**每個 Tab 獨立持有工作階段引用。** 同一檢視的 Tab 共用一個 `SessionProvider`，它的引用必須先於這些 Body 渲染而存在。按檢視持有即可覆蓋父級及其子節點，無須再為每個 Tab 管理一份引用生命週期。

**快取並搬移 DOM。** 普通 reparent 會觸發 Electron 斷開處理；實作不依賴原子搬移、私有掛載 API 或生命週期補丁。

**把 Browser 內容放在獨立浮層中.** 測量或 CSS 錨點可以對齊浮層, 但內容仍處於負責其尺寸與裁剪的父級 Grid/Flex 佈局之外.

**使用原生 popover。** 普通 Portal 內容無法透過 `z-index` 覆蓋 top layer 元素。把選單、對話方塊遷移到另一套層疊體系會擴大 Sidebar 之外的改動；實作保留既有 Portal 和層級模型。

**透過遞增根 z-index 置頂浮窗。** 不設上限的浮窗數量可能越過選單和模態層。同層 Grid cell 的 CSS 繪製順序同時保留層疊與 DOM 身份。

**隱藏時儲存 URL 再重建。** 無法保留表單、腳本狀態、滾動位置和原生 history。這是丟失實例後的恢復，不是活頁面保留。

## Consequences

佈局正確性由 Sidebar/DockKit 負責，而不是 Browser。代價是穩定的內容容器與顯式工作階段引用所有權：後臺保活不僅持有頁面記憶體，也持有工作階段 scope 和訂閱。沒有隱式 LRU 或空閒超時，未來回收需要明確的暫停與恢復策略；其他 Tab 型別不會自動承擔這些成本。

Sidebar/DockKit 除了負責保活內容佈局, 還負責控制元件、浮窗層級、焦點和平臺樣式. [停靠基礎設施](../feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)負責佈局引擎、持久化和 Tab 型別導航; [Desktop Browser 決策](../feature/2026-09-20-desktop-browser-webview.zh.md)負責 guest 導航、儲存和安全.

## Verification

定向測試覆蓋 Session 資料來源註冊與登出期間的正文保活、存檔佈局總和檢查碼既有 Sidebar 呈現。Host 與 Client TypeScript 編譯透過。使用者已手動驗收重新建置後的 Electron 冷啟動；未錄製 GIF。guest 身份、表單與 history 保留、多浮窗繪製順序、縮放、裁剪、放置提示、焦點和平臺視窗控制元件仍需獨立於這些單元測試的真實 Electron 證據。
