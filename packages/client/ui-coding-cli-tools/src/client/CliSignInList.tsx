/** The Models settings section's list of the CLIs whose own sign-in the model routes use, with their login. */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'
import {
  SIGN_IN_CLI_INFO, SIGN_IN_CLIS, type CliSignInBridge, type CliSignInStatus, type SignInCli,
} from './sign-in-bridge.ts'
import css from './CliSignInList.module.css'

/** Injected bridge of the list. */
export interface CliSignInListInjected {
  readonly bridge: CliSignInBridge
}

/** List props: copy and the Desktop bridge. */
export type CliSignInListProps = PropsLocale<'codingCliSignIn'> & CliSignInListInjected

type Translate = CliSignInListProps['t']
type Statuses = Partial<Record<SignInCli, CliSignInStatus>>
type Login = { readonly provider: SignInCli; readonly phase: 'signing-in' | 'terminal' | 'failed' }

/**
 * Describe one CLI's sign-in state.
 * @param status - reported state; undefined while it is read.
 * @param t - list copy.
 * @returns the localized state text.
 */
export function statusText(status: CliSignInStatus | undefined, t: Translate): string {
  if (status === undefined) return t('checking')
  if (status.state === 'signed-in') return status.email === undefined ? t('signedIn') : t('signedInAs', { email: status.email })
  return status.state === 'signed-out' ? t('signedOut') : t('unavailable')
}

/**
 * Render every CLI with its sign-in state and run one CLI's own login at a time.
 * @param props - copy and the Desktop bridge.
 * @returns the sign-in list.
 */
export function CliSignInList({ bridge, t }: CliSignInListProps): ReactNode {
  const [statuses, setStatuses] = useState<Statuses>({})
  const [login, setLogin] = useState<Login | undefined>()
  const [code, setCode] = useState('')
  const mounted = useRef(true)

  const check = async (provider: SignInCli): Promise<CliSignInStatus> => {
    setStatuses(current => ({ ...current, [provider]: undefined }))
    const status = await bridge.status(provider).catch((): CliSignInStatus => ({ state: 'unavailable' }))
    if (mounted.current) setStatuses(current => ({ ...current, [provider]: status }))
    return status
  }
  const checkAll = (): void => { for (const provider of SIGN_IN_CLIS) void check(provider) }
  const signIn = async (provider: SignInCli): Promise<void> => {
    setLogin({ provider, phase: 'signing-in' })
    setCode('')
    const result = await bridge.signIn(provider).catch(() => 'failed' as const)
    if (!mounted.current) return
    if (result === 'terminal' || result === 'failed') {
      setLogin({ provider, phase: result })
      return
    }
    setLogin(undefined)
    void check(provider)
  }
  const recheck = async (provider: SignInCli): Promise<void> => {
    if ((await check(provider)).state === 'signed-in' && mounted.current) setLogin(undefined)
  }
  const submitCode = (event: FormEvent): void => {
    event.preventDefault()
    const value = code.trim()
    if (login === undefined || value === '') return
    void bridge.submitCode(login.provider, value).then((received) => { if (received && mounted.current) setCode('') })
  }

  useEffect(() => {
    mounted.current = true
    checkAll()
    return () => { mounted.current = false }
  }, [bridge])

  const names = SIGN_IN_CLIS.map(provider => SIGN_IN_CLI_INFO[provider].name).join('、')
  const loginName = login === undefined ? '' : SIGN_IN_CLI_INFO[login.provider].name
  const pastesCode = login !== undefined && SIGN_IN_CLI_INFO[login.provider].pastesCode
  return (
    <section className={css.root} aria-labelledby="coding-cli-sign-in-title" data-coding-cli-sign-in="">
      <div className={css.header}>
        <h3 id="coding-cli-sign-in-title" className={css.title}>{t('title')}</h3>
        <button type="button" className={css.secondary} onClick={checkAll} disabled={login?.phase === 'signing-in'}>{t('recheck')}</button>
      </div>
      <p className={css.description}>{t('description', { names })}</p>
      <ul className={css.list}>
        {SIGN_IN_CLIS.map((provider) => {
          const status = statuses[provider]
          const busy = login?.provider === provider && login.phase === 'signing-in'
          return (
            <li key={provider} className={css.row} data-state={status?.state ?? 'checking'}>
              <span className={css.name}>{SIGN_IN_CLI_INFO[provider].name}</span>
              <span className={css.state}>{statusText(status, t)}</span>
              {status !== undefined && status.state !== 'unavailable' && (
                <button
                  type="button" className={css.primary} disabled={login?.phase === 'signing-in'}
                  aria-busy={busy} onClick={() => { void signIn(provider) }}
                >
                  {status.state === 'signed-in' ? t('signInAgain') : t('signIn')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {login !== undefined && (
        <div className={css.login} role="status">
          <p className={css.loginText}>
            {login.phase === 'terminal'
              ? t('terminal', { name: loginName })
              : login.phase === 'failed'
                ? t('failed', { name: loginName })
                : t(pastesCode ? 'waitingCode' : 'waitingBrowser', { name: loginName })}
          </p>
          {login.phase === 'signing-in' && pastesCode && (
            <form className={css.codeForm} onSubmit={submitCode}>
              <input
                className={css.codeInput} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
                aria-label={t('codePlaceholder')} placeholder={t('codePlaceholder')} value={code}
                onChange={(event) => { setCode(event.target.value) }}
              />
              <button type="submit" className={css.primary} disabled={code.trim() === ''}>{t('submitCode')}</button>
            </form>
          )}
          <div className={css.loginActions}>
            {login.phase === 'terminal' && (
              <button type="button" className={css.primary} onClick={() => { void recheck(login.provider) }}>{t('recheck')}</button>
            )}
            {login.phase === 'failed' && (
              <button type="button" className={css.primary} onClick={() => { void signIn(login.provider) }}>{t('signIn')}</button>
            )}
            <button
              type="button" className={css.secondary}
              onClick={() => {
                if (login.phase === 'signing-in') void bridge.cancel(login.provider)
                else setLogin(undefined)
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
