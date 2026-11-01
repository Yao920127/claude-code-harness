/** CLI sign-in choices of the desktop welcome; every CLI runs in the main process and none is required. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx'
import { CLAUDE_MARK_COLOR, CLAUDE_MARK_PATH, CLAUDE_MARK_VIEWBOX } from '@deepseek-ai/dsh-client-ui-brand-claude/src/client/mark.ts'
import { formatDesktopMessage, type DesktopMessages } from '../locale.ts'
import { CLI_PROVIDERS, CLI_PROVIDER_INFO, type CliProviderId, type CliStatus, type WelcomeApi } from '../welcome-api.ts'

type Statuses = { readonly [Id in CliProviderId]: CliStatus | undefined }
type Login = { readonly provider: CliProviderId; readonly phase: 'signing-in' | 'terminal' | 'failed' }

const UNCHECKED: Statuses = { 'claude-code': undefined, codex: undefined, antigravity: undefined, grok: undefined, opencode: undefined }

function statusText(m: DesktopMessages, status: CliStatus | undefined): string {
  if (status === undefined) return m.cliStatusChecking
  if (status.state === 'signed-in') return status.email === undefined ? m.cliStatusSignedIn : formatDesktopMessage(m.cliStatusSignedInAs, { email: status.email })
  return status.state === 'signed-out' ? m.cliStatusSignedOut : m.cliStatusUnavailable
}

/**
 * List the offered CLIs with their sign-in state, run one CLI's login at a time, and enter the workspace on request.
 * @param props.api - isolated preload API.
 * @returns the CLI welcome page with fixed bottom actions.
 */
