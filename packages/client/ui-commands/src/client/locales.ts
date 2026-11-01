/**
 * `command` namespace dictionaries: the composer menu's section headings,
 * the client face (title, description, claim token) of the built-in Host
 * commands whose catalog descriptors carry English text only, and the
 * popupSelect shell's copy.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'section.add': '新增',
  'section.commands': '指令',
  'label.goal': '目標',
  'label.plan': '計劃',
  'label.feedback': '回饋',
  'label.compact': '壓縮',
  'label.permission': '權限',
  'label.export': '下載日誌',
  'description.goal': '設定或檢視長期任務目標',
  'description.plan': '進入或退出計劃模式',
  'description.feedback': '傳送關於目前工作階段的回饋',
  'description.compact': '壓縮以上對話內容',
  'description.permission': '切換權限預設（沙箱模式與審批策略）',
  'description.export': '將目前工作階段內容匯出為 ZIP',
  'token.goal': '目標',
  'token.plan': '計劃',
  'token.feedback': '回饋',
  'token.compact': '壓縮',
  'token.permission': '權限',
  'token.export': '匯出',
  'search.placeholder': '搜尋…',
  'search.aria': '篩選選項',
  'status.loading': '正在載入選項…',
  'status.applying': '正在應用…',
  'status.empty': '無選項',
  'overlay.aria': '/{command} 選項',
  'listbox.aria': '/{command} 匹配項',
  'notice.attachmentsUnsupported': '/{command} 不接受附件，請先移除附件',
} satisfies Record<string, string>

/** The command namespace key union. */
export type CommandKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'section.add': 'Add',
  'section.commands': 'Commands',
  'label.goal': 'Goal',
  'label.plan': 'Plan',
  'label.feedback': 'Feedback',
  'label.compact': 'Compact',
  'label.permission': 'Permission',
  'label.export': 'Export',
  'description.goal': 'Set or view the goal for a long-running task',
  'description.plan': 'Enter or leave plan mode',
  'description.feedback': 'Record feedback about this session',
  'description.compact': 'Compact older conversation history',
  'description.permission': 'Switch the permission preset (sandbox mode + approval policy)',
  'description.export': 'Download this Session log as a ZIP archive',
  'token.goal': 'goal',
  'token.plan': 'plan',
  'token.feedback': 'feedback',
  'token.compact': 'compact',
  'token.permission': 'permission',
  'token.export': 'export',
  'search.placeholder': 'Search…',
  'search.aria': 'Filter options',
  'status.loading': 'Loading options…',
  'status.applying': 'Applying…',
  'status.empty': 'No options',
  'overlay.aria': '/{command} options',
  'listbox.aria': '/{command} matches',
  'notice.attachmentsUnsupported': '/{command} does not accept attachments; remove them first',
} satisfies Record<CommandKey, string>
