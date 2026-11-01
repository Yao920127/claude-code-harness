---
description: "面向瀏覽器功能測試的 jsdom slot 測試執行時，供測試作者針對生產機制檢驗 slot、儲存與渲染。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-test-runtime

[English](README.md) | 中文

## 概述

`SlotTestRuntime.create()` 讓 Vitest 套件在 jsdom 中驅動生產 slot、store、帶型別的 Session 與 Workspace fixture，並對區域性 DOM 斷言。面向外掛啟用、過載、重連與清理的測試，`createClientTest` 使用具名端點 Remote mock 啟動 web profile 的 bundle roster，無需業務 Host。缺失服務與未打樁呼叫會明確失敗。整機 fixture 擁有啟動和銷燬，區域性 runtime 提供冪等銷燬。透過 `devDependencies` 將本包用於用戶端測試；它不是產品外掛。

連結到工作區的 bundle 從實際包目錄解析依賴；各 bundle 自身目錄中的依賴優先於祖先目錄中繼承的包。

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

本包讓瀏覽器功能測試擁有可掛載的真實執行時：建立測試臺，宣告你的功能所佔用的 slot，掛載功能外掛，渲染一個 slot，在區域性檢視上斷言，然後 dispose（資源釋放）——全程不存在生產邏輯的第二份實作。

### 搭建功能測試

`SlotTestRuntime.create()` 組裝執行時，`declare(children)` 註冊一個自動 frame，其逐 key 的 `<div data-slot>` 包裹層成為快照根，`mount(plugin)` 在真實 fiber 上執行功能，`renderSlot(key, owner, opts?)` 返回帶限定查詢與原位更新的 slot 區域性檢視：

```text
const runtime = await SlotTestRuntime.create()
await runtime.declare({ 'feature-slot': {} })
const handle = await runtime.mount(FeaturePlugin)
const view = runtime.renderSlot('feature-slot', { owner: props })
expect(view.container).toMatchSnapshot()
await runtime.dispose()
```

`mount` 會預檢必需服務，缺失時自明報錯——先用 `provide(name, value)` 提供額外服務。執行時提供的 `fileUpload` 替身會拒絕每次呼叫，直到測試套件替換 `runtime.fileUpload.upload`。`storeOf(key, scopeKey)` 返回渲染器交給 slot 元件的即時儲存實例，用於身份與動作驅動寫入斷言。

可選渲染參數透過 `entryKey` 選擇 keyed 條目，或透過 `only` 選擇 list 條目；`view.update(owner)` 保留該選擇。`runtime.panelInfo` 提供預設的 `usePanelInfo` 資料來源，初始不選中全域面板。掛載生產 Layout 所有者之前，先呼叫 `releasePanelInfoSource()` 釋放該資料來源。`dispose()` 同時釋放預設的工作區與面板資訊根資料來源；提前釋放是冪等的，不會移除替代它們的所有者。

Session fixture 從顯式提供的地址或已載入的父級投影解析子代理地址，不會保留 Session generation。

### 區域性 DOM 快照

註冊的快照序列化器把 CSS-module 雜湊類名折回語義名（`_frame_a1b2c3` → `frame`），使 `.snap` 檔案只含結構，並把 `<svg>` 內部摺疊為 `data-content` 指紋。需要自定義頁面 frame 的套件改用 `root.declare(children, Frame)` 而非自動 frame；`dispose()` 沿單一軸拆除檢視、功能 fiber、已鑄 scope 與持久化儲存狀態，且冪等。

### 腳本化 Remote 應答與失敗

`TestRemote` 是 `ctx.remote` 面的替身：它把自己連同每個被腳本化的名稱空間各註冊一個服務，使注入 `remote.<name>` 的外掛得以解除掛起；`$on` 訂閱由顯式的測試事件驅動器推動；`$host` 是普通可變欄位，套件直接賦值即可腳本化帶 home 或非 loopback 的 Host。UI 套件也在本包取用 `RemoteError` 建構器這個值——`dsh-api-remotes` facade 承載不了它，因為從套件發起的值 import 會拉起該裝配尚未建置的 `/remote` 產物鏈。

按 Host 會答的碼來腳本化失敗，並以生產程式碼同樣的方式斷言——判 `code`，絕不判類：

```text
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'

remote.goals.create.mockResolvedValue({
  ok: false,
  error: new RemoteError('goal/not-found', 'goal "g1" does not exist', { goalId: 'g1' }),
})
expect(view.getByRole('alert')).toHaveTextContent('goal/not-found')
```

