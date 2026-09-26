#!/usr/bin/env node
/** Inspect the public Claude Code model-route Bundle composition without invoking the product. */

import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-llm'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const configPath = process.argv[2]
const bundlePatchPath = process.argv[3]
if (configPath === undefined || bundlePatchPath === undefined) {
  throw new Error('Claude Code route Loader composition driver requires config and Bundle patch paths')
}

const ctx = await bootProductionProfile({
  binName: 'llm-claude-code-loader-composition',
  profile: 'headless',
  overlayPaths: [
    resolveConfigPath(bundlePatchPath, undefined),
    resolveConfigPath(configPath, undefined),
  ],
})

try {
  const provider = ctx.llm.listProviders().find(info => info.id === 'claude-code')
  process.stdout.write(`${JSON.stringify({ provider })}\n`)
} finally {
  await ctx.fiber.dispose()
}
