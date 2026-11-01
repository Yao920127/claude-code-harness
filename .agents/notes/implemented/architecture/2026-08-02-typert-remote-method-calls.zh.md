# Agent Note: Typert Gateway 定向方法呼叫

Status: implemented

[English](2026-08-02-typert-remote-method-calls.md) | 中文

## Problem

Host API Proxy 當時在一個包裡同時承擔直接方法呼叫、帶狀態互動和 Session 事件流。三者的生命週期、路由語義和用戶端程式設計介面不同，繼續共用一個業務匯出包會讓業務 Service、傳輸協定、狀態機和用戶端型別彼此耦合。

本決策只涵蓋一次請求對應一次結果的定向方法呼叫。Permission、Approval 等帶狀態互動以及 Session 事件流仍採用獨立設計。

直接方法呼叫的約定屬於實作該行為的業務 Service。業務開發者只需宣告哪些方法可以遠端呼叫，無需再同步維護中央 API 介面、路由表、參數轉換表、用戶端 stub 和 Zod schema。

Host 與 Browser Client 使用獨立的 TypeScript Program，因為兩邊會以不同型別合併同名 Cordis `Context`。Remote 投影不能把完整 Host 宣告匯入消費端，也不能依賴 Browser 專屬型別；未來 TUI 若複用這套程式設計介面，也只能看到 Remote 標記的方法。本期不實作 TUI 接入，但實作邊界不得阻斷這種同構複用。

## 決策

業務 Service 繼承 `TypertRemoteService`，並透過 `@Remote` 或 `@RemoteScope()` 宣告可呼叫方法；已有其他基類的 Service 可以改用 `bindTypertRemote()` 暴露同一繫結。Typert 從 Host Program 生成 Host 本地反射產物和平臺無關的 Remote 消費端投影；Client Program 繼續獨立生成自己的本地反射產物。

Remote 消費端投影同時包含 `.d.ts`、`.d.ts.map` 和 `.js`。`.d.ts` 只暴露被 Remote decorator 標記的方法，並引用業務包唯一的公共型別符號；`.d.ts.map` 把消費端 API 方法導航回 Host 業務方法實作；`.js` 攜帶同一約定的 endpoint、參數、Context 和 Zod 資訊。Browser Client 在 assembly 層把需要的 Remote JS 貢獻集中掛到 Client Remote Service；該投影和 Remote 抽象保持平臺無關，以便未來 TUI 複用。

`@deepseek-ai/dsh-api-gateway` 位於 `packages/api/gateway`，提供對稱的兩個 face：預設入口提供 Host `ctx.typertGateway`，`/client` 入口提供消費端 `ctx.remote`。兩邊各自在本地消費由同一模型生成的 `InvocationDescriptor`，descriptor 不透過 wire 傳送。Remote 資料協定執行在 Connection 共享的 `/api` RPC channel 上；業務呼叫介面不隨 Connection 從 HTTP 遷移到 WebSocket 而改變。

`@deepseek-ai/dsh-api-remotes` 位於 `packages/api/remotes`，是 Gateway 上層的 BFF 層。其 Host 入口註冊本應用轉發的 Cordis 事件源與隨 generation readiness 攜帶的 Host 事實；`/client` 入口選擇應用對外暴露的生成 Remote contribution。Client 入口透過 Cordis 消費共享的 `TypertClientRemote` 約定，而不匯入具體 Gateway 實作。

## 元件和 Cordis 服務

| 元件 | Cordis 服務 | 職責 |
|---|---|---|
| `@deepseek-ai/dsh-typert-protocol` | 只宣告 `ctx.typert` 的最小協定 | `TypertRemoteService`、decorator、binding 退回、descriptor、lookup/Context 和 Remote map；不依賴 compiler、Zod、Connection 或 Browser |
| Typert registry | `ctx.typert` | 分開儲存目前環境 reflection、匯入的 Remote contribution、lookup provider 和 Context provider |
| Typert generator/loader | 無新增業務服務 | 從 Host/Client Program 生成三類 `lib` 產物，並把目前環境產物註冊到 `ctx.typert` |
| API Gateway 的 Host face | `ctx.typertGateway` | 關聯 Host definition 與活 Service，解碼參數、解析 receiver、呼叫方法，並將一元結果投影為載體無關的欄位與附件 |
| Connection | `ctx.connection` | 獨佔 HTTP Server/未來 WebSocket、共享 `/api` route、RPC envelope、rpcId、物理序列化、trust、錯誤傳輸、Typert 攔截，以及各 owner 在同一 channel 上註冊的精確 Fetch route |
| API Gateway 的 Client face | `ctx.remote`、`ctx.remote.<namespace>` | mount Remote contribution，把每個 namespace 實體化為可追蹤的 `remote.<namespace>` 子 Service，並把規範呼叫交給 `ctx.connection.rpc` |
| API Remotes | 無新增服務 | 負責 Host Agent/Session lookup 策略，並作為 Client 業務的唯一 facade，選擇並掛載 `/remote` contribution，同時暴露所選 API 宣告 |
| Agent/Session owning 包 | 既有領域服務 | 同時提供靜態 interface merge 與執行時 lookup/Context provider |
| Goal 等業務包 | 既有業務 Service | 只宣告 binding、Remote 方法和唯一 DTO，並匯出生成的 `/remote` 子路徑 |

Host Gateway 不依賴 `ctx.agents`、`ctx.sessions`、`ctx.goals` 或 `ctx.webServer` 的具體實作。Client Remote 不理解物理 carrier，Connection 也不理解 Goal、Agent、lookup、`InvocationDescriptor` 或 Remote namespace。

## 業務宣告

普通直接呼叫使用 `@Remote`。現有方法的參數和結果已經是預期的 Remote 約定時，直接裝飾該方法，不為此重新命名。只有 wire 約定需要不同的請求或結果形態時，才新增 `remoteExport*` 介面卡，並由 decorator 參數宣告短 API 名。方法需要哪個業務物件，就在頂層參數位置顯式宣告該物件：

```text
export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  create(agent: Agent, request: CreateGoalRequest): GoalView {
    // Existing business method remains unchanged.
  }

  @Remote('create')
  remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    const view = this.create(agent, request)
    return { ref: { id: view.id, revision: view.revision } }
  }
}
```