### 整體檔

上面的 slot 檔把一個功能掛在替身上。整體檔起真實裝配：`TestClient.start(plan, mock, options)` 程序內 import 每個 roster 行的 `/client` 模組（或取計劃裡的 `provide` 替換），把 `{ rpc: mock.rpc }` 繫結到該用戶端的 Connection 模組，用 `graphFromRoster` 合成啟動圖並把已載入模組交給生產模組系統，經生產 `bootClient` 啟動，按需掛載 `uiRenderer`，再等 `ctx.connection.state === 'connected'`。它藏在深 import 後面，slot 檔測試永不載入它：

```text
// @vitest-environment jsdom
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import { ok } from '@deepseek-ai/dsh-remote-mock'

const test = createClientTest({ roster: webApp }, { mount: true })
test('registers into the sidebar', async ({ remote, start }) => {
  remote.settings.describe.mockResolvedValue(ok({ writable: true, hasDocument: false, namespaces: [] }))
  const client = await start()
  expect(client.ctx.slots.entries('sidebar.settings')).toHaveLength(1)
})
```

`createClientTest` 使用原生 Vitest fixture：每個測試獲得已載入 `remoteDefaultResponses` 的新 `mock`、等同於 `mock.remote` 的 `remote` Proxy，以及設定應答後才起機的 `start()`。重複啟動共用一個 Promise，呼叫方必須 await 它來觀察啟動錯誤。fixture 收尾等待啟動，即使斷言失敗也銷燬用戶端、檢查漏配，並拒絕測試結束後儲存的 `start` 呼叫。需要分別擁有多個用戶端時直接用 `TestClient.start`。這些 fixture 隔離自己的狀態，不隔離 `location` 等頁面全域。

