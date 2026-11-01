// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import { CliWelcome } from '../src/client/CliWelcome.tsx'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { CliLoginResult, CliProviderId, CliStatus, WelcomeApi } from '../src/welcome-api.ts'

afterEach(cleanup)

function mount(statuses: Partial<Record<CliProviderId, CliStatus>>) {
  const account: AccountView = { links: { usageUrl: '', topUpUrl: '' }, status: 'signed-out', attempt: null }
  const login = Promise.withResolvers<CliLoginResult>()
  const skip = vi.fn(async () => undefined)
  const cliStatus = vi.fn(async (provider: CliProviderId): Promise<CliStatus> => statuses[provider] ?? { state: 'unavailable' })
  const cliSignIn = vi.fn((_provider: CliProviderId) => login.promise)
  const cliSubmitCode = vi.fn(async () => true)
  const cliCancel = vi.fn(async () => undefined)
  const api: WelcomeApi = {
    ...resolveDesktopLocale('en'),
    cliLogin: true,
    takeNotice: vi.fn(async () => undefined),
    onAccountState: vi.fn(() => () => {}),
    startSignIn: vi.fn(async () => account),
    cancelSignIn: vi.fn(async () => account),
    copySignInLink: vi.fn(async () => undefined),
    saveApiKey: vi.fn(async () => ({ ok: true as const })),
    skip,
    cliStatus,
    cliSignIn,
    cliSubmitCode,
    cliCancel,
  }
  render(<CliWelcome api={api} />)
  return { login, skip, cliStatus, cliSignIn, cliSubmitCode, cliCancel }
}

const visibleButtons = () => [...document.querySelectorAll('.actions button')]
  .filter(button => button.closest('[hidden]') === null && !(button as HTMLButtonElement).hidden).map(button => button.textContent)

function clickAction(text: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.actions button')]
    .find(candidate => candidate.closest('[hidden]') === null && !candidate.hidden && candidate.textContent === text)
  fireEvent.click(button!)
}

async function row(name: string): Promise<HTMLElement> {
  return (await screen.findByText(name)).closest('li')!
}

it('lists every CLI with its state and lets the user continue without signing in', async () => {
  const { skip, cliStatus } = mount({ 'claude-code': { state: 'signed-out' }, codex: { state: 'signed-in', email: 'me@example.com' } })
  expect(await screen.findByText('Sign in to a coding CLI')).toBeTruthy()
  expect(document.title).toBe('Claude Code Harness')
  expect(await within(await row('Codex')).findByText('Signed in as me@example.com')).toBeTruthy()
  expect(await within(await row('Claude Code')).findByText('Not signed in')).toBeTruthy()
  expect(await within(await row('Grok')).findByText('Not installed')).toBeTruthy()
  expect(within(await row('Grok')).queryByRole('button')).toBeNull()
  expect(cliStatus.mock.calls.map(([provider]) => provider)).toEqual(['claude-code', 'codex', 'antigravity', 'grok', 'opencode'])
  expect(visibleButtons()).toEqual(['Continue', 'Check again'])
  clickAction('Continue')
  await vi.waitFor(() => { expect(skip).toHaveBeenCalledOnce() })
})

it('offers "Set up later" when no CLI is signed in', async () => {
  const { skip } = mount({ 'claude-code': { state: 'signed-out' } })
  await within(await row('Claude Code')).findByText('Not signed in')
  expect(visibleButtons()).toEqual(['Set up later', 'Check again'])
  clickAction('Set up later')
  await vi.waitFor(() => { expect(skip).toHaveBeenCalledOnce() })
})

it('forwards a pasted Claude Code code and returns to the list once signed in, without entering the workspace', async () => {
  const { login, skip, cliStatus, cliSubmitCode } = mount({ 'claude-code': { state: 'signed-out' } })
  fireEvent.click(await within(await row('Claude Code')).findByText('Sign in'))
  expect(await screen.findByText('Finish signing in to Claude Code')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Submit code', 'Cancel'])
  fireEvent.change(document.querySelector('input')!, { target: { value: ' abc123 ' } })
  fireEvent.submit(document.querySelector('form')!)
  expect(cliSubmitCode).toHaveBeenCalledWith('claude-code', 'abc123')
  cliStatus.mockResolvedValue({ state: 'signed-in' })
  await act(async () => { login.resolve('signed-in'); await login.promise })
  expect(await within(await row('Claude Code')).findByText('Signed in')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Continue', 'Check again'])
  expect(skip).not.toHaveBeenCalled()
})

it('shows no code field for a browser-only login and returns to the list after cancellation', async () => {
  const { login, cliCancel } = mount({ codex: { state: 'signed-out' } })
  fireEvent.click(await within(await row('Codex')).findByText('Sign in'))
  expect(await screen.findByText('Complete the sign-in in your browser.')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Cancel'])
  clickAction('Cancel')
  expect(cliCancel).toHaveBeenCalledWith('codex')
  await act(async () => { login.resolve('cancelled'); await login.promise })
  expect(await screen.findByText('Sign in to a coding CLI')).toBeTruthy()
})

it('asks the user to finish a terminal login and recheck it', async () => {
  const { login, cliStatus } = mount({ opencode: { state: 'signed-out' } })
  fireEvent.click(await within(await row('OpenCode')).findByText('Sign in'))
  await act(async () => { login.resolve('terminal'); await login.promise })
  expect(await screen.findByText('Finish signing in to OpenCode in the terminal')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Check again', 'Back'])
  cliStatus.mockResolvedValue({ state: 'signed-in' })
  clickAction('Check again')
  expect(await screen.findByText('Sign in to a coding CLI')).toBeTruthy()
  expect(await within(await row('OpenCode')).findByText('Signed in')).toBeTruthy()
})

it('offers a retry after a failed login', async () => {
  const { login, cliSignIn } = mount({ grok: { state: 'signed-out' } })
  fireEvent.click(await within(await row('Grok')).findByText('Sign in'))
  await act(async () => { login.resolve('failed'); await login.promise })
  expect(await screen.findByText('Sign in to Grok was not completed. Please try again.')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Sign in again', 'Back'])
  clickAction('Sign in again')
  expect(cliSignIn).toHaveBeenCalledTimes(2)
})