`goals` 是傳給 `super()` 的明確 Cordis service key，並預設作為 wire namespace。只有協定 namespace 確實需要與 service key 不同時，才透過第三個參數傳入 `namespace` 選項。

需要在某類隔離 Context 中查詢 Service receiver 時使用 `@RemoteScope()`。Scope identity 不進入業務方法參數：

```text
export class ScopedGoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @RemoteScope('agent', 'create')
  remoteExportCreate(request: CreateGoalRequest): Promise<CreateGoalResult> {
    // Runs against the goals service resolved from the Agent Context.
  }
}
```

同一個 endpoint 只能選擇一種呼叫模式。需要顯式 `Agent` 參數的流程使用 `@Remote`；需要切換到 Agent Context 再解析 scoped receiver 的流程使用 `@RemoteScope('agent')`，兩者不會由 Typert 根據方法體或參數缺失自動猜測。

業務包只依賴輕量的 `@deepseek-ai/dsh-typert-protocol`。它提供 `TypertRemoteService`，以及 decorator、binding 退回、lookup、Remote Scope 和 descriptor 的宣告協定，不依賴 TypeScript compiler、Zod、HTTP 或 Client runtime。

支援協作式取消的方法會把 `signal: AbortSignal` 宣告為最後一個 Host 參數。這個保留參數不是業務值、lookup 或 JSON 欄位。生成的消費方方法將其暴露為最後一個可選參數，因此普通呼叫保持不變，而擁有取消控制權的呼叫方可以傳入 signal。

## Decorator 與顯式 Gateway facet

Decorator 只表達“該方法參與 Remote 約定”，不負責執行時型別反射，也不向 Service constructor 注入隱藏 symbol。`@Remote('create')` 和 `@RemoteScope('agent', 'create')` 的參數是外部方法名；被裝飾成員既可以是業務方法本身，也可以是 `remoteExportCreate` 這樣的介面卡。未給別名時才使用成員名作為外部方法名。繼承 `TypertRemoteService` 是 Service 加入 Gateway 的常規顯式宣告；其 public readonly `typertGateway` 欄位使執行時實例上的繫結保持可見。

SRC 模式下，decorator 把方法名和呼叫模式記錄在 Service prototype 上的帶版本描述符中。描述符使用穩定的字串屬性名，因此 `remoteMethods()` 可以讀取 `dsh-typert-protocol` 另一個已安裝副本生成的標記；它不會向 Service 實例、constructor 或方法函式寫入任何內容。

LIB 的嚴格方法發現、型別解析和 descriptor 生成由 Typert compiler 完成。它接受 `TypertRemoteService` 直接 `super()` 呼叫中的字面量 service key，或顯式 binding 退回；生成過程不改寫業務原始碼，也不注入隱藏註冊中繼資料。

## Lookup 與 Remote Scope 註冊

Gateway 不內建 Agent、Session 或其他業務物件分支。物件所屬包同時提供靜態宣告和執行時 provider：

```text
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertLookupMap {
    agent: TypertLookup<Agent, SessionId>
  }
}

ctx.typert.lookups.register('agent', {
  parameter: 'agent',
  wire: 'agentId',
  resolve: sessionId => resolveAgent(sessionId),
})
```

靜態宣告讓 Typert 知道 `Agent` 在 wire 上對應 `SessionId`；執行時 provider 負責把請求中的 `agentId` 解析為目前活的 `Agent` 物件。缺少任一側時，LIB 建置或最早可解析的執行時註冊直接失敗。

Agent、Session 等 lookup 物件只能各自佔據一個頂層參數位置。普通 JSON request 可以作為另一個完整參數傳入，但本設計不支援 `request.agent`、物件解構、物件陣列、巢狀 lookup 或從任意複雜結構中搜尋 ID。

Remote Scope 使用獨立的 merge-extensible map 和 Context provider。Agent 包註冊 `agent` provider，負責用 wire identity 找到 Agent Context，並從該 Context 解析 descriptor 指定的 service key；Gateway 不知道 Agent Context 的內部結構。

Client 側也註冊 `agent` Context binder。binder 只負責從一次呼叫所在的 Context 取得 `SessionId`；它不列舉 Scope，也不逐個複製方法。scoped namespace 由 Cordis Service tracker 自動 rebind 到目前 Agent Context。

## InvocationDescriptor

Typert、SRC 弱解析器、Host Gateway 和 Client Remote 之間只交換一種規範描述：

```text
InvocationDescriptor {
  id: '@deepseek-ai/dsh-goal#goals/create'
  service: 'goals'
  namespace: 'goals'
  method: 'create'
  implementation: 'remoteExportCreate'
  invocation: direct | { context: 'agent', wire: 'agentId' }
  scope?: { context: 'agent', wire: 'agentId' }
  parameters: [
    { name, wire, source: json | lookup, lookup?, codec }
  ]
  cancellation?: { parameter: 'signal' }
  result: codec
  sourceLocation
}
```

`method` 是 endpoint 和 Client Remote 使用的外部短名，`implementation` 是 Host receiver 上的真實成員名；兩者相同時可省略 `implementation`。`direct` descriptor 保留原始 Service 實例作為 receiver。Context descriptor 先透過對應 Context provider 找到 scoped Context，再以 descriptor 的 service key 解析 receiver。

嚴格生成器只在 direct 方法恰好包含一個 lookup 參數、同名 `TypertContextMap` 宣告存在且兩者使用同一 wire 型別 symbol 時寫入 `scope`。`scope.wire` 必須指向該 lookup 參數；它宣告消費端可以從呼叫所在 Context 補入這個參數，不改變 Host receiver 或 endpoint。多個 lookup、缺少 Context 宣告或 wire 型別不一致時不生成 scoped 投影，其中型別不一致屬於建置錯誤。

參數順序來自方法簽名，HTTP 欄位來自參數名或 lookup 宣告。取消 descriptor 只保留最後一個 `signal` 位置，並使其不進入具名 `args`；實際 signal 由 Connection 或直接呼叫 Gateway 的呼叫方提供。Gateway 不根據請求內容推斷可選欄位、Context 型別、lookup 型別或缺失參數，也不會合成業務預設值。

