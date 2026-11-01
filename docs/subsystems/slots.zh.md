# Web Client Slots

[English](slots.md) | 中文

Slots 是 Web Client 的型別化 React 組合系統。[`dsh-client-ui-slots`](../../packages/client/ui-slots/README.zh.md)定義不依賴 React 的註冊表與型別代數；[`dsh-client-ui-renderer`](../../packages/client/ui-renderer/README.zh.md)把可觀測源繫結成掛鉤、渲染整棵樹，並在內部擁有 React context。功能外掛透過 `ctx.slots.register()` 貢獻 UI，絕不匯入其他功能外掛的元件。

本文記錄 slot 的所有權、元件輸入、擴充功能 API 與目前層級。外圍的啟動、Remote、Client model 與 Conversation 資料通路見 [Web Client 架構](web-client.zh.md)。

`plugins.bundle.config` 以 npm 包名為 key，提供 Bundle 詳情設定。`plugins.bundle.activation` 在使用者顯式啟用後渲染可選引導，由擁有者提供關閉引導和開啟該 Bundle 詳情的回呼。`conversation.input.activity` 提供模型選擇器與傳送按鈕之間的單個活動控制元件，可展開工具欄並在解除安裝時釋放展開狀態。

## 宣告與生命週期

`SlotMap` 是編譯期註冊表。包透過宣告合併寫入 key、cardinality（基數）、scope、owner props、keyed props 與可選的 slot 級 inject face。執行時宣告則是擁有該渲染位置的元件在 `children` 中給出的對應條目。

宣告一個 child 會同時產生三種效果：令該 child key 生效、授權 parent entry 呼叫 `renderSlot` 或 `renderSlotChain`，以及記錄執行時 dispatch 規格。每個宣告只能有一個存活 owner。向未宣告 slot 註冊，或重複宣告其他 entry 已擁有的 child，都會在外掛啟用時失敗。

`root` 是唯一內建宣告，也是唯一由 Cordis service 自身渲染的 key。`ui-renderer` 呼叫 `ctx.slots.renderSlot('root', {})`；其餘每個後代都透過宣告它的 entry 所收到的 `renderSlot` 或 `renderSlotChain` prop 渲染。

註冊和宣告遵循 Cordis effect 生命週期。銷燬一個 entry 會移除其貢獻，並遞迴摺疊它宣告的 child slots。因此，向其他包的 slot 貢獻功能時使用 `ctx.slots.inject(key, callback)`：callback 會在每段宣告生命週期內執行，owner 摺疊時其 effect 隨之移除，owner 再次掛載時則重新執行。

```tsx ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type HeaderActionProps = PropsRuntime<'conversation.session.header.actions'>

function HeaderAction({ useSession }: HeaderActionProps) {
  const running = useSession(snapshot => snapshot.running)
  return <button disabled={running}>Review</button>
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'review',
      order: 100,
    }, HeaderAction))
}
```

## Cardinality 與 scope

Slot 宣告固定兩個相互獨立的維度。

| 維度 | 值 | 含義 |
|---|---|---|
| cardinality | `single` | 單個 cell，渲染目前 priority 勝者；需要並列內容時應宣告 child slot，而不是把它當作列表。 |
| cardinality | `list` | cell 由必填 `id` 定址，先按 `order`、再按註冊順序排列。 |
| cardinality | `keyed` | owner 傳入 `entryKey`；匹配 cell 以該 key 對應的 props 渲染。 |
| cardinality | `chain` | 每個 entry 提供純 `select(owner)` 函式；按 priority 順序遇到的第一個非 null 結果獲選，並以 `matched` 傳給元件；全部拒絕時渲染 owner fallback。 |
| scope | `root` | 一個 root 作用域元件和 store 實例。 |
| scope | `session-maybe` | 繼承外圍 Provider binding，但沒有 binding 時仍可渲染；Session 值是可選的。 |
| scope | `session` | 要求可解析的外圍 Provider binding，並收到確定存在的 Session 值。 |

對於 `single`、`list` 和 `keyed` cell，`priority` 是遮蔽優先順序；對於 `chain`，它是選舉順序。數值越小越先執行或渲染。普通增量貢獻應選用新的 list `id` 或 keyed `key`；複用已有 cell 表示有意替換其展示。

## 元件輸入

註冊元件會在 binding 位置收到組裝後的輸入。元件應從這些型別推導 props，不要重新抄寫成員。

