# Agent Note: 右側 Sidebar 的 tab 型別與導航

Status: implemented

[English](2026-09-05-sidebar-tab-types-and-navigation.md) | 中文

## Problem

[停靠面](../feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)給了右側 Sidebar 分欄、tab 與浮動面板，但一格 tab 只有在別的外掛能往裡放內容時才有用。這需要三份停靠面自身不定義的契約：外掛如何宣告一種 tab 及其能展示的地址；任何呼叫方——工作階段區裡的產出檔案 chip、檔案樹裡的一行、外掛自己的按鈕——如何請 Sidebar 展示某樣東西；以及 tab 的正文在執行時能依賴什麼。每一份都是倉外外掛將來要對著寫的公開面，所以必須在那些外掛出現之前定下來：之後改一個欄位名、一個列舉值或地址語法，就會同時弄壞它們全部。

兩條約束決定了答案。動態用戶端外掛之間不允許引用執行時值——函式、常數、類——只能引型別，因此這些契約裡不得要求從 Sidebar 包引入幫助函式或匯出常數。而 Web 用戶端已經有一套元件模型，即 Slot 系統；再為 tab 造一套，就是第二個要學要維護的並行框架。

## Decision

tab 型別是向 `ctx.sidebarRightTabs` 的一次靜態註冊；tab 的正文與標題是普通的 keyed Slot 註冊；`ctx.sidebarRight` 只以兩種方式開啟內容——按地址開資源、按 kind 開頁——其餘只操作佈局；正文透過框架注入的 `useTabInfo()` 讀取實例資訊。下面按外掛作者遇到的順序描述這四個面。

### 型別註冊表：`ctx.sidebarRightTabs`

`register(definition): () => void` 記錄一種 tab 型別並返回登出器，呼叫方把它放進自己的 `ctx.effect`，於是型別的壽命恰好等於貢獻它的外掛。定義是靜態的：

```ts ignore-check
interface SidebarRightTabDefinition {
  readonly id: string                                   // this implementation's identity in the tab system
  readonly kind: string                                 // what the tabs of this type are; what openTab names
  readonly patterns?: readonly string[]                 // resource-address globs; omitted by a page type
  readonly priority?: 'extension' | 'builtin' | 'fallback'   // defaults to extension
  readonly canOpen?: (address: string) => boolean       // veto after a glob matched
  readonly title: (address: string) => string           // chip text, captured at open time
  readonly guide?: readonly SidebarRightGuideEntry[]    // entry boxes on the guide page
}
```

`id` 與 `kind` 是兩回事。`kind` 是型別判別符——tab *是什麼*、`openTab` 點名什麼、tab 身份由什麼構成。`id` 是某個 kind 的一個*實作*的身份，在全部註冊裡唯一，包名是自然的取值。兩者分開是因為 kind 並不唯一：`extension` 可以註冊一個 `builtin` 已持有的 kind，兩個實作隨即在註冊表裡共存，生效的是 extension。註冊表拒絕重複的 `id`、同一 kind 在同一檔的第二次註冊、以及任何與同 kind 的 `fallback` 相遇的註冊；它只接受 extension 壓 builtin 這一對，extension 登出後 builtin 恢復。

`patterns` 是資源地址上的 glob，用 `picomatch` 按 VS Code 編輯器解析器的規則匹配，只有一處本地改動：含 `:` 的 pattern 匹配整個地址（`dsh-resource://file/**`），不含的匹配 URI 的路徑且任意深度（`*.md`），匹配不區分大小寫、不隱藏 dotfile，不是 URI 的地址不匹配任何路徑 pattern。頁型別——引導頁、檔案樹——不識別任何地址，省略 `patterns`，按 kind 開啟。