LIB codec 帶有隻快取成功結果的 Zod schema factory 和「package + 公共 subpath + export name」的規範 `typeSymbol`。Host Gateway 首次解碼嚴格輸入時呼叫參數與身份 factory。Client contribution 保留同一 codec 中繼資料，以在掛載時檢查嚴格輸入，但不實例化呼叫 schema；[僅在 Host 驗證 Remote 輸入](../simplification/2026-09-15-host-only-remote-input-validation.zh.md)規定了這個位置。SRC codec 只標記 `src-json`。

descriptor 只存在於兩端本地 registry。wire 上只有 `/api` channel、endpoint 和 `{ args }` payload。Client 用自己的 descriptor 把位置參數和 Context identity 對映為具名欄位；Host 用自己的 descriptor 驗證這些欄位、解析 receiver 並呼叫方法。

## Typert 執行時 registry

```text
ctx.typert.local     Host or Client reflection for this process
ctx.typert.remotes   peer Remote contributions explicitly mounted by a consumer
ctx.typert.lookups   providers and composition policy from wire IDs to Host objects
ctx.typert.contexts  Host Context resolvers and Client Context binders
```

每次註冊都返回由呼叫方 Cordis fiber 持有的 disposer。掛載 Client contribution 時，descriptor 集與具體方法會作為一項有明確所有者的操作統一註冊。Host Gateway 只快取 SRC 所認領的 endpoint 名稱集合，並在 Cordis Service 集合發生變化時整體丟棄該集合；它不保留 descriptor、Service 或提供者。呼叫時會從目前狀態解析所有活物件，因此移除 strict definition、Service 或提供者會使相應呼叫不可用，且不會留下陳舊的活物件。

lookup 註冊表會在活 resolver 解除安裝後保留穩定的 wire 宣告。SRC 解析仍會把該參數歸類為 lookup，而呼叫會以 `gateway/lookup-unavailable` 失敗；系統絕不會把傳入的 ID 重新歸類為普通 JSON 業務物件。在同一個 Typert Service 的生命週期內，以不同參數、wire 或規範型別 symbol 重新註冊同一 key 會直接失敗。

業務物件包和 scoped Context 包透過 `lookups.register()` 與 `contexts.registerHost()` 擁有穩定宣告和預設 resolver；Host 組合透過 `lookups.configure()` 與 `contexts.configureHost()` 提供 effect-scoped 非同步策略。設定可以先於 provider 註冊，但沒有活 provider 時不會單獨形成可用身份；設定解除安裝後恢復 provider 預設 resolver。Session Controller 的 `ApiSessionAgentController` 為 `agent`、`session` lookup 和 `agent` Host Context 設定同一個共享 resolver：live Agent 直接複用，普通冷工作階段自動恢復，並行恢復按 Session ID 去重，subagent ownership fence 則返回 `session/agent-busy`。`session` lookup 返回解析所得 Agent 的 Session，`agent` Host Context 返回其 Context，因此三種投影共用一個恢復生命週期。

Registry 的 Host 根入口擁有完整 `TypertRegistryContract` interface merge；Host 與 Client 共用的 registry 實作位於無環境宣告的獨立模組。Registry `/client` 入口只引用該共享實作，不經過 Host 根入口，因此不會把 Host Cordis 宣告帶入 Client Program。

## 唯一型別、符號與 Zod

Remote Client DTS 不複製業務 DTO，也不重新宣告一個結構相同的影子型別。它只從不攜帶 Host Cordis merge 的公共純型別 subpath 引用原始符號：

```text
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CreateGoalRequest, CreateGoalResult } from '@deepseek-ai/dsh-goal/types'
```

因此 `SessionId`、Agent wire ID、request 和 result 在 Host 與 Browser Client 中都指向同一 TypeScript declaration，未來 TUI 複用時也不需要第二份型別。DTO 的跳轉定義、重新命名和引用查詢回到業務型別的唯一原始碼位置，而不是停在生成檔案中的副本。

Remote 方法本身使用 declaration map 導航。Typert 把 `InvocationModel.location` 固定在 Host 被裝飾方法的方法名 token，並在 namespace interface 的對應屬性上寫入 source-map segment。對於由介面卡支撐的 endpoint，TypeScript editor 從 `ctx.remote.models.list` 取得生成 declaration 後，再沿 `typert.remote-client.d.ts.map` 跳到 Host Service 的 `remoteExportList` 遠端出口。該出口繼續顯式呼叫不改名的存量 `list()`，map 不把 decorator、class 或整個簽名誤當成方法定義位置。

Typert 為同一 symbol key 生成 wire Zod codec。Host Gateway 用參數與身份 codec 驗證輸入。Client Remote 信任生成的 TypeScript 參數與 JSON 成功結果。二進位制成功結果在 multipart 解碼後執行生成的結果 codec，具體由[二進位制 Remote 傳輸](2026-09-17-workspace-file-binary-transfer.zh.md)規定。複雜型別若無法生成嚴格 codec，LIB 建置失敗，不降級為 `unknown` 或未驗證 JSON。

Remote 方法引用的命名業務型別必須從純型別公共 subpath 匯出。如果唯一可達入口會帶入 Host Service、Cordis `Context` merge 或 Host-only 實作，建置失敗並要求業務包提供安全的型別出口。原始值、字面量和 Typert 明確支援的簡單組合不需要額外命名。

lookup 參數不會把 `Agent` class 暴露給消費端。Remote 投影引用 lookup 宣告中的唯一 ID 型別，例如 `SessionId`；Host 內部仍以唯一的 `Agent` class symbol 完成物件解析。

## 三種產物與兩個 TypeScript Program

Host 與 Client 仍然只有兩個獨立 TypeScript Program，但 Typert 生成三種性質不同的產物：

```text
Host Program
├─ typert.host.js / typert.host.d.ts
│  Host 自身的 Service、Event、Object、schema 和 inbound Gateway 資訊
└─ typert.remote-client.js / typert.remote-client.d.ts / typert.remote-client.d.ts.map
   Host Remote 對任意消費環境的 wire 投影

Client Program
└─ typert.client.js / typert.client.d.ts
   Client 自身的 Service、Event、Object 和 schema 資訊
```

`remote-client` 是 Host Program 的第二個 emitter，不是第三個 Program，也不是 Client 本地 face。它不包含 Host Cordis merge、Service class、Context class 或實作程式碼，不進入 Host 本地 reflection registry。

Host lib 建置負責完成嚴格 Host 分析併產出 Host 本地 artifact 與 Remote 消費端 artifact；Client lib 隨後消費 Remote DTS。完整順序為：