export function CliWelcome({ api }: { api: WelcomeApi }) {
  const { messages: m } = api
  const [statuses, setStatuses] = useState<Statuses>(UNCHECKED)
  const [login, setLogin] = useState<Login | undefined>()
  const [code, setCode] = useState('')
  const [entering, setEntering] = useState(false)
  const mounted = useRef(true)

  async function enter() {
    setEntering(true)
    try {
      await api.skip()
    } catch {
      if (mounted.current) setEntering(false)
    }
  }
  async function check(provider: CliProviderId): Promise<CliStatus> {
    setStatuses(current => ({ ...current, [provider]: undefined }))
    const status = await api.cliStatus(provider).catch((): CliStatus => ({ state: 'unavailable' }))
    if (mounted.current) setStatuses(current => ({ ...current, [provider]: status }))
    return status
  }
  function checkAll() {
    for (const provider of CLI_PROVIDERS) void check(provider)
  }
  async function signIn(provider: CliProviderId) {
    setLogin({ provider, phase: 'signing-in' })
    setCode('')
    const result = await api.cliSignIn(provider).catch(() => 'failed' as const)
    if (!mounted.current) return
    if (result === 'terminal') { setLogin({ provider, phase: 'terminal' }); return }
    if (result === 'failed') { setLogin({ provider, phase: 'failed' }); return }
    setLogin(undefined)
    void check(provider)
  }
  async function recheckTerminal(provider: CliProviderId) {
    if ((await check(provider)).state === 'signed-in' && mounted.current) setLogin(undefined)
  }
  function submitCode(event: FormEvent) {
    event.preventDefault()
    const value = code.trim()
    if (login === undefined || value === '') return
    void api.cliSubmitCode(login.provider, value).then((received) => { if (received && mounted.current) setCode('') })
  }

  useEffect(() => {
    mounted.current = true
    document.documentElement.lang = api.id
    document.title = m.welcomeTitle
    checkAll()
    return () => { mounted.current = false }
  }, [api])

  const anySignedIn = CLI_PROVIDERS.some(provider => statuses[provider]?.state === 'signed-in')
  const name = login === undefined ? '' : CLI_PROVIDER_INFO[login.provider].name
  const mode = login === undefined ? undefined : CLI_PROVIDER_INFO[login.provider].mode
  const title = login === undefined ? m.cliChooseTitle
    : login.phase === 'terminal' ? formatDesktopMessage(m.cliTerminalTitle, { name })
      : login.phase === 'failed' ? formatDesktopMessage(m.cliFailed, { name }) : formatDesktopMessage(m.cliWaitingTitle, { name })
  const description = login === undefined ? m.cliChooseDescription
    : login.phase === 'terminal' ? formatDesktopMessage(m.cliTerminalDescription, { name })
      : login.phase === 'failed' ? '' : mode === 'browser-code' ? m.cliWaitingCode : m.cliWaitingBrowser

  return <>
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome claude-code" aria-labelledby="cli-status">
      <div className="claude-brand">
        <svg className="claude-mark" width="40" height="40" aria-hidden="true"
          viewBox={`0 0 ${String(CLAUDE_MARK_VIEWBOX)} ${String(CLAUDE_MARK_VIEWBOX)}`}>
          <path d={CLAUDE_MARK_PATH} fill={CLAUDE_MARK_COLOR} />
        </svg>
        <p className="brand-name">{m.welcomeBrand}</p>
      </div>
      <div className="claude-body">
        <section className="key-heading" aria-live="polite">
          <h1 id="cli-status">{title}</h1>
          <p id="cli-description" hidden={description === ''}>{description}</p>
        </section>
        <ul className="cli-list" hidden={login !== undefined}>
          {CLI_PROVIDERS.map((provider) => {
            const status = statuses[provider]
            return <li key={provider} className="cli-row" data-state={status?.state ?? 'checking'}>
              <span className="cli-name">{CLI_PROVIDER_INFO[provider].name}</span>
              <span className="cli-state">{statusText(m, status)}</span>
              <button type="button" className="cli-sign-in" hidden={status?.state !== 'signed-out'} disabled={entering}
                onClick={() => { void signIn(provider) }}>{m.cliSignIn}</button>
            </li>
          })}
        </ul>
        <form id="cli-code-form" className="key-form" noValidate onSubmit={submitCode}
          hidden={login?.phase !== 'signing-in' || mode !== 'browser-code'}>
          <div className="key-field">
            <label className="visually-hidden" htmlFor="cli-code-input">{m.cliCodePlaceholder}</label>
            <input id="cli-code-input" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
              placeholder={m.cliCodePlaceholder} value={code} onChange={(event) => { setCode(event.target.value) }} />
          </div>
        </form>
      </div>
      <div className="actions" hidden={!entering}>
        <button className="primary" type="button" disabled aria-label={m.cliStatusChecking}>
          <StateDot state="ongoing" size={16} className="welcome-loading" />
        </button>
      </div>
      <div className="actions" hidden={entering || login !== undefined}>
        <button className="primary" type="button" onClick={() => { void enter() }}>{anySignedIn ? m.cliContinue : m.cliLater}</button>
        <button className="secondary" type="button" onClick={checkAll}>{m.cliRecheck}</button>
      </div>
      <div className="actions" hidden={login?.phase !== 'signing-in'}>
        <button className="primary" type="submit" form="cli-code-form" hidden={mode !== 'browser-code'} disabled={code.trim() === ''}>{m.cliSubmitCode}</button>
        <button className="secondary" type="button" onClick={() => { if (login !== undefined) void api.cliCancel(login.provider) }}>{m.welcomeAuthCancel}</button>
      </div>
      <div className="actions" hidden={login?.phase !== 'terminal'}>
        <button className="primary" type="button" onClick={() => { if (login !== undefined) void recheckTerminal(login.provider) }}>{m.cliRecheck}</button>
        <button className="secondary" type="button" onClick={() => { setLogin(undefined) }}>{m.cliBack}</button>
      </div>
      <div className="actions" hidden={login?.phase !== 'failed'}>
        <button className="primary" type="button" onClick={() => { if (login !== undefined) void signIn(login.provider) }}>{m.welcomeAuthRetry}</button>
        <button className="secondary" type="button" onClick={() => { setLogin(undefined) }}>{m.cliBack}</button>
      </div>
    </main>
  </>
}
