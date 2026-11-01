# Agent Note: Remote 事件投遞（ctx.remote.$on）

Status: implemented

[English](2026-08-10-remote-event-delivery.md) | 中文

## 問題

[Typert Remote 方法呼叫](../../implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)最初只覆蓋「一次請求一個結果」的定向呼叫，明確把 Session 事件流與有狀態互動留在別處；Host 向消費端的事件需要一個不歸 API Proxy 領域所有的投遞機制。

Host 擁有 `agent-preset/selected`、`commands/change`、`credentials/reference-updated`、`llm/adapters-updated`、`settings/document-updated` 等單向事件；它們既不依賴 AgentScope，載荷也本來就是 JSON。若每條事件都要穿過 API Proxy 手寫幀、Client Runtime 手寫橋和 Client 事件別名才能抵達 UI，這些層不會陳述 owner 事件之外的新事實。

那份重複宣告還是**有損**的：client 側寫成 `settings/changed(ns: string)`，brand 型別在這一跳被拍平成裸 `string`，與 Remote 方法側「消費端型別指向業務包唯一符號」的既有契約相反。

## 決策

消費端 Remote 面持有一個事件訂閱動詞 `ctx.remote.$on(event, listener)`；**名單驅動、原樣轉發**：

- `packages/api/remotes/src/remote-events.ts` 持有一份帶 `emit`／`waterfall` mode 的可轉發 Host 事件名單，它同時是「消費端能訂閱什麼」的唯一控制點。旁邊的 `src/types.ts` 由它派生型別投影並填充 selection 座位，按包約定保持純型別。兩個檔案**都同時列進本包 Host 與 Client 兩個 face 的 `files`**，兩側讀同一份。
- wire 上的事件名 **就是 host cordis 事件原名**（`settings/document-updated`），不加 `host/` 字首；載荷 **就是 host 的實參列表**，逐元素原樣過 JSON，無投影、無脫敏、無改名。
- Host source 由 `api/remotes` 註冊到 API Gateway；Gateway 在既有 `/api/remote.mux` 上保留內部 logical endpoint `$events`，不增加物理連線，也不讓 API Proxy 解釋事件。waterfall 結果透過 HTTP 一元 endpoint `$events/result` 返回。
- 事件**簽名**不另立表：owner 包把自己的 cordis `Events` 宣告搬進 client-safe 的 `./types` 純型別出口，兩側讀**同一份**——`$on` 的 listener 參數、結果和 `next()` 都由 `Events[Event]` 推導。「原樣」不需要證明，是建構性成立的。
- 但**只借 cordis 的型別形狀，不接 cordis 的事件系統**：投遞語義、註冊表、異常處置全歸 Typert 自己。

一條 `Events` 條目若簽名裡夠到了 host-only 符號（Service、`Agent`、Context 等），處理方式是**把程式碼拆到能幹淨落進 `./types` 為止**；不接受「一半留 index、一半搬走」的分裂宣告，也不接受在 `./types` 裡造結構等價的影子型別。目前名單內各 owner 都從 client-safe 型別出口提供同一份事件宣告。

名單內事件全部走這條路徑，專用幀與 Client 別名都已刪除。模型消費方直接訂閱 `llm/adapters-updated` 和 `settings/document-updated`；preset 消費方訂閱 `agent-preset/selected`；Session 與動態 Cordis 的無狀態通知使用 `emit`；Approval 與 Question 使用 Agent-scoped `waterfall`。真正需要 baseline、投影或去重的資料仍保留專用 Remote stream。

`skills/change`、`tools/change`、`system-prompt/change` 是同形狀的純失效事件但**沒有任何已交付消費者**，按「每個抽象都要有目前 owner 與需求」不進名單，只作為擴充功能位記錄在此。

### 消費端契約（dsh-typert-protocol）

type-meta 加事件形狀謂詞、mode 條目、選擇座位和 `TypertClientRemote` 的一個成員；零執行時程式碼：

```ts ignore-check
import type { Events } from '@deepseek-ai/cordis'

type TypertForwardingMode<Event extends keyof Events> =
  unknown extends ThisParameterType<Events[Event]>
    ? TypertEventResult<Event> extends void ? 'emit' : never
    : TypertWaterfallEvent<Event> extends never ? never : 'waterfall'

/** Cordis event names that can cross the Remote Event carrier without a second signature. */
export type TypertForwardableEvent = {
  [Event in keyof Events]: TypertForwardingMode<Event> extends never ? never : Event
}[keyof Events]

/** Event and dispatch mode accepted by the Remote Event source. */
export type TypertForwardableEventEntry = {
  [Event in keyof Events]: TypertForwardingMode<Event> extends infer Mode
    ? Mode extends 'emit' | 'waterfall'
      ? { readonly event: Event; readonly mode: Mode }
      : never
    : never
}[keyof Events]

/** The Host assembly's forwarding selection; api/remotes' allowlist fills it, no other package does. */
export interface TypertRemoteEventSelection {}

/** `$on`'s legal keys: selected, and present in the current compilation face. */
export type TypertRemoteEvent = Extract<keyof Events, keyof TypertRemoteEventSelection>
```

