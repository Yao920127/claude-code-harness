# Agent Teams

[English](agent-team.md) | 中文

實驗性隱式 Root Team 領域、模型工具與主機介面卡共享的型別。[Agent Teams Agent Note](../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)負責身份、mailbox、task 與共享 checkout 決策；本頁記錄 [`packages/experimental/agent-team/src/types.ts`](../../packages/experimental/agent-team/src/types.ts) 中的持久與用戶端可見形式。

## 身份與 roster

`TeamId` 是具有獨立[品牌](core.zh.md#branded-ids)的 Root `SessionId`。`TeamTaskId` 在 Team 內按 `task-<n>` 單調分配；`TeamMessageId` 是全域隨機值。teammate 的 Session id 始終是持久身份，而 `name` 是不可變的模型／UI 標籤。

```ts type-equiv
/** Whole durable value written on every teammate lifecycle change. */
interface TeamMemberSnapshot {
  readonly id: SessionId
  readonly name: string
  readonly description: string
  readonly provider: string
  readonly context: 'fresh' | 'fork'
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

每個 member 都從 `provisioning` 開始，並且只到達一個終態 roster phase：`active` 或 `failed`。roster 的 `running`／`inactive` 狀態單獨派生，絕不會重寫該記錄。

## 持久 mailbox

Lead Session 首先儲存完整 queued message。只有 target 的 pending inbox 條目或已記錄使用者訊息完成持久化，才會寫入獨立 acknowledgement event，queued-minus-delivered 因而構成恢復 mailbox。

```ts type-equiv
/** One peer message retained until its target Session records it. */
interface TeamMessageSnapshot {
  readonly id: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
  readonly targetId: SessionId
  readonly content: ContentBlock[]
}
```

每條訊息都會嘗試 Steer 投遞。running target 在最近的步驟邊界收到訊息，inactive target 在已載入時啟動一個輪次，否則冷恢復。呼叫方不能選擇其他模式，因此持久記錄不儲存排程方式。

target Session 會在 pending inbox 條目和終端使用者訊息上保留訊息身份與傳送者歸因。跨 inbox 與歷史摺疊該 source 構成 target 側去重鍵；模型可見的 framing 會重複 id 和傳送者。

```ts type-equiv
/** Source retained by the target Session for durable mailbox de-duplication. */
interface TeamMessageSource {
  readonly kind: 'team-message'
  readonly teamId: TeamId
  readonly messageId: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
}
```

## 共享任務 DAG

每條 task event 都儲存完整快照。`revision` 是 compare-and-set 值，每次變更遞增 1。`blockedBy` edge 必須指向未刪除任務，並維持無環圖。`writeScopes` 是規範化的提示性路徑字首，不是鎖。

```ts type-equiv
/** Whole durable task snapshot; every mutation increments {@link revision}. */
interface TeamTaskSnapshot {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly ownerId?: SessionId
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
}
```

`pending` 表示尚未開始或已經釋放，`in_progress` 攜帶 owner，`completed` 滿足 blocker，`deleted` 是保留的 tombstone。view 會新增 owner name、readiness 和 write-scope 重疊警告，但不會改變持久快照。

<a id="web-projection"></a>

## Web 投影

Lead Session 透過 `SessionProjectionMap.agentTeam` 釋出持久 roster 行與未刪除任務檢視。`failure` 在最後有效狀態旁報告被拒絕的持久記錄。成員活動來自 Session 狀態；模型標籤來自各成員的 `modelSelection` 投影。

```ts type-equiv
/** One durable roster row published through the `agentTeam` Session projection. */
interface TeamMemberProjection {
  readonly id: SessionId
  readonly name: string
  readonly role: 'lead' | 'teammate'
  /** Durable lifecycle; the Lead row is always `active`. Turn activity comes from Session status. */
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

```ts type-equiv
/** Runtime-enriched task view returned to tools and hosts. */
interface TeamTaskView {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
  readonly ownerName?: string
  readonly ready: boolean
  readonly writeScopeWarnings: string[]
}
```

```ts type-equiv
/**
 * Durable Team state published to browser clients through the Lead Session's
 * `agentTeam` projection. `failure` names the first rejected persisted Team
 * record; members and tasks then stay at the last valid state.
 */
interface TeamProjection {
  readonly members: TeamMemberProjection[]
  readonly tasks: TeamTaskView[]
  readonly failure?: string
}
```

## 回放

`agentTeam` Session 投影把一個 Root Session 回放成每個 Team 操作所讀取的 roster、任務板與 queued-minus-delivered mailbox。它按 `TeamId` 選取記錄，因此普通 fork 繼承的 event 保留 ancestor id，絕不會進入新 Root 的狀態。Session event 的 `seq` 與 `time` 繼續負責順序和時間記錄，Team snapshot 不再重複儲存它們。roster 與 task 讀取以 view 形式到達呼叫方，而 pending 郵件僅供投遞與恢復內部使用。包 [README](../../packages/experimental/agent-team/README.zh.md)負責 operation、authorization、recovery 和限制行為。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentteams--teamservice"></a>

### `ctx.agentTeams` — `TeamService`

Agent Teams service backed by the exact live Lead Session log.

```ts cordis-catalog
/**
 * Resolve one exact live Agent's Team role.
 * @param agent - exact live Agent used as the authority credential.
 * @returns its root, Team identity, role, and model-facing name.
 */
membership(agent: Agent): TeamMembership

/**
 * List the runtime-enriched roster visible to one Team member.
 * @param agent - exact live Team member.
 * @returns Lead and teammate rows in creation order.
 */
listMembers(agent: Agent): TeamMemberView[]

/**
 * Create one named, continuable direct child of the Team Lead.
 * @param caller - exact live Lead Agent.
 * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
 * @returns the active roster row.
 */
async spawnTeammate(caller: Agent, request: SpawnTeammateRequest): Promise<SpawnTeammateResult>

/**
 * Queue one durable peer message, then attempt immediate delivery.
 * @param caller - exact live sending Team member.
 * @param request - target name, content, and pre-queue cancellation.
 * @returns durable message identity and immediate-delivery observation.
 */
async sendMessage(caller: Agent, request: SendTeamMessageRequest): Promise<SendTeamMessageResult>

/**
 * Create one unowned pending task in the Team Lead log.
 * @param caller - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task view.
 */
async createTask(caller: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Return one task, including a deleted tombstone.
 * @param caller - exact live Team member reading the task.
 * @param id - Team-local task identity.
 * @returns the latest task value and derived readiness diagnostics.
 */
getTask(caller: Agent, id: TeamTaskId): TeamTaskView

/**
 * List current non-deleted tasks in numeric creation order.
 * @param caller - exact live Team member reading the board.
 * @returns detached current task views.
 */
listTasks(caller: Agent): TeamTaskView[]

/**
 * Compare-and-set one authorized task transition.
 * @param caller - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed next task revision.
 */
async updateTask(caller: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Wait for the next Team-domain or member-status change.
 * @param caller - exact live Team member waiting for activity.
 * @param timeoutMs - bounded wait duration from ten seconds through one hour.
 * @param signal - caller cancellation for the wait only.
 * @returns one observed change or a timeout result.
 */
async waitForChange(caller: Agent, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult>

/**
 * Interrupt one live teammate turn without clearing its pending inbox.
 * @param caller - exact live Lead Agent.
 * @param targetName - durable teammate name.
 * @returns the target status sampled before cancellation.
 */
interrupt(caller: Agent, targetName: string): { previousStatus: 'running' | 'inactive' }

/**
 * Resolve a caller without throwing, used by scoped-tool installation and observers.
 * @param agent - candidate exact live Agent.
 * @returns Team membership, or undefined for non-Team subagents and stale identities.
 */
tryMembership(agent: Agent): TeamMembership | undefined
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/agent-team/src/index.ts`](../../packages/experimental/agent-team/src/index.ts)
<!-- END GENERATED cordis-surface -->
