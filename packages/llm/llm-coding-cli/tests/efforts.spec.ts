import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { groupEffortSuffixes, readGrokEfforts, readOpenCodeEfforts, withEfforts, type ReadTextFile } from '../src/efforts.ts'
import { CODING_CLIS } from '../src/clis.ts'
import { ascendingEfforts, modelReasoning } from '../src/models.ts'

const HOME = '/home/me'

function files(contents: Record<string, string>): ReadTextFile {
  return path => contents[path]
}

describe('readGrokEfforts', () => {
  it('reads the model cache and the configured models with the configured default', () => {
    const read = files({
      [join(HOME, '.grok', 'models_cache.json')]: JSON.stringify({ models: {
        'grok-4.7': { info: { supports_reasoning_effort: true, reasoning_effort: 'high', reasoning_efforts: [
          { id: 'xhigh', value: 'xhigh' }, { id: 'high', value: 'high', default: true }, { id: 'low' },
        ] } },
        'grok-fast': { info: { supports_reasoning_effort: false, reasoning_efforts: [{ value: 'low' }] } },
        'grok-plain': { info: { reasoning_effort: 'odd', reasoning_efforts: [{ value: 'low' }] } },
        'grok-none': { info: {} },
        'broken': 'not an object',
      } }),
      [join(HOME, '.grok', 'config.toml')]: [
        '[models]',
        'default_reasoning_effort = "medium"',
        '',
        '[model."magpie/claude/claude-haiku-5-5"]',
        'name = "Claude Haiku 5.5"',
        'reasoning_efforts = ["low", "medium", "high"]',
        '[model."magpie/grok/grok-4.7@500k"]',
        'reasoning_efforts = []',
        '[ui]',
        'reasoning_efforts = ["ignored"]',
        'default_reasoning_effort = "ignored"',
      ].join('\n'),
    })
    expect(Object.fromEntries(readGrokEfforts(HOME, read))).toEqual({
      'grok-4.7': { efforts: ['xhigh', 'high', 'low'], defaultEffort: 'high' },
      'grok-plain': { efforts: ['low'] },
      'magpie/claude/claude-haiku-5-5': { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    })
  })

  it('reads nothing from missing or unreadable files', () => {
    expect(readGrokEfforts(HOME, files({}))).toEqual(new Map())
    expect(readGrokEfforts(HOME, files({ [join(HOME, '.grok', 'models_cache.json')]: '{oops' }))).toEqual(new Map())
  })
})

describe('readOpenCodeEfforts', () => {
  it('reads per-model variants, skipping comment lines, and prefers opencode.json', () => {
    const read = files({
      [join(HOME, '.config', 'opencode', 'opencode.json')]: [
        '// user configuration',
        '{"provider": {"magpie": {"models": {',
        '  "claude/claude-haiku-5-5": {"name": "Haiku\tTab", "variants": {"low": {}, "high": {}}},',
        '  "plain": {"name": "Plain"}',
        '}}, "other": "x"}}',
      ].join('\n'),
      [join(HOME, '.config', 'opencode', 'opencode.jsonc')]: JSON.stringify({ provider: { magpie: { models: {
        'claude/claude-haiku-5-5': { variants: { max: {} } },
        'extra': { variants: { medium: {} } },
      } } } }),
    })
    expect(Object.fromEntries(readOpenCodeEfforts(HOME, read))).toEqual({
      'magpie/claude/claude-haiku-5-5': { efforts: ['low', 'high'] },
      'magpie/extra': { efforts: ['medium'] },
    })
    expect(readOpenCodeEfforts(HOME, files({}))).toEqual(new Map())
  })
})

describe('CLI model lists with levels', () => {
  it('offers Antigravity\'s per-level ids as one model with levels', () => {
    expect(CODING_CLIS.antigravity.parseModels('gemini-4-argon-low\tGemini 4 Argon (Low)\ngemini-4-argon-high\tGemini 4 Argon (High)\n'))
      .toEqual([{ id: 'gemini-4-argon', name: 'Gemini 4 Argon', efforts: ['low', 'high'] }])
  })
})

describe('withEfforts', () => {
  it('attaches declared levels and keeps levels the CLI listed itself', () => {
    const declared = new Map([['a', { efforts: ['low'] }], ['b', { efforts: ['high'] }]])
    expect(withEfforts([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', efforts: ['max'] }, { id: 'c', name: 'C' }], declared)).toEqual([
      { id: 'a', name: 'A', efforts: ['low'] },
      { id: 'b', name: 'B', efforts: ['max'] },
      { id: 'c', name: 'C' },
    ])
  })
})

describe('groupEffortSuffixes', () => {
  it('groups ids that differ only in a trailing level into one model named without the level', () => {
    expect(groupEffortSuffixes([
      { id: 'gemini-4-argon-medium', name: 'Gemini 4 Argon (Medium)' },
      { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)' },
      { id: 'plain', name: 'Plain' },
      { id: 'gemini-4-argon-low', name: 'Gemini 4 Argon (Low)' },
      { id: 'plain-max', name: 'Plain (Max)' },
      { id: 'plain', name: 'Plain again' },
      { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
      { id: 'solo', name: 'Solo' },
    ])).toEqual([
      { id: 'gemini-4-argon', name: 'Gemini 4 Argon', efforts: ['medium', 'high', 'low'] },
      { id: 'plain', name: 'Plain', efforts: ['max'] },
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', efforts: ['medium'] },
      { id: 'solo', name: 'Solo' },
    ])
  })
})

describe('ascendingEfforts', () => {
  it('orders known levels from lowest to highest and keeps unknown levels after them', () => {
    expect(ascendingEfforts(['xhigh', 'ultra', 'high', 'turbo', 'low', 'minimal'])).toEqual(['minimal', 'low', 'high', 'xhigh', 'ultra', 'turbo'])
    expect(modelReasoning({ id: 'g', name: 'g', efforts: ['xhigh', 'high', 'low'] }, 'medium')?.efforts.map(level => level.name))
      .toEqual(['Low', 'High', 'Extra high'])
  })
})
