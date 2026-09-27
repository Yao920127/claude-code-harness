/**
 * Dispatch of a resolved launcher invocation, shared by the `dsh` and `cch`
 * entries. It lives outside both entries so bundling keeps each entry's
 * self-executing guard in its own output file.
 * @module @deepseek-ai/dsh/run-invocation
 */

/* v8 ignore file -- built-bin acceptance exercises every dispatched mode. */

import { loadLayeredEnv, StartupError } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { DshInvocation } from './args.ts'
import { reportStartupFailure } from './startup-diagnostics.ts'

/**
 * Run one resolved launcher invocation; `dsh` and `cch` both dispatch here.
 * @param invocation - the resolved command mode and its arguments.
 * @param version - the running dsh version, for startup diagnostics.
 * @returns a promise that settles when the selected command mode finishes.
 */
export async function runInvocation(invocation: DshInvocation, version: string): Promise<void> {
  switch (invocation.mode) {
    case 'profile': {
      const { runProfile } = await import('./profile-boot.ts')
      try {
        await runProfile({
          environment: loadLayeredEnv('dsh'),
          profile: invocation.profile,
          fromDefaultProfile: invocation.fromDefaultProfile,
          patchFiles: invocation.patches,
          args: invocation.args,
        })
      } catch (error) {
        if (!(error instanceof StartupError)) throw error
        await reportStartupFailure(error, { home: resolveDshHome(), version, profile: invocation.profile })
        process.exit(1)
      }
      break
    }
    case 'plugin': {
      const { runPlugin } = await import('./plugin.ts')
      process.exit(await runPlugin(invocation.profile, invocation.args))
      break
    }
    case 'dump-config': {
      const { runDumpConfig } = await import('./dump-config.ts')
      runDumpConfig(
        invocation.profile,
        invocation.defaultOnly,
        invocation.patches,
        invocation.fromDefaultProfile,
      )
      break
    }
    case 'dump-config-schema': {
      const { runDumpConfigSchema } = await import('./dump-config-schema.ts')
      await runDumpConfigSchema(invocation.profile, invocation.patches, invocation.fromDefaultProfile)
      break
    }
    default:
      invocation satisfies never
      throw new Error(`dsh: unhandled invocation mode ${JSON.stringify(invocation)}`)
  }
}
