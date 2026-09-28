/** The Source Control page of one Session: repository changes, commit and sync controls, and publishing to GitHub. */
import { useEffect, type ReactNode } from 'react'
import { Button, IconBranchOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { GitChangeKind, GitFileChange, GitStatusView, GithubVisibility } from '../types.ts'
import type {} from './locales.ts'
import { Notice } from './Notice.tsx'
import type { GithubState, RepositoryState } from './source-control.ts'
import css from './SourceControlBody.module.css'

/** One Session's repository state, the shared GitHub sign-in, and the commands bound to that Session. */
export interface SourceControlInjected {
  readonly hooks: {
    readonly repository: HostObservable<RepositoryState>
    readonly github: HostObservable<GithubState>
  }
  readonly refresh: () => void
  readonly setMessage: (message: string) => void
  readonly init: () => void
  readonly stage: (paths: readonly string[]) => void
  readonly unstage: (paths: readonly string[]) => void
  readonly commit: (push: boolean) => void
  readonly push: () => void
  readonly pull: () => void
  readonly sync: () => void
  readonly publish: (visibility: GithubVisibility) => void
  readonly refreshAccount: () => void
}

/** Sidebar page share, state, commands and copy. */
export type SourceControlBodyProps =
  PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'sourceControl'> & InjectFace<SourceControlInjected>

type Translate = SourceControlBodyProps['t']

const LETTERS: Readonly<Record<GitChangeKind, string>> = {
  'modified': 'M', 'type-changed': 'T', 'added': 'A', 'deleted': 'D', 'renamed': 'R', 'copied': 'C', 'untracked': 'U', 'conflicted': '!',
}

/**
 * Render the page; it reads the repository on mount and whenever the window regains focus.
 * @param props - repository and GitHub state, commands and copy.
 * @returns the page.
 */
export function SourceControlBody(props: SourceControlBodyProps): ReactNode {
  const { useRepository, useGithub, refresh, refreshAccount, t } = props
  const repository = useRepository(value => value)
  const account = useGithub(value => value.account)
  useEffect(() => {
    refresh()
    if (account === undefined) refreshAccount()
    const focused = (): void => { refresh() }
    window.addEventListener('focus', focused)
    return () => { window.removeEventListener('focus', focused) }
    // Mount-time reads only; later reads come from focus and the controls.
  }, [])
  const view = repository.view
  const busy = repository.busy !== null
  return (
    <div className={css.root} data-source-control="">
      <header className={css.header}>
        <span className={css.heading}>{t('title')}</span>
        <button type="button" className={css.icon} title={t('refresh')} aria-label={t('refresh')} disabled={busy} onClick={refresh}>
          <IconRefreshOutlineRegular />
        </button>
      </header>
      {view === undefined
        ? <p className={css.note}>{t('loading')}</p>
        : view.repository
          ? <Repository {...props} view={view} state={repository} />
          : (
            <section className={css.section}>
              <p className={css.note}>{t('notRepository')}</p>
              <Button variant="primary" className={css.fill} disabled={busy} onClick={props.init}>{t('init')}</Button>
            </section>
          )}
      <Notice notice={repository.notice} t={t} />
      {view?.repository === true && view.remoteUrl === null && (
        <section className={css.section} aria-label={t('github')}>
          <p className={css.note}>{t('noRemote')}</p>
          {account?.cli === 'ready' && account.login !== null
            ? (
              <div className={css.actions}>
                <Button variant="outline" className={css.fill} disabled={busy} onClick={() => { props.publish('private') }}>{t('publishPrivate')}</Button>
                <Button variant="outline" className={css.fill} disabled={busy} onClick={() => { props.publish('public') }}>{t('publishPublic')}</Button>
              </div>
            )
            : <p className={css.hint}>{t('publishSignIn')}</p>}
        </section>
      )}
    </div>
  )
}

function Repository(props: SourceControlBodyProps & {
  readonly view: Extract<GitStatusView, { repository: true }>
  readonly state: RepositoryState
}): ReactNode {
  const { view, state, t } = props
  const busy = state.busy !== null
  const staged = view.changes.filter(change => change.staged !== undefined)
  const unstaged = view.changes.filter(change => change.unstaged !== undefined)
  const cannotCommit = busy || state.message.trim().length === 0 || view.changes.length === 0
  return (
    <>
      <div className={css.branch}>
        <IconBranchOutlineRegular />
        <span className={css.branchName}>{view.branch ?? t('detached')}</span>
        <span className={css.sync}>{view.upstream === null ? t('noUpstream') : `↑${String(view.ahead)} ↓${String(view.behind)}`}</span>
      </div>
      <section className={css.section}>
        <textarea
          className={css.message} rows={3} placeholder={t('message')} aria-label={t('message')} value={state.message}
          disabled={busy} onChange={(event) => { props.setMessage(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); props.commit(false) }
          }}
        />
        <div className={css.actions}>
          <Button variant="primary" className={css.fill} disabled={cannotCommit} onClick={() => { props.commit(false) }}>{t('commit')}</Button>
          <Button variant="outline" className={css.fill} disabled={cannotCommit || view.remoteUrl === null} onClick={() => { props.commit(true) }}>{t('commitPush')}</Button>
        </div>
        {staged.length === 0 && view.changes.length > 0 && <p className={css.hint}>{t('commitHint')}</p>}
        <div className={css.actions}>
          <Button variant="outline" className={css.fill} disabled={busy || view.upstream === null} onClick={props.pull}>{t('pull')}</Button>
          <Button variant="outline" className={css.fill} disabled={busy || view.remoteUrl === null} onClick={props.push}>{t('push')}</Button>
          <Button variant="outline" className={css.fill} disabled={busy || view.upstream === null} onClick={props.sync}>{t('sync')}</Button>
        </div>
      </section>
      {view.changes.length === 0
        ? <p className={css.note}>{t('clean')}</p>
        : (
          <>
            {staged.length > 0 && (
              <ChangeList
                title={t('staged')} changes={staged} side="staged" busy={busy} t={t}
                allLabel={t('unstageAll')} onAll={() => { props.unstage([]) }}
                itemLabel={t('unstage')} itemSign="−" onItem={(path) => { props.unstage([path]) }}
              />
            )}
            {unstaged.length > 0 && (
              <ChangeList
                title={t('changes')} changes={unstaged} side="unstaged" busy={busy} t={t}
                allLabel={t('stageAll')} onAll={() => { props.stage([]) }}
                itemLabel={t('stage')} itemSign="+" onItem={(path) => { props.stage([path]) }}
              />
            )}
          </>
        )}
    </>
  )
}

