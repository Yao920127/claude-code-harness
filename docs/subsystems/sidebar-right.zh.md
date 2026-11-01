# 右側 Sidebar

[English](sidebar-right.md) | 中文

右側 Sidebar 是 Web Client 裡每個工作階段一份的停靠面：工作階段區旁的一列 pane 與 tab，按地址定址的內容——工作區檔案、目錄樹、產品自帶頁面——在這裡開啟、分欄、浮出、關閉。[`dsh-client-ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) 擁有這個面、tab 型別註冊表與導航服務；[`dsh-client-ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) 是它內部的佈局引擎；[`dsh-client-resources`](../../packages/client/resources/README.zh.md) 把地址變成任何元件都能讀的活資料；[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md) 同時提供 Host 工作區檔案服務與 Client `file` 資源提供者。

本頁是該子系統契約的參考：地址、tab 型別註冊、導航服務、擴充功能 slot 與其 owner props、資源模型、Workspace Files 服務、內建型別，以及明確不做的事。佈局引擎、frame 與停靠面如何拼在一起見 [Agent Note](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)；slot 機制見 [Slots 參考](slots.zh.md)。

## 定位與歸屬

每個工作階段恰有一個停靠面，儲存在工作階段作用域的 slot store 裡、由 `rightbar.session` 繪製。root 作用域的 `rightbar` 控制器為選中 Session 和擁有已初始化 `keepMounted` 正文的後臺 Session 保留獨立席位；只有前臺 Conversation 可見。重新整理會恢復已儲存的佈局（[狀態](../../packages/client/ui-sidebar-right/README.zh.md#state)）。面的每一次變化都是 kit 純規劃器算出的一條歷史記錄；停靠的 pane 從不空著，根 pane 為空時會加入根據已註冊引匯入口選出的預設頁。

一個 tab 型別是共用定義 `id` 的兩次註冊：在 `ctx.sidebarRightTabs` 裡的靜態定義說明其 `kind` 開啟哪些地址，一次 keyed slot 註冊提供它的正文。框架注入 `useTabInfo()` 以讀取 Sidebar、窗格和標籤的即時資訊；各型別把自身狀態放在 slot store 裡。各包之間只以型別形式引用彼此的宣告。

| 包 | 職責 |
|---|---|
| [`client/ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) | 面板與欄席位、佈局 store、`ctx.sidebarRightTabs`、`ctx.sidebarRight`、Tab 域、引導型別 |
| [`client/ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) | 純佈局引擎與 React 面；`ui-sidebar-right` 的內部依賴，不是穩定介面 |
| [`client/resources`](../../packages/client/resources/README.zh.md) | `ctx.resources`、`useResource`、協定 → 值型別的花名冊 `ResourceProtocolMap` |
| [`api/workspace-files`](../../packages/api/workspace-files/README.zh.md) | Host `ctx.workspaceFiles`、`workspaceFiles` Remote 名稱空間與 Client `file` 資源提供者 |
| [`util/workspace-path`](../../packages/util/workspace-path/README.zh.md) | 檔案地址語法：`fileAddressFor`、`parseFileAddress` |
| [`client/ui-sidebar-documentpreview`](../../packages/client/ui-sidebar-documentpreview/README.zh.md)、[`client/ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.zh.md)、[`client/ui-sidebar-browser`](../../packages/client/ui-sidebar-browser/README.zh.md) | 內建的 `text`、`files` 與 `browser` 型別 |

## 地址

每個 tab 都由一個地址字串開啟，地址就是 tab 的內容身份。地址分兩族。

**資源地址**是 `dsh-resource://<type>/…` 形式的 URL。host 命名資源協定——即 `ResourceProtocolMap` 的鍵——其後是該協定自己的路徑；所有協定共用一個 scheme，新增協定只新增 host、不新增 scheme。`file` 協定的路徑以其作用域開頭：`session/<sessionId>` 後接相對該工作階段工作區根的路徑（`dsh-resource://file/session/abc/src/notes.txt`），或 `absolute` 後接去掉前導 `/` 的絕對路徑（`dsh-resource://file/absolute/home/ys/notes.txt`，Windows 上為 `dsh-resource://file/absolute/C:/x/y.txt`）。id 與每一段路徑都做元件編碼，磁碟機代號的 `:` 保留原樣。`fileAddressFor(sessionId, cwd, path)` 建構地址——相對路徑或工作區內的絕對路徑成為 `session` 相對地址，其他絕對路徑成為 `absolute` 地址——`parseFileAddress(address)` 讀回各部分或返回 `undefined`（[語法](../../packages/util/workspace-path/README.zh.md)）。

**頁面地址**是 Sidebar 為按 kind（而非按資源）開啟的 tab 記下的地址：`sidebar://<kind>`，由 Sidebar 自己在 `openTab(kind)` 執行時寫入。呼叫方從不拼它——引導頁與檔案樹以 `openTab('guide')`、`openTab('files')` 開啟——此外不存在任何導航地址（[不做](#not-built)）。

tab 身份是 `(kind, address)` 二元組：註冊表的認領把地址原文用作記錄的 `contentId`，因此同一地址經同一型別再次開啟會找到已有 tab，同一地址經兩個型別開啟則是兩個 tab。

## Tab 型別註冊

`ctx.sidebarRightTabs.register(definition)` 在呼叫方的生命週期內註冊一個型別的一份實作並返回登出器；呼叫方把它放在自己的 `ctx.effect` 裡，因此實作與貢獻它的外掛同壽，同一 `id` 的第二次註冊拋錯（[擴充功能席位](../../packages/client/ui-sidebar-right/README.zh.md#extension-seats)）。定義是靜態的：沒有執行時 hook，沒有按 tab 或按工作階段的東西。

| 欄位 | 含義 |
|---|---|
| `id` | 該實作的身份，在所有註冊中唯一；包名是自然取值（`@deepseek-ai/dsh-client-ui-sidebar-files`）。正文與標題坑位按它註冊。 |
| `kind` | 型別的判別名：它的 tab 是什麼，也是 `openTab` 點名的物件。不唯一——extension 可以接管 builtin 的 kind。內建 kind 為 `guide`、`text`、`files`。 |
| `patterns` | 可選的資源地址 glob；按 kind 開啟的頁面型別省略。含 `:` 的模式匹配整個地址（`dsh-resource://file/**`）；不含的匹配 URL 的路徑部分且任意深度都中（`*.md`），不是 URL 的地址不會命中此類模式。匹配不分大小寫、不隱藏 dotfile；語法為 picomatch 的 POSIX 方言。 |
| `priority` | 三檔字面量之一：`extension`（預設且最高：產品之外的型別壓過所有內建檢視器）、`builtin`（隨產品釋出的型別）、`fallback`（任何更具體的型別都應壓過的純內容檢視器）。 |
| `canOpen(address)` | 可選的同步否決，對 glob 命中生效；每次路由決策都會呼叫。 |
| `title(address)` | chip 文字，在 tab 開啟時捕捉進佈局記錄，之後不再改寫。 |
| `keepMounted` | 可選的懶保活：已存取正文跨隱藏、Session 切換與停靠切換保留，由所屬 View 持有 Session reference。 |
| `guide` | 可選的引導頁入口框：`{ order, title(), description?(), icon? }`。點一框即把貢獻它的型別作為頁面開啟；省略即不上引導頁。 |

路由是一次排序認領。`candidates(address)` 對模式命中且未被 `canOpen` 否決的型別排序：先按檔，再按最長命中模式的長度，最後按註冊順序。`claim(address, kind?)` 取第一個候選，或直接用點名的 `kind`——跳過它的 glob，但 `canOpen` 仍生效——返回 `{ kind, contentId: address, title }`。沒有任何型別認領的地址會拋錯：這是接線錯誤，不是使用者錯誤。

同一個 `kind` 可同時攜帶一個 `builtin` 與一個 `extension` 註冊。extension 在認領、`get(kind)`、`openTab(kind)` 與引導頁上生效，席位按生效定義的 `id` 找 tab 的正文與標題，不涉及任何 slot 優先順序；extension 登出後 builtin 恢復。kind 上的其它任何撞名以及任何重複的 `id` 都拋錯。

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

export const inject = ['sidebarRightTabs', 'slots']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: '@acme/dsh-client-ui-image',
    kind: 'image',
    patterns: ['*.png', '*.jpg', '*.gif', '*.svg'],
    canOpen: address => address.startsWith('dsh-resource://file/'),
    title: address => address.slice(address.lastIndexOf('/') + 1),
  }), 'image type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: '@acme/dsh-client-ui-image' },
    ImageBody,
  )), 'image body')
}
```

## 導航：`ctx.sidebarRight`

兩種開啟構成導航控制器，進入這一列的每條路都呼叫其一：`openResource(address, options?)` 開啟 `dsh-resource://` 地址——工作階段區的檔案連結、工具行的行號引用、檔案樹的行；`openTab(kind, options?)` 開啟頁面——tab 條的新增控制元件、引導頁入口框或 Assistant Markdown 中的 HTTP(S) 連結。兩者都以一條歷史記錄走完四步——認領（註冊表為資源排候選，或點名 `kind` 的生效實作應答）；聚焦已顯示同一 `(kind, address)` 的 tab；否則落一個新 tab；展開這一列——然後把導航記入 Tab 域（[服務](../../packages/client/ui-sidebar-right/README.zh.md#ctxsidebarright)）。使用者看不見的內容不算開啟，所以摺疊的列會在同一步展開。`openResource` 對 `dsh-resource://` 之外的地址或無人認領的地址拋錯；`openTab` 對無人註冊的 kind 拋錯：二者都是接線錯誤，不是使用者錯誤。

