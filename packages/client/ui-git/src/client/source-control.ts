/**
 * Browser state of Source Control: each Session's repository status, its
 * draft commit message, and the one GitHub sign-in and repository list every
 * Session shares. Every command goes to the Host's `git` Remote; one command
 * runs at a time per repository, and its answer replaces the shown status.
 */
import { createSnapshotStore, type ObservableSnapshot, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  GitStatusView, GithubAccountView, GithubCloneResult, GithubLoginPrompt, GithubRepository, GithubVisibility,
} from '../types.ts'

/** Host commands, each resolving with its business result or rejecting with the Host's error. */
export interface GitCommands {
  readonly status: (sessionId: SessionId) => Promise<GitStatusView>
  readonly init: (sessionId: SessionId) => Promise<GitStatusView>
  readonly stage: (sessionId: SessionId, paths: readonly string[]) => Promise<GitStatusView>
  readonly unstage: (sessionId: SessionId, paths: readonly string[]) => Promise<GitStatusView>
  readonly commit: (sessionId: SessionId, message: string) => Promise<GitStatusView>
  readonly push: (sessionId: SessionId) => Promise<GitStatusView>
  readonly pull: (sessionId: SessionId) => Promise<GitStatusView>
  readonly githubAccount: () => Promise<GithubAccountView>
  readonly githubLogin: () => Promise<GithubLoginPrompt>
  readonly githubLogout: () => Promise<GithubAccountView>
  readonly githubRepositories: () => Promise<GithubRepository[]>
  readonly githubClone: (nameWithOwner: string) => Promise<GithubCloneResult>
  readonly githubPublish: (sessionId: SessionId, visibility: GithubVisibility) => Promise<GitStatusView>
}

/** A command the page is running; the page disables the controls while one runs. */
export type GitAction = 'refresh' | 'init' | 'stage' | 'unstage' | 'commit' | 'push' | 'pull' | 'publish'

/** One outcome message under the page's controls. */
export type GitNotice =
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'cloned'; readonly path: string }

/** One Session's repository on the page. */
export interface RepositoryState {
  /** Latest status; undefined until the first read settles. */
  readonly view: GitStatusView | undefined
  /** Command running for this repository, or null. */
  readonly busy: GitAction | null
  readonly notice: GitNotice | null
  /** Draft commit message. */
  readonly message: string
}

/** The GitHub sign-in and repository list every Session shares. */
export interface GithubState {
  /** Latest sign-in state; undefined until the first read settles. */
  readonly account: GithubAccountView | undefined
  /** Signed-in user's repositories; undefined until they are listed. */
  readonly repositories: readonly GithubRepository[] | undefined
  /** GitHub command running, or null. */
  readonly busy: 'account' | 'login' | 'logout' | 'repositories' | 'clone' | null
  readonly notice: GitNotice | null
}

const EMPTY_REPOSITORY: RepositoryState = { view: undefined, busy: null, notice: null, message: '' }

/** Owns every Session's repository state and the shared GitHub state. */
export class SourceControl {
  private readonly repositories = new Map<SessionId, SnapshotStore<RepositoryState>>()
  private readonly githubStore = createSnapshotStore<GithubState>({ account: undefined, repositories: undefined, busy: null, notice: null })
  private loginPoll: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  /**
   * @param commands - Host Git commands.
   * @param loginPollMs - milliseconds between sign-in checks while a GitHub sign-in waits for its code.
   * @param openUrl - opens GitHub's code page in the system browser.
   */
  constructor(
    private readonly commands: GitCommands,
    private readonly loginPollMs: number,
    private readonly openUrl: (url: string) => void,
  ) {}

  /**
   * Observe one Session's repository.
   * @param sessionId - owning Session.
   * @returns the same observable for every call.
   */
  repository(sessionId: SessionId): ObservableSnapshot<RepositoryState> {
    return this.store(sessionId)
  }

  /** The shared GitHub state. */
  get github(): ObservableSnapshot<GithubState> { return this.githubStore }

  /**
   * Read the repository status again.
   * @param sessionId - owning Session.
   */
  refresh(sessionId: SessionId): void {
    this.run(sessionId, 'refresh', () => this.commands.status(sessionId))
  }

  /**
   * Replace the draft commit message.
   * @param sessionId - owning Session.
   * @param message - new draft.
   */
  setMessage(sessionId: SessionId, message: string): void {
    const store = this.store(sessionId)
    store.set({ ...store.getSnapshot(), message })
  }

  /**
   * Create a repository in the Session's folder.
   * @param sessionId - Session whose folder becomes a repository.
   */
  init(sessionId: SessionId): void {
    this.run(sessionId, 'init', () => this.commands.init(sessionId))
  }

  /**
   * Stage changed paths.
   * @param sessionId - owning Session.
   * @param paths - paths to stage; empty stages every change.
   */
  stage(sessionId: SessionId, paths: readonly string[]): void {
    this.run(sessionId, 'stage', () => this.commands.stage(sessionId, paths))
  }

  /**
   * Unstage paths, keeping their changes.
   * @param sessionId - owning Session.
   * @param paths - paths to unstage; empty unstages every change.
   */
  unstage(sessionId: SessionId, paths: readonly string[]): void {
    this.run(sessionId, 'unstage', () => this.commands.unstage(sessionId, paths))
  }