```text
Host lib build
→ 生成 typert.host.{js,d.ts}
→ 生成各業務包 lib/typert.remote-client.{js,d.ts,d.ts.map}
→ 完成 Client lib 和 typert.client 產物
→ Vite 建置 Web
```

現有頂層 `build` 仍表現為先 `build:lib`、再 `build:web`，但 `build:lib` 內部必須先完成 Host 與 Remote artifact，再啟動 Client TypeScript 編譯。一次乾淨建置不能依賴上次殘留的 `.d.ts`。

即使主要輸入是原始檔，需要透過編譯器解析消費方 surface 的儲存庫門禁也有相同的前置條件。公共 `typecheck`、`lint` 和 `doc-typecheck` 命令會先執行 Host 約定 pass。門禁排程器僅可在顯式的 Typert 約定依賴或完整建置依賴完成後使用對應的 `*:contracts-ready` 變體，使並行 lane 既不會讀取缺失的宣告，也不會針對同一輸出並行執行多個生成器。

## `/remote` 包入口

每個提供 Remote 方法的業務包匯出生成的 `/remote` 子路徑：

```text
"./remote": {
  "types": "./lib/typert.remote-client.d.ts",
  "default": "./lib/typert.remote-client.js"
}
```

消費程式碼透過業務包本身選擇能力：

```text
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
```

該 import 讓 `.d.ts` 的 map augmentation 進入目前 TypeScript project，同時把同一約定的 JS descriptor 作為值交給執行時。未 import 的業務包不會擴充功能目前 project 的 Remote API 型別。

業務 package 的釋出檔案必須包含 `lib/typert.remote-client.d.ts.map`。生成 DTS 以 `//# sourceMappingURL=typert.remote-client.d.ts.map` 引用相鄰 map；map 中的 source 從 `lib` 相對指向業務原始碼，例如 `../src/index.ts`。`/remote` export 不單獨列出 map，package `files` 負責釋出它。該目標是開發期路徑：workspace 消費者經 package link 解析它，因此釋出產物仍然不含 `src`，已釋出的 map 只是解析不到東西。

僅需要靜態型別時可以使用 `import type {} from '@deepseek-ai/dsh-goal/remote'`；這種 import 在執行時會被擦除，不會載入 JS，也不能觸發任何執行時註冊。需要真實呼叫的環境必須把普通 value import 得到的 contribution 交給 Client Remote Service。

workspace 對 `/remote` 的解析必須明確指向 `lib` 生成物，不能被通用 package-to-`src` paths 規則帶回 Host 原始碼。普通業務 import 仍可按各環境既有規則解析到 SRC 或 LIB。

## 消費端嚴格 API 型別

Remote DTS 同時擴充功能平面 endpoint map、direct namespace interface、namespace map 和 scoped map，而不擴充功能全域 Cordis `Context`：

```text
interface TypertRemoteNamespace$676f616c73 {
  create: (
    agentId: SessionId,
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<CreateGoalResult>>
}

interface TypertRemoteMap {
  'goals/create': (
    agentId: SessionId,
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<CreateGoalResult>>
}

interface TypertRemoteNamespaceMap {
  goals: TypertRemoteNamespace$676f616c73
}

interface TypertRemoteScopeMap {
  'agent:goals/create': (
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<CreateGoalResult>>
}
```

`TypertRemoteMap` 保留規範 endpoint 簽名，供協定型別和反射使用。根 Remote 型別直接讀取 `TypertRemoteNamespaceMap`，不透過 key-remapped mapped type 間接推導方法；TypeScript Language Service 無法把這種間接屬性穩定導航到 declaration map。namespace interface 名由 namespace 的 UTF-8 bytes 編成 hex，`goals` 因而穩定得到 `TypertRemoteNamespace$676f616c73`。不同 package 對同一 namespace 生成同名 interface，依靠 module augmentation 合併各自方法，且 `TypertRemoteNamespaceMap.goals` 始終引用同一型別。

Typert 把 `TypertRemoteScopeMap` 按 Context key 投影到專用 Scope 型別。最終程式設計介面保持：

```text
ctx.remote.goals.create(agentId, request)
agentCtx.remote.goals.create(request)
```

Agent Scope 自動提供自己的 `SessionId`。因此帶 `agent` lookup 的 `@Remote` 方法可以同時生成 root 和 scoped 兩種消費端簽名；`@RemoteScope('agent')` 方法也省略獨立的 Scope identity，但只生成 scoped 簽名。根 `Context` 透過 `ctx.remote` 暴露 direct namespace，`AgentContext.remote` 則把該 direct surface 與 scoped surface 取交集。未來 TUI 複用時必須維持相同區分。

每個生成方法都解析為 `Promise<RemoteResult<T>>`：呼叫把結果報告在 `ok` 分支裡而不是 reject，只有裝配故障（arity、未掛載的方法、缺失的 Context adapter）仍然丟擲。消費方按 `result.ok` 分支，需要區分失敗時讀 `result.error.code`；失敗詞彙本身是[單一 Remote 失敗類加一張合併碼錶](2026-08-28-ctx-remote-failure-vocabulary.zh.md)。

`TypertClientRemote` 保持平臺無關，Browser Client 透過 `ctx.remote` 暴露它。未來 TUI 若複用該型別，也必須透過專用 Remote 物件和 Agent Scope 使用它，不能把 Host `Context` 當成更寬的 Service 集合；未標記的 public Service 方法不會進入 Remote maps。除生成的 namespace 之外，Gateway client face 還提供 `$mount`、`$on`、`$stream` 與 `$host`——最後這項把連線的固定 Host 事實（`home`、`isLoopback`）作為普通值讀取暴露，消費方無需為此注入載體。

## Client Typert 與 API Gateway Client face

一個消費環境的 Typert 同時維護本地資訊和從其他環境匯入的 Remote 資訊，但兩者存放在不同 registry：

```text
Typert.local    目前環境自己的反射模型
Typert.remotes  已匯入的 Remote contribution
```

`@deepseek-ai/dsh-api-remotes/client` 集中載入需要的 Remote contribution：

```text
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
import sessionsRemote from '@deepseek-ai/dsh-session/remote'

await ctx.remote.$mount(goalsRemote)
await ctx.remote.$mount(sessionsRemote)
```

