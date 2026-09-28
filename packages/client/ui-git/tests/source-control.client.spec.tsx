// @vitest-environment jsdom
/** Source Control state, page, tab type, and plugin lifetime as a user operates them. */
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { GuideArtworkSourceControl, SOURCE_CONTROL_ID, SOURCE_CONTROL_KIND, sourceControlDefinition } from '../src/client/definition.tsx'
import { en, zh } from '../src/client/locales.ts'
import { SourceControl, type GitCommands } from '../src/client/source-control.ts'
import { SourceControlBody, type SourceControlBodyProps, type SourceControlInjected } from '../src/client/SourceControlBody.tsx'
import type { GitStatusView, GithubAccountView, GithubRepository } from '../src/types.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

const t = makeTranslate(en)
const SESSION = 'session-1' as SessionId

const clean: GitStatusView = {
  repository: true, directory: '/work', root: '/work', branch: 'main', upstream: 'origin/main',
  ahead: 1, behind: 0, remoteUrl: 'https://github.com/octocat/work.git', changes: [],
}
const dirty: GitStatusView = {
  ...clean,
  changes: [
    { path: 'staged.ts', staged: 'modified' },
    { path: 'both.ts', staged: 'added', unstaged: 'deleted' },
    { path: 'new name.ts', originalPath: 'old.ts', staged: 'renamed' },
    { path: 'untracked.txt', unstaged: 'untracked' },
  ],
}
const signedIn: GithubAccountView = { cli: 'ready', login: 'octocat', pending: null }
const repositories: GithubRepository[] = [
  { nameWithOwner: 'octocat/hello', description: null, isPrivate: false, updatedAt: '', url: 'https://github.com/octocat/hello', localPath: null },
  { nameWithOwner: 'octocat/secret', description: 'Notes', isPrivate: true, updatedAt: '', url: 'https://github.com/octocat/secret', localPath: '/clones/secret' },
]

function commands(overrides: Partial<GitCommands> = {}): GitCommands {
  return {
    status: vi.fn(async () => clean),
    init: vi.fn(async () => clean),
    stage: vi.fn(async () => dirty),
    unstage: vi.fn(async () => dirty),
    commit: vi.fn(async () => clean),
    push: vi.fn(async () => ({ ...clean, ahead: 0 })),
    pull: vi.fn(async () => clean),
    githubAccount: vi.fn(async () => signedIn),
    githubLogin: vi.fn(async () => ({ code: 'ABCD-1234', url: 'https://github.com/login/device' })),
    githubLogout: vi.fn(async (): Promise<GithubAccountView> => ({ cli: 'ready', login: null, pending: null })),
    githubRepositories: vi.fn(async () => repositories),
    githubClone: vi.fn(async () => ({ path: '/clones/hello' })),
    githubPublish: vi.fn(async () => clean),
    ...overrides,
  }
}

function settle(): Promise<void> {
  return act(async () => { for (let turn = 0; turn < 5; turn++) await Promise.resolve() })
}

