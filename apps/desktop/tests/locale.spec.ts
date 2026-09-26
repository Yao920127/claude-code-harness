import { describe, expect, it } from 'vitest'
import { en, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale, zh } from '../src/locale.ts'
import { zhTW } from '../src/locale-zh-tw.ts'

describe('desktop locale dictionaries', () => {
  it('ships the same key set in English and Chinese', () => {
    expect(Object.keys(zh)).toEqual(Object.keys(en))
    expect(Object.keys(zhTW)).toEqual(Object.keys(en))
    expect(resolveDesktopLocale('zh-Hans-CN').messages).toEqual(zh)
    expect(resolveDesktopLocale('en-US').messages).toEqual(en)
    expect(resolveDesktopLocale('fr-FR').messages).toEqual(en)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('resolves Traditional Chinese tags to the Traditional dictionary', () => {
    for (const tag of ['zh-TW', 'zh-Hant', 'zh-Hant-TW', 'zh-HK', 'zh-MO']) {
      expect(resolveDesktopLocale(tag)).toEqual({ id: 'zh-TW', messages: zhTW })
    }
    expect(resolveDesktopLocale('zh-Hans').id).toBe('zh-CN')
    expect(resolveDesktopLocale('zh-TWX').id).toBe('zh-CN')
    expect(zhTW.quitApplication).toBe('結束 Claude Code Harness')
    expect(zhTW.claudeCodeSignIn).toBe('登入 Claude Code')
  })

  it('prefers an explicit supported choice, then the first supported system language', () => {
    expect(resolveDesktopStartupLocale('zh', ['en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('EN', ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hant', 'en-US']).id).toBe('zh-TW')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hans-CN', 'en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('zh-TW', ['en-US']).id).toBe('zh-TW')
    expect(resolveDesktopStartupLocale('zh-Hant-HK', ['zh-CN']).id).toBe('zh-TW')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
    expect(resolveDesktopStartupLocale('ja', ['zh-CN']).id).toBe('zh-CN')
  })

})
