/** Session Controller permanent deletion: work stop, Agent release, and storage removal. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import SessionStore, { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { SessionAlreadyOwnedError, SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createSessionTestController, installSessionReadTestServices } from './test-remote.ts'

const sid = (id: string): SessionId => id as SessionId
const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function header(id: string, lineage: Partial<Pick<SessionHeader, 'parentSession' | 'origin'>> = {}): SessionHeader {
  return { version: SESSION_FORMAT_VERSION, id: sid(id), createdAt: 1, cwd: '/proj', isSeeded: false, ...lineage }
}

async function composed(stored: SessionHeader[], options: { projectionCache?: boolean; persistence?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dsh-session-delete-'))
  roots.push(cwd)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(AgentRegistry)
  installSessionReadTestServices(ctx)
  const order: string[] = []
  const workspaceRegistry = {
    list: () => [],
    archivedSessionIds: [],
    archiveSession: vi.fn(async (id: SessionId, options: { stopActivity?: boolean }) => {
      order.push(`archive:${id}:${String(options.stopActivity)}`)
    }),
    forgetSession: vi.fn(async (id: SessionId) => { order.push(`forget:${id}`) }),
  }
  ctx.provide('workspaceRegistry', workspaceRegistry as never)
  const persistence = {
    stat: vi.fn(async (id: SessionId) => {
      const found = stored.find(entry => entry.id === id)
      return found === undefined ? undefined : { header: found, revision: SessionPersistenceRevision(`rev-${id}`) }
    }),
    list: vi.fn(async () => stored.map(entry => ({ header: entry, revision: SessionPersistenceRevision(`rev-${entry.id}`) }))),
    delete: vi.fn(async (id: SessionId) => {
      order.push(`delete:${id}`)
      return true
    }),
  }
  if (options.persistence !== false) ctx.provide('sessionPersistence', persistence as never)
  const projectionCache = { forget: vi.fn(async (id: SessionId) => { order.push(`cache:${id}`) }) }
  if (options.projectionCache !== false) ctx.provide('sessionProjectionCache', projectionCache as never)
  const disposals: SessionId[] = []
  ctx.agents.setFactory({
    createAgent: async (ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(options.sessionId, options.meta === undefined ? {} : { meta: options.meta })
      const agent = Object.assign({} as Agent, { id: session.id, session, status: 'idle', ctx: ownerCtx })
      await options.setup?.(ownerCtx, agent)
      const dispose = await ctx.agents.register(agent)
      return {
        agent,
        dispose: async () => {
          order.push(`dispose:${agent.id}`)
          disposals.push(agent.id)
          await dispose?.()
        },
      }
    },
    resume: () => Promise.reject(new Error('delete test sessions are created live')),
  })
  const controller = createSessionTestController(ctx, {
    defaultModelSelection: () => ({ provider: 'default-provider', model: 'default-model' }),
    cwd,
  })
  const removed: SessionId[] = []
  ctx.on('api-session/removed', (id) => { removed.push(id) })
  return { ctx, controller, cwd, order, stored, workspaceRegistry, persistence, projectionCache, disposals, removed }
}

describe('sessions.delete', () => {
  it('stops work, releases the Agent, and removes descendants before the Session', async () => {
    const h = await composed([])
    const { sessionId: root } = await h.controller.create({ cwd: h.cwd })
    h.stored.push(
      header(root),
      header('child', { parentSession: root, origin: 'subagent' }),
      header('grandchild', { parentSession: sid('child'), origin: 'subagent' }),
      header('fork', { parentSession: root }),
    )
    await expect(h.controller.delete({ sessionId: root })).resolves.toEqual({ deleted: true })
    expect(h.order).toEqual([
      `archive:${root}:true`,
      `dispose:${root}`,
      'delete:grandchild', 'cache:grandchild', 'forget:grandchild',
      'delete:child', 'cache:child', 'forget:child',
      `delete:${root}`, `cache:${root}`, `forget:${root}`,
    ])
    expect(h.removed).toContain(root)
    // A plain fork holds a copied history and is not a descendant.
    expect(h.persistence.delete).not.toHaveBeenCalledWith(sid('fork'))
  })

  it('keeps the retained handle when another Agent with the same id is disposed', async () => {
    const h = await composed([])
    const { sessionId } = await h.controller.create({ cwd: h.cwd })
    const agent = h.ctx.agents.get(sessionId)!
    h.ctx.emit('agent/disposed', { agent: { ...agent } })
    h.ctx.emit('agent/disposed', { agent: { ...agent, id: sid('never-retained') } })
    h.stored.push(header(sessionId))
    await h.controller.delete({ sessionId })
    expect(h.disposals).toEqual([sessionId])
  })

  it('forgets the retained handle when its Agent is disposed by another owner', async () => {
    const h = await composed([])
    const { sessionId } = await h.controller.create({ cwd: h.cwd })
    h.ctx.emit('agent/disposed', { agent: h.ctx.agents.get(sessionId)! })
    h.stored.push(header(sessionId))
    // The still-registered Agent is no longer this controller's to release.
    await expect(h.controller.delete({ sessionId })).rejects.toThrow('does not own')
    expect(h.disposals).toEqual([])
  })

  it('deletes a cold Session without an Agent and without a projection cache', async () => {
    const h = await composed([header('cold')], { projectionCache: false })
    await expect(h.controller.delete({ sessionId: sid('cold') })).resolves.toEqual({ deleted: true })
    expect(h.disposals).toEqual([])
    expect(h.order).toEqual(['archive:cold:true', 'delete:cold', 'forget:cold'])
    expect(h.removed).toEqual(['cold'])
  })

  it('refuses deletion when no session store is composed', async () => {
    const h = await composed([header('cold')], { persistence: false })
    await expect(h.controller.delete({ sessionId: sid('cold') })).rejects.toMatchObject({
      code: 'session/delete-unavailable', details: { sessionId: 'cold' },
    })
    expect(h.order).toEqual([])
  })

  it('rejects unknown and subagent-owned Sessions without deleting anything', async () => {
    const h = await composed([header('child', { parentSession: sid('root'), origin: 'subagent' })])
    await expect(h.controller.delete({ sessionId: sid('missing') })).rejects.toMatchObject({
      code: 'session/not-found', details: { sessionId: 'missing' },
    })
    await expect(h.controller.delete({ sessionId: sid('child') })).rejects.toMatchObject({ code: 'session/agent-busy' })
    expect(h.order).toEqual([])
  })

  it('maps a held writer to session/writer-held and propagates other storage failures', async () => {
    const h = await composed([header('held'), header('broken')])
    h.persistence.delete.mockRejectedValueOnce(new SessionAlreadyOwnedError(sid('held')))
    await expect(h.controller.delete({ sessionId: sid('held') })).rejects.toMatchObject({
      code: 'session/writer-held', details: { sessionId: 'held' },
    })
    const failure = new Error('disk failure')
    h.persistence.delete.mockRejectedValueOnce(failure)
    await expect(h.controller.delete({ sessionId: sid('broken') })).rejects.toBe(failure)
    expect(h.workspaceRegistry.forgetSession).not.toHaveBeenCalled()
  })

  it('refuses to release a live Agent another owner created', async () => {
    const h = await composed([header('foreign')])
    const session = h.ctx.sessions.create(sid('foreign'), { meta: { cwd: h.cwd } })
    await h.ctx.agents.register(Object.assign({} as Agent, { id: session.id, session, status: 'idle', ctx: h.ctx }))
    await expect(h.controller.delete({ sessionId: sid('foreign') })).rejects.toThrow('does not own')
    expect(h.persistence.delete).not.toHaveBeenCalled()
  })
})