describe('SourceControl', () => {
  it('runs one command at a time per repository and keeps the latest status', async () => {
    const git = commands()
    const control = new SourceControl(git, 1_000, vi.fn())
    const repository = control.repository(SESSION)
    expect(control.repository(SESSION)).toBe(repository)
    control.refresh(SESSION)
    control.init(SESSION)
    expect(repository.getSnapshot().busy).toBe('refresh')
    await settle()
    expect(git.init).not.toHaveBeenCalled()
    expect(repository.getSnapshot()).toMatchObject({ view: clean, busy: null })
    for (const run of [
      () => { control.init(SESSION) }, () => { control.stage(SESSION, ['a']) }, () => { control.unstage(SESSION, []) },
      () => { control.push(SESSION) }, () => { control.pull(SESSION) }, () => { control.publish(SESSION, 'public') },
    ]) {
      run()
      await settle()
    }
    expect(git.stage).toHaveBeenCalledWith(SESSION, ['a'])
    expect(git.unstage).toHaveBeenCalledWith(SESSION, [])
    expect(git.githubPublish).toHaveBeenCalledWith(SESSION, 'public')
    control.setMessage(SESSION, 'fix')
    control.commit(SESSION, true)
    await settle()
    expect(git.commit).toHaveBeenCalledWith(SESSION, 'fix')
    expect(repository.getSnapshot()).toMatchObject({ message: '', view: { ahead: 0 } })
    control.setMessage(SESSION, 'only commit')
    control.commit(SESSION, false)
    await settle()
    expect(git.push).toHaveBeenCalledTimes(2)
    control.sync(SESSION)
    await settle()
    expect(git.pull).toHaveBeenCalledTimes(2)
    expect(git.push).toHaveBeenCalledTimes(3)
  })

  it('reports a failure and rereads the status a failed command may have changed', async () => {
    const git = commands({
      push: vi.fn(async () => { throw new Error('rejected') }),
      status: vi.fn().mockRejectedValueOnce('offline').mockResolvedValue(dirty),
    })
    const control = new SourceControl(git, 1_000, vi.fn())
    control.refresh(SESSION)
    await settle()
    expect(control.repository(SESSION).getSnapshot()).toMatchObject({ busy: null, notice: { kind: 'error', message: 'offline' } })
    expect(git.status).toHaveBeenCalledOnce()
    control.push(SESSION)
    await settle()
    expect(control.repository(SESSION).getSnapshot()).toMatchObject({ view: dirty, notice: { kind: 'error', message: 'rejected' } })
    const failing = commands({ push: vi.fn(async () => { throw new Error('rejected') }), status: vi.fn(async () => { throw new Error('gone') }) })
    const other = new SourceControl(failing, 1_000, vi.fn())
    other.push(SESSION)
    await settle()
    expect(other.repository(SESSION).getSnapshot()).toMatchObject({ view: undefined, notice: { message: 'rejected' } })
  })

  it('signs in through the device page and checks until the sign-in completes', async () => {
    vi.useFakeTimers()
    const pending: GithubAccountView = { cli: 'ready', login: null, pending: { code: 'ABCD-1234', url: 'https://github.com/login/device' } }
    const git = commands({
      githubAccount: vi.fn()
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(pending)
        .mockRejectedValueOnce(new Error('blip'))
        .mockResolvedValue(signedIn),
    })
    const open = vi.fn()
    const control = new SourceControl(git, 1_000, open)
    control.login()
    control.logout()
    await settle()
    expect(open).toHaveBeenCalledWith('https://github.com/login/device')
    expect(git.githubLogout).not.toHaveBeenCalled()
    expect(control.github.getSnapshot()).toMatchObject({ account: pending, busy: null })
    for (let check = 0; check < 3; check++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    }
    expect(control.github.getSnapshot().account).toEqual(signedIn)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(git.githubAccount).toHaveBeenCalledTimes(4)
  })

  it('lists, clones, signs out, and reports GitHub failures', async () => {
    const git = commands({ githubRepositories: vi.fn().mockResolvedValueOnce(repositories).mockResolvedValueOnce(repositories).mockRejectedValue(new Error('signed out')) })
    const control = new SourceControl(git, 1_000, vi.fn())
    control.refreshAccount()
    await settle()
    control.loadRepositories()
    await settle()
    expect(control.github.getSnapshot()).toMatchObject({ account: signedIn, repositories })
    control.clone('octocat/hello')
    await settle()
    expect(control.github.getSnapshot().notice).toEqual({ kind: 'cloned', path: '/clones/hello' })
    control.logout()
    await settle()
    expect(control.github.getSnapshot()).toMatchObject({ account: { login: null }, repositories: undefined })
    control.loadRepositories()
    await settle()
    expect(control.github.getSnapshot().notice).toEqual({ kind: 'error', message: 'signed out' })
  })

  it('ignores answers and sign-in checks that arrive after unloading', async () => {
    vi.useFakeTimers()
    let answer!: (view: GitStatusView) => void
    let account!: (view: GithubAccountView) => void
    let failAccount!: (error: Error) => void
    const git = commands({
      status: vi.fn(() => new Promise<GitStatusView>((resolve) => { answer = resolve })),
      githubAccount: vi.fn(() => new Promise<GithubAccountView>((resolve, reject) => { account = resolve; failAccount = reject })),
    })
    const control = new SourceControl(git, 1_000, vi.fn())
    control.refresh(SESSION)
    control.refreshAccount()
    control.dispose()
    answer(clean)
    account(signedIn)
    await settle()
    expect(control.repository(SESSION).getSnapshot().view).toBeUndefined()
    expect(control.github.getSnapshot().account).toBeUndefined()
    const failing = new SourceControl(commands({
      push: vi.fn(async () => { throw new Error('x') }),
      status: vi.fn(() => new Promise<GitStatusView>((resolve) => { answer = resolve })),
      githubAccount: vi.fn(async () => { throw new Error('y') }),
    }), 1_000, vi.fn())
    failing.push(SESSION)
    failing.refreshAccount()
    await settle()
    failing.dispose()
    answer(clean)
    await settle()
    expect(failing.repository(SESSION).getSnapshot().view).toBeUndefined()
    const late = new SourceControl(commands({
      githubLogin: vi.fn(async () => ({ code: 'C', url: 'u' })),
      githubAccount: vi.fn()
        .mockResolvedValueOnce({ cli: 'ready', login: null, pending: { code: 'C', url: 'u' } })
        .mockImplementation(() => new Promise<GithubAccountView>((resolve, reject) => { account = resolve; failAccount = reject })),
    }), 1_000, vi.fn())
    late.login()
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    late.dispose()
    account(signedIn)
    await settle()
    expect(late.github.getSnapshot().account).toMatchObject({ login: null })
    const rejected = new SourceControl(commands({
      githubLogin: vi.fn(async () => ({ code: 'C', url: 'u' })),
      githubAccount: vi.fn()
        .mockResolvedValueOnce({ cli: 'ready', login: null, pending: { code: 'C', url: 'u' } })
        .mockImplementation(() => new Promise<GithubAccountView>((resolve, reject) => { account = resolve; failAccount = reject })),
    }), 1_000, vi.fn())
    rejected.login()
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    rejected.dispose()
    failAccount(new Error('late'))
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    let reject!: (error: Error) => void
    const racing = new SourceControl(commands({
      push: vi.fn(() => new Promise<GitStatusView>((_resolve, fail) => { reject = fail })),
      githubAccount: vi.fn(() => new Promise<GithubAccountView>((_resolve, fail) => { failAccount = fail })),
    }), 1_000, vi.fn())
    racing.push(SESSION)
    const rejectPush = reject
    racing.refreshAccount()
    racing.dispose()
    rejectPush(new Error('late push'))
    failAccount(new Error('late account'))
    await settle()
    expect(racing.repository(SESSION).getSnapshot().notice).toBeNull()
    expect(racing.github.getSnapshot().notice).toBeNull()
    const disposedBeforeCheck = new SourceControl(commands({
      githubAccount: vi.fn(async (): Promise<GithubAccountView> => ({ cli: 'ready', login: null, pending: { code: 'C', url: 'u' } })),
    }), 1_000, vi.fn())
    disposedBeforeCheck.login()
    await settle()
    disposedBeforeCheck.dispose()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
  })
})

