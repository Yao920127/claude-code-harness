# Agent Note: Client Session、Conversation 與 UI 所有權分層

Status: implemented

[English](2026-08-20-client-session-conversation-ownership.md) | 中文

## 問題

Web Client 曾由一個通用 Runtime 同時承載 Session 與 Workspace 物件、事件視窗、Conversation 組裝、React hooks、Slot 註冊表和 Store 引擎。協定狀態、業務投影、React 繫結和頁面呈現共享同一個依賴匯點，任何一層的變化都可能擴大到完整前端。

Session 快照也容易混入事件陣列、Conversation View、Chat Node 和待處理互動等並非 Session 自身擁有的資料。普通消費者由此需要理解事件重放與具體檢視，新增一個 Conversation target 也可能要求修改 Session、Runtime 和 renderer。

React 生命週期與 Session 生命週期之間缺少明確介面時，binding 釋放、Hook source 替換和 Slot store 清理會演變為互相回呼的專用協定。Approval 與 Question 同時影響側邊欄狀態和 composer takeover；若兩處各自維護狀態，它們還可能選擇不同的待處理請求。

需要把資料 owner、React adapter、通用渲染機制和具體檢視拆成單向依賴，同時保持既有應用行為。

## 決定

Client 採用“Controller 與領域物件 → UI adapter → renderer → Slot component”的分層。Controller 和領域物件釋出不依賴 React 的 observable source；所屬 `ui-*` package 宣告標準 props 並註冊 source；`ui-renderer` 在 Slot binding 點生成 selector hook；元件只從 Slot props 讀取資料與操作。

```text
[Remote / Controller / domain object]
                  |
                  | bare observable source
                  v
             [ui-* adapter]
                  |
                  | standard source registration
                  v
              [ui-renderer]
                  |
                  | selector hook binding
                  v
            [Slot component]
```

Session 與 Workspace 的 Client 物件分別歸 `api/session-controller/client` 和 `api/workspace-controller/client`。Conversation 的 target-neutral 資料結構和組裝歸 `client/ui-conversation`，Chat 與 Trajectory 分別歸 `client/ui-chat` 和 `client/ui-trajectory`。

Session 與 Workspace 的 React 適應分別歸 `client/ui-session` 和 `client/ui-workspace`。Store engine 歸 `client/store`，Slot registry、scope materialization 和 observable-to-hook 繫結歸 `client/ui-renderer`。

系統沒有聚合式 `client/runtime` 包，也沒有替代的中央 facade。[Session 歷史與事件傳輸](2026-08-18-session-history-and-event-transport.zh.md)定義歷史連續性。[Client 工作階段引用](2026-09-15-client-session-references.zh.md)擁有引用取得、精確代際生命週期、主區域所有權和統一 UI 狀態；本篇擁有分層與資料來源註冊規則。

## 分層原則

### Controller 是無 React 的邏輯 owner

Controller 可以作為 Cordis service 安裝，但不擁有 React Context、React hook、Slot props 或元件。Controller snapshot 只包含自身擁有的事實，命令只改變 Host 或領域物件狀態。

UI 層可以同時讀取多個 Controller 做一次導航決定，但不得把組合結果寫回任一 Controller snapshot。UI adapter 也不複製 Controller 命令的業務實作。

### UI adapter 擁有 React 接入

每個標準 hook 歸最接近其資料語義的 `ui-*` package。

| Hook | Owner | Source |
| --- | --- | --- |
| `useSessions` | `client/ui-session` | Session Controller 全域列表 |
| `useSession` | `client/ui-session` | 已繫結工作階段快照 |
| `useProjection` | `client/ui-session` | 已繫結工作階段的鍵控投影 |
| `useSessionStatus` | `client/ui-session` | 執行狀態、有效待處理請求和未讀完成提醒 |
| `useSessionRetainInfo` | `client/ui-session` | 控制器的只讀引用來源計數 |
| `useWorkspaces` | `client/ui-workspace` | Workspace Controller 列表 |
| `useConversation` | `client/ui-conversation` | Conversation binding snapshot |
| `useChat` | `client/ui-chat` | `chat` target source |
| `useTrajectory` | `client/ui-trajectory` | `trajectory` target source |

