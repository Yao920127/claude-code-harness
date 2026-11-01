/** The Desktop bridge that reads and runs the sign-in of the CLIs the model routes use. */

/** CLIs whose own sign-in a model route uses, in display order. */
export const SIGN_IN_CLIS = ['claude-code', 'codex', 'antigravity', 'grok', 'opencode'] as const

/** One CLI whose own sign-in a model route uses. */
export type SignInCli = typeof SIGN_IN_CLIS[number]

/** Product name of each CLI and whether its login asks for a pasted authorization code. */
export const SIGN_IN_CLI_INFO: { readonly [Id in SignInCli]: { readonly name: string; readonly pastesCode: boolean } } = {
  'claude-code': { name: 'Claude Code', pastesCode: true },
  codex: { name: 'Codex', pastesCode: false },
  antigravity: { name: 'Antigravity', pastesCode: false },
  grok: { name: 'Grok Build', pastesCode: false },
  opencode: { name: 'OpenCode', pastesCode: false },
}

/** Stored sign-in state of one CLI; `unavailable` means the CLI is not installed or could not run. */
export type CliSignInStatus =
  | { readonly state: 'signed-in'; readonly email?: string }
  | { readonly state: 'signed-out' }
  | { readonly state: 'unavailable' }

/** How one login ended; `terminal` means it continues in a terminal window. */
export type CliSignInResult = 'signed-in' | 'failed' | 'cancelled' | 'terminal'

/** Sign-in operations the Desktop main process runs for the product window. */
export interface CliSignInBridge {
  status(provider: SignInCli): Promise<CliSignInStatus>
  signIn(provider: SignInCli): Promise<CliSignInResult>
  submitCode(provider: SignInCli, code: string): Promise<boolean>
  cancel(provider: SignInCli): Promise<void>
}

/**
 * Read the Desktop sign-in bridge.
 * @param carrier - the global object a Desktop preload extends.
 * @returns the bridge, or undefined outside the Desktop app or in a Desktop build without it.
 */
export function signInBridge(carrier: object = globalThis): CliSignInBridge | undefined {
  const desktop = (carrier as { readonly dshDesktop?: { readonly cli?: CliSignInBridge } }).dshDesktop
  return desktop?.cli
}
