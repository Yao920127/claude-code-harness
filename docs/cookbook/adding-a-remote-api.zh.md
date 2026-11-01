# 實操手冊：新增一個 Remote API

[English](adding-a-remote-api.md) | 中文

新增或改動一個 `ctx.remote` 端點按本頁五步走：宣告方法、宣告失敗、在包上註冊、在 Client 消費、寫測試。decorator 語義、lookup 解析、生成管線與 `/api` 路由屬於機制，由 [API Gateway 參考](../api-gateway.zh.md)負責；本頁給的是每一步的動作與必須遵守的約定。為什麼是這套程式設計面，見 [Typert Remote 方法呼叫 Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)；為什麼失敗面是單個 `RemoteError` 加一張碼錶，見[失敗詞彙 Agent Note](../../.agents/notes/implemented/architecture/2026-08-28-ctx-remote-failure-vocabulary.zh.md)。

## 1. 宣告 API

owner 是一個 Host 側 Cordis 服務：繼承 `TypertRemoteService` 把 service 鍵與 wire namespace 一起繫結，再用 `@Remote` 標註對外暴露的方法。業務方法的簽名若已符合 wire 約定就直接標註它本身；只有形態需要調整（補 `signal`、換參數順序、換匯出名）才寫一個 `remoteExport*` adapter，由它呼叫不改名的業務方法。lookup 物件（`Agent`、`Session`）只能佔頂層參數位，支援協作式取消的方法把 `signal: AbortSignal` 放在最後一位。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** One stored note as a Client reads it. */
export interface NoteRow {
  readonly noteId: string
  readonly title: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    notesController: NotesController
  }
}

export class NotesController extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'notesController', { namespace: 'notes' })
  }

  /**
   * @param agent - lookup parameter the Gateway resolves from its wire identity.
   * @param signal - carrier cancellation, always the final parameter.
   * @returns the notes this Agent's session owns.
   */
  @Remote('list')
  async remoteExportList(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    return await this.list(agent, signal)
  }

  /** The in-process API the adapter above delegates to, unchanged by it. */
  async list(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    signal.throwIfAborted()
    return await Promise.resolve([{ noteId: `${agent.id}-1`, title: 'draft' }])
  }
}
```

## 2. 宣告失敗

Remote 失敗只有一個類 `RemoteError`：域碼經 declaration merging 進 `RemoteErrorDetailsMap`，失敗點直接 `throw new RemoteError(code, message, details)`。不要建域異常類家族，也不要寫出口對映函式；與本端點無關的異常不預先歸類，Gateway 會後備折成 `gateway/internal`。只有"把任意 provider 異常歸為一個域碼"這一種情境才寫 `catch`，並把原始異常掛在 `cause` 上。

碼名是 `<域>/<理由>`，宣告落點四條：

- 只有一個生產者：宣告落生產者包，緊挨丟擲點。
- 多個包共同生產：落雙方共同依賴的最低層域包（`session/not-found` 在 `core/session`，`workspace/not-found` 在 `dsh-workspace`）。
- 載體碼 `gateway/bad-request`、`gateway/cancelled`、`gateway/internal` 已在 protocol 宣告，Gateway 基礎設施碼已在 gateway 宣告——直接用，不要複製。
- 不上 wire 的本地失敗不進碼錶，用呼叫方自己的型別表達。

```ts
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No stored note carries that id. */
    'note/not-found': { readonly noteId: string }
    /** The store refused an otherwise valid write. */
    'note/rejected': { readonly noteId: string }
  }
}

declare const stored: ReadonlyMap<string, string>
declare function persist(noteId: string, title: string): Promise<void>