`ui-renderer` 只實作通用繫結，不 import Session、Workspace、Conversation、Chat 或 Trajectory 的業務型別和值。

### Slot scope 與標準 props 分離

`ui-slots` 宣告 root、session 和 session-maybe scope，以及可透過 declaration merge 擴充功能的標準 props 型別；它不決定每個 scope 安裝哪些 hook。

`ui-renderer` 實作通用 scope adapter 與 source materialization。`ui-session` 安裝 Session scope 並提供內建 source，其他領域 package 只註冊自己的 source 和消費它的 Slot entry。

新增 target 不要求 renderer 或 Session Controller 增加分支。資料 owner 負責狀態身份、更新、錯誤和釋放；UI adapter 負責 hook；顯示 owner 負責 target-specific projection 與互動狀態。

## Package 所有權

| Package | 擁有內容 | 明確不擁有 |
| --- | --- | --- |
| `api/session-controller/client` | 工作階段物件、目錄、引用、來源計數、命令、投影、事件視窗與 Agent Context | 導航、完成提醒、Conversation target、React、Slot、Workspace |
| `api/workspace-controller/client` | Workspace 物件、順序、歸檔、命令和 snapshot | React、Session 導航策略、目錄 UI |
| `client/ui-session` | 顯式工作階段作用域、標準資料來源、`SessionProvider` 與統一 UI 狀態 | 工作階段傳輸、引用所有權、Conversation 組裝、Approval/Question 結果 |
| `client/ui-workspace` | Workspace 掛鉤、瀏覽器 UI、主區域引用與跨控制器導航策略 | Workspace 傳輸、工作階段資料副本 |
| `client/ui-conversation` | Conversation core、registry、binding、shell、input、composer、queue 和 View 導航 | Session transport、Chat/Trajectory snapshot |
| `client/ui-chat` | Chat target、Node definitions、renderer、selection、details 和 locale | Session 生命週期、通用 View 導航、Trajectory、歷史圖片 cache |
| `client/ui-trajectory` | Trajectory target、事件記錄投影和檢查檢視 | Session snapshot、Chat snapshot |
| `client/ui-approval` | Pending Approval、Remote listener、composer 和審批 UI | Session control、通用 composer election |
| `client/ui-user-questions` | Pending Question、Remote listener、composer 和問題 UI | Session control、通用 composer election |
| `client/store` | React-free store contract 與實作 | 領域物件、React hook、Slot 生命週期 |
| `client/ui-renderer` | SlotRegistry、scope binding、selector hook、outlet 和 React root | Session、Workspace 與 Conversation 業務邏輯 |

## 總體資料流

Session 資料按以下路徑進入 UI：

```text
[ctx.remote.session]
          |
          v
[api/session-controller/client]
  |-- SessionListState --------------------------> [ui-session] -> useSessions
  |-- SessionSnapshot ----------------------------> [ui-session] -> useSession
  |-- ProjectionValueSource ----------------------> [ui-session] -> useProjection
  `-- per-Session SessionEventSource
                    |
                    v
             [client/ui-conversation]
                    |
                    | assemble
                    v
             ConversationSnapshot ----------------> useConversation
                    |
          |---------+----------|
          v                    v
      [ui-chat]           [ui-trajectory]
          |                    |
       useChat            useTrajectory