| 選項 | 含義 |
|---|---|
| `paneId` | 新 tab 落到這個 pane；預設為活動的停靠 pane（活動的是浮窗時取第一個停靠 pane）。 |
| `replaceTab` | 佔用這個 tab 的 pane 與條上位置，並在同一步關閉它；浮窗裡的 tab 讓不出位置，新 tab 按未指定位置落位。 |
| `revealIfOpened` | 預設 `true`：已顯示同一 `(kind, address)` 的 tab 被聚焦並收到 `params`。`false` 則無論如何再開一個。 |
| `preferNewPane` | 在普通格數預算與空間規則下優先新建停靠格；不能分欄時退回到目標格。與 `replaceTab` 一起使用時忽略。 |
| `kind`（僅 `openResource`） | 點名開啟型別而不排候選；該 kind 的生效實作開啟地址，它的 `canOpen` 仍生效。 |
| `params` | 給正文的導航參數，作為 `navigation.params` 送達。`openResource` 按資源型別經宣告合併表 `SidebarRightResourceParamsMap` 定型（文字預覽宣告 `{ line?: number }`）；`openTab<K>` 按 kind 經 `SidebarRightTabParamsMap` 定型，未宣告的 kind 為 `undefined`；正文讀到的是二者聯合 `SidebarRightNavigationParams`。值按約定為 JSON 形狀，執行時不驗證。 |

