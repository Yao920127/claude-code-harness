# Agent Note: 用戶端資源模型

Status: implemented

[English](2026-09-05-client-resource-model.md) | 中文

## Problem

右側 Sidebar 的 tab 正文、聊天卡片或任何別的 slot 元件，常常需要只以地址可知的活資料：agent 剛寫的檔案，將來的聊天節點或終端。資源模型出現前每個消費方各自取數——文字預覽自己持有 Remote 呼叫與重新整理迴圈——於是每次掛載都重讀、兩個元件顯示同一檔案就持有兩份、切 tab 解除安裝正文就丟內容，每種新內容都意味著一個新的專用 hook。

約束來自 tab 記錄。tab 必須在開啟它的程式碼不在場時挺過撤銷、重做、正文重掛載與熱替換，所以記錄只能存可序列化的資料：一個地址與導航參數。瀏覽器頁面重新整理會重置只在記憶體中的 Sidebar 狀態。因此開啟方不能把資料交給正文，注入也不是合適的工具——注入是領域與席位之間註冊期的關係，而開啟是執行期事件。元件必須只憑地址找到資料，途徑是由資料擁有者註冊一次的東西。

## Decision

[`packages/client/resources`](../../../../packages/client/resources/README.zh.md)（`@deepseek-ai/dsh-client-resources`）提供 `ctx.resources` 與 `useResource` 全域標準 hook。消費方活讀的任何東西都是**資源**，資源只由其**地址**標識，地址的協定命名唯一一個把它變成幀流的**提供者**。

### 地址

資源地址是 `dsh-resource://<type>/…` 形式的 URL。host 是協定鍵——`ResourceProtocolMap` 的鍵——路徑歸協定擁有者。`RESOURCE_SCHEME = 'dsh-resource'` 是唯一的 scheme 常數；`protocolOf(address)` 用 `new URL` 解析字串，要求 `protocol === 'dsh-resource:'`，返回小寫 host；解析器拒絕的字串、其它 scheme 或空 host 返回 `undefined`。`dsh-resource` 不是 URL 規範裡的特殊 scheme，解析器會保留 host 的大小寫並把路徑當作不透明串，所以小寫化是顯式做的，每段路徑由定義它的協定做百分號編碼。需要作用域的協定把作用域編進路徑：`dsh-resource://file/session/<sessionId>/<path>`，`session/<sessionId>` 命名由其 Host 工作區解析相對或絕對路徑的 Session（[語法](../../../../packages/util/workspace-path/README.zh.md)）。其它任何 scheme——`sidebar://guide`——是導航地址：它命名一個 tab 而非資料，模型對它回答 `none`（[tab 型別與導航](2026-09-05-sidebar-tab-types-and-navigation.zh.md)）。

### 服務

```ts ignore-check
interface Resources {
  register<P extends ResourceProtocol>(provider: ResourceProvider<P>): () => void
  pin(address: string, signal: AbortSignal): void
  source(address: string): ObservableSnapshot<ResourceSnapshot<unknown>>
}

interface ResourceProvider<P extends ResourceProtocol> {
  readonly protocol: P
  open(address: string, ctx: { readonly signal: AbortSignal }): AsyncIterable<RemoteResult<ResourceProtocolMap[P]>>
}

interface ResourceSnapshot<Value> {
  readonly status: 'none' | 'loading' | 'live' | 'failed'
  readonly value: Value | undefined
  readonly failure: RemoteFailure | undefined
}

type UseResource = <P extends ResourceProtocol>(address: string) => ResourceSnapshot<ResourceProtocolMap[P]>
```

`register` 讓每個協定恰有一個提供者：同一協定的第二次註冊拋錯，註冊是掛在註冊方外掛 fiber 上的 effect，所以協定隨外掛離開、之後可再註冊。`pin` 在不訂閱的情況下讓資源保持開啟直到訊號中止；已中止的訊號什麼也不釘。`source` 是 hook 背後的裸 observable，按地址引用穩定，供 React 之外的呼叫方使用。值型別在 `ResourceProtocolMap` 裡查得，它作為空介面宣告在 `ui-slots` 裡、與 `SlotMap` 並列——模組增強無法給目標模組新增它沒有的匯出，而每個消費方本來就依賴 `ui-slots`——各協定擁有者宣告合併自己的成員（`file: WorkspaceFileStat`）；resources 包再匯出這個型別。

### hook

`useResource` 宣告在 `ui-slots` 的 `GlobalStandardProps` 上，因此每個 slot 元件不論作用域都有它，外掛經 `ctx.slots.provideRoot({ keyedHooks: { resource: address => resources.source(address) } })` 提供，與 `useSessions` 走同一條根 keyed hook 路徑。它不是工作階段標準 prop：資源的作用域隨地址攜帶，工作階段作用域之外的元件也要讀資源。`useResource<P>(address)` 返回快照：地址協定沒有提供者或地址不是資源地址時為 `none`，流已開啟、首幀未到時為 `loading`，`live` 攜帶最新 `ok` 值，`failed` 在最後一個值旁攜帶最新幀的失敗。

### 幀

提供者產出 `RemoteResult` 幀：首幀是目前狀態，之後每次變化一幀。`ok` 幀使資源 `live`、替換值、清除失敗；`ok: false` 幀使其 `failed`、記下失敗、保留最後一個值。失敗是資料不是異常：Remote 面本來就把失敗折進 `ok: false` 且從不 reject，提供者原樣轉發這些幀，模型既不捕捉也不包裝——提供者流裡丟擲是程式設計錯誤，任其冒出。自行結束的流保持最後狀態；提供者在中止它的那次釋放之後產出的幀被丟棄，迭代器被歸還。流只推中繼資料不推載荷：`file` 的值是 `{ absolutePath, version, bytes? }`，消費方自己經 [Workspace Files 服務](2026-09-05-workspace-files-service.zh.md)讀內容。