```

Workspace 資料由 `ctx.remote.workspace` 進入 Workspace 控制器，再由 `ui-workspace` 透過 `useWorkspaces` 提供。`ui-workspace` 為跨領域導航讀取顯式目標並持有主區域引用，不把它變為預設業務 Context。

Approval 與 Question 透過 `ctx.remote.$on` 從 Host waterfall 到達各自的 UI owner。各 owner 釋出 Pending 物件；`ui-session.sessionStatus` 向 Workspace 標識和 Conversation composer 選擇提供同一個有效物件。

## Session Controller Client

### SessionSnapshot 的範圍

`SessionSnapshot` 表示 Session 自身的控制與生命週期事實。它可以包含 identity、running、removed、blank、subagent address、open phase、history phase、prompt error、agent error 和 queue 狀態。

它不包含以下資料：

- raw event array；
- Conversation View；
- Chat Node；
- Trajectory row；
- Approval 或 Question 的待處理物件；
- 要求呼叫者遍歷 event 才能解釋的呈現狀態。

欄位由 event、control frame 或本地命令推導，並不自動決定其 owner；消費語義決定 owner。`composerPhase` 同時依賴 Session lifecycle 與 Conversation target activity，因此由 `ui-conversation` 合成，不進入 `SessionSnapshot`。

### 三個讀取面

Session Controller 對外提供三個互不替代的讀取面：

1. 工作階段目錄與本地所有權資料來源，由 `useSessions` 和只讀引用中繼資料消費方使用。
2. 每個 Session 的邏輯 binding，包含 `sessionId`、`SessionSnapshot` source、commands 與 projection sources。
3. Conversation-facing `SessionEventSource`，只供 Conversation assemble core 使用。

普通 UI component 不直接讀取 `SessionEventSource`。`ui-session` 不讀取私有 event window，`ui-conversation` core 也不接收 React binding 或 Slot API。

### SessionEventSource

`SessionEventSource` 暴露已經物化的事件視窗，而不是 transport。

視窗攜帶有序 `entries`、`hasMore`、單調 `revision`，以及 `replace | prepend | append` 變更描述。Append 以常數時間連線不可變片段；需要完整 `entries` 陣列的消費者才為該 snapshot 物化並快取陣列。

首次開啟、重連、gap repair 和無法證明連續性的更新發布 `replace`；歷史分頁釋出 `prepend`；連續 live event 釋出 `append`。Conversation core 依據 revision 與 change 選擇增量更新或完整 rebuild。

`MutableSessionEventSource` 是 Session Controller 內部寫端，消費者只依賴只讀的 `SessionEventSource`。

### Session binding 生命週期

每個活躍工作階段 generation 持有 Cordis Context 與 Fiber。控制器在取得引用時建立繫結，並在最後一份引用釋放或根銷燬時結束該繫結。

依賴工作階段的物件透過 `binding.ctx.effect()` 註冊清理。generation 結束會清理 Conversation 繫結、UI 物化結果和作用域 Slot 儲存，無需單獨的 `onBindingRelease` 或 `onRelease` 回呼協定。

這種清理方式不要求 Session Controller 瞭解上層消費者名冊。

## UI Session

### 服務職責

`client/ui-session` 是 Session Controller 與 React/Slot 系統之間唯一的 Session adapter。它提供 `ctx.uiSession`，並負責：

- 觀察工作階段目錄、本地引用中繼資料和顯式提供的繫結；
- 安裝 session 與 session-maybe scope adapter；
- 提供 `SessionProvider` 的呈現語義；
- 內建 session snapshot、projection 和 sessionId source；
- 接收其他領域 package 的 Session-scoped source contribution；
- 在 `sessionStatus` 中組合領域持有的待處理互動、執行事實和完成提醒。

它不擁有 Session transport、event folding、Conversation target 或具體業務結果。

### 標準 source 註冊

領域 package 呼叫 `ctx.uiSession.provide()` 註冊 bare source。Descriptor 靜態宣告 hooks、keyedHooks 和 props 名冊，`resolve(binding)` 為一個 Session binding 返回完全對應的值；例如 `ui-conversation` 把每個 binding 的 snapshot 註冊為 `conversation` hook source。

普通 source 被 renderer 轉換成 `use<Name>`，Projection 等開放 key 空間透過 keyed hook resolver 暴露，穩定值透過 props 暴露。

執行時拒絕未宣告、缺失或重複的標準 prop。`ui-session` 自身也走相同 materialization，renderer 不為 Session 名字寫特殊分支。

### Scope binding

session 與 session-maybe 使用同一個 adapter，但繫結語義不同：

- 嚴格工作階段作用域在沒有顯式提供的繫結時拒絕渲染；
- session-maybe 使用穩定 absent binding，保持 hook 呼叫順序；
- 精確 Context generation 改變時重新掛載已繫結子樹，同一 id 的替代 generation 也如此；
- 未繫結的 session-maybe 條目無需重新掛載即可接納首個繫結；root 條目沒有工作階段繫結。

每個 UI 物化結果借用控制器繫結的 Context。`ui-session` 透過 `binding.ctx.effect()` 移除該 generation 的快取項並行布空值，不會 retain 工作階段。

Contribution roster 變化會重建已 materialize 的 binding 並行布新的 source 集合。同一 binding 生命週期內，source identity 保持穩定，以滿足 `useSyncExternalStore` 的快取要求。

### SessionProvider

`SessionProvider` 是 `PropsRenderSlots` 根據 session-scoped child 宣告派生的標準席，不是業務 component 直接 import 的 React Context。

它接收普通 `ReactNode` children 和必填的 `session={reference | undefined}`。Provider 借用呼叫方持有的引用，不取得或釋放它；呼叫方直接包住 `renderSlot('details', {})`。

工作階段身份透過顯式作用域繫結和標準 `sessionId` prop 到達元件。空 Provider 保持未繫結，巢狀 Provider 和 root 條目都不會退回到主區域工作階段。

### Pending interaction

`SessionPendingInteractionMap` 由業務 package declaration merge 擴充功能。每個 pending object 至少攜帶穩定 `key`、領域 `kind` 和 `sessionId`；`ui-session` 不 import Approval 或 Question 的具體型別。

業務 plugin 在 `apply()` 中呼叫 `registerPendingInteraction(precedence)`，為自己的 pending domain 建立穩定註冊。該呼叫返回逐請求 publication function；publication function 同時釋出精確物件及其 waterfall 委託回呼，並返回移除該物件的冪等 disposer。Plugin teardown 會先移除所有已釋出物件，再呼叫並等待其委託回呼，避免 Client 回答者解除安裝後 Host 請求繼續懸掛。

相同 key 的並行物件被拒絕，替換請求必須使用新 key。同一 Session 可以同時存在多個領域或多個請求。

`ui-session` 使用各 domain 的 precedence 選出每個 Session 目前生效的物件。較高 precedence 勝出，相同 precedence 下後遍歷到的有效物件勝出。

待處理聚合是 `ui-session` 的私有實作；其有效請求原樣出現在 `sessionStatus.getSnapshot().get(id)?.pendingInteraction` 中。`useSessionStatus` 是公開 UI 讀取介面。

Session 導航狀態和 composer takeover 必須讀取同一個 effective object，不得分別維護 status map 或 takeover roster。

## Workspace Controller 與 UI Workspace

### WorkspaceSnapshot 的範圍

`WorkspaceSnapshot` 只包含 Workspace Controller 擁有的 Host-authoritative 資料，包括 Workspace rows、順序、archive set、follow phase 和錯誤。Workspace row 的 `sessionIds` 是關聯欄位，不等於把 Session 物件複製進 Workspace snapshot。

以下組合事實不進入 `WorkspaceSnapshot`：

- Workspace 與 Session 兩條 baseline 是否同時 ready；
- 根據 Session 更新時間推導的最近 Workspace；
- 目前 Session 是否因歸檔而清除；
- New Session 應複用哪個 blank Session；
- 首次啟動應選擇哪個 Session。

### UI Workspace 的組合職責

`client/ui-workspace` 把 Workspace list source 註冊為 root 標準 source `workspaces`，renderer 由此提供 `useWorkspaces`。

啟動恢復、空白工作階段複用、新工作階段導航、並行建立合併與歸檔後的導航屬於 UI 策略。`ui-workspace` 可以讀取兩個控制器，但把主目標和引用儲存在自己的導航 owner 中，不向控制器快照寫入 UI 選擇。

目錄 picker、目錄瀏覽和 `openPath` 屬於獨立目錄能力，不進入 Workspace Controller。

## UI Conversation

### Assemble core

`client/ui-conversation` 同時包含不依賴 React 的 Conversation assemble core 和同領域的 React adapter。

Core 擁有 `ConversationSnapshot`、Definition registry、View registry、event assembler、location index、每 Session binding、target source 和 target activity。

Core 從 Session binding 取得 `SessionEventSource`。連續 revision 的 append 與 prepend 使用增量組裝；replace 或 revision 斷檔從完整視窗 rebuild。

Definition 或 View roster 變化只重建 Conversation binding，不重建 Session 或重開 Remote stream。Core 不 import React，可獨立測試事件摺疊、增量更新和 registry lifecycle。

`ConversationSnapshot` 不複製 `SessionSnapshot`，也不暴露 raw events；它只發布 target-neutral 的 View 名冊、target activity 和 target source lookup。

`useSession` 與 `useConversation` 來自兩個 source，不承諾在同一個 React commit 原子釋出。同時讀取兩者的元件按目前 snapshot 純計算，不把通知順序解釋為業務因果。

### Definition 與 View registry

`UiConversation.events` 是 event Definition 的唯一 registry，`UiConversation.views` 是 target snapshot builder 的唯一 registry。

Registry 拒絕重複 key，保持註冊順序並返回冪等 disposer。Roster 變化時，現有 Conversation binding 使用目前 event window 重建；同一同步註冊輪次中的變化會合併為一次 microtask 重建。

Target package 透過 declaration merge 擴充功能 snapshot 與 location data map，再向 registry 註冊自己的 Definition、builder 和 View。註冊隨 Cordis effect 釋放。

`ui-conversation` 不 import 具體 target package。

### Conversation React adapter

React adapter 把每個 Conversation binding 的 snapshot 註冊為 Session 標準 source `conversation`，renderer 由此提供 `useConversation`。

同包還擁有 shell、input、composer chain、queue UI、draft、View navigation 和 phase 合成；Core 不讀取 React Context、Slot props 或 component state。

View 選擇順序固定為：有效的持久化 selection、已註冊的 `chat`、無 View。無效 selection 不覆蓋持久化值，系統不 fallback 到第一個已註冊 View。

沒有 `ui-chat` 時 shell 仍能啟用和 mount，但不會隱式選擇 Trajectory 或其他 target。

Shell phase 由 Session lifecycle 與 Conversation target activity 純合成。Session 已 active 或任一 target 報告可見內容時顯示 active；首條 prompt 失敗仍保持 engaging。

### Input 與 composer

composer chain 屬於 `ui-conversation`，具體接管屬於業務包。`ConversationRoot` 透過 `useSessionStatus` 讀取已繫結工作階段的有效請求，並作為 `ComposerChainProps.pendingInteraction` 提供給 chain selector。

Selector 是 owner currency 的純函式，非 null 結果作為 `matched` 傳給獲選 component。Stable composer entry 與預設 composer 可以同時常駐，chain 只選擇一個有效呈現。

Draft 與輸入狀態屬於 Conversation UI，不進入 Session snapshot。Queue command 透過 Session-scoped service 定址，不把 queue UI 寫入 Conversation core。

## Chat 與 Trajectory target

### Chat owner

`client/ui-chat` 註冊 target id `chat`，並擁有 Chat snapshot builder、Conversation Node definitions、keyed node renderers、selection、details、stats、locale 和 tool inspection 協作。

它透過 `ctx.uiSession.provide()` 註冊 `chat` target source。`ChatView` 使用 `useChat` 讀取聚合 order、navigation 與 timeline；每個 `ChatNodeSeat` 從該 snapshot 接收身份穩定的 Node 與 Turn-process source，不訂閱聚合 source。

Chat activity 只由可見且非 command 的 Chat Node 啟用。普通 command-only history 保持 Hero，`/goal` 的 `command-input` Node 啟用 fresh Conversation。

歷史圖片 cache 已移入 `ui-conversation`（`ctx.uiConversation.imageUrl`），Chat 與 Trajectory 對同一工作階段附件共享一次授權讀取和一個瀏覽器 URL（[Trajectory 持久化圖片附件](../../archived/feature/2026-08-24-trajectory-image-attachments.md)）；Draft 圖片仍屬於 Conversation input。

### Trajectory owner

`client/ui-trajectory` 透過相同 target 協定註冊 `trajectory`。它擁有事件記錄、時間線、虛擬行、selection 和 inspection view，並透過標準 source 提供 `useTrajectory`。

Session 生命週期讀取 `useSession`，Trajectory 資料讀取 `useTrajectory`。Trajectory 不透過 Session snapshot 或 Chat snapshot 取得自己的資料。

其他 target 使用同一註冊流程，不修改 renderer、Session Controller 或 ui-session。

## Approval 與 Question

### 穩定註冊

Approval 和 Question 的 plugin 安裝分為穩定註冊與單次請求處理。`apply()` 註冊 locale、呼叫 `registerPendingInteraction()` 註冊本領域 pending domain，並向 `conversation.composer` 註冊唯一穩定 entry。

Approval 的 detail child Slot 也由穩定 entry 宣告。並行請求和 Session 數量不會增加 composer entry 或重複宣告 Slot，所有註冊隨 plugin fiber 釋放。

### 單次 waterfall 請求

Remote Event listener 從自身 Agent Context 解析 Session。沒有 Session scope 時呼叫 `next()` 繼續 waterfall；存在 Session scope 時建立 `PendingApproval` 或 `PendingQuestion`。

Listener 透過已註冊 domain 的 publication function 釋出物件，等待使用者完成、取消或請求 signal 中止，並在 `finally` 中精確移除物件。

單次請求不註冊 Slot，不建立第二套 lifecycle effect，也不修改 Session snapshot。

Approval 暴露 allow 與 reject，Question 暴露 answer 與 cancel。使用者主動取消 Question 返回 `ASK_CANCELLED`；等待中的請求被 `AbortSignal` 中止時返回 `UserQuestionError(ASK_ABORTED)`，不洩漏載體的 `AbortError` 或普通 `Error`。

Gateway 只要求 Remote Event 參數和結果是合法 JSON 傳輸值，不複製 Question 選項的領域驗證。

### 單一 pending 投影

Sidebar 與 composer 消費 `sessionStatus` 中同一個有效待處理請求。導航根據其 `kind` 顯示審批、計劃審閱或問題狀態；每個 composer 條目按物件身份選擇自己的面板。

同一請求 identity 同時驅動兩處 UI。新請求替換同型別舊請求時使用新 key，因此 selector 與訂閱者都觀察到身份變化。

`ui-session` 只實作跨領域 precedence，不解釋 Approval 或 Question 的欄位。

## UI Renderer 與 Store

### UI Renderer

`client/ui-renderer` 擁有 `SlotRegistry` service 和 React renderer。它負責：

- `ctx.slots.register()`、`inject()`、`renderSlot()` 與宣告生命週期；
- root、session 和 session-maybe scope adapter；
- 標準 observable source 到 selector hook 的繫結；
- Slot outlet、錯誤隔離、root mount 與 hydration；
- 按 scope key 管理 Slot store instance 生命週期。

Renderer 可以認識通用 scope 名稱和 binding 協定，但不讀取領域 service。渲染 Session scope 而沒有安裝 adapter 是裝配錯誤，並立即失敗。

### Store

`client/store` 是 React-free 普通庫，擁有 `ObservableSnapshot`、`SnapshotStore`、`defineStore`、`createSnapshotStore` 和 `shallowEqual`。

`ui-slots` 引用 store contract，`ui-renderer` 管理 store instance 並提供 `useStore`。

Store 只承載 draft、View selection、Chat selection、inspection request 和麵板尺寸等觀看或互動狀態。Session、Workspace、Conversation、Remote stream 和 connection generation 不進入 Store。

### 註冊與釋放順序

一個 plugin 同時提供 source 與 Slot entry 時，先註冊 source，再註冊 entry。Cordis 反向 disposal 先移除 entry，再移除 source，仍掛載的 entry 因而不會短暫失去必需 hook。

最後一份工作階段引用釋放後，透過 `binding.ctx.effect()` 清理 UI 物化結果和作用域儲存。外掛 fiber 釋放透過註冊 disposer 清理資料來源、監聽器和 Slot 條目。

所有 disposer 都可重複呼叫，不依賴 Cordis 生命週期以外的隱式回呼。

## 組合與依賴方向

應用 bundle 顯式安裝所需 Controller、adapter、target 和 renderer plugin。每個 owner 的 `apply()` 只安裝自己的 service、listener 和 contribution。

執行時消費方向是 `session-controller → ui-session → ui-conversation → target UI`、`workspace-controller → ui-workspace` 和 `store → ui-slots → ui-renderer`；Approval 與 Question 只依賴 `ui-session` 提供的 pending 註冊點。

圖中的箭頭表示執行時消費關係，不覆蓋 type-only declaration merge 邊。Controller 不反向依賴 UI adapter，renderer 不反向依賴領域 package，Conversation core 不依賴具體 target。

UI component 不接收 `ctx`。跨 package 協作使用 Cordis service、standard source 或 Slot registration，不新增聚合 facade。

## 開發者遵循方式

### 先確定資料 owner

新增狀態前先按消費語義確定唯一 owner：Host 通訊、命令和實體生命週期歸 API Controller；由 Session events 形成且與 target 無關的資料歸 Conversation core；只服務一種 View 的投影歸對應 target package；草稿、選擇和麵板狀態歸擁有該互動的 UI package。

同一個事實不能同時儲存在控制器快照、Conversation 快照和儲存中。跨領域導航在決策時讀取資料來源。UI 持有的狀態資料來源可以組合獨立的執行、待處理請求和完成提醒事實，但必須保留領域歸屬與物件身份，不能複製這些領域的狀態。

以下訊號表示 owner 選擇錯誤：Controller 開始 import React；renderer 出現業務型別分支；元件遍歷 Session events；Store 儲存 Session 或 Workspace 實體；一個 target 的變化要求修改 Session Controller。

### 新增 Session-scoped 資料

1. 在領域 owner 中提供 React-free observable source。
2. 在所屬 UI adapter 中 declaration-merge 標準 prop 型別。
3. 透過 `ctx.uiSession.provide()` 宣告固定 roster，並從 Session binding 解析 source。
4. 讓 Slot component 從 `PropsRuntime` 獲得生成的 hook，不向元件傳 `ctx`。
5. 把每個 binding 的資源清理掛到 `binding.ctx.effect()`，把 registration 清理留給 plugin fiber。
6. 測試缺失值、重複名字、roster 替換、Session 切換和 binding disposal。

只有開放 key 空間使用 keyed hook；有限且穩定的 source 使用普通 hook；不會變化的標識使用 prop。不得為了減少一次註冊而把業務名稱硬編碼進 renderer。

### 新增 Conversation target

1. 在 target package 中擴充功能 Conversation snapshot 或 location data map。
2. 向 `UiConversation.events` 註冊所需 event Definition。
3. 向 `UiConversation.views` 註冊 snapshot builder、target id、View 與 activity 規則。
4. 透過 `ctx.uiSession.provide()` 暴露該 target 的標準 selector hook。
5. 在同一 package 中註冊 renderer、locale 和 target-specific Slot entry。
6. 驗證 target 解除安裝只重建 Conversation binding，不改變 Session、其他 target 或 Remote stream。

Target 不得讀取另一個 target 的 snapshot 作為自己的資料來源。可選協作透過窄 port 或 Slot 完成；缺失 target 時，shell 必須保持可啟動且不得猜測 fallback。

### 新增 pending-interaction 業務

1. 業務 package 定義 Pending 物件及其完成、取消和中止語義。
2. 透過 declaration merge 把物件加入 `SessionPendingInteractionMap`。
3. 在 `apply()` 中呼叫 `registerPendingInteraction()` 一次，並註冊唯一穩定的 composer entry。
4. Remote waterfall listener 從 Agent Context 解析 Session；無法處理時呼叫 `next()`。
5. 可處理時建立 Pending 物件，使用 publication function 釋出，等待結果，並在 `finally` 中移除。
6. 測試並行 key、precedence、使用者取消、transport abort、plugin disposal 和無 Session delegation。

請求不註冊 Slot、不宣告子 Slot、不修改工作階段快照，也不建立獨立狀態索引。Sidebar 與 composer 從 `useSessionStatus` 讀取同一個有效物件。

### Review 檢查點

- 每個新 source、registry contribution、listener 和 cache 都有明確 Cordis fiber 或 Session binding owner。
- 每個公共 hook 能追溯到唯一 React-free source；不存在只為傳參而層層轉發的 selector。
- 每個 component 的資料與 action 都來自標準 props 或所屬 Slot inject face。
- 每個 target 在缺席、動態註冊和解除安裝時都有定義明確的結果。
- 每個跨層 import 都沿 Controller、adapter、renderer、component 的單向關係前進。
- 每個錯誤由最早能解釋其語義的 owner 歸類；載體錯誤不直接洩漏成業務錯誤。

## 驗證

各 owner 的測試分別固定 Controller binding 與 event source、UI scope 與 pending precedence、Conversation 增量組裝與 View fallback、target projection、waterfall 結果以及 renderer 的 scope/store 生命週期。應用組裝測試同時覆蓋完整 roster 和缺少具體 target 的啟動；元件測試不替代物件層、重放和生命週期測試。

## 備選方案

- **保留 Runtime facade。** 它維持單一入口，卻繼續形成依賴匯點並允許新程式碼繞過領域 owner；系統因此不保留 facade 或相容出口。
- **把所有 Client 狀態放進 API Controller。** 這會讓協定物件承擔 React、View 和 presentation policy；Controller 因而只保留無 React 的領域狀態。
- **讓 Controller 直接提供 React hooks。** 這會阻止非 React 消費者複用同一物件，也使 transport 與 renderer 生命週期相互依賴。
- **把 Conversation 放進 SessionSnapshot。** 這會擴大 Session API，並迫使普通 Session 消費者理解 event folding 與 target roster。
- **讓 Chat 和 Trajectory 各自重放 Session events。** 這會重複維護順序、location 和 registry rebuild；共享 assemble core 因而留在 `ui-conversation`。
- **把 Conversation core 拆成額外的非 UI package。** Core 與 adapter 目前共同演化且沒有其他非 UI package 消費者；同包目錄隔離足以保持 React-free core。
- **把 Workspace 與 Session 合成聯合 snapshot。** 這會製造新的跨域 owner；跨域邏輯保留為 `ui-workspace` 的即時決策。
- **讓 renderer 內建所有標準 hook。** 這會要求通用基礎設施認識每個領域；standard source registration 保持 renderer 與業務型別解耦。
- **讓每個 pending 請求動態註冊 composer entry。** 這會重複宣告 child Slot，並讓並行請求競爭註冊順序；穩定 entry 與請求期物件釋出保持分離。
- **把 pending interaction 寫回 Session projection。** 待回答 waterfall 不是已提交的持久 Session 事實，重新整理恢復由 Remote Event replay 負責，因此它留在業務 UI source。
- **為 binding 增加專用 release callback。** 這會重複 Cordis 生命週期；`binding.ctx.effect()` 已能把消費者清理掛到同一 owner。
- **讓 SessionProvider 透過 render function 傳 Session id。** 這會產生另一條資料注入路徑；普通 children 與標準 `sessionId` prop 保持 scope 資料只有一個入口。
- **把 Store 留在 renderer。** Store contract 不依賴 React，並被物件與測試基礎設施複用；獨立 `client/store` 保持 engine 與渲染生命週期分離。

## 後果

Session、Workspace、Conversation 與具體 target 各自擁有一份權威狀態，非 React consumer 可以直接複用 Controller 和 assemble core。新增 Conversation target 只需註冊 Definition、builder、View、標準 source 和 Slot entry；新增 pending-interaction 業務只需宣告型別、註冊 domain 並提供穩定 composer entry。

Renderer 和 Session Controller 不因新增業務領域而增加分支，Session binding 與 plugin fiber 則提供兩條明確且可組合的釋放路徑。UI 可以觀察到 Session 與 Conversation source 的獨立釋出，消費者不得依賴二者的通知順序。

組合包必須顯式裝載所需 adapter 與 target plugin。缺失具體 target 時 shell 仍可執行，但不會生成或猜測該 target 的 View。更多 package 和顯式註冊增加了裝配工作，但依賴方向、測試範圍與故障 owner 均可區域性確定。
