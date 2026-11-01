# Web Client 架構

[English](web-client.md) | 中文

Web Client 是由獨立載入外掛組裝而成的瀏覽器側 Cordis 應用。它有四個可複用底座：[Client Modules](client-modules.zh.md) 載入外掛圖，[API Gateway](../api-gateway.zh.md) 提供型別化 Host 通訊，[Slots](slots.zh.md) 組合 React UI，[Conversation](conversation.zh.md) 把 Session 歷史視窗變成各 target 自有的檢視。本文串聯這些系統，並規定 Client model 與功能包各自所在的位置。

[快捷鍵](../../packages/client/shortcuts/README.zh.md)負責視窗內命令註冊和物理鍵分發；[快捷鍵速查](../../packages/client/ui-shortcuts/README.zh.md)展示可用命令及區域性輸入操作。命令 owner 宣告各執行端／平臺的預設鍵位，並與滑鼠控制元件共用既有操作。共用模態元件裁決頂層 Esc 並恢復焦點。

## 分層與所有權

| 層 | 主要 owner | 職責 |
|---|---|---|
| Host 應用 | 業務 service 與 `packages/api/*-controller` Host entry | 擁有權威狀態、持久化、mutation 順序、存取策略與 stream 生產。 |
| 傳輸與 API assembly | `client/connection`、`api/gateway`、`api/remotes` | 建立 Client generation，公開生成的 `ctx.remote` method 與 stream，轉發選定的 Cordis event，並承載取消和結果。 |
| Client model | `api/session-controller/client`、`api/workspace-controller/client` | 維護不依賴 React 的 Host 狀態映像，處理 stream/unary 競態，擁有物件 identity 與訂閱，並公開收窄的 command service。 |
| UI adapter | `client/ui-session`、`client/ui-workspace` | 把 model observable 轉換為 root 或 Provider 繫結的 Session Slot source，並擁有檢視級導航與狀態策略。 |
| Conversation 資料 | `client/ui-conversation`、`ui-chat` 與 `ui-trajectory` 等 target package | 把標準 event 與緊湊的 Assistant 歷史批次組裝成相互獨立的 target snapshot，並擁有共享的 Conversation shell 與輸入流程。 |
| 組合與渲染 | `client/ui-slots`、`client/ui-renderer`、`client/ui-layout`、各 UI 功能包 | 宣告擴充功能位置、推導元件 props、把 observable 繫結成 React hook，並掛載最終元件樹。 |

依賴方向是 Host 狀態 → Remote 傳輸 → Client model → UI adapter → Conversation 或 presentation → Slots → React。使用者操作透過 callback 反向進入注入的 Client service 或生成的 Remote namespace。Presentation component 絕不接收 Cordis `ctx`、transport object 或其他功能外掛的實作。

## 瀏覽器啟動

Host 把組合後的 `WebBootGraph` 寫入 `window.__DSH_BOOT__`，並在 parser-preloaded script 執行前安裝瀏覽器 module-loader facade。模組系統是一張 lazy CommonJS 表：載入 bundle 只註冊 factory；materialize entry 時才以同步 `require` 執行 factory，並解析 platform module 和已宣告的動態依賴。

Web boot kernel 建立模組系統、預取 `immediately` entry、掛載 vendored Cordis Loader，再建立圖中的每個 entry。Cordis service injection 決定啟用順序；module graph 順序只決定同步 import 能否被 materialize。完整 roster 到達 settled 狀態後，`ui-renderer` hydrate 不依賴框架的 boot DOM，並呼叫唯一一次 context 級 `renderSlot('root')`。[Client Modules](client-modules.zh.md)負責 graph、bundle route、cache revision 與 loader 細節。

## Remote 通訊

Host 業務 service 使用 Typert Remote decorator 標記可呼叫 method。Host generation 產出嚴格 descriptor、runtime codec、declaration merge 與 source map。Client 側 `api-remotes` assembly 選擇這些生成貢獻，並把具體 method 掛到 `ctx.remote.<namespace>` 與 Session scope 的 `agentCtx.remote.<namespace>`。功能包依賴生成的 service face，而不依賴 Gateway 實作或 Host 包的執行時 entry。

Connection 擁有請求 URL 解析、request correlation、`/api` carrier、trust check、精確 Fetch 路由與 connection generation。API Gateway 擁有 Remote dispatch、取消、logical stream 與選定 Host event 的轉發。Controller 操作應進入生成的 Remote method 或顯式 Remote stream；功能自有的下載則註冊精確 Fetch 路由。[API Gateway 參考](../api-gateway.zh.md)定義 generation 與呼叫，[Connection README](../../packages/client/connection/README.zh.md)定義物理 carrier 與信任策略。

