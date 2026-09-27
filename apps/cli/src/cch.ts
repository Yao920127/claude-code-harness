#!/usr/bin/env node
/**
 * Command-line entry for cch, the Claude Code Harness shorthand over dsh.
 * @module @deepseek-ai/dsh/cch
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { parseCchArgs } from './cch-args.ts'
import { openDesktop, runCommand } from './open-desktop.ts'
import { runInvocation } from './run-invocation.ts'

/**
 * Run the public cch command-line interface.
 * @returns a promise that settles when the selected command finishes.
 */
export async function runCchCli(): Promise<void> {
  const version = getDshRuntimeVersion()
  const invocation = parseCchArgs(process.argv.slice(2), version)
  if (invocation.mode !== 'desktop') {
    await runInvocation(invocation, version)
    return
  }
  const failure = await openDesktop({ platform: process.platform, env: process.env, run: runCommand })
  if (failure === undefined) return
  process.stderr.write(`${failure}\n`)
  process.exit(1)
}

if (import.meta.main) {
  await runCchCli()
}
