/** Operations available to the isolated native welcome renderer. */

import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { DesktopLocale } from './locale.ts'

/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  takeNotice: 'dsh-welcome:take-notice',
  claudeCodeStatus: 'dsh-welcome:claude-code-status',
  claudeCodeSignIn: 'dsh-welcome:claude-code-sign-in',
  claudeCodeSubmitCode: 'dsh-welcome:claude-code-submit-code',
  claudeCodeCancel: 'dsh-welcome:claude-code-cancel',
} as const

/** Sign-in state reported by `claude auth status`; `unavailable` means the CLI could not run or answer. */
export type ClaudeCodeStatus =
  | { readonly state: 'signed-in'; readonly email?: string }
  | { readonly state: 'signed-out' }
  | { readonly state: 'unavailable' }

/** Outcome of one `claude auth login` run. */
export type ClaudeCodeLoginResult = 'signed-in' | 'failed' | 'cancelled'

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
  /** @returns the Claude Code CLI's current sign-in state. */
  claudeCodeStatus(): Promise<ClaudeCodeStatus>
  /** @returns how the browser login started by the Claude Code CLI ended. */
  claudeCodeSignIn(): Promise<ClaudeCodeLoginResult>
  /** @param code - authorization code shown by the browser. @returns whether a running login received it. */
  claudeCodeSubmitCode(code: string): Promise<boolean>
  /** Stop the running Claude Code login. */
  claudeCodeCancel(): Promise<void>
}

/** The renderer receives localized copy, login operations, and safe account snapshots. */
export type WelcomeApi = DesktopLocale & WelcomeOperations & {
  /** Whether the profile uses the Claude Code model route, which replaces the account and API-key pages. */
  readonly claudeCode: boolean
  /** @param listener - safe account snapshot recipient. @returns subscription disposer. */
  onAccountState(listener: (state: AccountView) => void): () => void
}

/** Authentication facts supplied at cold start or after a completed sign-out. */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
  /** `absent` when the profile has no Claude Code model route; otherwise the Claude Code CLI's sign-in state. */
  readonly claudeCode: 'absent' | ClaudeCodeStatus['state']
}

/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * A profile with the Claude Code route serves the workspace only through a signed-in Claude Code CLI.
 * @param authentication - current account, independently stored API-key, and Claude Code facts.
 * @returns true only when the profile's model routes cannot serve the workspace.
 */
export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  if (authentication.claudeCode !== 'absent') return authentication.claudeCode !== 'signed-in'
  return !authentication.loggedIn && !authentication.hasApiKey
}