Client 業務包只引用 `@deepseek-ai/dsh-api-remotes/client`，不直接依賴 API Gateway 或各業務 `/remote` 執行時入口。API Remotes 消費共享的 `TypertClientRemote` 約定和 Cordis `ctx.remote` 服務，再重新匯出宣告，使所選 Remote map 進入業務編譯；新增或移除整套 Client 能力只修改這一處 assembly。

`ctx.remote.$mount()` 把 contribution 註冊到 `Typert.remotes`，安裝它的 namespace Service 和具體方法，並在它們就緒後才 resolve。呼叫該方法的 Cordis fiber 持有 disposer。endpoint 重複、同一 namespace/method 模式衝突或 descriptor 與現有型別身份衝突時直接失敗。

Client Remote Service 把 `@Remote` descriptor 實體化為 `remote.<namespace>` 子 Service 上的真實函式。函式檢查位置參數數量，按 descriptor 的參數順序建構具名 `args`，不做執行時型別解析，然後呼叫 `ctx.connection.rpc.call('/api', endpoint, { args }, signal)`。對於支援取消的 descriptor，生成的函式接受最後一個可選 signal，並將其與 contribution 的掛載生命週期合併；因此解除安裝會取消所有正在進行的 carrier 呼叫，而呼叫方也可以單獨取消一次呼叫。

帶 `scope` 的 direct descriptor 和 `@RemoteScope` descriptor 都不為每個 Agent Scope 複製函式。Client Remote Service 為每個 namespace 建立一個註冊為 `remote.<namespace>` 的 Cordis 子 Service，並在其上實體化 direct 與 scoped 變體。透過 `agentCtx.remote.goals` 取得方法時，accessor 會在返回可呼叫控制代碼前捕捉目前 Agent Context。方法再透過對應 Context binder 從該 Context 取得 identity。direct scoped 投影用 identity 替代 `scope.wire` 指定的 lookup 位置，Remote Scope descriptor 則把 identity 寫入 receiver 的獨立 wire 欄位；兩者都發起同一種 `/api` 呼叫。

```text
root ctx.remote.goals.create(agentId, request)
  → direct descriptor
  → ctx.connection.rpc.call('/api', 'goals/create', { args })

agentCtx.remote.goals.create(request)
  → remote.goals accessor 捕捉 agent Context
  → agent binder 從 caller Context 取得 agentId
  → 用 agentId 補入同一 direct descriptor 的 lookup 參數
  → ctx.connection.rpc.call('/api', 'goals/create', { args })
```

根 `Context` 只 merge direct `TypertClientRemote` surface；`AgentContext` 把該屬性替換為 `TypertClientRemote` 與 `TypertRemoteScopeApi<'agent'>` 的交叉，因而 scoped-only 方法不會暴露給 root 程式碼。若呼叫方繞過型別從 Root 動態呼叫 scoped-only 方法，binder 明確報錯。若 Client 已有名為 `remote.<namespace>` 的 Cordis service，或兩個 contribution 衝突佔用同一 namespace/method，mount 直接失敗，不覆蓋現有服務。

生成的 Remote JS 只包含 descriptor、symbol key 和 codec，不打包 Host Service 實作。Client Remote Service 據此建立真實函式，因此執行時不依賴 JavaScript Proxy；Proxy 可以作為實作選擇，但不會成為型別或反射來源。

## 跨環境同構約束

Remote API 是消費端能力，不等同於 Browser API。已交付的執行時實作 Browser Client contribution 掛載、Connection RPC 呼叫和 Agent Scope 關聯。

Remote DTS、Remote JS、`TypertClientRemote`、`InvocationDescriptor`、Remote RPC 資料協定和 Context binder 不得依賴 DOM、Browser module loader 或 HTTP。Browser Client 透過 Connection 把 descriptor 實體化的方法編碼為 `/api` RPC 呼叫。

未來 TUI 可以在不改變業務 decorator、Remote maps 和 API 呼叫形狀的前提下接入同一呼叫抽象。屆時 TUI 可見的 API 仍只能由 `@Remote` 和 `@RemoteScope` 生成，不能因為它與 Host 同程序就繞過 Remote 限制直接暴露 Service 方法。

TUI 的 runtime 掛載、carrier、Agent Scope 關聯和 SRC 啟動接線均仍延後，不在本決策之內。

Web 本身依賴 `lib/client.js` 等建置產物，因此啟動 Web 前要求完整 `build:lib`。Host Remote 約定變化後，開發者需重新執行 lib build，再啟動或重新啟動 Web；系統不實作 Remote contract 的增量 watch。

## SRC 與 LIB 執行模式

SRC 面向本地原始碼啟動。`@Remote` 和 `@RemoteScope()` 建立的帶版本 prototype 描述符給出方法名和呼叫模式，執行時從 JavaScript 函式簽名讀取順序參數名，並結合已註冊 lookup/Context provider 生成弱 descriptor。

例如 `@Remote('create') remoteExportCreate(agent, request, signal)` 解析為外部方法 `create`、實作成員 `remoteExportCreate`、兩個頂層業務參數和一個取消注入點；lookup 註冊把 `agent` 改寫為 wire 欄位 `agentId`，`request` 按同名 JSON 參數傳遞，最後一個 `signal` 則留在 payload 之外。SRC 不啟動 `ts.Program`，不使用 preload、loader hook、原始碼生成或模組改寫，也不檢查普通 JSON 物件的內部結構。

SRC 無法明確解析的簽名會在首次呼叫解析其 descriptor 時失敗；Service 掛載只記錄 decorator 標記，不檢查 JavaScript 簽名。SRC 不會猜測物件解構、預設參數造成的歧義、rest 參數、巢狀 lookup 或複雜型別。

LIB 面向 CI、釋出和 Web 前置建置。Typert 掃描完整 Host project，檢查 Remote decorator、顯式 binding、service key、endpoint 衝突、lookup/Context 宣告、公共符號可達性、JSON codec、結果 codec，以及保留的最後一個 `signal` 參數是否具有全域 `AbortSignal` 型別，並生成嚴格 descriptor。

LIB 執行時只載入 `lib` 中的 definition，不啟動 TypeScript compiler。Host Gateway 後續的 Service 關聯、lookup、Context 解析、呼叫和回應編碼不區分 descriptor 來自 SRC 弱解析還是 LIB 嚴格生成。