落位是呼叫方的選項，從不是型別的屬性。工作階段區調 `openResource(fileAddressFor(sessionId, cwd, path))`，`read` 工具行另加 `{ params: { line } }`（來自呼叫的 1 起 `offset`）；引導頁入口框調 `tab.actions.openTab(entry.kind, { replaceTab: true })`；檔案樹的行調 `tab.actions.openResource(address)`；tab 條的新增控制元件調 `openTab('guide', { paneId, revealIfOpened: false })`。

`close(tabId)` 關閉一個 tab；`active()` 返回活動 pane 的活動 tab；`isExpanded()` 與 `toggleExpanded()` 讀取與翻轉這一列，翻轉記入序列。無工作階段時讀操作返回 `undefined` 或 `false`；寫操作需要已掛載的工作階段面，沒有時拋錯而不是寫進沒人繪製的面。

`focus(tabId)` 讓一個 tab 成為其 pane 的活動 tab；`split(paneId?)` 分割活動的停靠 pane 或點名的 pane，返回新 pane 的 id——pane 數預算或列寬不允許時返回 `undefined` 且不記帳；`float(tabId, rect?)` 把一個 tab 浮出為浮窗 pane；`dock(paneId)` 把浮窗 pane 收回停靠區。四者都走 store 既有動作、各記一條歷史；目標不存在或已處於目標狀態時是空操作，與 `open` 一樣在沒有已掛載工作階段面時拋錯。`TabId`、`PaneId`、`TabRecord`、`FloatRect` 自本包 `/client` 入口再匯出，呼叫方無需引 dockkit。