| 輸入 | 宣告者 | 元件型別 |
|---|---|---|
| owner 值與標準 scope 值 | `SlotMap` 條目與已安裝的 scope adapter | `PropsRuntime<K>` |
| 獲授權的 child renderer | 註冊項的 `children` keys | `PropsRenderSlots<S>` |
| 共享檢視狀態的 selector hook 與 mutation callback | 註冊項的 `store` | `PropsStore<H>` |
| 私有資料、callback 與 observable hook | 註冊項的 `inject` factory | `InjectFace<I>` |
| 在地化 `t` 函式 | 註冊項的 `locale` namespace | `PropsLocale<N>` |
| chain 選中的值 | 註冊項的 `select` 結果 | 透過 `ComposedProps` 提供的 `matched` |

當 entry 宣告 `session` 或 `session-maybe` child 時，`PropsRenderSlots` 還會提供 `SessionProvider`。不傳 `session` prop 時，它繼承外圍 binding；顯式傳入 `SessionReference` 或 `undefined` 時，只覆蓋該子樹。Provider 不為整個 body 設定 key。嚴格 `session` entry 在 binding generation 改變時重新掛載。空白 `session-maybe` entry 接受首個 binding 時不重新掛載，後續 generation 變化或回到缺失狀態時才重新掛載。

元件絕不會收到 `ctx`。父元件在某次渲染時已經知道的值透過 `renderSlot` 的 owner 參數進入；共享檢視狀態使用宣告的 store；service 與 model object 留在 `apply` closure 中，只向元件投影 callback 或 observable source。

## 框架提供的 hooks

目前組合中的 adapter 會新增以下標準 props。它們按目標 slot 的 scope 提供，與註冊元件來自哪個包無關。

| 可用範圍 | Props | Owner |
|---|---|---|
| 所有 scope | `useSessions`、`useSessionStatus`、`useSessionRetainInfo` | `ui-session` |
| 所有 scope | `useWorkspaces` | `ui-workspace` |
| 所有作用域 | `usePanelInfo` | `ui-layout` |
| `session` | `sessionId`、`useSession`、`useProjection` | `ui-session` |
| `session-maybe` | 結果可選的 `sessionId`、`useSession`、`useProjection` | `ui-session` |
| `session` | `useConversation`、`useInput`、`inputActions` | `ui-conversation` |
| `session-maybe` | 結果可選的 `useConversation`、`useInput`、`inputActions` | `ui-conversation` |
| `session` | `useChat` | `ui-chat` |
| `session` | `useTrajectory` | `ui-trajectory` |

Renderer 還會根據宣告的 store 建立 `useStore`，並根據宣告的 locale namespace 建立 `t`。這些是由註冊項推導的 props，不屬於全域標準 props。

框架與領域 adapter owner 可以透過 `ctx.slots.provideRoot()` 或 `ctx.uiSession.provide()` 擴充功能標準集合，同時提供對應的 `GlobalStandardProps`、`SessionStandardProps` 或 `SessionMaybeStandardProps` 宣告合併。普通功能元件不應自行建立 React hook prop，也不應為 entry 私有資料新增全域標準 prop。

## 開發者提供的 injection

註冊項的 `inject` 選項是通常使用的功能私有注入點。它的 factory 在外掛的 `apply` 世界中執行，可以閉包捕捉已經注入的 Cordis service，並且只返回元件所需的資料與 callback。對於 `session` slot，它會收到 `sessionId`；對於 `session-maybe`，它收到 `sessionId | undefined`；宣告 store 後，它還會收到該 store 繫結後的 actions。

回傳值中保留的 `hooks` 物件接收裸 `getSnapshot`／`subscribe` source。Renderer 把 `hooks: { status }` 轉換為元件 prop `useStatus(selector)`，並按 source identity 快取繫結。元件不會收到 source 本身，也不直接呼叫 `useSyncExternalStore`。

當每個 occupant 都需要同一種能力時，slot owner 可以在 child 宣告裡放置 `inject` face。普通成員會原樣交給所有 occupant；其 `hooks` 物件中的函式成員是 hook factory，它會收到 slot 的標準 props 與可選的逐次渲染 `hookContext`，再返回提供給 occupant 的受限 hook。`conversation.chat.node` 正是透過這種機制，為目前渲染的 node 提供 `useTurnData(key)`。

一次渲染時 owner 已知的值走 owner props；單個 entry 的 callback 與私有 observable 走註冊項 `inject`；由 slot owner 控制、所有 occupant 共享的能力走 slot 級 `inject`；需要跨 entry 共享或跨重新掛載保留的可變檢視狀態走宣告的 store。React node 透過 child slot 組合，不透過注入值傳遞。