```ts ignore-check
/** Subscribe to one forwarded Host event; the returned disposer belongs to the calling fiber. */
$on<Event extends TypertRemoteEvent>(event: Event, listener: TypertClientEventListener<Event>): () => void
```

`Events` 按程式解析：host 程式裡是 host 事件全集，client 程式裡是 client 編譯面看得見的那些——同一個謂詞在兩側各自成立，不需要把 host 宣告拖進 client。

**契約只公開消費動詞。**`ClientRemoteService` 啟用時就把內部唯一的 `$events` pump 註冊為 Connection generation source，與目前有無 `$on` 訂閱無關；瀏覽器透過共享 Remote mux 開啟 `$events`，程序內組合透過 `connection.rpc.open` 開啟同一 logical stream。解碼、精確 item 總和檢查碼訂閱表派發都是 Gateway Client 的私有實作，`TypertClientRemote` 不暴露生產方方法，因此業務外掛不能偽造一條 Host 事件。

每次 Host 開啟 `$events` 時，API Remotes source factory 先同步掛載所有 allowlist listener，Gateway 隨後產出首項 `{ type: 'ready', clientId, host: { home } }`，再開始迭代事件 source。`ConnectionController` 只有在該項到達後才釋出 `connected`，因此 baseline 讀取不會跑在增量 listener 前面。

物理 mux 斷開會讓 logical stream 以 `RemoteStreamCarrierError` 結束；Host 返回的 Remote stream error、意外正常結束、非 ready 首項或畸形事件項也會結束目前 generation。Connection 撤回該 generation，在退避後重開 `$events`；Gateway mux 只負責重建物理 WebSocket。轉發事件不重放；凡正確性依賴恢復的狀態，owner 必須另有查詢、cursor 或 opening baseline，不能把 `$on` 當作可靠日誌。

Client 以 Remote 實例私有 Cordis key 分發。普通 `emit` 使用 `parallel()` 並隔離 listener 失敗；Agent-scoped `waterfall` 在解析出的 Agent Context 上使用 `waterfall()`，允許結果、拒絕或 `next()` 委託。兩類註冊都歸屬呼叫方 fiber，且 Host 事件不會觸發 Client 本地同名事件。

### 名單：兩個 face 共讀的同一份宣告

`packages/api/remotes/src/remote-events.ts` 同時列進 `tsconfig.host.json` 與 `tsconfig.client.json` 的 `files`，是名單的**唯一家**；`src/types.ts` 由它派生型別面：

```ts ignore-check
// remote-events.ts — the value
export const API_REMOTE_FORWARDED_EVENTS = [
  { event: 'agent-preset/selected', mode: 'emit' },
  { event: 'approval/request', mode: 'waterfall' },
  ...SESSION_CONTROLLER_REMOTE_EVENTS.map(event => ({ event, mode: 'emit' as const })),
  { event: 'commands/change', mode: 'emit' },
  { event: 'credentials/reference-updated', mode: 'emit' },
  { event: 'cordis/request-run', mode: 'emit' },
  { event: 'cordis/request-run-resolved', mode: 'emit' },
  { event: 'cordis/dynamic-package', mode: 'emit' },
  { event: 'cordis/dynamic-retract', mode: 'emit' },
  { event: 'cordis/inspect-query', mode: 'emit' },
  { event: 'cordis/inspect-query-resolved', mode: 'emit' },
  { event: 'llm/adapters-updated', mode: 'emit' },
  { event: 'settings/document-updated', mode: 'emit' },
  { event: 'user-questions/request', mode: 'waterfall' },
] as const satisfies readonly TypertForwardableEventEntry[]

// types.ts — the type face, derived
export type ApiRemoteForwardedEvent = typeof API_REMOTE_FORWARDED_EVENTS[number]['event']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends Record<ApiRemoteForwardedEvent, true> {}
}
```

於是**加一個事件只改這一行陣列**：型別投影、`$on` 的鍵面、Host dispatch mode 與轉發迴圈全部從它派生。`ctx.remote.$on('slots/changed', …)`（Client 本地事件）或 `$on('skills/change', …)`（名單沒開）都是**編譯錯誤**。

