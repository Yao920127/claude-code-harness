/**
 * Commander adapter for the `cch` command line: the Claude Code Harness
 * shorthand over the `dsh` launcher. Every command except `desktop` becomes a
 * `dsh` invocation on the `cch` profile, so `cch` adds no launcher behavior of
 * its own: `cch web --no-open` is `dsh --profile cch --no-open`, and
 * `cch plugin add <pkg>` is `dsh plugin --profile cch add <pkg>`. `desktop`,
 * the default command, opens the installed Desktop application, which owns
 * its own profile.
 * @module @deepseek-ai/dsh/cch-args
 */

import { Command, CommanderError } from 'commander'
import { parseDshArgs, type DshInvocation } from './args.ts'

/** The profile every `cch` command other than `desktop` selects. */
export const CCH_PROFILE = 'cch'

/** Open the installed Desktop application. */
interface DesktopInvocation {
  mode: 'desktop'
}

/** The resolved `cch` invocation. Help, version, and errors exit inside {@link parseCchArgs}. */
export type CchInvocation = DesktopInvocation | DshInvocation

const HELP_EXAMPLES = `
Examples:
  cch                        open the Claude Code Harness desktop app
  cch web                    serve the web app with the cch profile and open it in a browser
  cch web --no-open          serve the web app without opening a browser
  cch web --help             the web app's own flags and help
  cch plugin add <package>   install a plugin into the cch profile
  cch config                 print the cch profile's composed configuration
`

/**
 * Resolve `cch` argv into one invocation, or print and exit for help,
 * version, or an error.
 * @param argv - arguments after the Node binary and script.
 * @param version - version string printed by `--version`.
 * @returns the resolved invocation.
 */
export function parseCchArgs(argv: readonly string[], version: string): CchInvocation {
  let resolved: CchInvocation | undefined
  const program: Command = new Command()
  program
    .name('cch')
    .version(version, '-V, --version', 'output the version number')
    .description('cch: Claude Code Harness — the Desktop app, or the web app on the cch profile.')
    .addHelpText('after', HELP_EXAMPLES)
    .exitOverride()
    .helpCommand(false)
    .enablePositionalOptions()
  program.command('desktop', { isDefault: true })
    .description('open the installed desktop app (the default command)')
    .action(() => { resolved = { mode: 'desktop' } })
  program.command('web')
    .description('serve the web app with the cch profile; later arguments go to the web app')
    .helpOption(false)
    .allowUnknownOption()
    .passThroughOptions()
    .argument('[args...]', 'web app arguments, such as --no-open or --help')
    .action((args: string[]) => { resolved = parseDshArgs(['--profile', CCH_PROFILE, ...args], version) })
  program.command('plugin')
    .description('manage the cch profile\'s plugins by forwarding the arguments to pnpm')
    .helpOption(false)
    .allowUnknownOption()
    .passThroughOptions()
    .argument('<args...>', 'pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>, ...)')
    .action((args: string[]) => { resolved = parseDshArgs(['plugin', '--profile', CCH_PROFILE, ...args], version) })
  const config = program.command('config')
    .description('print the cch profile\'s composed configuration without booting it')
    .option('--default', 'omit your own settings layer and print only the bundle layers')
    .option('--schema', 'print the JSON Schema of the profile entries instead')
    .action((options: { default?: boolean; schema?: boolean }) => {
      if (options.default === true && options.schema === true) config.error('error: --default and --schema are mutually exclusive')
      const dump = options.schema === true ? '--dump-config-schema' : options.default === true ? '--dump-default-config' : '--dump-config'
      resolved = parseDshArgs(['--profile', CCH_PROFILE, dump], version)
    })

  try {
    program.parse(argv, { from: 'user' })
  } catch (error) {
    return process.exit(error instanceof CommanderError ? error.exitCode : 1)
  }
  /* v8 ignore next -- an action resolves or Commander throws */
  if (resolved === undefined) throw new Error('cch: no invocation resolved')
  return resolved
}