CI 和釋出執行 LIB。全倉 coverage 全部切換到 LIB 是獨立後續工作，不阻塞本次直接方法呼叫實作。

## Host Gateway 解析

Host Gateway 向 Connection 註冊一個 `/api` interceptor，不維護第二份 endpoint 註冊表。ownership matcher 會先檢查目前 Typert local 註冊表，再查詢一份可失效的集合；該集合透過掃描目前 Cordis Service 中的 `typertGateway` binding 與 SRC Remote 標記生成。Cordis Service 發生變化時會整體丟棄該集合，因此 Typert definition 與業務 Service 可以按任意順序到達，同時既不會在每次請求時重新掃描所有 Service，也不會因任意請求路徑而擴大快取。

每次呼叫都會重新從目前狀態解析 descriptor、receiver、lookup 提供者與 Context 提供者。目前 strict descriptor 優先於 SRC。strict endpoint 一旦出現，即使隨後撤回對應 descriptor，`TypertLocalRegistry.hasSeen()` 仍會在註冊表剩餘生命週期內保持對它的認領並禁止退回 SRC；重新註冊 strict descriptor 即可恢復呼叫。移除 Service 或提供者會讓呼叫明確失敗；Gateway 既不保留失效物件，也不會以原始 lookup ID 呼叫方法。

普通 `@Remote` 呼叫保留原始 Service 實例作為 receiver。lookup 成功後，Gateway 按 descriptor 的參數順序呼叫 `implementation ?? method` 指定的成員；若 descriptor 宣告取消，則在這些參數之後追加 carrier signal。

`@RemoteScope('agent')` 呼叫先由 Agent Context provider 解析 wire identity，再從該 Context 讀取 descriptor 的 service key 並呼叫 scoped receiver。業務方法不會收到隱藏 Context 參數或 Agent ID。

```text
ctx.typertGateway.invoke({ namespace, method, args, signal })
→ 查詢本地 InvocationDescriptor 與 live receiver
→ 按參數 descriptor 讀取具名 wire 欄位
→ codec 解碼普通值或 lookup ID
→ lookup provider 把 ID 解析為活物件
→ direct 使用原 Service；context 先解析 scoped Context 和 Service
→ cancellation descriptor 存在時把 signal 追加到業務參數末尾
→ Reflect.apply(receiver[implementation ?? method], receiver, orderedArgs)
```

`ctx.typertGateway.invoke()` 是 carrier-independent 的 Host 入口。它不建立 rpcId、RPC envelope 或 HTTP response；它直接返回未經執行時輸出解碼的業務結果，或產生由 Connection RPC adapter 對映的 Gateway 錯誤。

## 共享 `/api` 呼叫鏈

Connection 在 HTTP Server 上持有唯一 `/api` route。Gateway 把同步 endpoint ownership 判斷和 Remote RPC handler 掛到 Connection：

```text
ctx.connection.rpc.intercept(
  '/api',
  endpoint => ownsRemoteEndpoint(endpoint),
  (endpoint, payload, signal) => {
    const { namespace, method } = parseEndpoint(endpoint)
    const { args } = parsePayload(payload)
    return ctx.typertGateway.invoke({ namespace, method, args, signal })
  },
)
```

Host registry 中存在 strict descriptor、記錄過已撤回的 strict descriptor，或 active SRC Service binding 上存在匹配的 `@Remote` 標記時，Gateway 認領該 endpoint。endpoint 一旦被認領，即使 payload 解碼、descriptor 解析或呼叫失敗也繼續由 Gateway 返回錯誤；既不匹配精確 Fetch route、也不被 Gateway 認領的 endpoint 返回 404。

Connection Host half 把一個複合 FetchHandler 交給 HTTP bridge。bridge 建立標準 `Request` 後，該 handler 先用 pathname 匹配各 owner 在該 channel 上註冊的精確 Fetch route，再匹配該 channel 唯一的 interceptor——即 Gateway——兩者都不認領時返回 404。該 channel 上的每條路徑複用同一 request/response envelope、rpcId、序列化、trust 與錯誤傳輸，失敗則攜帶共享的 `{ code, message, details }` 資料。目前物理對映是：

```text
POST /api/<namespace>/<method>
```

Remote payload 使用具名 JSON 物件，不使用位置陣列，也不傳送 `InvocationDescriptor`。普通 Goal 呼叫的 payload slot 是：

```json
{
  "args": {
    "agentId": "session-1",
    "request": {
      "objective": "finish the migration"
    }
  }
}
```

完整鏈結為：

```text
ctx.remote.goals.create(sessionId, request, signal?)
→ Client InvocationDescriptor 組裝 { args: { agentId, request } }
→ Client 合併 caller signal 與 contribution mount lifetime
→ ctx.connection.rpc.call('/api', 'goals/create', { args }, signal)
→ Connection 建立 rpcId 和既有 client-request envelope
→ 目前 carrier 傳送 POST /api/goals/create
→ Connection Host half 執行共享 trust，再由 bridge 建立標準 Request
→ 複合 FetchHandler 判斷 endpoint ownership 並選擇目標 FetchHandler
→ Typert interceptor 呼叫 ctx.typertGateway.invoke(..., request.signal)
→ Host InvocationDescriptor 解碼、lookup、receiver 解析並把 signal 注入 Reflect.apply
→ Connection 寫入既有 RPC result 並回送相同 rpcId
→ Client 直接返回 CreateGoalResult
```

Remote 不在 wire 上定義第二層 `{ ok, value/error }` response。成功值與失敗都直接使用既有 RPC response 的 `result`，失敗分支攜帶共享的 `{ code, message, details }` 資料。owner、resolver 與 Gateway 拋的都是同一個類 `RemoteError`，其碼來自合併後的 `RemoteErrorDetailsMap`：Host 把結構識別出的 `RemoteError` 原樣編碼上 wire——包括 Gateway 自己的 `gateway/*` 裝配碼，以及 resolver 的 `session/not-found`、`session/agent-busy`——只把未歸類的 throw 折成 `gateway/internal`，並把診斷串留在 message 裡。Client face 為 `RemoteResult` 的錯誤分支重建實例，因此 `throw result.error` 的 throw 語義成立。[失敗詞彙 Agent Note](2026-08-28-ctx-remote-failure-vocabulary.zh.md) 持有碼錶、落點規則，以及為什麼判別讀 `code` 而不用 `instanceof`。

