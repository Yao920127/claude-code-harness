/** Agent Teams Web dictionaries. */

/** Locale namespace owned by the Agent Teams Web UI. */
export const NS = 'agent-team'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  trigger: '智慧代理團隊',
  loading: '正在載入團隊…',
  unavailable: 'Team 暫不可用',
  failure: '團隊持久記錄無效：{message}',
  empty: '暫無共享任務，可以透過對話建立',
  roster: '成員',
  tasks: '共享任務',
  model: '模型',
  open: '開啟成員工作階段',
  current: '目前工作階段',
  owner: 'Owner',
  unowned: '未分配',
  blockedBy: '依賴',
  writeScopes: '寫入範圍',
  ready: '可開始',
  blocked: '被依賴阻塞',
  'task.expand': '展開',
  'task.collapse': '收起',
  'memberStatus.running': '執行中',
  'memberStatus.inactive': '未執行',
  'memberStatus.provisioning': '準備中',
  'memberStatus.failed': '失敗',
  'status.pending': '待處理',
  'status.in_progress': '進行中',
  'status.completed': '已完成',
} satisfies Record<string, string>

/** Agent Teams locale key union. */
export type TeamKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  trigger: 'Agent Team',
  loading: 'Loading Team…',
  unavailable: 'Team is unavailable',
  failure: 'Invalid persisted Team record: {message}',
  empty: 'No shared tasks yet. Create them through the conversation.',
  roster: 'Members',
  tasks: 'Shared tasks',
  model: 'Model',
  open: 'Open member conversation',
  current: 'Current chat',
  owner: 'Owner',
  unowned: 'Unowned',
  blockedBy: 'Blocked by',
  writeScopes: 'Write scopes',
  ready: 'Ready',
  blocked: 'Blocked by dependencies',
  'task.expand': 'Show more',
  'task.collapse': 'Show less',
  'memberStatus.running': 'Running',
  'memberStatus.inactive': 'Inactive',
  'memberStatus.provisioning': 'Provisioning',
  'memberStatus.failed': 'Failed',
  'status.pending': 'Pending',
  'status.in_progress': 'In progress',
  'status.completed': 'Completed',
} satisfies Record<TeamKey, string>
