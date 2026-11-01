import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAccess } from '../src/access.ts'
import { CODING_CLIS, GROK_INLINE_IMAGE_MAX_CHARS, linkedImages } from '../src/clis.ts'
import { cliPath, locateCli, searchDirectories } from '../src/locate.ts'
import {
  modelReasoning, parseAntigravityModels, parseCodexModels, parseGrokModels, parseOpenCodeModels,
} from '../src/models.ts'

describe('model lists', () => {
  it('lists the Codex catalog entries Codex shows, with their reasoning levels', () => {
    const models = parseCodexModels(readFileSync(new URL('fixtures/codex-models.json', import.meta.url), 'utf8'))
    expect(models.map(model => model.id)).toEqual(['gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.6-luna', 'claude/claude-haiku-5-5'])
    expect(models[0]).toMatchObject({ name: 'GPT-6-Luna', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' })
    expect(modelReasoning(models[0], 'medium')?.efforts.map(effort => effort.name)).toEqual(['Low', 'Medium', 'High', 'Extra high', 'Max'])
    expect(modelReasoning(models[0], 'medium')?.defaultEffort).toBe('medium')
    expect(modelReasoning(models[0], 'max')?.defaultEffort).toBe('max')
    expect(modelReasoning({ id: 'b', name: 'b', efforts: ['low', 'high'], defaultEffort: 'high' }, 'medium')?.defaultEffort).toBe('high')
  })

  it('keeps sparse Codex entries and rejects output without a catalog', () => {
    expect(parseCodexModels(JSON.stringify({ models: [{ slug: 'a', visibility: 'list', default_reasoning_level: 'odd', supported_reasoning_levels: [{ effort: 'turbo' }] }, { visibility: 'list' }, { slug: 'b', visibility: 'list' }] })))
      .toEqual([{ id: 'a', name: 'a', efforts: ['turbo'] }, { id: 'b', name: 'b' }])
    expect(modelReasoning({ id: 'a', name: 'a', efforts: ['turbo'] }, 'medium')).toEqual({ efforts: [{ id: 'turbo', name: 'turbo' }] })
    expect(modelReasoning({ id: 'a', name: 'a' }, 'medium')).toBeUndefined()
    expect(modelReasoning(undefined, 'medium')).toBeUndefined()
    expect(() => parseCodexModels('null')).toThrow('codex debug models printed no models array')
  })

  it('reads the Grok, Antigravity, and OpenCode listings', () => {
    expect(parseGrokModels('You are logged in.\n\nAvailable models:\n  - grok-4.7\n  * magpie/claude/claude-sonnet-5-5 (default)\n'))
      .toEqual([{ id: 'grok-4.7', name: 'grok-4.7' }, { id: 'magpie/claude/claude-sonnet-5-5', name: 'magpie/claude/claude-sonnet-5-5', description: 'Grok default' }])
    expect(parseAntigravityModels('Fetching available models...\ngemini-4-argon-high\tGemini 4 Argon (High)\n\tnameless\n'))
      .toEqual([{ id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)' }])
    expect(parseOpenCodeModels('opencode/big-pickle\nmagpie/lmstudio/google/gemma-4-12b\nnot a model\n'))
      .toEqual([{ id: 'opencode/big-pickle', name: 'opencode/big-pickle' }, { id: 'magpie/lmstudio/google/gemma-4-12b', name: 'magpie/lmstudio/google/gemma-4-12b' }])
  })
})

describe('turn invocations', () => {
  const turn = { prompt: '-p hi', model: 'm', effort: 'high', resume: 'c1', images: [] } as const

  it('passes the prompt so that it is never parsed as an option', () => {
    expect(CODING_CLIS.codex.turn({ ...turn, access: 'workspace-write' })).toEqual({
      args: ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--model', 'm', '--config', 'model_reasoning_effort="high"', 'resume', 'c1', '-'],
      stdin: '-p hi',
    })
    expect(CODING_CLIS.grok.turn({ ...turn, access: 'full-access' }).args)
      .toEqual(['--output-format', 'streaming-json', '--permission-mode', 'bypassPermissions', '--model', 'm', '--reasoning-effort', 'high', '--resume', 'c1', '--single=-p hi'])
    expect(CODING_CLIS.antigravity.turn({ ...turn, access: 'workspace-write' }).args)
      .toEqual(['--output-format', 'stream-json', '--mode', 'accept-edits', '--model', 'm', '--effort', 'high', '--conversation', 'c1', '--print=-p hi'])
    expect(CODING_CLIS.opencode.turn({ ...turn, access: 'full-access' }).args)
      .toEqual(['run', '--standalone', '--format', 'json', '--thinking', '--auto', '--model', 'm', '--session', 'c1', '--', '-p hi'])
  })

  it('omits the model, effort, and conversation the turn leaves to the CLI', () => {
    expect(CODING_CLIS.codex.turn({ prompt: 'x', images: [], access: 'full-access' }).args)
      .toEqual(['exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-'])
    expect(CODING_CLIS.antigravity.turn({ prompt: 'x', images: [], access: 'read-only' }).args).toEqual(['--output-format', 'stream-json', '--print=x'])
    expect(CODING_CLIS.grok.turn({ prompt: 'x', images: [], access: 'read-only' }).args).toEqual(['--output-format', 'streaming-json', '--permission-mode', 'default', '--single=x'])
    expect(CODING_CLIS.opencode.turn({ prompt: 'x', images: [], access: 'workspace-write' }).args).toEqual(['run', '--standalone', '--format', 'json', '--thinking', '--', 'x'])
  })
})

describe('turn images', () => {
  const image = { path: '/tmp/t/image-1.png', mediaType: 'image/png', base64: 'AAAA' }

  it('attaches images the way each CLI accepts them', () => {
    expect(CODING_CLIS.codex.turn({ prompt: 'x', images: [image, image], access: 'read-only' }).args)
      .toEqual(['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '--image', image.path, '--image', image.path, '-'])
    expect(CODING_CLIS.opencode.turn({ prompt: 'x', images: [image], access: 'read-only' }).args)
      .toEqual(['run', '--standalone', '--format', 'json', '--thinking', '--file', image.path, '--', 'x'])
    expect(CODING_CLIS.grok.turn({ prompt: 'x', images: [image], access: 'read-only' }).args).not.toContain('--add-dir')
    expect(CODING_CLIS.grok.turn({ prompt: 'x', images: [image], access: 'read-only' }).args.at(-1))
      .toBe(`--prompt-json=${JSON.stringify([{ type: 'text', text: 'x' }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }])}`)
    expect(CODING_CLIS.antigravity.turn({ prompt: 'x', images: [image, image], access: 'read-only' }).args)
      .toEqual(['--output-format', 'stream-json', '--add-dir', '/tmp/t', `--print=${linkedImages('x', [image, image])}`])
    expect(linkedImages('x', [image])).toBe(`Attached images (read them before answering):\n[image-1](file://${image.path})\n\nx`)
  })

  it('links images Grok cannot take inline within the argument limit', () => {
    const large = { ...image, base64: 'A'.repeat(GROK_INLINE_IMAGE_MAX_CHARS + 1) }
    expect(CODING_CLIS.grok.turn({ prompt: 'x', images: [large], access: 'read-only' }).args.at(-1)).toBe(`--single=${linkedImages('x', [large])}`)
  })
})

describe('resolveAccess', () => {
  it('derives the level from the Session or applies a pinned level', () => {
    expect(resolveAccess('read-only', { sandbox: 'danger-full-access', approval: 'never' })).toBe('read-only')
    expect(resolveAccess('session', undefined)).toBe('read-only')
    expect(resolveAccess('session', { sandbox: 'danger-full-access', approval: 'never' })).toBe('full-access')
    expect(resolveAccess('session', { sandbox: 'danger-full-access', approval: 'ask' })).toBe('workspace-write')
    expect(resolveAccess('session', { sandbox: 'workspace-write', approval: 'ask' })).toBe('workspace-write')
    expect(resolveAccess('session', { sandbox: 'read-only', approval: 'never' })).toBe('read-only')
  })
})

describe('locateCli', () => {
  const host = { path: '/a:/b', home: '/home/me', platform: 'darwin' } as const

  it('searches PATH, then the shared and CLI install directories', () => {
    expect(searchDirectories([['.grok', 'bin']], host)).toEqual([
      '/a', '/b', '/opt/homebrew/bin', '/usr/local/bin',
      join('/home/me', '.local', 'bin'), join('/home/me', '.bun', 'bin'), join('/home/me', '.npm-global', 'bin'), join('/home/me', '.grok', 'bin'),
    ])
    expect(locateCli('grok', [['.grok', 'bin']], host, path => path === join('/home/me', '.grok', 'bin', 'grok'))).toBe(join('/home/me', '.grok', 'bin', 'grok'))
    expect(locateCli('grok', [], { ...host, path: undefined }, () => false)).toBeUndefined()
    expect(cliPath('/x/grok', [], { ...host, path: '/x' }).split(':').slice(0, 2)).toEqual(['/x', '/opt/homebrew/bin'])
  })

  it('tries Windows executable suffixes and skips the POSIX system directories', () => {
    const windows = { path: '/win/bin', home: '/win/me', platform: 'win32' } as const
    expect(searchDirectories([], windows)).not.toContain('/opt/homebrew/bin')
    expect(locateCli('codex', [], windows, path => path.endsWith('codex.cmd'))).toBe(join('/win/bin', 'codex.cmd'))
  })

  it('reports a missing file as not installed', () => {
    expect(locateCli('definitely-not-a-cli-dsh', [], { path: '/nonexistent', home: '/nonexistent', platform: 'linux' })).toBeUndefined()
  })
})
