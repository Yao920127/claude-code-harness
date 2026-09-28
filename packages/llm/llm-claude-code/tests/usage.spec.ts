import type { SDKControlGetUsageResponse } from '@anthropic-ai/claude-agent-sdk'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { ClaudeCodeUsageController, usageView } from '../src/usage.ts'

// Partial usage answers carry only the fields the view reads.
function usage(limits: SDKControlGetUsageResponse['rate_limits'], available = true): SDKControlGetUsageResponse {
  return { subscription_type: 'max', rate_limits_available: available, rate_limits: limits } as SDKControlGetUsageResponse
}

const READ_AT = new Date('2026-09-29T00:00:00.000Z')

describe('usageView', () => {
  it('lists the named windows in display order, then the per-model windows', () => {
    expect(usageView(usage({
      seven_day: { utilization: 63, resets_at: '2026-10-02T00:00:00Z' },
      five_hour: { utilization: 87, resets_at: '2026-09-29T03:00:00Z' },
      seven_day_opus: null,
      seven_day_sonnet: { utilization: null, resets_at: null },
      model_scoped: [{ display_name: 'Fable', utilization: 12, resets_at: null }],
    }), READ_AT)).toEqual({
      subscription: 'max',
      available: true,
      readAt: '2026-09-29T00:00:00.000Z',
      windows: [
        { kind: 'five-hour', utilization: 87, resetsAt: '2026-09-29T03:00:00Z' },
        { kind: 'seven-day', utilization: 63, resetsAt: '2026-10-02T00:00:00Z' },
        { kind: 'seven-day-sonnet', utilization: null, resetsAt: null },
        { kind: 'model', label: 'Fable', utilization: 12, resetsAt: null },
      ],
    })
  })

  it('reports no windows for sign-ins without plan limits', () => {
    expect(usageView(usage(null, false), READ_AT)).toMatchObject({ available: false, windows: [] })
    expect(usageView(usage({}), READ_AT)).toMatchObject({ available: true, windows: [] })
  })
})

describe('ClaudeCodeUsageController', () => {
  function controller(read: () => Promise<SDKControlGetUsageResponse>) {
    let now = 0
    const ctx = new Context()
    const service = new ClaudeCodeUsageController(ctx, { read, freshMs: 1_000, now: () => now })
    return { service, advance: (ms: number) => { now += ms } }
  }

  it('answers from a fresh read, asks again after the freshness window or on refresh', async () => {
    const read = vi.fn(async () => usage({ five_hour: { utilization: 10, resets_at: null } }))
    const h = controller(read)
    const first = await h.service.get(false)
    expect(first.windows).toEqual([{ kind: 'five-hour', utilization: 10, resetsAt: null }])
    await h.service.get(false)
    expect(read).toHaveBeenCalledOnce()
    await h.service.get(true)
    expect(read).toHaveBeenCalledTimes(2)
    h.advance(1_000)
    await h.service.get(false)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('does not reuse a failed read', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(usage(null, false))
    const h = controller(read)
    await expect(h.service.get(false)).rejects.toThrow('offline')
    await expect(h.service.get(false)).resolves.toMatchObject({ available: false })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer read when an older one fails later', async () => {
    let fail!: (error: Error) => void
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
      .mockResolvedValue(usage(null, false))
    const h = controller(read)
    const older = h.service.get(false)
    await h.service.get(true)
    fail(new Error('late'))
    await expect(older).rejects.toThrow('late')
    await h.service.get(false)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