  /**
   * Commit with the draft message, then push when asked; a successful commit clears the draft.
   * @param sessionId - owning Session.
   * @param push - push after committing.
   */
  commit(sessionId: SessionId, push: boolean): void {
    const message = this.store(sessionId).getSnapshot().message
    this.run(sessionId, 'commit', async () => {
      const committed = await this.commands.commit(sessionId, message)
      this.setMessage(sessionId, '')
      return push ? await this.commands.push(sessionId) : committed
    })
  }

  /**
   * Push the current branch.
   * @param sessionId - owning Session.
   */
  push(sessionId: SessionId): void {
    this.run(sessionId, 'push', () => this.commands.push(sessionId))
  }

  /**
   * Fast-forward the current branch to its upstream.
   * @param sessionId - owning Session.
   */
  pull(sessionId: SessionId): void {
    this.run(sessionId, 'pull', () => this.commands.pull(sessionId))
  }

  /**
   * Pull, then push.
   * @param sessionId - owning Session.
   */
  sync(sessionId: SessionId): void {
    this.run(sessionId, 'pull', async () => {
      await this.commands.pull(sessionId)
      return await this.commands.push(sessionId)
    })
  }

  /**
   * Create a GitHub repository from the Session's repository and push to it.
   * @param sessionId - owning Session.
   * @param visibility - visibility of the new GitHub repository.
   */
  publish(sessionId: SessionId, visibility: GithubVisibility): void {
    this.run(sessionId, 'publish', () => this.commands.githubPublish(sessionId, visibility))
  }

  /** Read the GitHub sign-in again. */
  refreshAccount(): void {
    this.runGithub('account', async () => ({ account: await this.commands.githubAccount() }))
  }

  /** Start a GitHub sign-in, open its code page, and check until the user finishes it. */
  login(): void {
    this.runGithub('login', async () => {
      const prompt = await this.commands.githubLogin()
      this.openUrl(prompt.url)
      this.scheduleLoginPoll()
      return { account: await this.commands.githubAccount() }
    })
  }

  /** Sign GitHub out. */
  logout(): void {
    this.runGithub('logout', async () => ({ account: await this.commands.githubLogout(), repositories: undefined }))
  }

  /** List the signed-in user's repositories. */
  loadRepositories(): void {
    this.runGithub('repositories', async () => ({ repositories: await this.commands.githubRepositories() }))
  }

  /**
   * Clone a repository and add it as a Workspace.
   * @param nameWithOwner - `owner/name` of the repository.
   */
  clone(nameWithOwner: string): void {
    this.runGithub('clone', async () => {
      const result = await this.commands.githubClone(nameWithOwner)
      return { repositories: await this.commands.githubRepositories(), notice: { kind: 'cloned', path: result.path } }
    })
  }

  /** Stop checking a waiting sign-in and ignore commands that settle later. */
  dispose(): void {
    this.disposed = true
    clearTimeout(this.loginPoll)
  }

  private scheduleLoginPoll(): void {
    clearTimeout(this.loginPoll)
    // dispose() clears this timer, so its callback only runs while the plugin is loaded.
    this.loginPoll = setTimeout(() => {
      this.loginPoll = undefined
      void this.commands.githubAccount().then((account) => {
        if (this.disposed) return
        this.githubStore.set({ ...this.githubStore.getSnapshot(), account })
        if (account.cli === 'ready' && account.pending !== null) this.scheduleLoginPoll()
      }, () => { if (!this.disposed) this.scheduleLoginPoll() })
    }, this.loginPollMs)
  }

  private store(sessionId: SessionId): SnapshotStore<RepositoryState> {
    let store = this.repositories.get(sessionId)
    if (store === undefined) {
      store = createSnapshotStore<RepositoryState>(EMPTY_REPOSITORY)
      this.repositories.set(sessionId, store)
    }
    return store
  }

  private run(sessionId: SessionId, action: GitAction, command: () => Promise<GitStatusView>): void {
    const store = this.store(sessionId)
    if (store.getSnapshot().busy !== null) return
    store.set({ ...store.getSnapshot(), busy: action, notice: null })
    command().then((view) => {
      if (!this.disposed) store.set({ ...store.getSnapshot(), view, busy: null })
    }, (error: unknown) => {
      if (this.disposed) return
      store.set({ ...store.getSnapshot(), busy: null, notice: { kind: 'error', message: errorMessage(error) } })
      // A failed command can still have changed the repository, such as a commit before a failed push.
      if (action !== 'refresh') void this.commands.status(sessionId).then((view) => {
        if (!this.disposed) store.set({ ...store.getSnapshot(), view })
      }, () => undefined)
    })
  }

  private runGithub(busy: NonNullable<GithubState['busy']>, command: () => Promise<Partial<GithubState>>): void {
    if (this.githubStore.getSnapshot().busy !== null) return
    this.githubStore.set({ ...this.githubStore.getSnapshot(), busy, notice: null })
    command().then((patch) => {
      if (!this.disposed) this.githubStore.set({ ...this.githubStore.getSnapshot(), ...patch, busy: null })
    }, (error: unknown) => {
      if (!this.disposed) this.githubStore.set({ ...this.githubStore.getSnapshot(), busy: null, notice: { kind: 'error', message: errorMessage(error) } })
    })
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