`priority` 是三個字面量檔位之一，寫成字串，好讓別的包的型別不需要任何執行時引入：`extension` 是來自產品之外的型別的檔位也是最高檔，所以什麼都不宣告的型別壓過這裡隨包交付的每個檢視器；`builtin` 是隨包型別的常規檔；`fallback` 是任何更具體的東西都應壓過的純內容位置，VS Code 的文字編輯器隱含地佔據它，我們的文字預覽明確地佔據它。`candidates(address)` 返回 glob 命中且 `canOpen` 未否決的每個型別，按檔位、再按命中的最長 pattern 長度、再按註冊順序排序。`claim(address, kind?)` 取最佳候選，或在呼叫方指定時取該 kind 生效的型別（不查它的 glob；點名即決定），對無人願開的地址拋錯——這是接線錯誤，不是使用者錯誤。`get(kind)` 返回生效型別；`entries()` 與 `guide()` 列出生效型別及其引匯入口；`subscribe` 觀察變化。

`title(address)`、`guide[].title()` 與可選的 `guide[].description()` 都是每次使用時重讀的 thunk，語言切換無需重新註冊。[Sidebar README](../../../../packages/client/ui-sidebar-right/README.zh.md#the-guide)定義描述顯示與後備圖示規則。註冊表本身是 `apply` 頂層提供的普通物件，**不帶** `Service.tracker`：tracker 會把 `this.ctx` 重綁到呼叫方上下文，跨包 `register()` 就會在呼叫方 fiber 仍是活動作用域時往它上加 effect，瀏覽器啟動會無音效卡死。

### 正文與標題：按定義 `id` keyed 的 Slot 坑位

型別註冊表說型別是什麼；Slot 系統說它長什麼樣。型別把正文註冊進 keyed、session 作用域的坑位 `sidebar.right.pane.tab`，鍵是自己的 `id`，並可把標題元件註冊進 `sidebar.right.pane.tab.title`，鍵相同。畫 tab 的座位經註冊表把 tab 的 `kind` 解析成生效型別，再派發到該型別的 `id`，於是 extension 接管 builtin 的 kind 時兩個包互不知曉也能正確渲染，且沒有任何優先順序數字跨過包邊界。沒有生效型別的 kind 渲染屬主的「沒有東西能檢視它」提示；沒註冊標題的型別得到註冊表在開啟時捕捉的 `title(address)` 文字。

另有兩個坑位擴充功能引導與選單：`sidebar.right.tab.guide` 是 chain，第一個不拒絕的條目在不替換 tab 的前提下替換隨包引導正文；`sidebar.right.tab.menu.item` 是 list，追加在庫自身佈局動作之後，放與 tab 內容有關的動作。型別自己的控制元件——過載、換行開關——住在自己正文裡；tab 條屬於面板，只放面板的控制元件。型別自己的狀態是正文註冊上普通的 Slot store 與 inject 面；框架不給元件模型添任何東西。

### 標籤實例資訊

[回應式 Sidebar 與標籤資訊](2026-09-07-sidebar-responsive-tab-info.zh.md)取代本記錄中以平鋪 owner props 傳遞實例資訊的選擇。正文、標題與引導頁替換項接收框架注入的 `useTabInfo()`，以 `{ sidebar, panel, tab }` 讀取所屬 Sidebar、窗格與標籤。實例的記錄、導航、可見性、signal 與繫結動作均在 `tab` 內；精確欄位見 [Sidebar 參考](../../../../docs/subsystems/sidebar-right.zh.md)。

標籤域仍為每個已提交記錄擁有一個實例，包括 `AbortController`、導航快照和繫結到所屬 Session 的動作。記錄存活期間，其地址被釘在[資源模型](2026-09-05-client-resource-model.zh.md)中；隱藏與切換 Session 不結束實例，關閉記錄則中止並釋放它。框架已有的儲存與導航掛鉤提供即時讀取，型別不自行訂閱。

### 導航：`ctx.sidebarRight`

該面以兩種方式開啟內容，對內容不做別的事：

```ts ignore-check
openResource(address: string, options?: { kind?: string; params?: SidebarRightResourceParams; paneId?; replaceTab?: TabId; revealIfOpened?: boolean }): void
openTab<K extends string>(kind: K, options?: { params?: SidebarRightTabParamsFor<K>; paneId?; replaceTab?: TabId; revealIfOpened?: boolean }): void
```

`openResource` 接一個資源地址——`dsh-resource://<type>/…` URI，資源模型僅有的 scheme——並問註冊表誰來展示：不帶 `kind` 時問遍所有型別由排序決定；帶 `kind` 時由該型別生效的實作開啟。其它 scheme 的地址與無人認領的地址走同一條失敗路徑。`openTab` 按 kind 開啟頁型別，永遠見不到地址：Sidebar 把該 tab 記帳在 `sidebar://<kind>` 下，這個字面量只在包內一處拼裝，為的是頁 tab 與其它 tab 一樣有 `contentId` 供身份與歷史使用。這個 scheme 只是記帳：沒有呼叫方拼它，業務包裡沒有這個字面量，檔案樹與引導頁分別以 `openTab('files')`、`openTab('guide')` 開啟。

兩種開啟走同樣四步：解析型別（按排序或按 kind）；除非 `revealIfOpened` 為 `false`，否則按 `(kind, contentId)` 定位已有 tab；落位——落在 `replaceTab` 的格與條位、`paneId`、或活躍格；把展開、開啟或聚焦、以及 `replaceTab` 的關閉記為一條歷史，再把 `{ address, params }` 交給 tab 域。落位是呼叫方的事，從不是型別級特性：檔案樹把檔案開進自己的格是因為它自己說了，正如 VS Code 的 Explorer 自己傳 `SIDE_GROUP` 或 `ACTIVE_GROUP`。`replaceTab` 只有一個含義——在那個 tab 的位置開啟並在同一步關掉它——為的是引導頁入口框把自己的 tab 交給所點的頁。

參數按被開啟的東西定型，經 Sidebar 包宣告、由鍵的擁有者增補的兩張可宣告合併表：

```ts
interface SidebarRightResourceParamsMap {}   // key: resource type — the text preview declares { line?: number }
interface SidebarRightTabParamsMap {}        // key: kind — a page type declares its own shape, or nothing
```

`openResource` 接受所有已宣告資源形狀的聯合，`openTab<K>` 接受為 `K` 宣告的形狀；正文按自己所服務的協定或 kind 收窄 `navigation.params`。參數屬於資源型別而非檢視器，因為行號是關於檔案位置的事實，不是關於文字預覽的，任何認領 `file` 地址的型別收到同一形狀。值必須可 JSON 序列化，一條記錄必須只憑地址與參數就能重建，因為撤銷、重做、重新整理與 HMR 都在開啟方已不在時重建 tab。

除兩種開啟外，該面還有 `close(tabId)`、`active()`、`isExpanded()`、`toggleExpanded()`，以及四個操作型方法——`focus(tabId)`、`split(paneId?)`（返回新格，預算或寬度規則不允許分欄時返回 `undefined` 且不記帳）、`float(tabId, rect?)` 與 `dock(paneId)`——每個記一條歷史，目標不存在或已在目標態時為 no-op。沒有佈局快照、沒有訂閱、沒有按地址查詢：該面給的是對佈局的控制權，不是佈局的檢視。座位掛載期間釋出其繫結——自己的工作階段、其 store 的 action 與其面；公開面上的命令作用於已掛載工作階段，沒有已掛載工作階段面時拋錯。tab 自己的動作則到達其工作階段自己的 store：slot 執行時每個工作階段鑄一個 store，外掛在鑄出時逐個收養，控制器按工作階段 id 路由，因此使用者切換工作階段之後觸發的動作照樣落實，而 store 從未鑄出的工作階段什麼也不做。

### 地址

地址分兩族，永不混用。資源地址是資源模型的 `dsh-resource://<type>/…` URI（工作區檔案是 `dsh-resource://file/session/<sessionId>/<相對該工作階段工作區根的路徑>`，任意檔案是 `dsh-resource://file/absolute/<絕對路徑>`，都由 `dsh-util-workspace-path` 建構與解析）；它們是 `openResource` 的入參、`patterns` 的匹配物件、`useResource` 的讀取物件。導航地址命名的是頁而非資料；今天唯一的一種是頁 tab 記帳用的內部 `sidebar://<kind>`。只有資源族是契約：導航族在 Sidebar 內部拼裝與消費，更完整的導航協定是之後的決定，本決定透過把所有導航字面量留在一處為它預留空間。

### 入口

工作階段區的 `openFile(path, { line? })`——工具行路徑連結、產出檔案 chip、收尾訊息提及——把路徑編碼為該 Session 的檔案資源地址並呼叫 `openResource`，呼叫方知道行號時帶 `params.line`；`read` 工具行傳入其 `offset` 參數起始的行。tab 條的「+」為所在格呼叫 `openTab('guide', { paneId, revealIfOpened: false })`；引匯入口框呼叫 `tab.actions.openTab(entry.kind, { replaceTab: true })`；檔案樹的一行呼叫 `tab.actions.openResource(address)`，落在樹自己的格里。

## Alternatives considered

**用 chain 坑位派發 tab，或只用 keyed 坑位。** chain 的 `select` 不可列舉，而引導頁與導航面必須列舉型別；keyed 坑位只帶正文，型別的標題與地址識別無處可住。兩段——定義註冊表加 keyed 元件坑位——是儲存庫既有模式（`ConversationViewRegistry`）。

**執行時 hook 或每 tab 一個實例物件。** 紙面上試過多種形態——每 tab 一個 Cordis fiber、抽象基類、返回帶 `dispose` 實例的 `initial`/`create` 對、一組 `useTab*` hook、框架託管的 `useTabResource(fetch)`、`useTabStream`。依次否決：每 tab 一個 fiber 太重；動態包無法共享基類或匯出常數；實例層重複了 Slot store 與 inject 面已經是的東西；每 tab hook 複述 owner props；框架託管的 fetch 沒有好的快取鍵；tab 域上的流 hook 問錯了主人——聊天資料必須來自聊天域，檔案資料來自工作區檔案服務。剩下的是 owner props 加一個全用戶端的 `useResource`。`visible` 後來以 prop 而非 hook 加入也是同一理由：它是關於該次出現的又一個事實，而 props 已經承載了該次出現。 對實例讀取掛鉤的否決由[標籤資訊決策](2026-09-07-sidebar-responsive-tab-info.zh.md)取代；對獨立實例物件、fiber 與資料流所有權的理由仍適用。

**每格一個工具區坑位放活躍 tab 的控制元件（`sidebar.right.pane.tab.tools`）。** 上線一輪評審後刪除：它把型別私有按鈕放到面板 tab 條上、與分欄和收起控制元件並列，讀起來像面板 chrome。型別的控制元件屬於自己的正文。

**型別級落位（`opensInto`）與隱藏的相鄰格啟發式。** 否決：tab 落在哪是開啟方的事，正如 VS Code 的 Explorer 自己決定 `sideBySide`。

**副檔名列表與數字優先順序。** `claims.extensions` 表達不了 `.d.ts`、`Dockerfile`、目錄約束或整個 scheme——它是退化的 glob；數字優先順序需要動態包無法引入的匯出常數。字面量檔位加 glob。VS Code 自己的檔位從五個收成三個：`option` 檔（只列出、永不自動選中）在「用其他方式開啟」存在之前沒有消費者，`default` 檔改名 `extension`，因為那個名字讀起來像最低檔而它是最高檔。

**一個 `open(address)` 包打天下，外加拼頁地址的幫助函式。** 第一版頁也按地址開啟，於是業務包需要 `sidebar://<kind>` 字面量或來自 Sidebar 包的 `sidebarAddress(kind)` 幫助函式。兩者都被值引用規則禁止，也都洩露了尚未設計的導航 scheme。把面拆成 `openResource` 與 `openTab`，唯一的字面量留在包內，且每種模式各自定型參數。

**開啟時點名某個實作（`?impl=`）、`find(address)`、`mode()`/`setMode()`、佈局快照、`features` 清單。** 都考慮過並留在外面。點名實作屬於尚不存在的導航協定；`find` 與快照會把該面變成佈局的檢視，而它本該是對佈局的控制；呈現模式是 UI 開關不是外掛關心的事；能力清單在該面尚在收斂時為時過早。

**用 Slot 優先順序表達 extension 接管 builtin，隨後是註冊表鑄造的坑位鍵。** 第一次嘗試讓覆蓋方經一個匯出常數以更低的 Slot 優先順序註冊正文——這是動態外掛間的值引用，也是拿第二套規則（Slot 優先順序）替註冊表的規則站臺。第二次嘗試讓註冊表為每次註冊鑄一個鍵並從 `register()` 返回，這把註冊變成了兩步且順序敏感的舞步。讓實作自己宣告 `id`——必填、唯一、與它註冊坑位所用的同一個串——既不需要常數，也不需要鑄鍵與順序，還給了註冊表拒絕重複所需的身份。

## Consequences

- 一個型別 = 一個靜態物件 + 一到兩個 keyed 坑位註冊；其實例資訊透過注入的 `useTabInfo()` 讀取。框架不長任何按型別的 API 面，倉外型別從 Sidebar 包只引型別。
- 兩種開啟配兩張參數列，意味著呼叫方無法只按地址開頁或只按 kind 開資源，編譯器會說明；代價是每個想要型別化參數的新資源型別或頁 kind 都要增補一張表。
- `id` 與 `kind` 分離讓 extension 能按 kind 原位替換隨包型別，extension 登出後 builtin 恢復；代價是每個定義多一個必填欄位。
- 導航面只有控制權。需要知道佈局的外掛無法索取，這讓佈局的形狀在導航協定決定暴露什麼之前不進任何外掛的契約。
- `sidebar://<kind>` 字面量住在一個檔案裡。之後改導航語法只碰 Sidebar 包。
- 這些面是 Sidebar 裡被定死的部分：地址、註冊欄位與檔位、兩種開啟及其參數列、slot 名與注入的標籤資訊。使用者看到的一切行為——浮窗貼到哪、分欄控制元件何時置灰、文案、樹的排序——都是這裡任何契約之外的產品規則，改動無需通知任何外掛。

## Testing

`ui-sidebar-right` 的 spec 覆蓋註冊表（檔位、extension 壓 builtin 及恢復、`id` 與同檔衝突、glob 與路徑匹配、`canOpen`、排序與平局）、兩種開啟（正常、邊界與失敗路徑，含錯誤 scheme 與未註冊 kind）、`replaceTab` 記一條歷史、座位把 kind 解析到生效實作並退回、`useTabInfo()` 含摺疊與浮窗下的 `tab.visible`、以及操作型方法的 no-op 與拋錯情形。Web e2e 套件在 Chromium 裡經真實外掛圖驅動引導頁、檔案樹與一次檔案開啟。兩套均無需金鑰。

## Deferred

- `sidebar://<kind>` 之外的導航協定：頁內子路由、點名實作、以及面向生態的其它導航 scheme 規則。
- 從公開面往屏上工作階段之外的工作階段裡開啟；公開面只作用於已掛載的工作階段，而 tab 自己的動作已作用於其所在工作階段。
- 從工作階段區開啟失敗時的在地化提示；目前是拋錯文字本身。
