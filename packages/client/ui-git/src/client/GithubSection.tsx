/** The GitHub page of Settings: sign-in, sign-out, and cloning the signed-in user's repositories. */
import { useEffect, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from './locales.ts'
import { Notice } from './Notice.tsx'
import type { GithubState } from './source-control.ts'
import css from './GithubSection.module.css'

/** The shared GitHub state and its commands. */
export interface GithubSectionInjected {
  readonly hooks: { readonly github: HostObservable<GithubState> }
  readonly refreshAccount: () => void
  readonly login: () => void
  readonly logout: () => void
  readonly loadRepositories: () => void
  readonly clone: (nameWithOwner: string) => void
}

/** Settings page share, GitHub state, commands and copy. */
export type GithubSectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'sourceControl'> & InjectFace<GithubSectionInjected>

/**
 * Render the page; it reads the sign-in on mount and lists repositories once signed in.
 * @param props - GitHub state, commands and copy.
 * @returns the page.
 */
export function GithubSection(props: GithubSectionProps): ReactNode {
  const { useGithub, refreshAccount, loadRepositories, t } = props
  const github = useGithub(value => value)
  const account = github.account
  const login = account?.cli === 'ready' ? account.login : null
  useEffect(() => { refreshAccount() }, [refreshAccount])
  useEffect(() => { if (login !== null) loadRepositories() }, [login, loadRepositories])
  const busy = github.busy !== null
  return (
    <section className={css.section} data-github-settings="">
      <h2 className={css.title}>{t('github')}</h2>
      <p className={css.intro}>{t('githubIntro')}</p>
      <div className={css.card}>
        {account === undefined
          ? <p className={css.note}>{t('loading')}</p>
          : account.cli === 'missing'
            ? <p className={css.note}>{t('githubMissing')}</p>
            : account.login !== null
              ? (
                <div className={css.row}>
                  <span className={css.account}>{t('githubSignedIn', { login: account.login })}</span>
                  <Button variant="outline" disabled={busy} onClick={props.logout}>{t('githubLogout')}</Button>
                </div>
              )
              : account.pending !== null
                ? (
                  <>
                    <p className={css.note}>{t('githubCode', { code: account.pending.code })}</p>
                    <p className={css.code}>{account.pending.code}</p>
                    <Button variant="primary" className={css.fill} onClick={() => { window.open(account.pending?.url, '_blank', 'noopener') }}>{t('githubOpen')}</Button>
                    <p className={css.hint}>{t('githubWaiting')}</p>
                  </>
                )
                : (
                  <>
                    <p className={css.note}>{t('githubSignedOut')}</p>
                    <Button variant="primary" className={css.fill} disabled={busy} onClick={props.login}>{t('githubLogin')}</Button>
                  </>
                )}
        <Notice notice={github.notice} t={t} />
      </div>
      {login !== null && (
        <>
          <h3 className={css.subtitle}>{t('repositories')}</h3>
          {github.repositories === undefined
            ? <p className={css.note}>{t('repositoriesLoading')}</p>
            : github.repositories.length === 0
              ? <p className={css.note}>{t('repositoriesEmpty')}</p>
              : (
                <ul className={css.repositories}>
                  {github.repositories.map(repository => (
                    <li key={repository.nameWithOwner} className={css.repository}>
                      <span className={css.name} title={repository.description ?? repository.url}>
                        {repository.nameWithOwner}{repository.isPrivate ? ` · ${t('private')}` : ''}
                      </span>
                      {repository.localPath === null
                        ? <Button variant="outline" size="sm" disabled={busy} onClick={() => { props.clone(repository.nameWithOwner) }}>{t('clone')}</Button>
                        : <span className={css.hint} title={repository.localPath}>{t('cloned')}</span>}
                    </li>
                  ))}
                </ul>
              )}
        </>
      )}
    </section>
  )
}
