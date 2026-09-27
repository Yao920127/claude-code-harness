/**
 * `pnpm cch web [args...]`: boot the Web application on the `cch` profile, the
 * same bundles Desktop composes, through the dsh launcher. Arguments after
 * `web` reach the Web application, so `pnpm cch web --no-open` serves without
 * opening a browser.
 */
import { spawn } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)
if (command !== 'web') {
  console.error('usage: pnpm cch web [--no-open] [--port <port>] [...web app arguments]')
  process.exit(1)
}

const child = spawn(process.execPath, [
  '--import',
  'tsx/esm',
  'apps/cli/src/bin.ts',
  '--profile',
  'cch',
  ...args,
], { stdio: 'inherit' })
child.on('exit', (code, signal) => { process.exit(signal !== null ? 1 : code ?? 1) })
