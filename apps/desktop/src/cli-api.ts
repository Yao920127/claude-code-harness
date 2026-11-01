/** Ids, sign-in states, and login outcomes of the coding-agent CLIs the Desktop app signs in to; imports nothing. */

/** Coding-agent CLIs the welcome offers, in display order; signing in to any one of them is optional. */
export const CLI_PROVIDERS = ['claude-code', 'codex', 'antigravity', 'grok', 'opencode'] as const

/** One coding-agent CLI the welcome can sign in to. */
export type CliProviderId = typeof CLI_PROVIDERS[number]

/** Sign-in state reported by a CLI; `unavailable` means the CLI is not installed or could not run or answer. */
export type CliStatus =
  | { readonly state: 'signed-in'; readonly email?: string }
  | { readonly state: 'signed-out' }
  | { readonly state: 'unavailable' }

/** Outcome of one CLI login; `terminal` means the login continues in a terminal window and its outcome is unknown. */
export type CliLoginResult = 'signed-in' | 'failed' | 'cancelled' | 'terminal'
