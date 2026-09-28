/** Copy owned by the Claude Code usage meter. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    claudeCodeUsage: keyof typeof zh
  }
}

/** Simplified Chinese usage copy. */
export const zh = {
  title: 'Claude 用量',
  refresh: '刷新用量',
  loading: '正在读取用量…',
  failed: '无法读取用量：{message}',
  unavailable: '当前登录方式没有方案用量限制',
  'window.five-hour': '5 小时',
  'window.seven-day': '每周',
  'window.seven-day-opus': '每周 Opus',
  'window.seven-day-sonnet': '每周 Sonnet',
  'window.model': '每周 {label}',
  used: '已用 {value}%',
  remaining: '剩 {value}%',
  unknown: '—',
  resets: '{time} 重置',
} satisfies Record<string, string>

/** English usage copy. */
export const en = {
  title: 'Claude usage',
  refresh: 'Refresh usage',
  loading: 'Reading usage…',
  failed: 'Could not read usage: {message}',
  unavailable: 'This sign-in has no plan usage limits',
  'window.five-hour': '5 hours',
  'window.seven-day': 'Weekly',
  'window.seven-day-opus': 'Weekly Opus',
  'window.seven-day-sonnet': 'Weekly Sonnet',
  'window.model': 'Weekly {label}',
  used: '{value}% used',
  remaining: '{value}% left',
  unknown: '—',
  resets: 'Resets {time}',
} satisfies Record<keyof typeof zh, string>
