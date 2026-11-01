# Todo

[English](todo.md) | 中文

本頁記錄 [`@deepseek-ai/dsh-tool-todo`](../../packages/todo/tool-todo/README.zh.md) 擁有的持久 todo 詞彙。面向模型的工具會整體替換一個 agent（智慧代理）工作階段的列表；該包還擁有事件宣告、回放投影和不變數配套外掛。工具行為與設定見[包 README](../../packages/todo/tool-todo/README.zh.md)。

原始碼：[`packages/todo/tool-todo/src/types.ts`](../../packages/todo/tool-todo/src/types.ts)

## `TodoItem`：一條列表項

```ts type-equiv
/**
 * One entry in an agent's todo list — the unit of the `todo/write`
 * whole-list snapshot declared by this package.
 *
 * Deliberately minimal: a human-readable `content` line and a three-state
 * `status`. No id, priority, or `activeForm` — the list is replaced wholesale
 * on every write (last-write-wins), so entries need no stable identity. The
 * three statuses describe the complete portable lifecycle needed by model and
 * UI consumers.
 */
interface TodoItem {
  /** What this task is — a short imperative line shown in the UI. */
  content: string
  /** Lifecycle state. `in_progress` marks a task being worked now; parallel work may mark several. */
  status: 'pending' | 'in_progress' | 'completed'
}
```

## 持久事件與不變數

該包透過宣告合併把 `todo/write: { todos: TodoItem[] }` 加入 `SessionEventMap`。此事件僅寫入日誌，並攜帶完整替換列表；生成的[持久化目錄](../persistence-catalog.zh.md#todowrite--log-only)會記錄其宣告位置。該包的不變數配套外掛會單次遍歷驗證現有工作階段和新發布的工作階段，隨後增量追蹤已提交的輪次邊界，使每個即時 `todo/write` 都能在追加前得到驗證，而無需重新掃描日誌。
