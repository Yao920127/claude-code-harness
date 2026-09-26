/** Claude Code sign-in view of the desktop welcome; the CLI runs in the main process. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx'
import { CLAUDE_MARK_COLOR, CLAUDE_MARK_PATH, CLAUDE_MARK_VIEWBOX } from '@deepseek-ai/dsh-client-ui-brand-claude/src/client/mark.ts'
import type { WelcomeApi } from '../welcome-api.ts'

type Phase = 'checking' | 'signed-out' | 'unavailable' | 'signing-in' | 'failed'

/**
 * Check the Claude Code sign-in, offer the CLI's browser login, and enter the workspace once signed in.
 * @param props.api - isolated preload API.
 * @returns the Claude Code welcome page with fixed bottom actions.
 */
export function ClaudeCodeWelcome({ api }: { api: WelcomeApi }) {
  const { messages: m } = api
  const [phase, setPhase] = useState<Phase>('checking')
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
  async function check() {
    setPhase('checking')
    const status = await api.claudeCodeStatus().catch(() => ({ state: 'unavailable' as const }))
    if (!mounted.current) return
    if (status.state === 'signed-in') await enter()
    else setPhase(status.state)
  }
  async function signIn() {
    setPhase('signing-in')
    setCode('')
    const result = await api.claudeCodeSignIn().catch(() => 'failed' as const)
    if (!mounted.current) return
    if (result === 'signed-in') await check()
    else setPhase(result === 'cancelled' ? 'signed-out' : 'failed')
  }
  function submitCode(event: FormEvent) {
    event.preventDefault()
    const value = code.trim()
    if (value === '') return
    void api.claudeCodeSubmitCode(value).then((received) => { if (received && mounted.current) setCode('') })
  }

  useEffect(() => {
    mounted.current = true
    document.documentElement.lang = api.id
    document.title = m.welcomeTitle
    void check()
    return () => { mounted.current = false }
  }, [api])

  const title = phase === 'checking' ? m.claudeCodeChecking
    : phase === 'signing-in' ? m.claudeCodeWaitingTitle
      : phase === 'unavailable' ? m.claudeCodeUnavailableTitle
        : phase === 'failed' ? m.claudeCodeFailed : m.claudeCodeSignedOutTitle
  const description = phase === 'signing-in' ? m.claudeCodeWaitingDescription
    : phase === 'unavailable' ? m.claudeCodeUnavailableDescription
      : phase === 'checking' ? '' : m.claudeCodeSignedOutDescription
  const busy = phase === 'checking' || entering

  return <>
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome claude-code" aria-labelledby="claude-code-status">
      <div className="claude-brand">
        <svg className="claude-mark" width="40" height="40" aria-hidden="true"
          viewBox={`0 0 ${String(CLAUDE_MARK_VIEWBOX)} ${String(CLAUDE_MARK_VIEWBOX)}`}>
          <path d={CLAUDE_MARK_PATH} fill={CLAUDE_MARK_COLOR} />
        </svg>
        <p className="brand-name">{m.welcomeBrand}</p>
      </div>
      <div className="claude-body">
        <section className="key-heading" aria-live="polite">
          <h1 id="claude-code-status">{title}</h1>
          <p id="claude-code-description" hidden={description === ''}>{description}</p>
        </section>
        <form id="claude-code-form" className="key-form" hidden={phase !== 'signing-in'} noValidate onSubmit={submitCode}>
          <div className="key-field">
            <label className="visually-hidden" htmlFor="claude-code-input">{m.claudeCodeCodePlaceholder}</label>
            <input id="claude-code-input" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
              placeholder={m.claudeCodeCodePlaceholder} value={code} onChange={(event) => { setCode(event.target.value) }} />
          </div>
        </form>
      </div>
      <div className="actions" hidden={phase !== 'checking' && !entering}>
        <button className="primary" type="button" disabled aria-label={m.claudeCodeChecking}>
          <StateDot state="ongoing" size={16} className="welcome-loading" />
        </button>
      </div>
      <div className="actions" hidden={phase !== 'signing-in' || entering}>
        <button className="primary" type="submit" form="claude-code-form" disabled={code.trim() === ''}>{m.claudeCodeSubmitCode}</button>
        <button className="secondary" type="button" onClick={() => { void api.claudeCodeCancel() }}>{m.welcomeAuthCancel}</button>
      </div>
      <div className="actions" hidden={busy || phase === 'signing-in'}>
        <button className="primary" type="button" hidden={phase === 'unavailable'} onClick={() => { void signIn() }}>
          {phase === 'failed' ? m.welcomeAuthRetry : m.claudeCodeSignIn}
        </button>
        <button className="secondary" type="button" onClick={() => { void check() }}>{m.claudeCodeRecheck}</button>
        <button className="back" type="button" onClick={() => { void enter() }}>{m.claudeCodeLater}</button>
      </div>
    </main>
  </>
}
