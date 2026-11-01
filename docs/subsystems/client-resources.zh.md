# 用戶端資源

[English](client-resources.md) | 中文

用戶端資源模型把一個地址變成任何 Web Client 元件都能讀的活資料。[`dsh-client-resources`](../../packages/client/resources/README.zh.md) 提供 `ctx.resources` 服務與 `useResource` 全域標準 hook；擁有某類內容的包為它的**協定**註冊一個**提供者**，元件按**地址**讀取該內容的目前狀態，而無需引用擁有者的執行時。右側 Sidebar 的 tab 是這個模型的第一個消費方（[右側 Sidebar](sidebar-right.zh.md)）；決策記錄見 [用戶端資源模型 Agent Note](../../.agents/notes/implemented/architecture/2026-09-05-client-resource-model.zh.md)。

本頁是面向開發者的參考：地址怎麼寫、提供者怎麼註冊、資源怎麼讀、狀態與失敗各是什麼意思、模型怎樣持有與釋放一份資源。

## 地址

資源地址是 `dsh-resource://<type>/…` 形式的 URL。host 命名協定，必須是 `ResourceProtocolMap` 的鍵；路徑歸協定自己，由其擁有者逐段做百分號編碼。需要作用域的協定把作用域放進路徑：`file` 協定的地址形如 `dsh-resource://file/session/<sessionId>/<path>`，其中 path 可以相對工作區根，也可以是保留前導斜槓的絕對路徑，用 [`dsh-util-workspace-path`](../../packages/util/workspace-path/README.zh.md) 的 `fileAddressFor(sessionId, cwd, path)` 建構、`parseFileAddress(address)` 讀回。模型本身只讀 scheme 與 host：`protocolOf(address)` 對 `dsh-resource://` URL 返回小寫 host，對其它任何字串返回 `undefined`。其它 scheme 下的地址——Sidebar 的 `sidebar://guide`——不指向資源，讀作 `none`。

| 地址 | 協定鍵 | 讀作 |
|---|---|---|
| `dsh-resource://file/session/s1/notes/a.md` | `file` | 工作階段 `s1` 工作區根下 `notes/a.md` 的中繼資料（`file` 提供者已註冊時） |
| `dsh-resource://file/absolute/home/me/notes.md` | `file` | 可解析，但沒有授權 Session，以 `workspace-file/unknown-workspace` 失敗；不借用目前或 Tab Session |
| `DSH-RESOURCE://File/session/s1/a` | `file` | 另一份記錄：地址按字串比較，`openResource` 只接受 `fileAddressFor` 生成的規範小寫拼寫 |
| `dsh-resource://subagentchat/session/c1?parent=p1&mode=continuable` | `subagentchat` | 已定址的 subagent Conversation；其值持有一個 `SessionReference`，直到資源關閉 |
| `sidebar://guide` | — | `none`：導航地址 |
| `/home/me/notes.md` | — | `none`：不是 URL |

## 註冊提供者

協定擁有者在 `ResourceProtocolMap` 上宣告其值型別，並在自己的 `ctx.effect` 裡註冊一個提供者，使協定與外掛同壽（[提供協定](../../packages/client/resources/README.zh.md#provide-a-protocol)）。`open(address, { signal })` 返回一條 `RemoteResult` 幀流——首幀是目前狀態，之後每次變化一幀——並且必須在 `signal` 中止時停下。失敗是攜帶 `RemoteFailure` 的 `ok: false` 幀；流裡丟擲是程式設計錯誤，不會被捕捉。

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-resources/client'

interface NoteView { readonly title: string; readonly updatedAt: string }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { note: NoteView }
}

export const inject = ['resources', 'remote']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.resources.register<'note'>({
    protocol: 'note',
    async *open(address, { signal }): AsyncIterable<RemoteResult<NoteView>> {
      const id = new URL(address).pathname.slice(1)
      yield await ctx.remote.notes.read(id, signal)
      for await (const change of ctx.remote.notes.follow(id, signal)) yield change
    },
  }), 'my-notes: note resource provider')
}
```

一個協定恰有一個提供者；第二次註冊拋錯。註冊時若該協定的地址已被持有，則立刻開啟它們的流；提供者 dispose 時結束這些流，地址讀作 `none` 直到提供者回來。

## 讀取資源

每個 slot 元件不論作用域都在 props 上收到 `useResource`（[Slots](slots.zh.md)）。`useResource<P>(address)` 以型別參數命名協定，返回該地址的目前快照；訂閱就是持有資源的方式，另一個持有者讓資源存活時，新掛載的元件立刻讀到最新值而不重開流（[讀取資源](../../packages/client/resources/README.zh.md#read-a-resource)）。

| `status` | 含義 | `value` | `failure` |
|---|---|---|---|
| `none` | 地址的協定沒有註冊提供者，或地址不是資源地址 | `undefined` | `undefined` |
| `loading` | 提供者的流已開啟、尚未產出 | `undefined` | `undefined` |
| `live` | 最新一幀成功 | 最新的 `ok` 值 | `undefined` |
| `failed` | 最新一幀報告了失敗 | 保留的上一個 `ok` 值 | 該幀的 `RemoteFailure` |

```tsx ignore-check
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'

type Props = PropsRuntime<'sidebar.right.pane.tab'>

export function FileHeader({ useTabInfo, useResource, t }: Props) {
  const { tab } = useTabInfo()
  const meta = useResource<'file'>(tab.contentId)
  if (meta.status === 'failed') return <p role="alert">{t('failed', { code: meta.failure.code })}</p>
  return (
    <header>
      {tab.title}
    </header>
  )
}
```

`failed` 由消費方自己呈現：模型把最後一個值留在失敗旁，正文可以帶提示顯示舊內容而不是一片空白，下一個 `ok` 幀會清除失敗。模型本身不產生任何使用者可見文案。

## 持有與釋放

資源有持有者就存活：一個訂閱中的 `useResource`，或一次釘住。`ctx.resources.pin(address, signal)` 在不訂閱的情況下讓資源保持開啟直到 `signal` 中止，已中止的訊號什麼也不釘；右側 Sidebar 在每條開啟的 tab 記錄存續期內釘住其地址，因此切 tab 解除安裝正文不關流。第一個持有者開啟提供者的流；最後一個釋放時中止它、丟棄值，並把快照回到 `loading`（有提供者）或 `none`（沒有）。提供者在這次釋放之後產出的幀被丟棄，迭代器被歸還。`ctx.resources.source(address)` 是 hook 背後的裸 observable，按地址引用穩定，供 React 之外的呼叫方使用；只讀它的快照不算持有（[生命週期](../../packages/client/resources/README.zh.md#lifecycle)）。

多數流只推中繼資料而不推內容。`file` 提供者的值是 `WorkspaceFileStat { absolutePath, version, bytes? }`：首幀來自 Host 的 `stat`，後續觀察更新版本。消費方自己經 Workspace Files Remote 名稱空間讀取內容；Preview 按 tab 獨立重新整理（[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md)）。`subagentchat` 提供者保留已定址 Session 併產出其 `SessionReference`，在資源 signal 中止時釋放該 reference。

## 限制

記錄在頁面存續期內保留：地址的記錄在最後一個持有者離開後仍留著，不持有流也不持有值，因此記憶體隨讀過的不同地址數增長。忽略 `signal` 的提供者會一直跑到它的下一幀。失敗型別是 Remote 面的 `RemoteFailure`，來源不是 Remote 呼叫的提供者得自己鑄一個。拼錯的協定或畸形的地址讀作 `none`，沒有別的診斷。