陣列宣告末尾的 `satisfies` 把 Host 事件詞彙與 mode 約束落到同一份名單上：

```ts ignore-check
API_REMOTE_FORWARDED_EVENTS satisfies readonly TypertForwardableEventEntry[]
```

它卡住三件事：**名字合法**（謂詞以 `keyof Events` 為基）、**mode 匹配簽名**，以及只接受無 scope 的 `void` 通知或帶一級 Agent scope、同結果 `next()` 和 Promise 返回的 waterfall。其他 Scope、bail、parallel 與 serial 形狀都被排除。

**「原樣」不在任何地方證明，而是建構性成立**：`$on` 的 listener 型別取自 owner 包 `./types` 裡那一份 cordis `Events` 宣告，host 轉發讀的是同一份，不存在可以彼此偏離的第二份宣告。

載荷 JSON-safe 交給執行時：`api/remotes` 的 Host source 在入隊前用 `dsh-session` 的 `isJsonValue` 逐元素驗證，不合格**拋錯 fail loud**（這是名單設定錯誤，不是外部輸入）。

### 線協定（API Gateway Remote mux）

```ts ignore-check
ready     { type, clientId }
emit      { type, event, args }
waterfall { type, event, eventId, agentId, request }
cancel    { type, eventId }
```

Client 以 endpoint `$events` 和 payload `{ args: {} }` 開啟 internal logical stream。Gateway 拒絕額外參數、缺失 Host source 和重複 source 註冊；source 被撤回時會中止所有由該註冊開啟的 stream。每個 Client stream 在 `api/remotes` 中擁有獨立佇列與一組 allowlist listener，因此一個 Client 斷開不會消費或撤銷另一個 Client 的事件。

Client 要求首項是帶非空 `clientId` 與 `host.home` 的 `ready`；後續 item 按 discriminant 精確驗證欄位。ready 項建立 Connection generation，並提供穩定的 Host 路徑顯示資訊。普通 `emit` 的未知但結構合法事件名在沒有訂閱者時靜默丟棄。waterfall 透過 `eventId` 關聯 `$events/result`，並由 `agentId` 選擇 Client Agent Context；Client 只回傳可無損表示為 JSON 的結果，不在 transport 層重複解釋業務欄位。

`$events` 是 Gateway 內部 endpoint，不進入生成的 Typert Remote descriptor，也不成為 `ctx.remote.<namespace>`。應用選擇仍只存在於 `api/remotes` 的 allowlist 和 Host source；Gateway 只擁有註冊、payload 驗證與物理傳輸。

### apps/web 的 browser e2e 屬於 Host 面

`apps/web/tests/**` 那批 e2e 在**根 `tsconfig.host.json`** 做型別檢查：它們在程序內起真 harness、直接存取 `ctx.connection`、Host `SessionStore.get/create/flush` 與 `ctx.sessionProjectionCache`。**執行時用瀏覽器 ≠ 型別上屬於 Client 程式**——把它們搬進 Client 聚合會報錯，因為一個 program 裝不下兩個 face 對同一個 Context key 的合併。

由此得到一條對本設計要緊的連帶紀律：**這些測試從用戶端包 import 值或型別，會把該包的整個 project——以及它引用的每個 project——拖進 Host 建置圖**。`ui-settings-general`/`ui-settings-models`/`ui-permission`/`ui-commands` 四個消費者 references `api/remotes` 的 client face，而該 face 必須等 host tsdown 生成 `@deepseek-ai/dsh-goal/remote` 才能編譯，於是形成建置期死鎖：host tsc → api/remotes client face → `goal/remote` → host tsdown → 排在 host tsc 之後。

所需的用戶端符號在測試側**映像**了一份（`scaffold.ts` 匯出映像後的 welcome-notice 常數，兩個 chat e2e 直接引 `dsh-client-runtime/client` 因為 `runtime` 工程本來就在 host 圖裡），從而讓那 4 個消費者離開了 host 圖；`apps/cli/tsconfig.json` 裡 15 條 client 工程引用隨之失去 owner-map 職責，已一併刪除。映像值與源逐字一致，漂移的表現是選擇器失配或通知未被抑制，都是響亮失敗。

### 改動清單