`focusedTarget(element?)` 從即時 DOM 焦點（包括內嵌 iframe）捕捉可見頁面；側欄外部或過期的側欄標記不產生目標。`commandTarget(element?)` 還允許側欄外部發起的開啟操作使用已掛載 Session 的活動停靠窗格。`SidebarRightTarget` 捕捉 Session、窗格、host、tab occurrence 和導航 revision。`isTargetCurrent(target)` 在執行前檢查這些身份，因此重新開啟記錄或再次導航都會使已捕捉的動作失效；它不會改為操作其他頁面。關閉與落位結果見[控制器方法](../../packages/client/ui-sidebar-right/src/client/service.ts)。

## Slot 與 owner props

Sidebar 宣告四個擴充功能 slot；其文件 tab 另行宣告下表中的 keyed 文件正文 slot（[層級](slots.zh.md)）。

| Slot | Cardinality | 用途 |
|---|---|---|
| `sidebar.right.pane.tab` | 按定義的 `id` keyed，工作階段作用域 | 一個 tab 的正文。席位把 tab 分發到其 kind 生效實作的 `id`，因此註冊者收到該 kind 的每個 tab，停靠或浮窗。實作沒有註冊正文的 kind 渲染 owner 的「無法檢視此內容」提示。 |
| `sidebar.right.pane.tab.title` | 按定義的 `id` keyed，工作階段作用域 | chip 的標題，owner share 與正文相同。可選：沒有條目時 chip 顯示開啟時捕捉的 `title(address)` 文字；有活標題的型別在此讀自己的 store。 |
| `sidebar.right.tab.guide` | chain，工作階段作用域 | 替換引導 tab 的內容而不替換 tab；第一個不拒絕的條目接管正文，否則渲染自帶引導。 |
| `sidebar.right.tab.menu.item` | list，工作階段作用域 | 追加在 kit 自身佈局動作之後的內容級動作。執行了動作的條目必須呼叫 owner 的 `dismiss()`。 |
| `sidebar.right.tab.document` | 按文件實作的 `id` keyed，工作階段作用域 | 文件 tab 內選中的檔案渲染器；父元件擁有共享載入與工具欄控制元件。 |

正文、標題與引導頁替換項接收框架注入的 `useTabInfo()`。它返回 `{ sidebar, panel, tab }`：`sidebar` 包含 `expanded` 與 `fullscreen`，`panel.id` 標識所屬窗格，`tab` 包含記錄欄位以及 `visible`、`navigation`、`signal` 和 `actions`。所有 tab 都要求 Session 位於前臺。停靠正文還要求展開且選中；停靠標題要求展開；前臺浮窗不隨整欄收起。`signal` 在記錄消失或外掛解除安裝時中止，不因隱藏或切換 Session 而中止。`tab.actions` 提供繫結到標籤所屬 Session 的 `openResource`、`openTab` 與 `close`。開啟位置預設為目前所屬窗格；`revealIfOpened` 預設為 `true`，`replaceTab: true` 在同一歷史項中替換本記錄。選單項保留普通的 `tab` 與 `dismiss` owner 參數。

