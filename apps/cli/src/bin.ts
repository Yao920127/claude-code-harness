#!/usr/bin/env node
/**
 * Command-line entry for dsh.
 * @module @deepseek-ai/dsh/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { parseDshArgs } from './args.ts'
import { runInvocation } from './run-invocation.ts'

/**
 * Run the public dsh command-line interface.
 * @returns a promise that settles when the selected command mode finishes.
 */
export async function runCli(): Promise<void> {
  const version = getDshRuntimeVersion()
  await runInvocation(parseDshArgs(process.argv.slice(2), version), version)
}

if (import.meta.main) {
  await runCli()
}