兩檔測試的所有名稱空間都使用[通用 Remote Proxy](../remote-mock/README.zh.md#remote-proxy)。裝配測試使用 `remote` fixture；區域性 `TestRemote` 可以接收 `{ settings: mock.remote.settings }`。直接設定返回資料，並讀取原生 `.mock.calls`。mutation 應答不會自動更新後續 describe 應答：情境釋出新資料時，顯式修改 `remote.settings.describe.mockResolvedValue(...)`。Proxy 文件擁有無建置型別說明和必需的建置後本地型別檢查規則。

### Roster 與啟動行為

`webApp` 是 `web` profile 的瀏覽器 roster，首次 import 裝配入口時從它的 bundle（先 `dsh-base`、再 `dsh-web-app`）按啟動器的方式現讀，只是匹配不到任何行的補丁在這裡拋錯、啟動器只警告：每個 bundle 的 `dsh.bundle.patch` 列表用 include 外掛的 YAML 方言解析、用它的 `applyEntryPatches` 合成，每個未停用且其包宣告 `dsh.client.platform === 'web'` 的行成為一行，帶上該宣告的 `inject` 與 `immediately`；`bundleRoster(bundles, anchor, disabledContext)` 接受顯式 Loader 求值作用域來處理條件 `disabled` 標記；未提供作用域時拒絕瀏覽器表示式。`webApp` 僅提供 Web profile 名稱，不提供業務 Host 服務。沒有任何東西從 bundle 複製出來，bundle 一改下次跑測試就能看見。`webApp.closure(names)` 保留點名的行及其傳遞注入的全部行（即按 bundle 組合方式起這些外掛所需的行），`webApp.pick(names)` 與 `webApp.without(names)` 手工裁剪，三者都對未知名字拋錯，`ClientRoster.of(rows)` 內聯建構一份。`remoteDefaultResponses` 是 roster 在沒有 session、沒有 workspace、預設設定下啟動時恰好會打的那些 Remote 端點的預設回應；測試用 `mock.load(table)` 在其上疊加自己的 `RemoteTable`，任何沒有規則的呼叫都會在 `dispose()` 時經 `mock.assertNoUnmatched()` 讓測試失敗。`mount` 要求 roster 提供 `uiRenderer`；否則 `start` 響亮失敗而不是返回一個空容器。`client.connection` 是 roster 的 Connection 服務（沒有任何 `Context` 增強宣告它），`connectTimeoutMs` 限定等就緒的時長，超時訊息列出 mock log。`reload(name)` 透過共享的 Client Modules 輔助函式重建一個 Loader entry（先拆 registry，再 `entry.refresh()`）；每個用戶端都保留自己的模組系統和繫結實例的 Connection 替換，因此啟動與過載可以重疊而無需改寫頁面全域變數。`unload(name)` 移除 entry 並等待外掛清理完成，`flush()` 在 `act` 內讓 React 落定。jsdom 既沒有 `EventSource`（client-hmr 在 apply 時開啟一個）也沒有 `ResizeObserver` 和 `document.fonts` 事件目標（佈局元件掛載時觀察尺寸與字型載入），所以 `start` 對缺失的全域惰性樁做引用計數，`dispose` 只移除它裝的那些——這是 jsdom 的缺口，不是用戶端身份通道。每個 roster 裡的 `@deepseek-ai/dsh-api-remotes` 行都會被去掉：它生成的 Remote 用戶端只存在於建置後的 `lib/`，而 `remote.<ns>` 正是本檔要替掉的東西。`start` 改為給 roster 注入的每個 `remote.<ns>` 服務（加上此刻 mock 登記過規則的名稱空間；之後才首次登記的名稱空間沒有代理）提供一個無契約代理；`ctx.remote.<ns>.<method>(...args)` 變成對端點 `<ns>/<method>` 的呼叫，攜帶位置參數，mock 登記了 `stream()` 腳本的走流、否則走一元，並沿用生成用戶端的結果摺疊（載體拋錯折成 `gateway/internal`，中止折成 `gateway/cancelled`）。沒有規則的端點照樣發出，所以 mock 會記下它、`dispose()` 讓測試失敗。

### 何時使用

當功能套件要在真實執行時下檢驗 slot、儲存、渲染與銷燬時使用本測試臺——生產 `SlotRegistry`、渲染器與 provide bundle 物化都會被掛載，絕不重實作。它是用戶端測試基礎設施：永遠不觸及模型請求，功能包僅以 `devDependencies` 依賴之。

### 可能出什麼問題

- **已宣告服務未提供**——`mount` 自明報錯並列出缺失名稱；請先用 `provide()` 提供。
- **在 `declare` 之前嘗試渲染**——`renderSlot` 自明報錯；請先宣告該 key。
- **測試呼叫工作階段行為樁上未打樁的動詞**——fixture 樁按設計自明報錯，缺失的樁會在呼叫點浮現，而非靜默透過。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋測試臺的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

測試臺不複製生產邏輯：它掛載生產 `SlotRegistry`、生產渲染器與 `UiSession` 介面卡。`TestSessions` 與 `TestWorkspaces` 實作功能透過 Cordis 消費的 owner 介面，每個 fixture Session 實作 `SessionFace`，`stubConfigForm` 實作 `ConfigForm`。`UiSession` 從這些控制器繫結派生標準渲染器資料來源。未 stub 的 `ISession` 行為會攜缺失方法名失敗。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SlotTestRuntime` 組裝、`TestRoot`、自動 frame、`mount`/`dispose` |
| [`src/sessions.ts`](src/sessions.ts) + [`src/workspaces.ts`](src/workspaces.ts) | `ISessions`/`IWorkspaces` 測試替身與 `FixtureSession` 行為樁 |
| [`src/fixtures.ts`](src/fixtures.ts) | 普通 fixture 建構器：工作階段快照、workspace 列表狀態 |
| [`src/snapshot.ts`](src/snapshot.ts) | DOM 快照序列化器（類名雜湊摺疊、`<svg>` 指紋） |
| [`src/remote.ts`](src/remote.ts) | 用於 host RPC 的 `TestRemote` 替身、`RemoteError` 值轉出 |
| [`src/translate.ts`](src/translate.ts) + [`src/locale-env.ts`](src/locale-env.ts) | 翻譯與固定瀏覽器語言測試輔助 |
| [`src/config-form.ts`](src/config-form.ts) | 帶測試驅動釋出與寫入 spy 的 `stubConfigForm` |
| [`src/assembly/roster.ts`](src/assembly/roster.ts) | `ClientRosterRow`、`ClientRoster`（`of`/`closure`/`pick`/`without`）、它所標註的 `AssemblyPlan`，以及 `graphFromRoster` |
| [`src/assembly/modules.ts`](src/assembly/modules.ts) | 原始碼 `/client` 匯入及替換，透過生產模組 facade 的待註冊工廠佇列登記 |
| [`src/assembly/test-client.ts`](src/assembly/test-client.ts) | `TestClient`：繫結實例的 Connection、共享 jsdom 樁、`bootClient`、掛載、等就緒、`reload`/`unload`/`dispose` |
| [`src/assembly/vitest.ts`](src/assembly/vitest.ts) | 測試級 `mock` 與懶啟動 `start` fixture |
| [`src/assembly/remote-default-responses.ts`](src/assembly/remote-default-responses.ts) | `remoteDefaultResponses`：roster 啟動期 Remote 端點的預設回應 |
| [`src/assembly/remote-proxies.ts`](src/assembly/remote-proxies.ts) | 經 Connection 的無契約 `remote.<ns>` 代理：`remoteNamespacesOf`、`remoteProxiesPlugin` |
| [`src/assembly/bundle-roster.ts`](src/assembly/bundle-roster.ts) | `bundleRoster` 與 `webApp`：用 include 外掛自己的 schema 與補丁應用從 bundle 補丁檔案讀出瀏覽器 roster |
| — | 不釋出執行時不變式伴生入口；本測試支援包不擁有生產事件流或可變資料，而是圍繞測試替身組裝生產 SlotRegistry 與渲染器。所掛載的生產包擁有各自的不變式，本包行為由本包測試檢驗。 |

### 生命週期

`create()` 建置全新上下文，掛載 slot 與工作階段註冊表，安裝渲染器，並提供 session/workspace 替身和明確失敗的檔案上傳替身。`mount` 在啟動 fiber 前對照上下文檢查每個已宣告注入，使缺失提供者自明報錯而非永久掛起。`dispose()` 先解除安裝 React 樹，再 dispose 功能 fiber、釋放根註冊、dispose 已鑄 session scope 並清除持久化儲存狀態；每個公共修改器都包裹在 act 中，因此測試無需自行處理 SlotCore 微任務批處理或 React `act`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從測試臺逐步進入它所掛載的生產機制以及使用它的測試。

- [ui-session](../../client/ui-session/README.zh.md)——從控制器替身派生標準 Slot 資料來源的生產介面卡。
- [UI slots 包](../../client/ui-slots/README.zh.md)——測試臺掛載的 `SlotRegistry` 約定。
- [UI renderer 包](../../client/ui-renderer/README.zh.md)——測試臺安裝的渲染器。
- [測試策略](../../../docs/testing.zh.md)——覆蓋層級與瀏覽器快照流水線。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支援包。

-----

<a id="model-experience"></a>
## 模型體驗

無；本包是瀏覽器側測試基礎設施，不會發起任何模型請求。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本測試臺如何被消費。它們是目前包約束，不是任務積壓。

- **整體檔不執行生成的 Remote 用戶端**——`remote.<ns>` 代理轉發位置參數，不經過生成的 zod 驗證、wire 名對映或 scoped 身份注入；mock handler 直接接收這些參數，生成用戶端仍由 built-artifact e2e 車道覆蓋。
- **代理呼叫繞過 Gateway 用戶端的 `invoke` 與 `invokeStream`**——不做 `$mount` 生命週期檢查，流失敗不經 `normalizeConnectionStream` 重新標記，一元拒絕由代理自己用 Gateway 用戶端匯出的 `carrierFailure` 與 `cancelledFailure` 摺疊。`ctx.remote.$stream`、`$on`、`$host` 是真 Gateway 用戶端的。
- **未宣告的端點按一元呼叫發出**——代理從 mock 的登記學到每個端點的模式；spec 既沒給腳本也沒宣告（`RemoteTable.streams`、`mock.stream(endpoint)`）的流端點記為 `unary` 漏配，產品程式碼收到的是摺疊結果而不是失敗的流。`remoteDefaultResponses` 宣告瞭 roster 啟動後才開啟的流；無論哪種，`dispose()` 都會讓測試失敗。
- **本包的 client 編譯程式加了 `node` 環境型別**，好讓 roster 讀取器使用 `node:fs`；slot 檔的原始碼也在這些型別下編譯。
- **Session、Conversation 與 Chat fixture 保持分離**——`sessionSnapshot` 只包含 Session 控制器狀態，`conversationSnapshot` 包含與目標無關的 Conversation 狀態，`chatSnapshot` 包含 Chat 目標狀態。組裝測試提供 Session 事件條目，而不是向 `SessionSnapshot` 新增 Conversation 或 Chat 欄位。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
