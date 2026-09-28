/** Wire types shared by the Git Remote and the Source Control page. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** How one side of a changed path differs. */
export type GitChangeKind = 'modified' | 'type-changed' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted'

/** One changed path: its staged side against HEAD and its unstaged side against the index. */
export interface GitFileChange {
  /** Path relative to the repository root. */
  readonly path: string
  /** Former path of a rename or copy. */
  readonly originalPath?: string
  /** Change recorded in the index; absent when the index matches HEAD. */
  readonly staged?: GitChangeKind
  /** Change in the working tree; absent when it matches the index. */
  readonly unstaged?: GitChangeKind
}

/** Repository state of one Session's working directory. */
export type GitStatusView =
  | {
    readonly repository: false
    /** The Session's working directory. */
    readonly directory: string
  }
  | {
    readonly repository: true
    readonly directory: string
    /** Repository root containing the directory. */
    readonly root: string
    /** Checked-out branch; null while HEAD is detached. */
    readonly branch: string | null
    /** Upstream branch, such as `origin/main`; null when none is set. */
    readonly upstream: string | null
    /** Commits on the branch that its upstream lacks. */
    readonly ahead: number
    /** Commits on the upstream that the branch lacks. */
    readonly behind: number
    /** URL of the `origin` remote; null when the repository has none. */
    readonly remoteUrl: string | null
    /** Changed paths in `git status` order. */
    readonly changes: readonly GitFileChange[]
  }

/** Device-flow prompt of a GitHub sign-in in progress. */
export interface GithubLoginPrompt {
  /** One-time code the user enters on GitHub. */
  readonly code: string
  /** Page where the user enters the code. */
  readonly url: string
}

/** GitHub sign-in state of the Host's GitHub CLI. */
export type GithubAccountView =
  | { readonly cli: 'missing' }
  | {
    readonly cli: 'ready'
    /** Signed-in GitHub user; null when signed out. */
    readonly login: string | null
    /** Sign-in waiting for the user to enter its code; null when none is running. */
    readonly pending: GithubLoginPrompt | null
  }

/** One repository of the signed-in GitHub user. */
export interface GithubRepository {
  /** `owner/name`. */
  readonly nameWithOwner: string
  readonly description: string | null
  readonly isPrivate: boolean
  /** ISO 8601 time of the last update. */
  readonly updatedAt: string
  readonly url: string
  /** Local directory the repository clones to, when it already exists there. */
  readonly localPath: string | null
}

/** Where a cloned repository landed. */
export interface GithubCloneResult {
  /** Local directory of the clone. */
  readonly path: string
}

/** Visibility of a repository published to GitHub. */
export type GithubVisibility = 'private' | 'public'

/** A Session whose working directory a Git operation targets. */
export type GitSessionId = SessionId

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The Session is unknown or has no working directory. */
    'git/no-directory': { readonly sessionId: string }
    /** A required command-line program is not installed. */
    'git/program-missing': { readonly program: string }
    /** A `git` or `gh` command exited unsuccessfully; `output` holds its diagnostics. */
    'git/command-failed': { readonly command: string; readonly output: string }
    /** The request is not valid for the repository's current state. */
    'git/invalid-request': { readonly reason: string }
  }
}
