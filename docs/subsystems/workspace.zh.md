# 工作區

[English](workspace.md) | 中文

工作區（workspace）是使用者工作目錄的持久記錄：一個建立在規範路徑之上的穩定 id、一個顯示標題，以及歸屬於它的工作階段的有序帳本。該子系統是單個包（package）（[dsh-workspace](../../packages/workspace/workspace)，`ctx.workspaceRegistry`）——一項主機側可選能力，不屬於 agent loop（智慧代理迴圈）主幹，並且對模型不可見（沒有工具、沒有提示詞文字、沒有工作階段事件）。它透過[儲存領域資料形式](storage.zh.md)儲存自己的記錄，並對照 [`SessionHeader.cwd`](persistence.zh.md#sessionheader--metadata-beside-the-log) 驗證工作階段成員資格，因此 `storageDomain` 與 `sessionPersistence` 是必需的啟動依賴：持久化這一依賴不可用時，外掛保持 pending，而不是把這種不可用誤當作空歷史。設計記錄：[領域 KV 儲存 Agent Note（agent 決策記錄）](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)；引導與 GUI 順序：[Workspace UI 產品流程 Agent Note](../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md)。

原始碼：[`packages/workspace/workspace/src/types.ts`](../../packages/workspace/workspace/src/types.ts)

## 標識

```ts type-equiv
/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
type WorkspaceId = Branded<'WorkspaceId'>
```

`WorkspaceId` 是[品牌化 id](core.zh.md#branded-ids)。路徑標識與之分離：`realpathNormalize`（`fs.realpath`；尾部斜槓、`..` 與符號連結全部解析）是唯一的一套唯一性規範——工作區路徑以規範化形式儲存，唯一性即規範路徑的字串相等（指向已被擁有目錄的符號連結會與之衝突），attach 時的工作階段 cwd 檢查也走同一套規範。

## 工作區實體

消費方只看到 `Workspace` 介面；實作保持包內私有。

```ts type-equiv
/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered candidate account of sessions. Membership requires both an id in
 * that account and a session header whose canonical cwd equals the workspace
 * path. Consumers only see this interface; the implementation stays private.
 */
interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to the final path segment, or a filesystem root's own spelling; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Header-validated sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The durable candidate
   * account is filtered synchronously: missing headers, invalid cwd values,
   * and canonical cwd mismatches are never returned. A subsequent workspace
   * mutation prunes those filtered candidates durably.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. An already
   * accounted id resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs. A new id's
   * live or persisted
   * header cwd must resolve to an existing directory equal to {@link path};
   * unknown ids, missing or invalid cwd values, and mismatches reject without
   * writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs; decided on
   * the domain write chain like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}
```

所有權的真源是記錄中有序的 `sessionIds`，絕不從工作階段 cwd 派生——但成員資格要求兩者同時成立：帳本上有其 id，且 header 的規範 cwd 等於工作區路徑，因此一個工作階段在結構上至多屬於一個工作區。失敗的寫入會拒絕（`insertSessionBefore` 的帳本錯誤以 `WorkspaceMoveInvalidError` 拒絕，儲存失敗以普通錯誤拒絕）；每次被接受的變更都蓋上 `updatedAt` 時間戳，並持久修剪不再透過成員資格檢查的候選項。

## 註冊表：`ctx.workspaceRegistry`

`WorkspaceRegistry`（[簽名](#ctxworkspaceregistry--workspaceregistry)）擁有註冊與解析。`create(path, title?)` 要求完全限定路徑並將其規範化，拒絕不存在的路徑（原樣傳出原始 `ENOENT`）或非目錄；當規範路徑已被擁有時原樣返回既有實體；否則建立一條標題為 `title ?? defaultWorkspaceTitle(path)` 的記錄並前插到持久的註冊表順序中（不同規範路徑可以共享同一顯示標題，沒有最終路徑段時使用根路徑拼寫）。`get(id)` 與有序的 `list()` 是同步快取讀取；`resolveByPath(path)` 應用同一套完全限定 realpath 規範但不建立。`delete(id)` 只移除註冊記錄、順序條目和工作階段帳本——目錄、使用者檔案、即時工作階段和已持久化日誌一概不動，因此這些工作階段變為 Ungrouped（[決策](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)）；未知 id 返回 `false`。create 與 delete 會在其兩次寫入（記錄 + 順序）可能分叉之前先持久寫入一個待定變更標記；啟動時恰好解決被標記的那次變更——透過刪除被標記的錶行：這會補完被中斷的 delete，並復原被中斷的 create（註冊可以重建，因此復原是安全方向）——而沒有標記的順序/表不一致則作為損壞大聲失敗。

工作階段的 cwd 在建立時由建立者賦予，而不是由本註冊表賦予——API 閘道從所選工作區的 `path` 解析新工作階段的 cwd（退回到顯式或預設 cwd），先建立工作階段使 cwd 落入其不可變的 [`SessionHeader`](persistence.zh.md#sessionheader--metadata-beside-the-log)，再呼叫 `attachSession`，後者會把已儲存的 header cwd 與工作區路徑重新驗證一遍。首次成功啟動時，註冊表僅憑已持久化的 header（`id`、`cwd`、`createdAt`——絕不讀事件正文）引導歷史：把規範 cwd 有效的工作階段按目錄分組為工作區，最新的排在最前；「已初始化」標記最後寫入，因此被中斷的引導可以安全續跑。引導只發生這一次：沒有 cwd 的歷史遺留工作階段保持 Ungrouped，此後建立的工作階段只能透過 `attachSession` 加入工作區。

## 預設工作區初始化

控制器的 `initializeDefault` 不接受請求參數：它擁有固定目錄名 `default-workspace`，解析設定的位置，並請求註冊表確保預設工作區位於該處，位置改變時將其遷移過去。註冊表接收目錄解析器，以所請求目錄（而非規範路徑）的最後一段作為初始標題，並將登記與持久化身份一起提交。語言不會傳到 Host——瀏覽器消費方透過控制器的 `workspaceDisplayTitle` 為仍保留該自動標題的工作區加標籤，因此只有螢幕上的名稱跟隨讀者語言。[首次使用行為與設定](../../packages/api/workspace-controller/README.zh.md#first-use-workspace)說明覆用和失敗處理。

## 工作階段置頂

控制器的[傳輸型別](../../packages/api/workspace-controller/src/types.ts)定義了 `WorkspacePinSessionRequest` 和 `WorkspaceUnpinSessionRequest`，兩者都攜帶一個 `sessionId`。兩個操作都返回 `WorkspacePinValue`：完整的工作階段 id 陣列 `pinnedSessionIds`，最近置頂的工作階段排在前面。置頂要求工作階段已知且未歸檔；對未置頂的 id 取消置頂會成功，且不改變集合。歸檔在同一次持久化寫入中移除該工作階段的置頂，取消歸檔不會恢復置頂。

## 歸檔准入

歸檔是一個註冊表全域的持久化集合，註冊表拒絕把正在執行的工作藏在它後面。這條規則是本包宣告並派發的兩個主機事件之上的能力接縫（[事件](#workspace-events)）：`workspace/session-activity`（waterfall）向已組合的提供者詢問某工作階段還有什麼在跑，`workspace/session-stop`（parallel）請它們停止這些工作。每個提供者像任何監聽器一樣在根上註冊，因此本包不認識 agent、job 或 schedule 的詞彙；各族是一個可合併擴充功能的 map 的鍵。

```ts type-equiv
/**
 * Activity families a `workspace/session-activity` listener may report. This
 * package declares none: each provider merges its own key from a module both
 * its Host and Client faces import, so a consumer that renders the families
 * sees exactly the keys its program compiled and falls through to a generic
 * description for any other. The shipped providers merge `turn` (the Agent
 * registry), `job` (the job registry seam), `subagent` (the Subagent
 * runtime), and `schedule` (the Schedule plugin).
 */
interface SessionActivityKindMap {}
```

`SessionActivityKind` 即 `keyof SessionActivityKindMap`，因此一個沒有編譯任何提供者的程式看不到任何鍵。隨附的鍵放在各自 client 可匯入的型別模組裡：`turn` 在 Agent 註冊表的 `types.ts`，`job` 在任務註冊表接縫的 `view.ts`，`subagent` 在 Subagent runtime 的 `control-types.ts`，`schedule` 在 Schedule 外掛的 `types.ts`；渲染各族的消費方為其分支匯入這些模組，併為其他任何鍵保留一條通用文案。提供者透過把自己的 `SessionActivity` 條目前置到 `next()` 的結果來回答 waterfall；註冊表最內層的回呼返回空列表，因此沒有提供者的組合可自由歸檔。

```ts type-equiv
/**
 * One reason a session counts as active for archive admission. Families with
 * per-item identity list their items so a caller can name what must stop.
 */
interface SessionActivity {
  readonly kind: SessionActivityKind
  /** Active items of the family; absent for a family without per-item identity (`turn`). */
  readonly items?: readonly SessionActivityItem[]
}
```

`SessionActivityItem` 攜帶各族自己的 `id`（工作階段、任務或提醒 id）和可選的展示 `label`。`archiveSession(sessionId)` 在存在性檢查之後只詢問 waterfall 一次，對非空答案以 `WorkspaceActiveSessionError`（`sessionId`、`activity`）拒絕且不寫入；控制器把它對映為 `workspace/session-active` 錯誤，其 details 攜帶同樣的兩個欄位。`archiveSession(sessionId, { stopActivity: true })`——`ArchiveSessionOptions` 的這個欄位由傳輸請求以 `stopActivity` 暴露——跳過檢查、先寫入歸檔、再派發 `workspace/session-stop`；提供者拋錯只記日誌，歸檔保留，被停止的工作從不等待收斂。已歸檔的 id 既不詢問也不停止。隨附的提供者、它們停止什麼，以及讓已歸檔工作階段不跑模型步的 `agent/pre-step` 門禁，記錄在[註冊表包](../../packages/workspace/workspace/README.zh.md#api-behavior)；決策記錄見 [archive-stops-running-work Agent Note](../../.agents/notes/implemented/feature/2026-09-21-archive-stops-running-session-work.zh.md)。

## 消費方

[`dsh-workspace-controller`](../../packages/api/workspace-controller) 經 `ctx.workspaceRegistry` 向 GUI 用戶端提供工作區 CRUD，[`dsh-session-controller`](../../packages/api/session-controller) 執行上文「先建工作階段再 attach」的流程。[dsh-agent-instructions](../../packages/context/agent-instructions) 儘管名字如此，卻**不是**消費方：它在 agent 自己的 cwd 下發現 AGENTS.md 風格的指令檔案，從不觸碰 `ctx.workspaceRegistry`——兩者共用的這個詞指的是使用者的工作目錄，而非本註冊表的實體。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdirectorypicker--directorypicker-abstract-seam"></a>

### `ctx.directoryPicker` — `DirectoryPicker` (abstract seam)

Abstract directory-picking service. Subclass, implement `capability()`, and load the subclass as a plugin — it registers as `ctx.directoryPicker` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior). The capability object must be stable for the service lifetime: consumers may capture it across calls.

```ts cordis-catalog
/**
 * The backend's interaction capability.
 * @returns the discriminated capability consumers switch on.
 */
abstract capability(): DirectoryPickerCapability
```

Source: [`packages/host/directory-picker/src/index.ts`](../../packages/host/directory-picker/src/index.ts)

<a id="ctxdirectorypickercontroller--directorypickercontroller"></a>

### `ctx.directoryPickerController` — `DirectoryPickerController`

Host service backing the generated `ctx.remote.directoryPicker` namespace. The seam it exports is abstract and therefore never a Loader entry of its own, so this controller carries the wire verbs: one composed backend serves either the native chooser or the browse primitives, and a verb the composition cannot serve is refused rather than approximated.

```ts cordis-catalog
/**
 * Open the host's OS chooser for a Remote caller.
 * @param signal - caller lifetime; abort terminates the chooser.
 * @returns the chosen absolute path, or null when the operator cancels.
 */
@Remote('pick') async pick(signal: AbortSignal): Promise<string | null>

/**
 * List one directory level for a Remote caller's in-app browser.
 * @param path - absolute directory to list; absent lists the home directory.
 * @param signal - caller lifetime; abort stops the backend's scan instead of
 *   letting it outlive a disconnected caller.
 * @returns the level's listing with its ancestry.
 */
@Remote('list') async list(path: string | undefined, signal: AbortSignal): Promise<DirectoryListing>

/**
 * Create one child directory for a Remote caller's in-app browser.
 * @param path - absolute existing parent directory.
 * @param name - single non-blank path segment.
 * @returns the created directory's absolute path.
 */
@Remote('createDirectory') async createDirectory(path: string, name: string): Promise<string>
```

Source: [`packages/api/workspace-controller/src/directory-picker.ts`](../../packages/api/workspace-controller/src/directory-picker.ts)

<a id="ctxterminalcontroller--terminalcontroller"></a>

### `ctx.terminalController` — `TerminalController`

Typed Remote control of transient Session-owned terminal processes.

```ts cordis-catalog
/**
 * Read the Session working directory and terminal limits without resolving a shell.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns the Session workspace directory and terminal limits.
 */
@Remote environment(agent: Agent, signal: AbortSignal): TerminalEnvironment

/**
 * Discover installed shells in the Session's execution environment.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns verified profiles, with the configured or system default first.
 */
@Remote shells(agent: Agent, signal: AbortSignal): Promise<TerminalShell[]>

/**
 * List retained terminals without resolving or activating an Agent.
 * @param sessionId - displayed Session identity, including offline history.
 * @returns terminals retained for this Host lifetime.
 */
@Remote list(sessionId: SessionId): WebTerminalInfo[]

/**
 * Allocate a user shell once for a caller-generated identity, without Agent sandbox or approval restrictions.
 * @param agent - Session owner supplied by the Gateway.
 * @param request - initial dimensions and idempotency identity.
 * @param signal - allocation cancellation; committed terminals survive disconnection.
 * @returns the existing or newly committed terminal.
 */
@Remote async create(agent: Agent, request: TerminalCreateRequest, signal: AbortSignal): Promise<WebTerminalInfo>

/**
 * Retain an existing terminal for a window without activating its Agent or taking input control.
 * @param sessionId - owning Session identity, including an inactive saved layout.
 * @param id - retained Host terminal identity.
 * @param signal - physical Remote stream cancellation.
 * @returns a hold acknowledgement followed by an open lifetime stream.
 */
@Remote({ mode: 'stream' }) retain(sessionId: SessionId, id: WebTerminalId, signal: AbortSignal): AsyncIterable<TerminalRetentionFrame>

/**
 * Attach to a terminal without binding its process lifetime to the transport.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - new exclusive input attachment.
 * @param signal - physical stream cancellation.
 * @returns screen recovery followed by output and metadata changes.
 */
@Remote({ mode: 'stream' }) follow(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, signal: AbortSignal): AsyncIterable<TerminalFrame>

/**
 * Deliver raw input, including Tab completion and control characters.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - current writable attachment.
 * @param data - input bytes represented as UTF-8 text.
 * @returns after provider input acceptance.
 */
@Remote async write(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, data: string): Promise<void>

/**
 * Update the dimensions of the PTY and recovery screen.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - current writable attachment.
 * @param cols - column count.
 * @param rows - row count.
 * @returns after the resize completes.
 */
@Remote async resize(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, cols: number, rows: number): Promise<void>

/**
 * Rename a terminal without changing its shell.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param title - nonempty display title, at most 120 characters.
 */
@Remote rename(agent: Agent, id: WebTerminalId, title: string): void

/**
 * Close an identity to future creation and kill its process range; repeated closes succeed.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @returns after provider cleanup succeeds. A failure retains the terminal for retry.
 */
@Remote async close(agent: Agent, id: WebTerminalId): Promise<void>
```

Types: [Agent](core.zh.md) · [SessionId](core.zh.md)

Source: [`packages/api/terminal-controller/src/index.ts`](../../packages/api/terminal-controller/src/index.ts)

<a id="ctxworkspacecontroller--workspacecontroller"></a>

### `ctx.workspaceController` — `WorkspaceController`

Host service backing the generated `ctx.remote.workspace` namespace.

```ts cordis-catalog
/**
 * Create or idempotently resolve one Workspace over an existing directory.
 * @param request - directory path to register.
 * @returns the Workspace and whether this call created it.
 */
@Remote('create') create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue>

/**
 * Ensure the permanent default Workspace exists at the configured directory.
 * When the configuration names another directory than the registered
 * default's, the default moves there and the previous default stays an
 * ordinary Workspace. The directory name is fixed; its initial title is that
 * same name, which browser consumers label in the reader's language.
 * @param signal - caller lifetime; cancels native directory lookup.
 * @returns the durable default Workspace, or undefined when this Host provides none; creates no Session or message.
 */
@Remote('initializeDefault') async initializeDefault(signal: AbortSignal): Promise<WorkspaceValue | undefined>

/**
 * Rename one Workspace to a unique non-blank title.
 * @param request - Workspace identity and proposed title.
 * @returns the updated Workspace projection.
 */
@Remote('rename') rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue>

/**
 * Remove one Workspace registration while retaining files and Sessions. The
 * default Workspace is refused with `workspace/default-undeletable`.
 * @param request - Workspace identity to remove.
 * @returns deletion confirmation.
 */
@Remote('delete') delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue>

/**
 * Move one Workspace within the registry display order.
 * @param request - moved Workspace and optional anchor.
 * @returns the complete resulting Workspace order.
 */
@Remote('insertBefore') insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue>

/**
 * Move one accounted Session within a Workspace.
 * @param request - Workspace, Session, and optional anchor identities.
 * @returns the updated Workspace projection.
 */
@Remote('insertSessionBefore') insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue>

/**
 * Hide one known Session from Workspace grouping surfaces.
 * @param request - Session identity to archive.
 * @returns the complete resulting archive set.
 */
@Remote('archiveSession') archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Restore one archived Session to Workspace grouping surfaces.
 * @param request - Session identity to unarchive.
 * @returns the complete resulting archive set.
 */
@Remote('unarchiveSession') unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Surface one known unarchived Session ahead of unpinned Sessions.
 * @param request - Session identity to pin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('pinSession') pinSession(request: WorkspacePinSessionRequest): Promise<WorkspacePinValue>

/**
 * Remove one Session's pin without changing its saved Session order.
 * @param request - Session identity to unpin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('unpinSession') unpinSession(request: WorkspaceUnpinSessionRequest): Promise<WorkspacePinValue>

/**
 * Stream a complete Workspace baseline followed by ordered increments.
 * @param signal - generation cancellation.
 * @returns baseline followed by ordered Workspace increments.
 */
@Remote({ mode: 'stream' }) follow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame>
```

Source: [`packages/api/workspace-controller/src/index.ts`](../../packages/api/workspace-controller/src/index.ts)

<a id="ctxworkspacefiles--workspacefiles"></a>

### `ctx.workspaceFiles` — `WorkspaceFiles`

Host Remote file reads and workspace directory observations over the composed filesystem.

```ts cordis-catalog
/**
 * Read one page of lines from a UTF-8 file readable by the filesystem backend.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param range - the line window; omitted fields take the page defaults.
 * @param signal - caller cancellation.
 * @returns the page, the file's version at the stat before it, and whether it reaches the last line.
 */
@Remote async read( workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceFileRange, signal: AbortSignal, ): Promise<WorkspaceFileText>

/**
 * Read a complete regular file or one byte range without text decoding.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - target path, absolute or workspace-relative; relative to the base file's directory when provided.
 * @param options - optional base file and range; without a range the complete-file cap applies.
 * @param signal - caller cancellation.
 * @returns native bytes with the file's version and size at the preceding stat, byte offset, and EOF marker.
 */
@Remote async readBytes( workspaceFileScope: WorkspaceFileScope, path: string, options: WorkspaceByteReadOptions, signal: AbortSignal, ): Promise<WorkspaceFileBytes>

/**
 * Report one regular file's identity, version, and size without its content.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param signal - caller cancellation.
 * @returns the file's absolute path, current version, and byte size.
 */
@Remote async stat(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileStat>

/**
 * Replace the complete text of an existing regular file inside the Session's
 * workspace, only while the file still has the version the caller read; the
 * write is atomic and fenced by the workspace like an agent's workspace write.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; the file must lie inside the workspace.
 * @param request - the complete new text and the version it was edited from.
 * @param signal - caller cancellation.
 * @returns the file's absolute path, its version after the write, and its new byte size.
 */
@Remote async write( workspaceFileScope: WorkspaceFileScope, path: string, request: WorkspaceFileWriteRequest, signal: AbortSignal, ): Promise<WorkspaceFileStat>

/**
 * List the direct children of one directory inside the Session's workspace.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - workspace path, absolute or relative to the workspace root.
 * @param signal - caller cancellation.
 * @returns the directory's children in the backend's stable name order, bounded by the entry cap.
 */
@Remote async list(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceDirectoryListing>

/**
 * Watch one file or a directory's direct entries in the Session's filesystem.
 * Files use the backend's read authority; directories remain workspace-scoped.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - target path; the Host determines its type and confines directories to the workspace.
 * @param signal - generation cancellation.
 * @returns `ready` once the target watch is active, then current metadata for queued and live invalidations.
 * @throws RemoteError when watching is unavailable or a directory is outside the workspace.
 */
@Remote({ mode: 'stream' }) changes(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame>
```

Source: [`packages/api/workspace-files/src/index.ts`](../../packages/api/workspace-files/src/index.ts)

<a id="ctxworkspaceregistry--workspaceregistry"></a>

### `ctx.workspaceRegistry` — `WorkspaceRegistry`

Durable workspace registry. Startup waits for `sessionPersistence`, builds one canonical-cwd header index, and completes the one-time history bootstrap before the service becomes active. The persistence dependency is mandatory so an unavailable peer can never be mistaken for an empty history and commit the initialized marker.

```ts cordis-catalog
/**
 * Create or reuse a workspace for an existing directory. The fully qualified
 * path is canonicalized through `fs.realpath`; a relative, nonexistent, or
 * non-directory path rejects. Repeated calls for the same canonical path
 * return the existing entity without changing its title.
 * A newly created workspace is prepended to the durable registry order.
 * Different canonical paths may share a display title.
 * @param path - Existing directory to own, in a fully qualified path spelling.
 * @param title - Display title used only when a new record is created.
 * @returns the existing or newly durable workspace.
 */
async create(path: string, title?: string): Promise<Workspace>

/**
 * Ensure the permanent default Workspace exists at the resolved directory,
 * independently of Session history and of other registrations. The
 * directory is created recursively; a registered default at that canonical
 * path is returned as is. Otherwise the directory is registered — or, when a
 * Workspace already owns it, adopted — as the default, and a previous
 * default at another path stays registered as an ordinary Workspace with its
 * Sessions and files untouched. When resolution fails and a default is
 * registered, that default is kept and its directory recreated. The initial
 * title is the requested directory's own final segment — not the canonical
 * one, so a symlink at that path does not retitle the Workspace after its
 * target. After resolution, caller cancellation does not roll back creation
 * or registration.
 * @param resolveDirectory - resolve the configured absolute directory; called
 * on every ensure, inside the registry mutation queue.
 * @returns the default Workspace.
 */
initializeDefault(resolveDirectory: () => Promise<string>): Promise<Workspace>

/**
 * Look up a workspace by id.
 * @param id - Workspace id.
 * @returns the workspace, or `undefined` when unknown.
 */
get(id: WorkspaceId): Workspace | undefined

/**
 * Synchronous workspace projection in durable registry order. Every
 * entity's `sessionIds` getter is already filtered by the startup/live
 * canonical-cwd header index; this method performs no persistence reads.
 * @returns a fresh ordered array of workspace entities.
 */
list(): Workspace[]

/**
 * Delete one workspace registration while retaining its directory and every
 * session log. The durable order is updated before the table deletion; a
 * failed table write restores the prior order and keeps the entity
 * published. Unknown ids are an idempotent no-op for domain callers.
 * @param id - Workspace registration to remove.
 * @returns `true` when a record was deleted, `false` when it was unknown.
 * @throws {@link WorkspaceDefaultUndeletableError} when `id` is the default Workspace.
 */
delete(id: WorkspaceId): Promise<boolean>

/**
 * Move one workspace within the durable display order, DOM-insertBefore-like.
 * With an anchor it lands before that workspace; without one it appends.
 * @param id - Workspace to move.
 * @param beforeId - Workspace anchor; omitted appends.
 * @returns the complete committed workspace order.
 */
insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>

/**
 * Archive one session durably. The session must exist (live or in session
 * persistence); its workspace accounting — or lack of one — is irrelevant.
 * Without `stopActivity` the session must also be inactive: the
 * `workspace/session-activity` waterfall is asked once, and any reported
 * activity rejects with {@link WorkspaceActiveSessionError} before anything
 * is written. With `stopActivity` the archive is written without an
 * activity check, and the `workspace/session-stop` providers are then asked
 * to stop the session's work: the durable archive set is what a provider's
 * `agent/pre-step` gate reads, so every wake the stops induce is already
 * blocked. Archiving drops the session's pin in the same durable write
 * (pinning and archival are mutually exclusive). An already archived id
 * resolves without writing, asking, or stopping.
 * @param sessionId - The session to archive.
 * @param options - Whether running work is stopped instead of refusing.
 * @returns resolution after durability and, with `stopActivity`, after every stop request was issued.
 */
archiveSession(sessionId: SessionId, options: ArchiveSessionOptions = {}): Promise<void>

/**
 * Unarchive one session durably by dropping it from the registry-global
 * archive set; the accounting slot was never touched, so the session
 * returns to its recorded position. Unarchiving runs no session-existence
 * check because removing an id cannot introduce an unknown one, so an
 * entry whose session is gone still resolves. An id that is not archived
 * resolves without writing.
 * @param sessionId - The session to unarchive.
 * @returns resolution after durability.
 */
unarchiveSession(sessionId: SessionId): Promise<void>

/**
 * Forget one deleted session: drop it from the header index, from every
 * workspace account, and from the archive and pin sets, durably. Call it
 * after the session's stored artifact is gone; a still-stored session would
 * reappear in the header index at the next startup. An id the registry
 * does not hold resolves without writing.
 * @param sessionId - The deleted session.
 * @returns resolution after durability.
 */
forgetSession(sessionId: SessionId): Promise<void>

/**
 * Pin one session durably, prepending it to the registry-global pin set.
 * The session must exist (live or in session persistence) and must not be
 * archived. An already pinned id resolves without writing or reordering.
 * @param sessionId - The session to pin.
 * @returns resolution after durability.
 */
pinSession(sessionId: SessionId): Promise<void>

/**
 * Unpin one session durably by dropping it from the registry-global pin
 * set. Unpinning runs no session-existence check because removing an id
 * cannot introduce an unknown one, so an entry whose session is gone still
 * resolves. An id that is not pinned resolves without writing.
 * @param sessionId - The session to unpin.
 * @returns resolution after durability.
 */
unpinSession(sessionId: SessionId): Promise<void>

/**
 * Resolve by canonical directory path without creating or mutating a
 * workspace. A missing path rejects during `realpath`; an existing unowned
 * directory returns `undefined`.
 * @param path - Existing directory path in a fully qualified spelling.
 * @returns the workspace owning the canonical path, when one exists.
 */
async resolveByPath(path: string): Promise<Workspace | undefined>
```

Types: [SessionId](core.zh.md)

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspace-events"></a>

### `workspace/*` events

<a id="workspacesession-activity--waterfall"></a>

#### `workspace/session-activity` — waterfall

Ask the composed providers what still runs for a session before it is archived. A listener prepends its own SessionActivity entries to the result of `next()`; the registry's innermost callback returns an empty list, so a composition without providers archives freely. Any non-empty result refuses the archive without a write.

```ts cordis-catalog
/**
 * Ask the composed providers what still runs for a session before it is
 * archived. A listener prepends its own {@link SessionActivity} entries to
 * the result of `next()`; the registry's innermost callback returns an
 * empty list, so a composition without providers archives freely. Any
 * non-empty result refuses the archive without a write.
 * @param request - the session about to be archived.
 * @param next - delegate to the remaining providers.
 * @mode waterfall
 */
'workspace/session-activity'( request: SessionActivityRequest, next: () => Promise<readonly SessionActivity[]>, ): Promise<readonly SessionActivity[]>
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspacesession-stop--parallel"></a>

#### `workspace/session-stop` — parallel

Stop a session's running work because the caller archived it with `stopActivity`; the archive set is durable when this dispatches. Each provider stops its own families — cancelling a turn, its subagent descendants, owned jobs, or active schedules — through the same cancel paths the user's own stop actions use, so the session log ends every open turn regularly and a later unarchive can continue the conversation. Listeners issue their stop requests without waiting for running work to settle; a listener may await its own durability barrier. A rejection is logged by the registry and does not undo the archive.

```ts cordis-catalog
/**
 * Stop a session's running work because the caller archived it with
 * `stopActivity`; the archive set is durable when this dispatches. Each
 * provider stops its own families — cancelling a turn, its subagent
 * descendants, owned jobs, or active schedules — through the same cancel
 * paths the user's own stop actions use, so the session log ends every
 * open turn regularly and a later unarchive can continue the
 * conversation. Listeners issue their stop requests without waiting for
 * running work to settle; a listener may await its own durability
 * barrier. A rejection is logged by the registry and does not undo the
 * archive.
 * @param request - the session being archived.
 * @mode parallel
 */
'workspace/session-stop'(request: SessionActivityRequest): Promise<void> | void
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)
<!-- END GENERATED cordis-surface -->