describe('SourceControlBody', () => {
  function mount(control: SourceControl, git: GitCommands) {
    const injected: Omit<SourceControlInjected, 'hooks'> = {
      refresh: () => { control.refresh(SESSION) },
      setMessage: (message) => { control.setMessage(SESSION, message) },
      init: () => { control.init(SESSION) },
      stage: (paths) => { control.stage(SESSION, paths) },
      unstage: (paths) => { control.unstage(SESSION, paths) },
      commit: (push) => { control.commit(SESSION, push) },
      push: () => { control.push(SESSION) },
      pull: () => { control.pull(SESSION) },
      sync: () => { control.sync(SESSION) },
      publish: (visibility) => { control.publish(SESSION, visibility) },
      refreshAccount: () => { control.refreshAccount() },
      login: () => { control.login() },
      logout: () => { control.logout() },
      loadRepositories: () => { control.loadRepositories() },
      clone: (name) => { control.clone(name) },
    }
    const props = {
      ...injected, t,
      useRepository: bindSnapshotSelector(control.repository(SESSION)),
      useGithub: bindSnapshotSelector(control.github),
    } as never as SourceControlBodyProps
    return { git, view: render(<SourceControlBody {...props} />) }
  }

  it('offers to initialize a folder that is not a repository and shows the missing GitHub CLI', async () => {
    const git = commands({
      status: vi.fn(async (): Promise<GitStatusView> => ({ repository: false, directory: '/work' })),
      githubAccount: vi.fn(async (): Promise<GithubAccountView> => ({ cli: 'missing' })),
    })
    const control = new SourceControl(git, 1_000, vi.fn())
    mount(control, git)
    expect(screen.getAllByText(en.loading)).toHaveLength(2)
    await settle()
    expect(screen.getByText(en.notRepository)).toBeDefined()
    expect(screen.getByText(en.githubMissing)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.init }))
    expect(git.init).toHaveBeenCalledWith(SESSION)
  })

  it('stages, unstages, commits with the keyboard or buttons, and syncs', async () => {
    const git = commands({
      status: vi.fn(async () => dirty), commit: vi.fn(async () => dirty), push: vi.fn(async () => dirty), pull: vi.fn(async () => dirty),
    })
    const control = new SourceControl(git, 1_000, vi.fn())
    const h = mount(control, git)
    await settle()
    expect(screen.getByText('main')).toBeDefined()
    expect(screen.getByText('↑1 ↓0')).toBeDefined()
    expect(screen.getByRole('region', { name: en.staged }).querySelectorAll('li')).toHaveLength(3)
    expect(screen.getByTitle('old.ts → new name.ts')).toBeDefined()
    expect(screen.getByTitle(en['kind.untracked']).textContent).toBe('U')
    fireEvent.click(screen.getByRole('button', { name: `${en.unstage} staged.ts` }))
    await settle()
    expect(git.unstage).toHaveBeenLastCalledWith(SESSION, ['staged.ts'])
    fireEvent.click(screen.getByRole('button', { name: en.unstageAll }))
    await settle()
    expect(git.unstage).toHaveBeenLastCalledWith(SESSION, [])
    fireEvent.click(screen.getByRole('button', { name: `${en.stage} untracked.txt` }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: en.stageAll }))
    await settle()
    expect(git.stage).toHaveBeenLastCalledWith(SESSION, [])
    const message = screen.getByRole('textbox', { name: en.message })
    expect(screen.getByRole('button', { name: en.commit }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(message, { target: { value: 'Fix things' } })
    fireEvent.keyDown(message, { key: 'Enter' })
    expect(git.commit).not.toHaveBeenCalled()
    fireEvent.keyDown(message, { key: 'Enter', metaKey: true })
    await settle()
    expect(git.commit).toHaveBeenCalledWith(SESSION, 'Fix things')
    fireEvent.change(message, { target: { value: 'Again' } })
    fireEvent.keyDown(message, { key: 'Enter', ctrlKey: true })
    await settle()
    fireEvent.change(message, { target: { value: 'Button' } })
    fireEvent.click(screen.getByRole('button', { name: en.commit }))
    await settle()
    fireEvent.change(message, { target: { value: 'And push' } })
    fireEvent.click(screen.getByRole('button', { name: en.commitPush }))
    await settle()
    expect(git.commit).toHaveBeenCalledTimes(4)
    fireEvent.click(screen.getByRole('button', { name: en.pull }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: en.push }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: en.sync }))
    await settle()
    expect(git.pull).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    await settle()
    window.dispatchEvent(new Event('focus'))
    await settle()
    h.view.unmount()
    window.dispatchEvent(new Event('focus'))
    expect(git.status).toHaveBeenCalledTimes(3)
  })

  it('shows a clean detached repository without upstream, and failures', async () => {
    const git = commands({
      status: vi.fn(async (): Promise<GitStatusView> => ({ ...clean, branch: null, upstream: null, remoteUrl: null })),
      pull: vi.fn(async () => { throw new Error('no upstream') }),
    })
    const control = new SourceControl(git, 1_000, vi.fn())
    mount(control, git)
    await settle()
    expect(screen.getByText(en.detached)).toBeDefined()
    expect(screen.getByText(en.noUpstream)).toBeDefined()
    expect(screen.getByText(en.clean)).toBeDefined()
    control.pull(SESSION)
    await settle()
    expect(screen.getByRole('alert').textContent).toBe('Failed: no upstream')
  })

  it('reads the GitHub sign-in only once across pages', async () => {
    const git = commands()
    const control = new SourceControl(git, 1_000, vi.fn())
    mount(control, git)
    await settle()
    mount(control, git)
    await settle()
    expect(git.githubAccount).toHaveBeenCalledOnce()
  })

  it('hints that an unstaged commit includes every change', async () => {
    const git = commands({ status: vi.fn(async (): Promise<GitStatusView> => ({ ...clean, changes: [{ path: 'a', unstaged: 'modified' }] })) })
    mount(new SourceControl(git, 1_000, vi.fn()), git)
    await settle()
    expect(screen.getByText(en.commitHint)).toBeDefined()
  })

  it('signs in, publishes, lists and clones repositories, and signs out', async () => {
    const accounts: GithubAccountView[] = [
      { cli: 'ready', login: null, pending: null },
      { cli: 'ready', login: null, pending: { code: 'ABCD-1234', url: 'https://github.com/login/device' } },
    ]
    const git = commands({
      status: vi.fn(async (): Promise<GitStatusView> => ({ ...clean, remoteUrl: null })),
      githubAccount: vi.fn(async () => accounts.shift() ?? signedIn),
      githubRepositories: vi.fn().mockResolvedValueOnce([]).mockResolvedValue(repositories),
      githubPublish: vi.fn(async (): Promise<GitStatusView> => ({ ...clean, remoteUrl: null })),
    })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const control = new SourceControl(git, 1_000, vi.fn())
    mount(control, git)
    await settle()
    expect(screen.getByText(en.githubSignedOut)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.githubLogin }))
    await settle()
    expect(screen.getByText('Enter code ABCD-1234 on GitHub (copied to the clipboard)')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.githubOpen }))
    expect(open).toHaveBeenCalledWith('https://github.com/login/device', '_blank', 'noopener')
    control.refreshAccount()
    await settle()
    expect(screen.getByText('Signed in as octocat')).toBeDefined()
    expect(screen.getByText(en.noRemote)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.publishPrivate }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: en.publishPublic }))
    await settle()
    expect(git.githubPublish).toHaveBeenLastCalledWith(SESSION, 'public')
    const details = screen.getByText(en.repositories).closest('details') as HTMLDetailsElement
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(screen.getByText(en.repositoriesLoading)).toBeDefined()
    await settle()
    expect(screen.getByText(en.repositoriesEmpty)).toBeDefined()
    details.open = false
    fireEvent(details, new Event('toggle'))
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(git.githubRepositories).toHaveBeenCalledOnce()
    control.loadRepositories()
    await settle()
    expect(screen.getByText('octocat/secret · Private')).toBeDefined()
    expect(screen.getByText(en.cloned).getAttribute('title')).toBe('/clones/secret')
    fireEvent.click(screen.getByRole('button', { name: en.clone }))
    await settle()
    expect(screen.getByRole('status').textContent).toBe('Cloned to /clones/hello and added as a workspace')
    fireEvent.click(screen.getByRole('button', { name: en.githubLogout }))
    await settle()
    expect(git.githubLogout).toHaveBeenCalledOnce()
    open.mockRestore()
  })
})

