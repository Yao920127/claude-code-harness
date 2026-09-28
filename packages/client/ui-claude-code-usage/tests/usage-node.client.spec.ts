/** Without a document the plugin still reads usage once and registers the meter. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

it('reads usage once and registers the meter where no document exists', async () => {
  const ctx = new Context()
  const register = vi.fn(() => () => {})
  ctx.provide('slots', { inject: (_name: string, add: () => () => void) => add(), register } as never)
  ctx.provide('locale', { register: () => () => {} } as never)
  const get = vi.fn(async () => ({ ok: false, error: new Error('offline') }))
  ctx.provide('remote', { claudeCodeUsage: { get } } as never)
  ctx.provide('remote.claudeCodeUsage', {} as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  expect(typeof document).toBe('undefined')
  expect(get).toHaveBeenCalledExactlyOnceWith(false)
  expect(register).toHaveBeenCalledOnce()
  await fiber.dispose()
})
