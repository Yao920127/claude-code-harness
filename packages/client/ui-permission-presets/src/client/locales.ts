/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** Locale namespace shared by both current-session permission pickers. */
export const PERMISSION_ACCESS_NS = 'permission.access'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '權限',
  'description': '選擇新工作階段的預設權限模式',
  'loading': '載入中',
  'unavailable': '不可用',
  'preset.readOnly': '僅可檢視',
  'preset.workspaceWrite': '工作區內修改',
  'preset.fullAccess': '完全權限',
  'confirm.title': '確認啟用完全權限？',
  'confirm.description': '啟用完全權限後，新工作階段將減少確認步驟，並且可以直接執行更多操作，包括敏感操作、檔案修改或外部命令。僅建議在你信任後續任務時使用。',
  'confirm.acknowledge': '我已瞭解風險，並願意繼續',
  'confirm.cancel': '取消',
  'confirm.enable': '啟用完全權限',
} satisfies Record<string, string>

/** The settings.permission namespace key union. */
export type PermissionSettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionSettingsKey, string>

/** Simplified Chinese dictionary for the current-session popup gate. */
export const accessZh = {
  'mode': '存取模式，目前：{name}',
  'close': '關閉',
  'preset.readOnly': '僅可檢視',
  'preset.workspaceWrite': '工作區內修改',
  'preset.fullAccess': '完全權限',
  'confirm.title': '確認啟用完全權限？',
  'confirm.description': '啟用完全權限後，智慧代理將減少確認步驟，並且可以直接執行更多操作，包括敏感操作、檔案修改或外部命令。僅建議在你信任目前任務時使用。',
  'confirm.acknowledge': '我已瞭解風險，並願意繼續',
  'confirm.cancel': '取消',
  'confirm.enable': '啟用完全權限',
  'auto.label': 'Auto review',
  'auto.badge': 'EXP',
  'auto.description': '無沙箱執行；每次原生工具呼叫和 PTC 內層呼叫前由同一模型進行實驗性審查。',
  'auto.confirm.title': '確認啟用 Auto review（實驗）？',
  'auto.confirm.description': 'Auto review 不使用沙箱。每次原生工具呼叫和 PTC 內層呼叫前，都會由與目前 agent 相同的模型進行審查；審查拒絕的呼叫由你批准或拒絕。此功能仍屬實驗性，可能誤放行或誤拒絕，並會消耗額外 token。',
  'auto.confirm.acknowledge': '我已瞭解這些風險，並願意繼續',
  'auto.confirm.enable': '啟用 Auto review',
} satisfies Record<string, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessZh

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'mode': 'Access mode, current: {name}',
  'close': 'Close',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
  'auto.label': 'Auto review',
  'auto.badge': 'EXP',
  'auto.description': 'Run without a sandbox after an experimental same-model review of every native tool call and PTC inner call.',
  'auto.confirm.title': 'Enable Auto review (experimental)?',
  'auto.confirm.description': 'Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it; you approve or reject each call it denies. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.',
  'auto.confirm.acknowledge': 'I understand these risks and want to continue',
  'auto.confirm.enable': 'Enable Auto review',
} satisfies Record<PermissionAccessKey, string>