`navigation.revision` 在每次導航到該 tab 時遞增，`params` 不變也遞增，正文可僅憑「又被導航了」行動；按地址開啟的 tab 為 `1`，沒有人按地址開啟的記錄——種入的引導、撤銷恢復的 tab——為 `0`。Tab 域為每條開啟的記錄保有一個 occurrence：記錄出現即在資源模型裡釘住，因此切換 tab 解除安裝正文也不丟內容；記錄消失即中止並丟棄；撤銷恢復的記錄是新的 occurrence（[Tab 域](../../packages/client/ui-sidebar-right/README.zh.md#the-tab-domain)）。

`tab.actions.bindCommands(commands)` 為已掛載正文提供 `SidebarRightTabCommands`，目前包含可選的 `refresh` 回呼。省略的操作不可用；返回的 disposer 釋放本次註冊，不會移除較新正文的命令。標籤生命週期結束時也會釋放這些命令。`tab.refreshShortcut` 為頁面控制元件提供生效的重新整理目錄項；沒有可用條目時該欄位可省略。這些欄位宣告在 [slot owner 型別](../../packages/client/ui-sidebar-right/src/client/contract/slots.ts)中。

## 文件渲染器

`text` tab 是共享的 Document Preview 所有者。其[根註冊](../../packages/client/ui-sidebar-documentpreview/src/client/index.ts)宣告 `sidebar.right.tab.document` 並提供 `ctx.documentPreviews`。渲染器在自己的 effect 中註冊 `DocumentPreviewDefinition` 中繼資料，再透過 `ctx.slots.inject('sidebar.right.tab.document', ...)` 等待 slot，以 `key: definition.id` 和自己的 locale 名稱空間註冊元件。渲染器註冊自己的正文，並可透過子 slot 複用共享展示元件。切換渲染器不改變 tab 或資源地址；[擴充功能決議](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md)將預覽策略與資源歸屬分開。

[註冊表](../../packages/client/ui-sidebar-documentpreview/src/client/document/registry.ts)記錄唯一的 `id`、`extensions`、在地化 `title()`、`loading`，以及可選的 `priority` 和 `wrap`。字尾匹配不區分大小寫，先排 `extension`（預設值）、再排 `builtin`，隨後比較字尾長度（長者優先）與註冊順序。與 tab kind 替換不同，註冊表保留所有實作；工具欄列出匹配的候選，按 tab 記住選擇。未知副檔名使用純文字。`binaryExtensions` 宣告的字尾不提供純文字備選，見[包 README](../../packages/client/ui-sidebar-documentpreview/README.zh.md#what-it-registers)。`loading` 為 `text-pages`、`bytes-complete` 或 `renderer`；`wrap` 宣告是否支援共享的原始碼換行控制元件。

[`DocumentPreviewProps`](../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts) 派生自 `PropsRuntime<'sidebar.right.tab.document'>`。owner 提供原始 `resourceAddress`、`content`、目前 `wrap`，以及宣告依賴的 `addResource` / `setResources` 回呼：文字內容為 `{ kind: 'text', text, pages: [{ offset, text, lines }], eof }`，其中 `text` 為累積文字；完整位元組為 `{ kind: 'bytes', data }`，其中 `data` 為 `Uint8Array<ArrayBuffer>`。這些瞬時緩衝區按只讀方式借用，不得進入持久佈局或 Session JSON。PDF 在轉移到 Worker 前複製位元組，以保留 owner 的緩衝區。子元件收到同一個框架繫結的 `useTabInfo`，以及全域共享、僅提供中繼資料的 `useResource`。父元件透過 `remote.workspaceFiles.read` 讀取文字，透過 `remote.workspaceFiles.readBytes` 讀取位元組，擁有追加分頁、逐 tab 重新整理與載入狀態。HTML 向同一個位元組讀取方法傳入 `baseFile`；路徑由 Host 程式碼解析。Markdown 和程式碼在追加期間保留同一個增量渲染器，到 EOF 完成最終解析；HTML 和 PDF 接收完整位元組。

Preview 記錄已載入版本和讀取開始時的觀察版本。自動重新整理預設開啟；成員首次中繼資料只建立基線，後續變化才重新載入 tab。重新整理只重讀目前 tab，不改變共享中繼資料或其他 tab 的內容。讀取不具備事務性；版本是不透明的相等性權杖，不是可排序的時間戳（[資源觀察與 Preview RPC](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md)）。

自行載入的渲染器接收 `{ kind: 'renderer', revision, loaded, failed, reload }`，而不是檔案位元組。正文呼叫自己的注入 face，在 revision 變化和解除安裝時取消請求，並透過 `loaded(version)` 報告已展示的源版本。載入失敗時呼叫 `failed()`，使後續檔案變化能夠觸發重試。父元件忽略過期報告，保留共享的重新載入與原始檔變更控制元件。Office 使用此模式請求 [Host 渲染的 PDF](office-to-pdf.zh.md)；其 face 將轉換位元組、字型中繼資料和失敗寫入自己的 store，正文渲染巢狀 PDF 檢視。`OfficeFontAction` 透過 `sidebar.right.tab.document.action` 在重新整理按鈕前顯示缺失字型警告。[包 README](../../packages/client/ui-sidebar-documentpreview/README.zh.md#what-it-registers)定義載入生命週期。

## 資源模型

模型本身見[用戶端資源](client-resources.zh.md)；本節只寫 Sidebar 依賴的部分。一份資源是一個地址，資源地址是 `dsh-resource://<type>/…` 形式的 URL，小寫 host 即協定鍵。協定所屬的用戶端包用 `ctx.resources.register(provider)` 在自身生命週期內註冊唯一的提供者；同一協定的第二個提供者拋錯（[提供協定](../../packages/client/resources/README.zh.md#provide-a-protocol)）。提供者是 `{ protocol, open(address, { signal }) }`：`open` 產出 `RemoteResult` 幀——首幀是目前狀態，之後每次變化一幀——並在 `signal` 中止時停下；失敗是 `{ ok: false, error }` 幀而不是拋錯，流裡丟擲的東西是程式設計錯誤，模型不捕捉。

`useResource<P>(address)` 是每個 slot 元件都有的全域標準 prop，不論作用域。它返回 `{ status, value, failure }`：地址協定沒有提供者或地址不是資源地址（`sidebar://guide` 不指向資源）時為 `none`，首幀之前為 `loading`，`live` 攜帶最新 `ok` 值，`failed` 在最後一個值旁攜帶最新幀的失敗。（[讀取資源](../../packages/client/resources/README.zh.md#read-a-resource)）。

資源有持有者就保持開啟——訂閱中的 `useResource` 或一次 `ctx.resources.pin(address, signal)`；第一個持有者開啟提供者的流，之後的持有者共享它並立刻讀到最新值，最後一個釋放時中止流並丟棄值。流只推中繼資料不推內容：`file` 的值是 `{ absolutePath, version, bytes? }`，消費方自己經 Workspace Files 服務按頁讀檔案文字（[生命週期](../../packages/client/resources/README.zh.md#lifecycle)）。

## Workspace Files

Host 的 `ctx.workspaceFiles` 服務與生成的 `workspaceFiles` Remote 名稱空間讀取 Session 檔案系統後端允許的檔案：`stat(path)` 返回 `{ absolutePath, version, bytes? }`；`read(path, { offset?, limit? })` 返回一頁行（`offset` 1 起，`limit` 受設定頁長限制），形如 `{ …stat, offset, text, eof }`；`readBytes(path, { range?, baseFile? })` 在 `maxFileBytes` 上限內返回完整檔案，或在 `maxBytes` 上限內返回位元組視窗，形如 `{ …stat, offset, data, eof }`，其中 `data` 為原生 `Uint8Array`。可選 `range` 使用 0 起算的 `offset` 與位元組數 `length`；`baseFile` 從另一檔案所在目錄解析相對目標。`list(path)` 仍限定在工作區根內，返回目錄的直接子項（`name`、`type: 'file' | 'directory' | 'other'`、`size?`），按設定上限截斷並置 `truncated`。`changes(path)` 監聽一個目標，由 Host 判斷目標型別並將目錄限制在工作區。訂閱就緒後產出 `{ kind: 'ready' }`，隨後產出 `{ kind: 'change', change }` 幀，其載荷為 `{ absolutePath, version }` 或 `{ absolutePath, absent: true }`（[README](../../packages/api/workspace-files/README.zh.md#use-this-package)）。檔案讀取拒絕末端符號連結並執行傳輸上限；`read` 還要求 UTF-8 文字。失敗使用 `workspace-file/*` 錯誤碼（[失敗](../../packages/api/workspace-files/README.zh.md)）。

[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md) 註冊 `file` 提供者，`ResourceProtocolMap.file` 直接是 `WorkspaceFileStat`。Session 地址攜帶授權 Session 與相對或絕對路徑，Host 原樣接收並解析。提供者在 stat 前等待 Host 的 `ready` 幀，並按 `stat.absolutePath` 過濾變更。裸 `absolute` 地址沒有授權 Session，以 `workspace-file/unknown-workspace` 失敗，不借用目前或 Tab Session。任何 UI（包括 Global）存取同一完整地址都共享觀察。Preview 的 Remote 回呼使用地址中的 Session；`remote.workspaceFiles.readBytes` 透過 Connection 的二進位制 RPC 傳輸返回原生位元組。

## 內建型別

- **`guide`**——`builtin`，以 `openTab('guide')` 開啟。一枚弱化的羅盤位於各型別按 `order` 貢獻的入口膠囊上方；入口較少時顯示已註冊的描述，未提供圖示的入口統一使用內建預留位置。點選膠囊即在引導 tab 的位置把貢獻它的型別作為頁面開啟。每個 pane 最多一個引導 tab，tab 條的新增控制元件只在本 pane 沒有引導時出現。新 pane 使用已註冊的預設頁：只有一個引匯入口時直接使用該入口，否則使用引導頁（[引導](../../packages/client/ui-sidebar-right/README.zh.md#the-guide)）。
- **`text`**——`fallback`，`dsh-resource://file/**`，只認領 Session 地址。Document Preview 透過 `useResource<'file'>` 觀察中繼資料，經 Remote 回呼載入內容，並擁有渲染器選擇、工具欄、逐 tab 重新整理、滾動與原始碼定位；未知副檔名按純文字渲染（[README](../../packages/client/ui-sidebar-documentpreview/README.zh.md)）。
- **`files`**——`builtin`，以 `openTab('files')` 開啟。工作區目錄樹，經 `list` 懶載入，按展開目錄建立監聽，用 `tab.actions.openResource(fileAddressFor(sessionId, root, path))` 在自己所在 pane 開啟檔案（[README](../../packages/client/ui-sidebar-files/README.zh.md)）。
- **`browser`**——可多開的 `builtin`，以 `openTab('browser', { params: { url? } })` 開啟。Chat 的[連結偏好](../../packages/client/ui-chat/README.zh.md)決定 Assistant Markdown 是否在此開啟 HTTP(S) 連結。它在預設 sandbox 下接受公共與 loopback HTTP(S) 目標，本地檔案改用 Document Preview，並使用應用已知的 iframe history（[README](../../packages/client/ui-sidebar-browser/README.zh.md)）。
- **`subagentchat`**——`builtin`，`dsh-resource://subagentchat/session/<child>?parent=<parent>&mode=<mode>`。資源提供者保留一個顯式定址的 subagent Conversation，並透過共享 Conversation Factory 渲染（[README](../../packages/client/ui-subagent/README.zh.md)）。

<a id="agent-open-requests"></a>
## Agent 開啟請求

Host 呼叫方用 `ctx.sidebarBrowser.open(sessionId, url)` 為使用者開啟頁面，返回收到請求的應用視窗數。每個已連線視窗跟隨 `sidebarBrowser.watchOpenRequests` Remote 流，並透過 `openTabIn` 在該 Session 中新開一個 `browser` tab；Browser 像驗證任何 typed-open 地址一樣驗證該地址。請求只在即時生效：之後才連線的視窗收不到先前的請求，沒有視窗接管的 Session 不會開啟任何頁面。[Claude Code 模型路由](../../packages/llm/llm-claude-code/README.zh.md)把這個通道作為 `open_browser_tab` 工具提供給 Claude Code。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgitcontroller--gitcontroller"></a>

### `ctx.gitController` — `GitController`

Serves Source Control and GitHub operations over the `git` Remote namespace.

```ts cordis-catalog
/**
 * Read the repository state of a Session's working directory.
 * @param sessionId - Session whose working directory is inspected.
 * @returns the state, or `repository: false` when the directory is not inside a Git repository.
 */
@Remote async status(sessionId: SessionId): Promise<GitStatusView>

/**
 * Create a Git repository in a Session's working directory.
 * @param sessionId - Session whose working directory becomes a repository.
 * @returns the new repository's state.
 */
@Remote async init(sessionId: SessionId): Promise<GitStatusView>

/**
 * Stage changed paths.
 * @param sessionId - Session whose repository changes.
 * @param paths - repository-relative paths; empty stages every change.
 * @returns the repository's state afterwards.
 */
@Remote async stage(sessionId: SessionId, paths: readonly string[]): Promise<GitStatusView>

/**
 * Remove paths from the index, keeping their working-tree changes.
 * @param sessionId - Session whose repository changes.
 * @param paths - repository-relative paths; empty unstages every change.
 * @returns the repository's state afterwards.
 */
@Remote async unstage(sessionId: SessionId, paths: readonly string[]): Promise<GitStatusView>

/**
 * Commit the staged changes, staging every change first when none is staged.
 * @param sessionId - Session whose repository commits.
 * @param message - commit message; blank messages are refused.
 * @returns the repository's state afterwards.
 */
@Remote async commit(sessionId: SessionId, message: string): Promise<GitStatusView>

/**
 * Push the current branch, setting `origin` as its upstream when it has none.
 * @param sessionId - Session whose repository pushes.
 * @returns the repository's state afterwards.
 */
@Remote async push(sessionId: SessionId): Promise<GitStatusView>

/**
 * Fast-forward the current branch to its upstream.
 * @param sessionId - Session whose repository pulls.
 * @returns the repository's state afterwards.
 */
@Remote async pull(sessionId: SessionId): Promise<GitStatusView>

/**
 * Read the GitHub CLI's sign-in.
 * @returns whether the CLI is installed, the signed-in user, and a sign-in in progress.
 */
@Remote async githubAccount(): Promise<GithubAccountView>

/**
 * Start a GitHub device sign-in, or return the one already waiting for its code.
 * @returns the one-time code and the page to enter it on; the sign-in completes in the background.
 */
@Remote githubLogin(): Promise<GithubLoginPrompt>

/**
 * Sign the GitHub CLI out of github.com.
 * @returns the sign-in state afterwards.
 */
@Remote async githubLogout(): Promise<GithubAccountView>

/**
 * List the signed-in user's repositories, most recently updated first.
 * @returns the repositories and, for each, its local clone when one exists.
 */
@Remote async githubRepositories(): Promise<GithubRepository[]>

/**
 * Clone a repository into the clone directory and add it as a Workspace; an existing clone is reused.
 * @param nameWithOwner - `owner/name` of the repository.
 * @returns the clone's local directory.
 */
@Remote async githubClone(nameWithOwner: string): Promise<GithubCloneResult>

/**
 * Create a GitHub repository from a Session's repository, add it as `origin`, and push.
 * @param sessionId - Session whose repository is published.
 * @param visibility - visibility of the new GitHub repository.
 * @returns the repository's state afterwards.
 */
@Remote async githubPublish(sessionId: SessionId, visibility: GithubVisibility): Promise<GitStatusView>
```

Types: [SessionId](core.zh.md)

Source: [`packages/client/ui-git/src/git-controller.ts`](../../packages/client/ui-git/src/git-controller.ts)

<a id="ctxsidebarbrowser--sidebarbrowseropener"></a>

### `ctx.sidebarBrowser` — `SidebarBrowserOpener`

Fans open requests out to the connected app windows.

```ts cordis-catalog
/**
 * Ask every connected app window to open a page in a new Browser tab.
 * @param sessionId - Session whose Sidebar receives the tab.
 * @param url - HTTP(S) address; the Browser refuses any other address.
 * @returns the number of app windows that received the request; 0 when none is connected.
 */
open(sessionId: SessionId, url: string): number

/**
 * Stream the open requests made while subscribed, in order, without replaying earlier ones.
 * @param signal - stream lifetime.
 * @returns `ready` once this window receives requests, then one `open` item per request.
 */
@Remote({ mode: 'stream' }) async *watchOpenRequests(signal: AbortSignal): AsyncIterable<BrowserOpenStreamItem>
```

Types: [SessionId](core.zh.md)

Source: [`packages/client/ui-sidebar-browser/src/open-requests.ts`](../../packages/client/ui-sidebar-browser/src/open-requests.ts)
<!-- END GENERATED cordis-surface -->

<a id="not-built"></a>
## 不做

- 持久化：佈局狀態只在記憶體裡；重新整理後每個工作階段從摺疊開始，任何工作階段的 tab 都不會出現在另一個工作階段裡。
- `ctx.sidebarRight` 上的只讀佈局快照或訂閱：服務只暴露操作，dockkit 的 `LayoutState`/`LayoutOp` 是內部的。
- 服務上的能力探測陣列（`features`）。
- tab 型別的 `option` 優先順序檔：沒有「只列出、不許認領」的 tab 型別。
- 改寫記錄的標題：`title(address)` 只捕捉一次；活的 chip 來自標題 slot，而不是記錄。
- 開啟時點名某個 tab 實作：`openResource` 最多點名一個 kind；文件渲染器由檔案 tab 的工具欄選擇。
- 服務上的地址查詢（`find`）：呼叫方用 `revealIfOpened` 開啟，由停靠面去重。
- Sidebar 自身 `sidebar://<kind>` 記帳之外的導航地址；其語法等導航控制器整體做時再定。
- 面向使用者的撤銷與跨型別通用內容導航棧（[暫緩](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md#deferred)）；Browser 只擁有自身頁面歷史。