describe('Source Control plugin', () => {
  it('declares the tab type and artwork', () => {
    const definition = sourceControlDefinition(makeTranslate(en))
    expect(definition).toMatchObject({ id: SOURCE_CONTROL_ID, kind: SOURCE_CONTROL_KIND, priority: 'builtin' })
    expect(definition.title('')).toBe(en.title)
    expect(definition.guide?.map(entry => [entry.title(), entry.description?.()])).toEqual([[en.title, en.guideDescription]])
    render(<GuideArtworkSourceControl />)
    render(<GuideArtworkSourceControl size={20} className="x" />)
    expect(document.querySelectorAll('svg')).toHaveLength(2)
  })

  it('registers the page over the git Remote and releases it on unload', async () => {
    const ctx = new Context()
    const entries: { name: string; key?: string; inject: (key: string) => SourceControlInjected }[] = []
    const types: unknown[] = []
    const dictionaries = new Map<string, unknown>()
    ctx.provide('slots', {
      inject: (_name: string, register: () => () => void) => register(),
      register: (entry: typeof entries[number]) => { entries.push(entry); return () => { entries.splice(entries.indexOf(entry), 1) } },
    } as never)
    ctx.provide('locale', {
      bind: () => (key: string) => key,
      register: (name: string, values: unknown) => { dictionaries.set(name, values); return () => { dictionaries.delete(name) } },
    } as never)
    ctx.provide('sidebarRightTabs', { register: (type: unknown) => { types.push(type); return () => { types.splice(types.indexOf(type), 1) } } } as never)
    const ok = <T,>(value: T) => vi.fn(async () => ({ ok: true, value }))
    const git = {
      status: ok(clean), init: ok(clean), stage: ok(dirty), unstage: ok(dirty), commit: ok(clean), push: ok(clean), pull: ok(clean),
      githubAccount: ok(signedIn), githubLogin: ok({ code: 'C', url: 'u' }), githubLogout: ok(signedIn),
      githubRepositories: ok(repositories), githubClone: ok({ path: '/p' }), githubPublish: ok(clean),
    }
    ctx.provide('remote', { git } as never)
    ctx.provide('remote.git', {} as never)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(dictionaries.get('sourceControl')).toEqual({ zh, en })
    expect(types).toHaveLength(1)
    const face = entries[0]!.inject(SESSION)
    for (const call of [
      face.refresh, () => { face.setMessage('m') }, face.init, () => { face.stage([]) }, () => { face.unstage([]) },
      () => { face.commit(false) }, face.push, face.pull, face.sync, () => { face.publish('private') },
      face.refreshAccount, face.login, face.logout, face.loadRepositories, () => { face.clone('o/r') },
    ]) {
      call()
      await settle()
    }
    for (const method of Object.values(git)) expect(method).toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('u', '_blank', 'noopener')
    git.status.mockResolvedValueOnce({ ok: false, error: new Error('remote failed') } as never)
    face.refresh()
    await settle()
    expect(face.hooks.repository.getSnapshot().notice).toEqual({ kind: 'error', message: 'remote failed' })
    await fiber.dispose()
    expect(entries).toEqual([])
    expect(types).toEqual([])
    expect(dictionaries.size).toBe(0)
    open.mockRestore()
  })
})