| 位置 | 改動 |
|---|---|
| `dsh-typert-protocol` | `src/types.ts` 提供 forwardable mode 推導、selection 與 Client listener 投影；`TypertClientRemote` 只公開 `$on`。純型別，零執行時 |
| `api/gateway` | Host 半提供唯一 Remote event source、`$events` stream、pending waterfall 協調和 `$events/result`；Client 半把私有 pump 註冊為 Connection generation source，負責 frame 總和檢查碼 Cordis 分發 |
| `api/remotes` | `src/remote-events.ts`（帶 mode 的名單值）與 `src/types.ts`（鍵投影 + selection）雙列進兩個 face；Host 半註冊每 Client source，並在入隊前驗證 JSON；Client 半繼續組合生成的 Remote contribution |
| 根 `tsconfig.base.json` | 加 `dsh-settings/types`、`dsh-credentials/types`、`dsh-api-remotes/types` 三條 `paths`，全部指向**源**平面 |
| `dsh-commands` / `dsh-settings` / `dsh-credentials` | `interface Events` 子塊移入各自 client-safe 的 `./types`（settings/credentials 新建該出口，brand 與純型別一併移入，index 繼續 re-export 並留住建構器；`files` 補 `lib/types/**/*.js`） |
| `dsh-session` | `isJsonValue` 供 `api/remotes` Host source 驗證每個事件參數 |
| `client/runtime` | 刪除 Host frame 到 Remote subscription table 的橋；只繼續在 Connection generation 建立後釋出 `connection/reset` |
| 消費方 | Client 外掛直接訂閱 `ctx.remote.$on(...)`，type-only 引入 owner 事件宣告並把 `'remote'` 加進 `inject` |
| `client/connection` | 提供唯一 generation source 註冊位；`ConnectionController` 釋出 `$events` ready 攜帶的 Host 資訊，fixture 也從同一 source 產生事件 |
| `apps/web/tests` + `apps/cli` | 用戶端符號映像（見上節）；`apps/cli/tsconfig.json` 刪 15 條 client 工程引用 |

## 備選方案

**繼續寄生 API Proxy 的 Host downlink。**這樣可以複用 Connection generation 和 `connection/reset`，但會讓 API Proxy 保留 Remote 事件 allowlist、佇列、schema 和 Client Runtime bridge，領域傳輸也無法隨其他 Remote stream 共用生命週期。API Gateway 已有常駐 `/api/remote.mux` 後，`$events` 只增加一個 internal logical stream，不需要第三條 WebSocket，因此轉移到 Gateway 的成本和所有權都更合理。

**給 Remote 事件另開第三條物理 WebSocket 或 duplex stream。**獨立通道能擁有自己的連線狀態，但會重複 Gateway mux 已經提供的認證升級、複用、取消、錯誤對映和退避重連。內部 `$events` endpoint 保留獨立 logical stream，waterfall 結果複用 HTTP 一元呼叫。

**在 type-meta 立一張獨立的 `TypertRemoteEventMap`，讓 owner 包 declare-merge 進去**。消費端鍵集會精確等於「被宣告為可遠端投遞的事件」；代價是每條事件的簽名要在 cordis `Events` 之外**再寫一遍**，於是需要一條雙向 `extends` 的等價性證明來防漂移，還要給三個 owner 包新增 type-meta 依賴。共用同一份 `Events` 宣告讓等價性變成建構性成立，這張表因此不立。

**讓 typert generator 從 host `Events` 宣告生成事件投影**（codec + `.d.ts` + 宣告對映，與 `/remote` 同族）。generator 已經在分析 host 事件；但它拿不到投影與脫敏語義，且要動生成器與建置面。原樣轉發這條路本就不需要投影。

**給可轉發事件載入荷投影函式**（`{ 事件名, 投影, zod }` 轉發表）。能一舉覆蓋 `models-changed` 的 fan-in 與 workspace 的 view 派生；代價是投影邏輯與載荷型別手工對齊，回到方法側剛剛消滅的中心表形態。

**把 apps/web 的 browser e2e 搬進 client 聚合**。看似「用戶端測試歸用戶端面」，實測立刻 21 條錯：它們用 host 服務，而 client 程式裡 `ctx.sessions` 是 `ISessions`。已否。

**給 `directory-picker-browse`/`-native` 做 host/client 雙 face 切分**，從根上讓用戶端包不進 host 圖。方向正確（它們確實是未切分的雙半包），但改動落在別人屬地，而收益只是「建置圖更乾淨」——本設計在測試側映像用戶端符號之後已經不需要它。**已評估不做**。

## 驗證

釘住該行為的東西：