export async function rename(noteId: string, title: string): Promise<void> {
  if (!stored.has(noteId)) {
    throw new RemoteError('note/not-found', `no note "${noteId}"`, { noteId })
  }
  try {
    await persist(noteId, title)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new RemoteError('note/rejected', message, { noteId }, { cause: error })
  }
}
```

## 3. 在包上註冊

`@Remote` 必須落在一個 Loader entry 外掛包裡；owner 是抽象 seam 時把控制器放進 `packages/api/` 下的對應包。包清單要補兩個生成入口與 protocol 的 peer 依賴，Client 側則由 `@deepseek-ai/dsh-api-remotes` 的 assembly 掛載該貢獻並按需轉口型別詞彙。兩個入口分別指向哪個生成產物、生成管線如何排序，見 [API Gateway 參考](../api-gateway.zh.md)。

```json
{
  "exports": {
    "./typert": { "types": "./lib/typert.host.d.ts", "default": "./lib/typert.host.js" },
    "./remote": { "types": "./lib/typert.remote-client.d.ts", "default": "./lib/typert.remote-client.js" }
  },
  "peerDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:*" },
  "devDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:*" }
}
```

改動了簽名、碼錶、namespace 或匯出名之後重跑 `pnpm run build:lib`，Client 才拿得到新的宣告與 codec；只改實作體不需要重新生成。

## 4. 在 Client 消費

呼叫外掛在 `inject` 裡同時宣告 `remote` 與 `remote.<namespace>`，呼叫點直寫 `ctx.remote.<namespace>.<method>(...)`：不要用 `Pick<ClientRemote, …>` 窄化、不要手寫方法簽名、不要造 wire 中轉物件。結果是 `RemoteResult<T>`，就地 `if (!result.ok)` 分支，判 `code` 而不是 `instanceof`——code 分支會自動窄化 `details`。異常流的站點寫 `throw result.error`（它是真 Error）；接住它的上層用 `isRemoteFailure` 區分 Remote 失敗與本地缺陷，本地缺陷繼續往上拋。不要寫防禦性 catch：Remote 呼叫不 reject，裝配錯誤就該炸。

Host 的固定事實讀 `ctx.remote.$host`：`home` 與 `isLoopback` 是普通值讀取，沒有訂閱也沒有 generation 計數器，`home` 在第一幀 ready 之前是 `undefined`；重連後的重新整理走 `ctx.on('connection/reset')` 或各域自己的 remote 事件。呼叫方 abort 掉一次一元呼叫時，結果落在錯誤分支上的 `gateway/cancelled`，而不是丟擲。

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import { isRemoteFailure } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.notes']

declare const ctx: Context

/** Store-side read: the error branch is handled where the code is meaningful. */
export async function noteTitles(): Promise<readonly string[]> {
  const result = await ctx.remote.notes.list()
  if (!result.ok) {
    if (result.error.code === 'note/not-found') return []
    throw result.error
  }
  return result.value.map(row => row.title)
}

/** Action-side: a Remote failure becomes copy; a local fault keeps crashing. */
export async function renderTitles(): Promise<string> {
  try {
    return (await noteTitles()).join(', ')
  } catch (error: unknown) {
    if (!isRemoteFailure(error)) throw error
    return `unavailable (${error.code})`
  }
}

/** Fixed Host facts as plain reads. */
export function hostLabel(): string {
  const { home, isLoopback } = ctx.remote.$host
  return home ?? (isLoopback ? 'local host' : 'remote host')
}
```

## 5. 測試

owner 側斷言丟擲的碼：捕捉後用 `remoteErrorOf` 取出失敗，再用 `toMatchObject` 比對 `code` 與需要的 `details` 欄位——不要用 `toEqual` 深比對錯誤物件，也不要斷言 `instanceof`。

```ts
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it } from 'vitest'

declare function rename(noteId: string, title: string): Promise<void>

it('refuses an unknown note before writing', async () => {
  const failure = await rename('n-404', 'fresh title').catch((error: unknown) => error)

  expect(remoteErrorOf(failure)).toMatchObject({
    code: 'note/not-found',
    details: { noteId: 'n-404' },
  })
})
```

Client 側的替身返回真實例：`RemoteError` 與 `TestRemote` 的值 import 一律取自 `@deepseek-ai/dsh-client-test-runtime`，因為從 `api-remotes` facade 值 import 會拉起尚未建置的裝配鏈。`TestRemote.$host` 是普通欄位，spec 直接賦值即可。

```ts ignore-check
import { Context } from '@deepseek-ai/cordis'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { expect, it } from 'vitest'

it('renders the failure code the Host reported', async () => {
  const ctx = new Context()
  const remote = new TestRemote(ctx, {
    notes: {
      list: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('note/not-found', 'no note "n-404"', { noteId: 'n-404' }),
      }),
    },
  })
  remote.$host = { home: '/home/fixture', isLoopback: true }

  await expect(ctx.remote.notes.list()).resolves.toMatchObject({ error: { code: 'note/not-found' } })
})
```

## 驗證

1. `pnpm run build:lib`：簽名、碼錶、namespace 或匯出名變過就必須重跑，Client 宣告與 codec 由它產出。
2. `pnpm run typecheck`：Host 與 Client 兩個 program 都過一遍，碼錶的 merge 落點錯了會在這裡紅。
3. 點名跑兩側 spec：`npx vitest run <owner spec> <client spec>`。
4. 端點屬於產品可見面時補一條錄製工作階段快照，規則見[測試策略](../testing.zh.md)。
