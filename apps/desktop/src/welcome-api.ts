/** Operations available to the isolated native welcome renderer. */

import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { DesktopLocale } from './locale.ts'
import { CLI_PROVIDERS, type CliLoginResult, type CliProviderId, type CliStatus } from './cli-api.ts'

export { CLI_PROVIDERS } from './cli-api.ts'
export type { CliLoginResult, CliProviderId, CliStatus } from './cli-api.ts'

/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  takeNotice: 'dsh-welcome:take-notice',
  cliStatus: 'dsh-welcome:cli-status',
  cliSignIn: 'dsh-welcome:cli-sign-in',
  cliSubmitCode: 'dsh-welcome:cli-submit-code',
  cliCancel: 'dsh-welcome:cli-cancel',
} as const


/**
 * How a CLI's login proceeds: `browser-code` accepts a pasted authorization code, `browser` completes through the
 * browser redirect alone, and `terminal` continues in a terminal window the user drives.
 */
export type CliLoginMode = 'browser-code' | 'browser' | 'terminal'

/** Product name and login mode of each CLI. */
export const CLI_PROVIDER_INFO: { readonly [Id in CliProviderId]: { readonly name: string; readonly mode: CliLoginMode } } = {
  'claude-code': { name: 'Claude Code', mode: 'browser-code' },
  codex: { name: 'Codex', mode: 'browser' },
  antigravity: { name: 'Antigravity', mode: 'terminal' },
  grok: { name: 'Grok', mode: 'browser' },
  opencode: { name: 'OpenCode', mode: 'terminal' },
}

/**
 * Check a renderer-supplied CLI id.
 * @param value - IPC argument.
 * @returns Whether the value names an offered CLI.
 */
export function isCliProvider(value: unknown): value is CliProviderId {
  return typeof value === 'string' && (CLI_PROVIDERS as readonly string[]).includes(value)
}


/** Credential writes return a safe outcome without exposing Host diagnostics. */
export type WelcomeSaveResult = { readonly ok: true } | { readonly ok: false }

/** One-time notification retained by the main process until Welcome receives it. */
export type WelcomeNotice = 'session-expired'

/** Host-owned operations used by the welcome window. */
export interface WelcomeOperations {
  /** @returns the pending notification, clearing it before another renderer can receive it. */
  takeNotice(): Promise<WelcomeNotice | undefined>
  /** @returns account state after starting a login attempt. */
  startSignIn(): Promise<AccountView>
  /** @param id - attempt to cancel. @returns the settled state. */
  cancelSignIn(id: SignInAttemptId): Promise<AccountView>
  /** @param id - current waiting attempt whose authorization URL is copied to the system clipboard. */
  copySignInLink(id: SignInAttemptId): Promise<void>

  /**
   * Store the official provider's key before entering the workspace.
   * @param value - validated, trimmed API key.
   * @returns whether the write completed, without private error details.
   */
  saveApiKey(value: string): Promise<WelcomeSaveResult>
  /**
   * Enter the workspace without writing an onboarding-completion setting.
   * @returns completion after the workspace opens.
   */
  skip(): Promise<void>
  /** @param provider - CLI to read. @returns the CLI's current sign-in state. */
  cliStatus(provider: CliProviderId): Promise<CliStatus>
  /** @param provider - CLI to sign in to. @returns how the login started by the CLI ended. */
  cliSignIn(provider: CliProviderId): Promise<CliLoginResult>
  /**
   * @param provider - CLI whose running login receives the code.
   * @param code - authorization code shown by the browser.
   * @returns whether a running login received it.
   */
  cliSubmitCode(provider: CliProviderId, code: string): Promise<boolean>
  /** @param provider - CLI whose running login stops. */
  cliCancel(provider: CliProviderId): Promise<void>
}

/** The renderer receives localized copy, login operations, and safe account snapshots. */
export type WelcomeApi = DesktopLocale & WelcomeOperations & {
  /** Whether the profile uses the Claude Code model route, whose CLI sign-in choices replace the account and API-key pages. */
  readonly cliLogin: boolean
  /** @param listener - safe account snapshot recipient. @returns subscription disposer. */
  onAccountState(listener: (state: AccountView) => void): () => void
}

/** Authentication facts supplied at cold start or after a completed sign-out. */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
  /** `absent` when the profile has no Claude Code model route; otherwise whether any offered CLI is signed in. */
  readonly cli: 'absent' | 'signed-in' | 'signed-out'
}

/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * A profile with the Claude Code route opens the workspace directly once any offered CLI is signed in.
 * @param authentication - current account, independently stored API-key, and Claude Code facts.
 * @returns true only when the profile's model routes cannot serve the workspace.
 */
export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  if (authentication.cli !== 'absent') return authentication.cli !== 'signed-in'
  return !authentication.loggedIn && !authentication.hasApiKey
}
