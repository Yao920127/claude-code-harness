#!/usr/bin/env node
/** Resolve one shipped search provider through the headless profile without contacting a vendor. */

import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-web'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('search provider Loader composition driver requires a config path')

const ctx = await bootProductionProfile({
  binName: 'web-search-vendors-loader-composition',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
})

try {
  // A pre-aborted search reaches the selected provider without starting a
  // request; a missing provider would fail selection first.
  let code = 'resolved'
  try {
    await ctx.web.search({ query: 'probe' }, AbortSignal.abort())
  } catch (error: unknown) {
    code = (error as { code?: string }).code ?? String(error)
  }
  process.stdout.write(`${JSON.stringify({ code })}\n`)
} finally {
  await ctx.fiber.dispose()
}