### 生命週期

每個地址一條記錄。持有隻控制觀察的啟停，不控制底層檔案或 Session 的生滅。持有者是 hook 的訂閱者加 pin；第一個持有者在 `AbortController` 下開啟提供者的流，之後的持有者共享它並立刻讀到最新值，最後一個釋放時中止流並把快照重置為空閒——有提供者註冊時為 `loading`，否則為 `none`。地址已被持有時到達的提供者會開啟該地址的流；離開的提供者中止它，地址讀作 `none`。記錄在頁面存續期內保留，使 `source(address)` 在 React 渲染到訂閱的視窗與 StrictMode 重掛載之間保持引用穩定，否則重建記錄會讓每次渲染重訂閱、重開流。

右側 Sidebar 的 Tab 域在每條開啟的 tab 記錄存續期內釘住其地址，所以切 tab 解除安裝正文不關流、切回讀到最新值；撤銷恢復的記錄是一次新的釘住，模型已放掉的資源會重新讀取（[tab 型別與導航](2026-09-05-sidebar-tab-types-and-navigation.zh.md)）。`openResource(address)` 只收資源地址；引導頁與檔案樹這類頁面按 kind 開啟，從不進入資源模型。

## Alternatives considered

**工作階段繫結的資源：`useResource` 掛工作階段標準件、身份為 `(session, address)`。** 第一版形態。被否，因為檔案不是工作階段的事——工作階段只是路徑的授權者——而且模型必須服務工作階段作用域之外的協定與元件。身份改為只有地址，作用域進入地址語法，hook 移到全域標準件。

**內容進資源流。** 被否：內容可能任意大，流是用來推變化的，不是推載荷。流只帶中繼資料，消費方選擇讀取並保留多少內容。

**以拋錯表達失敗，並把非 `RemoteFailure` 的丟擲包裝成 `gateway/internal`。** 被否：Remote 面從不 reject，所以提供者丟擲的任何東西都是 bug，包裝它就是把 bug 藏起來不讓肇事者看見的 fallback。失敗是 `ok: false` 幀；丟擲就冒出來。

**`file:/<scope>/<id>/<path>`，再到把作用域放在 authority 位的 `file://<scope>/<id>/<path>`。** 兩版更早的語法。單斜槓形態不是平臺解析器接受的 URL，每個消費方都得手工解析。把作用域移到 authority 位使它成為 URL，卻讓每個資源協定各佔一個 scheme——`file://`、將來的 `chat://`、`terminal://`——scheme 的集合隨協定集合增長，`file://` 地址不再是它在別處的含義，區分資源地址與導航地址需要一張清單。單一 scheme `dsh-resource://<type>/…` 讓這個判斷只需一次比較，host 留給協定命名，其它所有 scheme 留給導航。

**手寫 scheme 字首解析代替 URL 解析器。** 第一版 `protocolOf` 用正則匹配 scheme。地址成為 URL 後被否：解析器已經決定合法性與大小寫，它拒絕的字串應讀作「無協定」而不是被解析一半。

**每 tab 一個流 hook，或框架代管的 `useTabResource(fetch)`。** 依次被否：掛在 tab 域上的流 hook 問錯了擁有者——`file` 資料必須來自工作區檔案服務，聊天資料來自聊天域——而框架代管的 fetch 沒有好的快取鍵。留下的是 tab 上框架繫結的 `useTabInfo` 加一個按地址的用戶端級 `useResource`。

## Consequences

任何 slot 元件只憑地址讀活資料，於是開啟方只傳資料，正文在撤銷、正文重掛載或熱替換後能從記錄重建自己。顯示同一地址的兩個元件共享一條流，被釘住的地址在正文解除安裝後仍存活。一個協定的傳輸只住在一個提供者裡，新增協定只是一個宣告合併的型別加一次註冊。

代價記錄在此以免被重新發現。記錄不回收：記憶體隨讀過的不同地址數增長，而非隨讀取次數增長。中止合規歸提供者；模型會丟棄已釋放的流仍產出的幀，卻阻止不了忽略訊號的提供者跑到下一幀。失敗型別是 Remote 面的 `RemoteFailure`，來源不是 Remote 呼叫的提供者得自己鑄一個。導航地址或畸形字串讀作 `none` 而非報錯，這讓混合地址列表渲染起來便宜，卻讓拼錯的協定除了缺值之外沒有任何診斷。

## Testing

`packages/client/resources/tests/resources.client.spec.ts` 用腳本化的 feed 驅動註冊表：協定歸屬與登出、無提供者的協定與導航地址都為 `none`、提供者在地址已被持有後到達與在持有中離開、註冊隨 fiber 消失、首個持有者開流末個關流、一址一源、包括已中止訊號在內的 pin、重掛讀到最新值且不重開、重開為新流、中止後幀丟棄且迭代器歸還、流自行結束、失敗幀與最後值並存。`tests/apply.client.spec.ts` 在 `SlotTestRuntime` 裡掛載外掛，經一個根作用域探針元件驗證 `useResource` 到達 props、渲染它即開啟提供者的流、dispose 外掛同時撤走服務與 hook。

## Deferred

回收空閒記錄、與 Remote 面解耦的資源自有失敗型別、`chat` 與 `terminal` 協定都還開放；各自等待一個消費方。面向開發者的參考是 [docs/subsystems/client-resources.md](../../../../docs/subsystems/client-resources.zh.md)；消費這個模型的 Sidebar 見 [docs/subsystems/sidebar-right.md](../../../../docs/subsystems/sidebar-right.zh.md)。
