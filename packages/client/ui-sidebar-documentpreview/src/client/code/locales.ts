/** Locale-owned code renderer name and CodeBlock controls. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Code document implementation name and copy controls. */
    sidebarCodePreview: keyof typeof zh
  }
}

/** Simplified Chinese dictionary and key source. */
export const zh = {
  title: '程式碼',
  copy: '複製',
  copied: '已複製',
}

/** English dictionary with the same keys. */
export const en = {
  title: 'Code',
  copy: 'Copy',
  copied: 'Copied',
} satisfies Record<keyof typeof zh, string>
