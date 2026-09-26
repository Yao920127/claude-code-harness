import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, createTraditionalRewrite, inject, LANGUAGE_ID } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

async function bench() {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  locale.register('ns', 'zh', { save: '保存文件', settings: '设置' })
  locale.register('ns', 'en', { save: 'Save file', english: 'Only English' })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { locale, fiber }
}

describe('Traditional Chinese language pack', () => {
  it('keeps the host Loader entry inert and declares the locale service', () => {
    expect(hostApply).not.toThrow()
    expect(inject).toEqual(['locale'])
  })

  it('offers Taiwan Traditional Chinese converted from the Simplified copy until unloaded', async () => {
    const { locale, fiber } = await bench()
    expect(locale.getLocale().locales).toContainEqual({ id: LANGUAGE_ID, label: '繁體中文', fallback: 'zh' })

    locale.setLocale(LANGUAGE_ID)
    const t = locale.bind('ns')
    expect(t('save')).toBe('儲存檔案')
    expect(t('settings')).toBe('設定')
    expect(t('english')).toBe('Only English')

    await fiber.dispose()
    expect(locale.getLocale().locales.map(definition => definition.id)).toEqual(['zh', 'en'])
  })

  it('memoizes each conversion', () => {
    const rewrite = createTraditionalRewrite()
    expect(rewrite('网络连接失败')).toBe('網路連線失敗')
    expect(rewrite('网络连接失败')).toBe('網路連線失敗')
  })
})