Gateway 不處理逐方法權限、呼叫者身份、冪等或長連線狀態。它只把 Connection 的協作式取消傳播給顯式支援取消的業務方法。共享 channel 上的每個請求——無論是 Typert endpoint 還是精確 Fetch route——都先過 Connection 的瀏覽器認證與 trusted-host 策略再分發；Gateway 不疊加第二套策略。Connection/WebSocket 遷移後續獨立完成。

## Connection 與協定邊界

Client Remote Service 負責 Remote contribution、namespace Service 實體化、Scope 繫結以及位置參數與 descriptor 的對應。Gateway 負責 Host descriptor、endpoint ownership、lookup、Context 和業務呼叫。Connection 把 `/api`、endpoint 和 `{ args }` 作為一個 RPC 呼叫傳送到目標並返回既有 RPC result；它不理解 Goal、Agent、lookup、descriptor 或 Client Remote 型別。

Gateway 只向 Connection 註冊 ownership matcher 和 RPC handler，不註冊 HTTP route。Connection 把共享 `/api` route 掛到 HTTP Server，並把一個複合 FetchHandler 交給 bridge；該 handler 把精確註冊路徑分發給它的 route owner、把已認領 endpoint 分發給 Gateway，其餘一律 404。未來 Connection transport 可以保留相同順序，而不改變 Remote payload、業務 decorator、生成的 DTS、Remote API 型別或 Agent Scope 程式設計介面。

## 包邊界

- `@deepseek-ai/dsh-typert-protocol`：輕量 decorator、binding、lookup、Remote Scope 和 descriptor 協定。
- Typert generator：分析 Host/Client Program，生成本地 face 和 Remote 消費端投影，並生成規範 symbol/Zod 資訊。
- Typert runtime：分別儲存目前環境的 local reflection 與匯入的 Remote contribution。
- `@deepseek-ai/dsh-api-gateway`：預設入口關聯 Host definition 與 Service，認領 Remote endpoint，驗證輸入，執行 lookup、解析 Context receiver、呼叫方法，並向 Connection 註冊 `/api` interceptor；`/client` 入口掛載 Remote contribution，建立嚴格 Remote namespace Service 和方法，並把呼叫交給 `ctx.connection.rpc`。兩個入口共享 Remote 協定，但不互相匯入各自的 Cordis interface merge。
- `@deepseek-ai/dsh-api-remotes`：BFF 層；註冊本應用轉發的 Cordis 事件源與隨 generation readiness 攜帶的 Host home，選擇 Client `/remote` contribution，並透過共享的 `TypertClientRemote` 約定向業務包暴露合併後的 Remote 型別。
- Connection：擁有唯一 HTTP Server/未來 WebSocket carrier、共享 `/api` route 與其複合 FetchHandler、各 owner 註冊的精確 Fetch route、RPC envelope、rpcId、序列化、trust 和錯誤傳輸。
- Agent/Session 等業務物件包：擁有 lookup、Context provider、唯一 ID 型別和純型別公共出口。
- `@deepseek-ai/dsh-api-session-controller`：設定共享的 `agent`/`session` lookup 與 `agent` Host Context resolver，因此每個接收這些物件的 Remote endpoint 共用同一套恢復與 ownership fence 策略。
- 業務 Service 包：宣告 binding、Remote 方法及其 request/result 型別，並匯出生成的 `/remote` 子路徑。

## 已交付範圍與後續工作

已交付的縱向鏈結是 `@deepseek-ai/dsh-goal/remote → Browser Client Remote → Connection RPC /api → Host Gateway → GoalService.remoteExportCreate()`。同一個帶 Agent lookup 的 direct descriptor 同時支援 `ctx.remote.goals.create(agentId, request)` 與 `agentCtx.remote.goals.create(request)`。普通冷工作階段在 lookup 時由該共享 resolver 恢復，subagent-owned identity 保持 `session/agent-busy` fence；`@RemoteScope('agent')` 仍是獨立的 scoped receiver 模式。

Connection 提供共享 channel interceptor 與目前 HTTP carrier 對映。WebSocket 遷移、TUI runtime 與 carrier、TUI Agent Scope 接線、Permission/Approval 狀態機、Session 事件流、呼叫授權、重試、冪等及跨版本協定相容均不屬於本決策。

包拓撲為 `api/remotes → api/gateway → client/connection → host/webserver`。Connection 與 WebServer 在本次變更中保留既有路徑；後續將它們移到 `api/connection` 和 `api/webserver` 只會改變包位置，不會改變這些服務邊界。

## Alternatives considered

**繼續使用中央 API Proxy 包。** 該方案要求業務方法、Host 路由和 Client 介面在多個位置重複宣告，也會繼續把直接呼叫、帶狀態互動和事件流綁在同一生命週期中，因此不採用。

**讓 decorator 在執行時完成嚴格反射。** JavaScript decorator 無法恢復擦除後的 TypeScript 型別、公共符號身份和完整 Zod codec；向 constructor 注入 compiler 私有 symbol 又會隱藏業務類的真實依賴，因此嚴格資訊由 Typert compiler 生成。

**SRC 啟動時使用 preload、loader hook 或完整 `ts.Program`。** 這能複用 LIB 分析，但增加所有原始碼啟動入口的要求。SRC 只需要可用的弱 descriptor，因此採用 decorator 標記、函式參數名和顯式 provider；嚴格檢查留給 LIB 約定 pass。

**手寫 Client interface。** 手寫介面不能保證只包含 Remote 標記的方法，也會與 Host 簽名、lookup ID 和 Zod schema 漂移，因此 Client 型別從 Host Program 自動投影。

**使用 TypeScript language-service/compiler plugin 讓 Client 直接理解 decorator。** 這會讓編輯器、Vite、tsc、tsx 和釋出消費者都依賴額外外掛，接入面過大，因此生成普通 `.d.ts` 和標準 declaration map。

**把完整 Host DTS 匯入 Client 或 TUI。** 該方案會帶入 Host Service 和 Cordis interface merge，並向消費端暴露未標記方法。Remote DTS 只引用純型別公共符號並擴充功能專用 Remote maps。

**只生成 Remote DTS，不生成 JS。** 型別可以成立，但執行時無法列舉 endpoint、codec 和 Context 模式，只能依賴 Proxy 或另一份手寫註冊表，因此同一次 Host 投影同時生成 Remote JS contribution。