內部 `$events` logical stream 是 Connection generation source。它的 opening `ready` frame 攜帶用於路徑顯示的 Host home，並在 Host listener 已掛載、任何 controller 開始 baseline read 之前建立 generation。`ctx.remote.$on()` 把 allowlist 內的普通 event 交付給 root Client Context，並把 scoped waterfall event 交付給已解析的 Session Context；waterfall listener 可以返回結果、呼叫 `next()` 或拒絕。

## Client models

每個 API controller 包都擁有配對的 Host face 與 Client face。Host 側擁有權威 mutation 與 stream 生產；Client 側基於相同的生成 wire type 維護 identity 穩定、與 React 無關的 model，並公開 observable snapshot 與 command。UI 包消費這些 Client service，不在 component store 中複製 transport state。

### Sessions

[`api/session-controller`](../../packages/api/session-controller/README.zh.md)公開 Session list、search、creation、prompt、queue、cancellation、pagination 及 follow/control stream 等 Host command。其 Client 側按 `ClientSessions → SessionManager → Session` 組織：

- `ClientSessions` 提供 `ctx.sessions`，擁有 reference、source count、Session scope 與穩定的 `SessionBinding` object，並投影不含全域 current Session 選擇的 catalog state。
- `SessionManager` 擁有 list baseline、即時 list/control update、惰性 Session instance、projection store、subagent catalog，以及 pull 與後到 update 之間的衝突順序。
- 每個 `Session` 擁有一段由 `SessionEventLikeEntry` value 表示的連續邏輯 event window、pagination、follow、prompt/control state 與供 adapter 消費的 observable snapshot。

持久 event 路徑開啟 `follow()`，其首幀包含目前 header、tail page、cursor 與完整 projection baseline。歷史 record 帶有顯式 `event` 或 `chunks` 判別欄位和欄位對齊的內部 `event`；journal 先驗證每條 record 的邏輯 seq 閉區間，Client 再直接把這些 record 保留為 `SessionEventLikeEntry`，無需逐 record 轉換。每個物理 generation 都根據該 snapshot 原子替換保留視窗，隨後按 seq append 標準即時 event。`page()` 只用於更早歷史與 gap repair。瞬態 control stream 每代以完整 baseline 開始，隨後應用 projection update。

### Workspaces

[`api/workspace-controller`](../../packages/api/workspace-controller/README.zh.md)把 Workspace 變更策略與權威 follow feed 留在 Host。`ClientWorkspaceModel` 擁有瀏覽器行、Workspace 順序、歸檔與置頂 Session id 陣列、命令回顯，以及流與一元呼叫的競態合併。每代 stream 先給出完整 baseline，再給出 `upsert`、`remove`、`order`、`archived` 和 `pinned` increment；重連時以新 baseline 替換 model。`WorkspaceController` 把該 model 作為 `ctx.workspaces` 公開，`ui-workspace` 則提供 `useWorkspaces` 與導航回呼。側邊欄的 `ArchivedFilter` 控制列表與搜尋中的預設隱藏、顯示已歸檔或僅顯示已歸檔。歸檔行保留排序位置、置灰展示，必須透過行選單或搜尋結果的取消歸檔操作恢復後才能開啟。恢復呼叫 `workspace.unarchiveSession`，完整歸檔集合透過一元回應及 `archived` increment 到達 Client。Session 顯示順序儲存在瀏覽器本地，包含隱藏歸檔項；置頂在該完整順序內移動 Session，取消置頂不恢復先前位置。

這種配對不會產生第二份業務真相。Host controller 決定持久狀態與 mutation outcome；Client model 維護最新可用的本地 projection，在有利於渲染時保持 object identity，並明確 delayed response 與 replacement baseline 的合併規則。

## Conversation 與 presentation

