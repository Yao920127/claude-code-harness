import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const PRODUCTION_PROFILE_PROCESS_TIMEOUT_MS = 60_000
const PRODUCTION_PROFILE_TEST_TIMEOUT_MS = PRODUCTION_PROFILE_PROCESS_TIMEOUT_MS + 15_000

const fixtureDir = fileURLToPath(new URL('./fixtures/loader/', import.meta.url))
const driver = join(fixtureDir, 'driver.ts')
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('shipped search provider Loader composition', () => {
  it.each(['openai', 'claude-code'])('selects the %s provider the shipped rows register', async (provider) => {
    const configPath = join(fixtureDir, `${provider}.patch.yml`)
    const { stdout, stderr } = await runLoaderSmoke({
      label: `${provider} search provider Loader composition`,
      tempDirPrefix: 'dsh-web-search-vendors-loader-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
      processTimeoutMs: PRODUCTION_PROFILE_PROCESS_TIMEOUT_MS,
      // Loading the Claude Code provider must not probe or start a Claude binary.
      env: { PATH: '' },
    })

    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({ code: 'WEB_ABORTED' })
  }, PRODUCTION_PROFILE_TEST_TIMEOUT_MS)
})
