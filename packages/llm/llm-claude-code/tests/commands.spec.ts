import type { SlashCommand } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { CLAUDE_CODE_COMMAND_RANK, ClaudeCodeCommandProvider } from '../src/commands.ts'

const commands: SlashCommand[] = [
  { name: 'hello', description: 'Say hello', argumentHint: '<name>' },
  { name: 'review', description: '', argumentHint: '' },
  { name: 'plugin:tool', description: 'Plugin command', argumentHint: '' },
  { name: 'plugin:hello', description: 'Shadowed by the bare hello', argumentHint: '' },
  { name: 'a:shared', description: 'One of two shared names', argumentHint: '' },
  { name: 'b:shared', description: 'The other shared name', argumentHint: '' },
  { name: 'bare:', description: '', argumentHint: '' },
  { name: 'Bad_Name', description: 'Not a skill name', argumentHint: '' },
]

function provider(read = vi.fn(async (_cwd: string) => commands)) {
  const lifetime = new AbortController()
  const invalidate = vi.fn()
  const control: SkillProviderControl = { signal: lifetime.signal, invalidate }
  const onError = vi.fn()
  return { provider: new ClaudeCodeCommandProvider(read, control, 1_000, onError), read, invalidate, onError, lifetime }
}

afterEach(() => { vi.useRealTimers() })

describe('ClaudeCodeCommandProvider', () => {
  it('lists skill-named commands, plugin commands by their unqualified name, as user-only skills Claude Code expands itself', async () => {
    const h = provider()
    await expect(h.provider.list({})).resolves.toEqual([])
    expect(h.read).not.toHaveBeenCalled()
    const listed = await h.provider.list({ cwd: '/work' })
    expect(h.read).toHaveBeenCalledWith('/work')
    expect(listed).toEqual([
      {
        name: 'hello', description: 'Say hello <name>', invocation: { modelInvocable: false, userInvocable: true },
        source: 'claude-code', provider: 'claude-code', rank: CLAUDE_CODE_COMMAND_RANK, locator: 'hello',
      },
      expect.objectContaining({ name: 'review', description: '/review' }),
      expect.objectContaining({ name: 'tool', description: 'Plugin command (plugin plugin)', locator: 'tool' }),
    ])
    await expect(h.provider.get()).resolves.toBeUndefined()
    h.lifetime.abort()
  })

  it('reports a failed listing as incomplete so the next lookup asks again', async () => {
    const failure = new Error('not signed in')
    const h = provider(vi.fn(async () => { throw failure }))
    await expect(h.provider.list({ cwd: '/work' })).resolves.toEqual({ candidates: [], complete: false })
    expect(h.onError).toHaveBeenCalledWith(failure)
  })

  it('stops when the lookup was cancelled while Claude Code answered', async () => {
    const h = provider()
    const lookup = new AbortController()
    lookup.abort(new Error('closed'))
    await expect(h.provider.list({ cwd: '/work', signal: lookup.signal })).rejects.toThrow('closed')
  })

  it('invalidates the catalog once per refresh window and not after unregistration', async () => {
    vi.useFakeTimers()
    const h = provider()
    await h.provider.list({ cwd: '/a' })
    await h.provider.list({ cwd: '/b' })
    vi.advanceTimersByTime(1_000)
    expect(h.invalidate).toHaveBeenCalledOnce()
    await h.provider.list({ cwd: '/a' })
    h.lifetime.abort()
    vi.advanceTimersByTime(1_000)
    expect(h.invalidate).toHaveBeenCalledOnce()
    await h.provider.list({ cwd: '/a' })
    vi.advanceTimersByTime(1_000)
    expect(h.invalidate).toHaveBeenCalledOnce()
  })
})
