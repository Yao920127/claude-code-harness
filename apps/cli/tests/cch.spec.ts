import { afterEach, describe, expect, it, vi } from 'vitest'
import { CCH_PROFILE, parseCchArgs } from '../src/cch-args.ts'
import { DESKTOP_APPLICATION, openDesktop, runCommand } from '../src/open-desktop.ts'

const parse = (argv: string[]) => parseCchArgs(argv, '1.2.3')

/** Capture the process exit code and printed output while muting Commander. */
function exit(argv: string[]): { code: number; output: string } {
  const code = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  let output = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { output += String(chunk); return true })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { output += String(chunk); return true })
  try {
    parse(argv)
    throw new Error(`expected ${JSON.stringify(argv)} to exit`)
  } catch {
    return { code: code.mock.calls.at(-1)?.[0] as number, output }
  } finally {
    vi.restoreAllMocks()
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('parseCchArgs', () => {
  it('opens the desktop app by default and on request', () => {
    expect(parse([])).toEqual({ mode: 'desktop' })
    expect(parse(['desktop'])).toEqual({ mode: 'desktop' })
  })

  it('boots the cch profile for web, handing every later argument to the web app', () => {
    expect(CCH_PROFILE).toBe('cch')
    expect(parse(['web'])).toEqual({ mode: 'profile', profile: 'cch', patches: [], args: [] })
    expect(parse(['web', '--no-open', '--port', '8080'])).toEqual({ mode: 'profile', profile: 'cch', patches: [], args: ['--no-open', '--port', '8080'] })
    expect(parse(['web', '--help'])).toEqual({ mode: 'profile', profile: 'cch', patches: [], args: ['--help'] })
  })

  it('forwards plugin arguments to the cch profile and requires some', () => {
    expect(parse(['plugin', 'add', 'pkg', '--save-exact'])).toEqual({ mode: 'plugin', profile: 'cch', args: ['add', 'pkg', '--save-exact'] })
    expect(exit(['plugin']).code).toBe(1)
  })

  it('prints the composed, bundle-only, or schema configuration of the cch profile', () => {
    expect(parse(['config'])).toEqual({ mode: 'dump-config', profile: 'cch', defaultOnly: false, patches: [] })
    expect(parse(['config', '--default'])).toEqual({ mode: 'dump-config', profile: 'cch', defaultOnly: true, patches: [] })
    expect(parse(['config', '--schema'])).toEqual({ mode: 'dump-config-schema', profile: 'cch', patches: [] })
    const both = exit(['config', '--default', '--schema'])
    expect(both.code).toBe(1)
    expect(both.output).toContain('--default and --schema are mutually exclusive')
  })

  it('prints help and version, and rejects unknown commands and options', () => {
    const help = exit(['--help'])
    expect(help.code).toBe(0)
    expect(help.output).toContain('cch web --no-open')
    expect(help.output).toMatch(/desktop +open the installed desktop app/u)
    expect(exit(['--version'])).toEqual({ code: 0, output: '1.2.3\n' })
    expect(exit(['--bogus']).code).toBe(1)
    expect(exit(['desktop', 'extra']).code).toBe(1)
  })
})

describe('openDesktop', () => {
  it('opens the named application on macOS, preferring CCH_DESKTOP_APP', async () => {
    const run = vi.fn(async () => ({ code: 0, stderr: '' }))
    await expect(openDesktop({ platform: 'darwin', env: {}, run })).resolves.toBeUndefined()
    expect(run).toHaveBeenLastCalledWith('open', ['-a', DESKTOP_APPLICATION])
    await openDesktop({ platform: 'darwin', env: { CCH_DESKTOP_APP: ' My Harness ' }, run })
    expect(run).toHaveBeenLastCalledWith('open', ['-a', 'My Harness'])
    await openDesktop({ platform: 'darwin', env: { CCH_DESKTOP_APP: '  ' }, run })
    expect(run).toHaveBeenLastCalledWith('open', ['-a', DESKTOP_APPLICATION])
  })

  it('explains a missing application and other platforms without opening anything', async () => {
    const missing = vi.fn(async () => ({ code: 1, stderr: 'Unable to find application named \'Claude Code Harness\'' }))
    await expect(openDesktop({ platform: 'darwin', env: {}, run: missing })).resolves
      .toBe('cch: cannot open the desktop app "Claude Code Harness" (Unable to find application named \'Claude Code Harness\'); install it, set CCH_DESKTOP_APP to its name or path, or run \'cch web\'')
    const silent = vi.fn(async () => ({ code: 1, stderr: '' }))
    await expect(openDesktop({ platform: 'darwin', env: {}, run: silent })).resolves.toContain('"Claude Code Harness"; install it')
    const never = vi.fn()
    await expect(openDesktop({ platform: 'linux', env: {}, run: never })).resolves.toContain('macOS only')
    expect(never).not.toHaveBeenCalled()
  })

  it('reports exit codes from real commands instead of throwing', async () => {
    await expect(runCommand(process.execPath, ['-e', ''])).resolves.toEqual({ code: 0, stderr: '' })
    await expect(runCommand(process.execPath, ['-e', 'console.error(" no "); process.exit(3)'])).resolves.toEqual({ code: 3, stderr: 'no' })
    await expect(runCommand('/nonexistent/cch-command', [])).resolves.toMatchObject({ code: 1 })
  })
})
