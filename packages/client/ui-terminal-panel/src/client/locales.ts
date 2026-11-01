/** Copy owned by the terminal panel feature. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    terminalPanel: keyof typeof zh
  }
}

/** Simplified Chinese terminal copy. */
export const zh = {
  'shortcut.noSession': '請先選擇工作階段',
  recoveryFailed: '恢復終端失敗：{message}', retryRecovery: '重試恢復終端',
  shell: '選擇 Shell', shellLoading: '正在讀取 Shell…', shellEmpty: '沒有可用的 Shell',
  title: '終端', guideDescription: '在右側邊欄開啟終端', open: '開啟終端', new: '新建終端', toggle: '切換終端面板', hide: '隱藏終端面板',
  tabs: '終端標籤', closeTab: '關閉終端「{title}」', resize: '調整終端面板高度',
  loading: '正在讀取終端環境…', creating: '正在啟動…',
  connecting: '正在連線…', disconnected: '連線已斷開。', reconnect: '重新連線',
  readonly: '此頁面目前只讀。', control: '接管輸入',
  closed: '終端已關閉。', exited: '程序已退出（{code}）', failed: '終端錯誤：{message}',
  rename: '終端名稱', unavailable: '不可用', retry: '重試',
  cleanupFailed: '終端「{title}」未能結束：{message}',
  missingTerminal: '此終端已不存在，請新建終端。',
  inputFull: '輸入緩衝區已滿，請重新連線後重試。',
  attachmentEnded: '終端連線已結束，請重新連線。',
  invalidOutput: '終端畫面傳輸異常，請重新連線。',
  terminalLimit: '終端數量已達上限，請關閉不用的終端後重試。已退出的終端也計入數量。',
} satisfies Record<string, string>

/** English terminal copy. */
export const en = {
  'shortcut.noSession': 'Select a session first',
  recoveryFailed: 'Terminal recovery failed: {message}', retryRecovery: 'Retry terminal recovery',
  shell: 'Choose shell', shellLoading: 'Loading shells…', shellEmpty: 'No shells available',
  title: 'Terminal', guideDescription: 'Open a terminal in the right Sidebar', open: 'Open terminal', new: 'New terminal', toggle: 'Toggle terminal panel', hide: 'Hide terminal panel',
  tabs: 'Terminal tabs', closeTab: 'Close terminal “{title}”', resize: 'Resize terminal panel',
  loading: 'Reading terminal environment…', creating: 'Starting…',
  connecting: 'Connecting…', disconnected: 'Disconnected.', reconnect: 'Reconnect',
  readonly: 'This view is read-only.', control: 'Take control',
  closed: 'Terminal closed.', exited: 'Process exited ({code})', failed: 'Terminal error: {message}',
  rename: 'Terminal name', unavailable: 'Unavailable', retry: 'Retry',
  cleanupFailed: 'Terminal “{title}” could not be ended: {message}',
  missingTerminal: 'This terminal no longer exists. Open a new terminal.',
  inputFull: 'The input buffer is full. Reconnect and try again.',
  attachmentEnded: 'The terminal connection ended. Reconnect to continue.',
  invalidOutput: 'The terminal screen could not be received. Reconnect to recover it.',
  terminalLimit: 'The terminal limit has been reached. Close unused terminals and try again. Exited terminals also count toward the limit.',
} satisfies Record<keyof typeof zh, string>