Web 和桌面端共享[程式碼工作工具偏好](../../packages/client/ui-settings/README.zh.md#use-this-package)。它控制診斷 View、新工作階段預設選擇、改動檔案卡片和內建 HTML 預覽策略，不改變 Session 記錄。

`ui-session` 安裝 Session scope adapter，並提供 `useSessions`、`useSessionStatus`、`useSessionRetainInfo`、`useSession`、`sessionId` 和 `useProjection`。`SessionProvider` 可以繼承外圍 binding，也可以繫結顯式 `SessionReference`，因此並存子樹可以指向不同 Session。領域 adapter 可以繼續新增標準 source，但不會把 React hook 放進 model object。

`ui-conversation` 對每個 `SessionBinding.eventSource` 只繫結一次。它的 event registry 把持久 Session event 與 Client-only `assistant/live-chunk` update 關聯成穩定的業務 Context，view registry 則 materialize target snapshot。Chat Assistant、Trajectory Assistant 與 Turn Tail 同時解釋 live chunk 和持久 settlement 中嵌入的緊湊 stream，因此重連與分頁歷史無需持久 token 行即可復現相同 Assistant 狀態。`ui-chat` 與 `ui-trajectory` 分別註冊自己的 Definition 和 builder：它們可以解釋同一 event family，但不會匯入或共享彼此的最終 display model。Shell 選擇一個已註冊 view，再透過標準 hook 與 Slot 交付其 snapshot。[Conversation](conversation.zh.md)定義 Context identity、replay、Location data、target builder 與 keyed renderer。

`ui-slots` 提供型別化 registry 與 lifecycle ledger；`ui-renderer` 是唯一透過 `useSyncExternalStore` 繫結裸 observable、擁有 React context 並渲染 root tree 的包。功能 component 透過推匯出的 props 接收 framework hook、owner prop、store action 與顯式 injection。[Web Client Slots](slots.zh.md)列出這些輸入、擴充功能 API 與目前 Slot 層級。

## 資料通路

| 路徑 | 順序 |
|---|---|
| 持久 Session 展示 | Host Session log → packed Remote `follow`/`page` 歷史 → Client `SessionEventLikeEntry` window → Conversation Context → target snapshot（`chat`、`trajectory` 或其他已註冊 target）→ Slot view → React |
| 瞬態 Session control | Host control baseline → Remote snapshot stream → `SessionManager` projection store → Session 與 list snapshot → 標準 hook → component |
| 後臺任務 | Host job 註冊表 → `job.list` / `job.follow` → [`ClientJobs`](../../packages/api/job-controller/README.zh.md) 名冊與輸出檢視 → 任務列表和麵板 |
| Workspace 狀態 | Host Workspace baseline 與 increment → `ClientWorkspaceModel` → `ctx.workspaces.list` → `useWorkspaces` → sidebar、hero 與 navigation entry |
| scoped interaction | Host Cordis waterfall → API Remotes `$events` → Session Context 上的 `ctx.remote.$on()` → 所屬 UI 包 → result 或 `next()` |
| 使用者 command | component callback → 註冊項 inject face 或 Slot owner → `ctx.sessions`、`ctx.workspaces` 或生成的 scoped Remote → Host Controller → 權威 update → stream 或 event projection 回到 Client |

## 重連

物理恢復與邏輯恢復彼此獨立。Gateway mux 恢復物理 WebSocket；Connection 釋出可用 generation 後，每個 `RemoteStream` 分別重開自己的 logical source。Carrier failure 可以重試；business error、非法 opening item 或 protocol violation 會令所屬 logical stream 終止。

恢復方式由資料語義決定：

- 持久 Session journal 驗證邏輯 seq range，並根據每個 generation 的 opening snapshot 替換視窗；`page()` 提供更早歷史並修復後續 range gap。
- Session control 與 Workspace stream 在斷開期間保留最後一次釋出的值，再用新的 opening baseline 原子替換。
- 普通 forwarded notification 不會 replay。需要可靠恢復的 stateful domain 必須提供 baseline、cursor 或顯式 query；scoped waterfall 保留自身的 request lifetime。

架構中沒有統一的 Client `Runtime`、`HostFrame`、`events.mux`、`events.host` 或通用 `resync()` API。Connection 公開 generation state，Gateway 管理 logical stream，Client model 則按自身資料定義 replacement 或 resume 語義。

## 包邊界

功能外掛包可以透過 `import type` 共享宣告；不得執行時匯入或轉發另一個功能外掛的值。跨包行為使用注入的 Cordis service，跨包 UI 使用 Slots。特定 target 的 Conversation Definition、projection helper 與最終 view data 留在所屬 target 包中，即使 Chat 和 Trajectory 有意實作平行邏輯。

共享執行時值需要一個職責收窄、沒有功能生命週期的靜態 owner，例如 `client/store`、`ui-primitives` 或瀏覽器安全的 util 包。Transport 與生成 API assembly 可以匯入執行時 contribution，因為組裝同一個 protocol 正是它們的顯式職責。功能包不能只為繞過此規則而新增 `dsh.client.external`。

根據所新增的擴充功能查閱四篇詳細參考：

- [Client Modules](client-modules.zh.md)：package discovery、loading、共享 module identity 與 boot order。
- [API Gateway](../api-gateway.zh.md)：Host method、生成的 Remote contribution、stream 與 forwarded event。
- [Web Client Slots](slots.zh.md)：component、hook、store、injection 與 placement。
- [Conversation](conversation.zh.md)：持久 event correlation、target snapshot，以及 Chat 或 Trajectory view contribution。