**讓 `/remote` 的頂層 import 偷偷註冊全域狀態。** ESM 求值時未必已有目標 Cordis Context，多個 Context、HMR 和 dispose 也無法明確歸屬，因此普通 value import 只返回 contribution，由環境 assembly 的 Client Remote Service 顯式掛載。

**為 Remote 新建獨立 transport、HTTP route 或 `/api2` channel。** 這會複製或拆分 Connection 的 Server ownership、rpcId、序列化、trust、錯誤和未來 WebSocket 生命週期。共享 `/api` interceptor 保留唯一物理 route，並讓 Connection 用各 owner 註冊的精確 Fetch route 與該 channel 唯一的 interceptor 組合出它。

## 驗證

- Goal Service 直接裝飾業務簽名已經符合 Remote 約定的變更類方法，僅保留 `remoteExportCreate(...)` 把 `GoalView` 適應為 `CreateGoalResult`，無需第二條路由、第二份 codec 或 Client 方法清單。
- 一次乾淨的 `build:lib` 會在 Client 編譯前生成 Host 與消費方 Remote 產物，包括業務包 `/remote` 下的 JS、DTS 和 declaration map。
- `clean` 後，單獨執行 `typecheck`、`lint` 或 `doc-typecheck` 都會重新生成 Remote 約定；pre-push 掛鉤使用同一個已包含約定準備步驟的 typecheck，CI 中的原始碼消費方則等待一次共享的約定 pass。
- 匯入 `@deepseek-ai/dsh-goal/remote` 會加入嚴格的 `ctx.remote.goals.create(...)` 型別，並可透過 declaration 導航到 `remoteExportCreate`；不匯入時不會出現該 namespace。
- 掛載同一次 import 得到的 JS contribution 會提供 endpoint、參數、結果、lookup、Context 和 Zod 反射，並在無需手寫 stub 的情況下實體化呼叫。
- Root 與 Agent-scoped 呼叫會經過真實的共享 `/api` carrier，將 `agentId` 解析為活 Agent，呼叫原始 Goal receiver，並透過既有 RPC envelope 返回。
- Agent 與 Session lookup 會共享同一次並行冷恢復；普通冷工作階段得到恢復後的物件，冷態或 live subagent identity 均在業務呼叫前返回 `session/agent-busy`。
- Remote 產物與 map 僅包含已標記的方法，不依賴 Browser，從而為未來 TUI 保留相同的消費方邊界。
- 生命週期測試會撤回並重新掛載 descriptor、Service、lookup、Context 提供者和 Client namespace；依賴不可用時，呼叫會失敗，且不會使用陳舊呼叫或退回原始 ID。
- 取消測試覆蓋嚴格生成、SRC 末位參數名識別、Client signal 合併、Connection 到 Gateway 的傳播，以及 Host 在 wire `args` 之外的注入。
- 既不匹配精確 Fetch route、也不屬於已認領 Remote endpoint 的請求在同一 channel 上返回 404，而已撤回的 route 隨即停止服務。

## 後果

Remote API 型別依賴生成的 `lib` 宣告，建置與門禁編排必須在對 Host 和 Client 消費方進行編譯或語義分析之前完成 Host 約定 pass；順序錯誤會使乾淨環境中的命令依賴陳舊產物。

原始碼導航依賴 Remote package 同時釋出 declaration map 和 map 指向的 `src`。package `files` 漏掉任一側時型別仍可編譯，但消費端跳轉會停在生成 DTS，因此 workspace manifest 驗證必須把兩者作為同一釋出約定。

SRC 弱 descriptor 不驗證普通 JSON 內部結構。Host Remote 簽名變化後，Web 和嚴格型別消費方必須重新執行 lib build，因為系統沒有增量 contract watcher。

公共型別唯一性要求業務 DTO 具有純型別出口，可能暴露現有包中 Host 型別與實作入口混雜的問題。建置會拒絕這些邊界，而不是複製型別掩蓋問題。

型別 import 與執行時 contribution 是兩種不同效果。`import type {}` 只擴充功能靜態 Remote surface；真實呼叫環境遺漏 value contribution 時，Client Remote Service 必須以明確的「Remote 未掛載」錯誤失敗。

生成的 Host 與 Client 產物攜帶匹配的 Zod factory；Client Remote 僅實例化二進位制結果 schema。規範 symbol key、同一生成模型和 Host wire 驗證讓兩側保持一致，而無需跨 realm 比較 schema 物件 identity。

消費端可以匯入 Host 目前未掛載的 Remote contract。型別表示「該協定能力已被消費端選擇」，不保證目標程序目前存在對應 Service；執行時 endpoint 不可用必須明確失敗。

Connection 的通用 channel API 必須同時適合目前 HTTP carrier 和後續 WebSocket carrier。若 Client Remote 或 Gateway 暴露 `fetch`、HTTP request 或 route handle，WebSocket 遷移會再次穿透 Remote 層，因此這些物理物件必須留在 Connection 內部。

Remote endpoint 使用 Connection 的 `trusted-host` authority。系統預設接受 loopback；LAN 呼叫方必須透過顯式 trusted-host 設定接入，但本層不增加逐方法呼叫方授權，因此每個 trusted host 都能呼叫已掛載的 Remote endpoint。

`hasSeen()` 優先保障 strict definition 的安全性，而非 SRC 可用性。strict descriptor 撤回時（例如 HMR 期間），Gateway 會繼續認領 endpoint 並報告不可用，而不會退回到弱 SRC descriptor。重新註冊即可恢復；只有重新啟動 Typert 註冊表才會忘記歷史 strict definition。

支援取消的 Remote 簽名會接收 Connection 請求的 `AbortSignal`，因此 HTTP 斷連或 Client 側 abort 能在不進入 JSON 協定的情況下傳遞到正在進行的業務工作。取消仍是協作式的：沒有保留末位參數的方法會繼續執行；收到 signal 的方法必須將它傳給自身支援取消的操作，或自行觀測它。

lookup 設定目前以 key 為粒度，因此每個 `agent` 或 `session` 參數都採用同一套冷恢復策略。需要 live-only 語義的特定 Remote 必須等待顯式的逐參數或逐 endpoint 策略，不能靠業務實作猜測物件是否剛被恢復。