- Host source 真組合測試：兩個 Client stream 各自收到 host emit 的 `{ event, args }`，其中一個斷開不會影響另一個；非 JSON 實參會響亮拒絕且不會毒化後續合法事件。
- 型別層負例拒絕未選擇事件、非 `void` 的無 scope 事件、非 Agent-scoped waterfall，以及宣告 mode 與簽名不符的條目。`$on('slots/changed', …)`（Client 本地事件）與 `$on('skills/change', …)`（已宣告但未選中）都編譯失敗——因此 `$on` 的鍵面恰好等於名單。
- 消費端 `$on('settings/document-updated', …)` 把 `ns` 解析為 `SettingsNamespace`：brand 穿過 wire 存活。
- `$on` 的 disposer 歸屬呼叫方 fiber；同一個函式物件訂閱兩次時兩條註冊各自獨立退訂——按 listener 身份做鍵的表會把它們合併，所以訂閱按註冊項定址。
- 普通通知同時收容丟擲的 listener 與拒絕所返回 Promise 的 listener；waterfall 測試固定 Client result、`next()`、拒絕、取消、多 Client 首個 claim 和重連重放 pending request。
- Gateway 測試覆蓋 source 缺失、重複註冊、撤銷中止、payload 拒絕、ready 先於事件，以及瀏覽器與程序內兩種 carrier；Client 測試覆蓋 generation source 註冊邊界、描述與增量就緒順序、物理失敗後重開、Host 錯誤與意外結束、非 ready 首項、畸形事件項、`$events/result` 失敗和 dispose quiescence。
- `host/remote-event`、公開 `$dispatch`、Client Runtime bridge 和 API Proxy 的 allowlist 依賴都不存在；各消費方直接觀察 owner 事件。

## 後果

- **Gateway 有一個非生成 endpoint**：`$events` 不對應業務 namespace，也不進入 Typert descriptor；它是 Gateway 與 `api/remotes` 之間的內部連線點，同時定義 Client Connection generation 的存活期。嚴格的空 payload 驗證、opening ready 總和檢查碼單 source 註冊限制它不會演化成第二個手寫業務 API。
- **兩個檔案打破了 api/remotes 的 face 互斥約定**：`src/remote-events.ts` 與 `src/types.ts` 同屬兩個工程，各自向共享的 `lib/types` 發射一份相同宣告。內容逐位元組相同、`.tsbuildinfo` 各自獨立，實踐上無害；README 的建置邊界節陳述了這個例外及其成因（`paths` 指向原始碼面）。
- **生產方保持私有**：業務外掛只能呼叫 `$on`；Host source 註冊和 Client 派發都不在 `TypertClientRemote` 上暴露，測試 double 以自己的 `emit` 方法驅動訂閱，不偽裝成生產介面。
- **畸形實參在 emit 點失敗**：`api/remotes` listener 在入隊前丟擲，因此呼叫 Host `ctx.emit` 的操作立即看到名單設定錯誤；佇列仍可繼續投遞後續合法事件。
- **測試側映像值可能漂移**：沒有任何機制核對 `apps/web/tests` 中映像的 client 常數與其源；安全網只是漂移會讓選擇器失配。規則寫在 `apps/web/tests/README.md`，由 review 守；grep 級門禁經評估後刻意不做。
- **放棄的能力**：不支援投影或脫敏載荷，不支援 Agent 以外的 Scope，也不為普通通知提供重放。需要可靠恢復的狀態必須擁有查詢、cursor 或 opening baseline；waterfall 只重放仍處於同一次 Host 呼叫生命週期內的 pending request。
- **仍有 client 包留在 host 圖裡**：12 個工程（`connection`、`runtime`、`ui-slots` 等）經未拆分的 `directory-picker-browse`/`-native` 與 `api/gateway → client/connection` 仍可達 host 圖。它們都能編譯且不再牽連 api/remotes 的 client face，因此沒有阻塞本次改動；拆分那些包能減少幾個，但經評估後不做。兩個 chat e2e 直接引 `dsh-client-runtime/client` 依賴 `runtime` 本來就在圖裡——屬偶然而非保證。
- **本包不釋出 invariant companion**：早先的修訂曾在活事件匯流排上斷言投遞形狀（`thisArg === null`、`mode === 'emit'`），這讓診斷邏輯與名單值耦合，並使 rolldown 把它提成第三個 bundle chunk——而機械推導的釋出檔案清單並不攜帶它。Host 面的 `TypertForwardableEventEntry` 斷言已在編譯期拒絕這些偏離，包 README 也記錄了不再存在獨立執行時關係的原因。

## 相關

- [Remote 雙工流](2026-09-19-remote-duplex-stream.zh.md)：所有 Remote 流在同一邏輯流上承載用戶端上行；其「後續」列出的雙工 `$events` 落實後取代 unary `$events/result` 路徑。
