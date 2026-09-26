// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import { ClaudeCodeWelcome } from '../src/client/ClaudeCodeWelcome.tsx'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { ClaudeCodeLoginResult, ClaudeCodeStatus, WelcomeApi } from '../src/welcome-api.ts'

afterEach(cleanup)

function mount(status: ClaudeCodeStatus['state']) {
  const account: AccountView = { links: { usageUrl: '', topUpUrl: '' }, status: 'signed-out', attempt: null }
  const login = Promise.withResolvers<ClaudeCodeLoginResult>()
  const skip = vi.fn(async () => undefined)
  const claudeCodeStatus = vi.fn(async (): Promise<ClaudeCodeStatus> => ({ state: status }))
  const claudeCodeSubmitCode = vi.fn(async () => true)
  const claudeCodeCancel = vi.fn(async () => undefined)
  const api: WelcomeApi = {
    ...resolveDesktopLocale('en'),
    claudeCode: true,
    takeNotice: vi.fn(async () => undefined),
    onAccountState: vi.fn(() => () => {}),
    startSignIn: vi.fn(async () => account),
    cancelSignIn: vi.fn(async () => account),
    copySignInLink: vi.fn(async () => undefined),
    saveApiKey: vi.fn(async () => ({ ok: true as const })),
    skip,
    claudeCodeStatus,
    claudeCodeSignIn: vi.fn(() => login.promise),
    claudeCodeSubmitCode,
    claudeCodeCancel,
  }
  render(<ClaudeCodeWelcome api={api} />)
  return { login, skip, claudeCodeStatus, claudeCodeSubmitCode, claudeCodeCancel }
}

const visibleButtons = () => [...document.querySelectorAll('button')]
  .filter(button => button.closest('[hidden]') === null && !button.hidden).map(button => button.textContent)

it('offers Claude Code sign-in when the CLI is signed out, forwards a pasted code, and enters after sign-in', async () => {
  const { login, skip, claudeCodeStatus, claudeCodeSubmitCode } = mount('signed-out')
  expect(await screen.findByText('Sign in to Claude Code to get started')).toBeTruthy()
  expect(document.title).toBe('Claude Code Harness')
  expect(visibleButtons()).toEqual(['Sign in to Claude Code', 'Check again', 'Set up later'])
  fireEvent.click(screen.getByText('Sign in to Claude Code'))
  expect(await screen.findByText('Finish signing in in your browser')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Submit code', 'Cancel'])
  fireEvent.change(document.querySelector('input')!, { target: { value: ' abc123 ' } })
  fireEvent.submit(document.querySelector('form')!)
  expect(claudeCodeSubmitCode).toHaveBeenCalledWith('abc123')
  claudeCodeStatus.mockResolvedValue({ state: 'signed-in' })
  await act(async () => { login.resolve('signed-in'); await login.promise })
  await vi.waitFor(() => { expect(skip).toHaveBeenCalledOnce() })
})

it('returns to the sign-in choices after cancellation and offers a retry after failure', async () => {
  const cancelled = mount('signed-out')
  fireEvent.click(await screen.findByText('Sign in to Claude Code'))
  fireEvent.click(screen.getByText('Cancel'))
  expect(cancelled.claudeCodeCancel).toHaveBeenCalledOnce()
  await act(async () => { cancelled.login.resolve('cancelled'); await cancelled.login.promise })
  expect(await screen.findByText('Sign in to Claude Code to get started')).toBeTruthy()
  cleanup()
  const failed = mount('signed-out')
  fireEvent.click(await screen.findByText('Sign in to Claude Code'))
  await act(async () => { failed.login.resolve('failed'); await failed.login.promise })
  expect(await screen.findByText('Sign in was not completed. Please try again.')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Sign in again', 'Check again', 'Set up later'])
})

it('explains an unavailable CLI and lets the user check again or continue', async () => {
  const { skip, claudeCodeStatus } = mount('unavailable')
  expect(await screen.findByText('Claude Code could not start')).toBeTruthy()
  expect(visibleButtons()).toEqual(['Check again', 'Set up later'])
  fireEvent.click(screen.getByText('Check again'))
  await vi.waitFor(() => { expect(claudeCodeStatus).toHaveBeenCalledTimes(2) })
  fireEvent.click(screen.getByText('Set up later'))
  await vi.waitFor(() => { expect(skip).toHaveBeenCalledOnce() })
})