## 目前層級

下圖是目前釋出組合的宣告樹。只有具名 parent entry 已掛載時，其 child 才存在；因此可選功能 entry 可以作為一個生命週期單元讓整棵子樹出現或消失。

```text
root
├─ sidebar
│  ├─ sidebar.brand.mark
│  ├─ sidebar.brand.name
│  ├─ sidebar.panellist
│  ├─ sidebar.footer.action
│  ├─ sidebar.workspaces
│  │  ├─ sidebar.workspaces.directoryFlow
│  │  ├─ sidebar.workspaces.session.menu.item
│  │  └─ sidebar.workspaces.session.row.action
│  └─ sidebar.settings
│     ├─ settings.trigger
│     ├─ settings.header
│     ├─ settings.action
│     ├─ settings.close
│     ├─ settings.onboarding
│     └─ settings.section
│        ├─ settings.general.item
│        ├─ settings.models.provider-card
│        ├─ settings.models.footer
│        └─ settings.plugins.tab
├─ main
│  ├─ plugins.item
│  ├─ plugins.bundle.config
│  ├─ plugins.row.config
│  ├─ plugins.detail.actions
│  ├─ plugins.detail.badge
│  ├─ plugins.detail.section
│  └─ main.conversation
│     ├─ conversation.session
│     │  └─ conversation.view
│     │     ├─ conversation.chat.node
│     │     │  ├─ conversation.chat.assistant-actions
│     │     │  ├─ conversation.chat.commandview
│     │     │  ├─ conversation.chat.turnTail
│     │     │  └─ tool.call.toolview
│     │     │     ├─ tool.call.images
│     │     │     └─ tool.view.cordis
│     │     ├─ conversation.message.images
│     │     └─ conversation.trajectory.images
│     ├─ conversation.header
│     │  ├─ conversation.header.leading
│     │  └─ conversation.session.header
│     │     ├─ conversation.session.header.lineage
│     │     ├─ conversation.session.header.actions
│     │     ├─ conversation.session.header.utilities
│     │     └─ conversation.session.header.corner
│     ├─ conversation.composer
│     │  ├─ conversation.approval.detail
│     │  └─ conversation.plan-review.actions
│     ├─ conversation.composer.bar
│     │  ├─ conversation.input.attachments
│     │  ├─ conversation.input.permission
│     │  ├─ conversation.input.plan
│     │  └─ conversation.input.model
│     ├─ conversation.input.overlay
│     ├─ conversation.input.dock
│     ├─ conversation.composer.dock
│     ├─ conversation.input.left
│     ├─ conversation.input.right
│     ├─ conversation.hero.brand.mark
│     ├─ conversation.hero.brand.headline
│     ├─ conversation.hero.workspace
│     │  └─ conversation.hero.workspace.directoryFlow
│     └─ conversation.hero.agentPreset
├─ rightbar
│  └─ rightbar.session
│     ├─ sidebar.right.pane.tab
│     │  ├─ sidebar.right.tab.guide
│     │  └─ sidebar.right.tab.guide.entry
│     ├─ sidebar.right.pane.tab.title
│     └─ sidebar.right.tab.menu.item
└─ shell.overlay
   └─ shell.quota-notice
```

生成的 Client inspect catalog 是每個 key 的完整參考，包含 cardinality、scope、owner props、標準 props、目前 occupant、宣告 owner 與替換風險。執行中的動態包可以用 `cordis_inspect what:"client"` 查詢即時樹與某個精確 key；原始碼 catalog 由 `pnpm run gen-client-catalog` 根據 `SlotMap` 宣告和 `slots.register()` 呼叫點生成。

## 擴充功能規則

- 另一個功能包只能透過 `import type` 引入宣告；絕不匯入或轉發它的執行時值。
- 只在擁有並渲染某個位置的元件中宣告新的 child slot。其他包透過 `ctx.slots.inject()` 等待，再透過 `ctx.slots.register()` 貢獻內容。
- 業務與傳輸狀態留在所屬 Cordis service 或 Client model 中。Slot store 只承載共享的檢視與互動狀態。
- 可觀測 source 及其 snapshot identity 在值變化前保持穩定；值變化時透過同一個 source 釋出。
- UI domain 之間只傳 JSON 相容資料和 callback。`hooks` compartment 是裸 observable 的唯一例外；React 內容透過 slot 傳遞。
- 將 `single` 和已有 occupant 的 keyed cell 視為替換點。增量擴充功能使用 list id 或尚未佔用的 key。