function ChangeList({ title, changes, side, busy, t, allLabel, onAll, itemLabel, itemSign, onItem }: {
  readonly title: string
  readonly changes: readonly GitFileChange[]
  readonly side: 'staged' | 'unstaged'
  readonly busy: boolean
  readonly t: Translate
  readonly allLabel: string
  readonly onAll: () => void
  readonly itemLabel: string
  readonly itemSign: string
  readonly onItem: (path: string) => void
}): ReactNode {
  return (
    <section className={css.list} aria-label={title}>
      <div className={css.listHeader}>
        <span>{title} ({changes.length})</span>
        <button type="button" className={css.link} disabled={busy} onClick={onAll}>{allLabel}</button>
      </div>
      <ul className={css.files}>
        {changes.map((change) => {
          const kind = change[side] as GitChangeKind
          return (
            <li key={change.path} className={css.file}>
              <span className={css.kind} data-kind={kind} title={t(`kind.${kind}`)}>{LETTERS[kind]}</span>
              <span className={css.path} title={change.originalPath === undefined ? change.path : `${change.originalPath} → ${change.path}`}>{change.path}</span>
              <button type="button" className={css.icon} title={itemLabel} aria-label={`${itemLabel} ${change.path}`} disabled={busy} onClick={() => { onItem(change.path) }}>{itemSign}</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
