// @vitest-environment jsdom
/** The Models settings sign-in list of the CLIs whose own sign-in the model routes use. */
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { CliSignInList, statusText } from '../src/client/CliSignInList.tsx'
import { en, zh } from '../src/client/locales.ts'
import { signInBridge, type CliSignInBridge, type CliSignInStatus } from '../src/client/sign-in-bridge.ts'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(globalThis, 'dshDesktop')
})

const t = makeTranslate(en)

type BridgeDouble = { readonly [K in keyof CliSignInBridge]: Mock }

function bridge(statuses: Partial<Record<string, CliSignInStatus>> = {}): BridgeDouble {
  return {
    status: vi.fn((provider: string) => Promise.resolve(statuses[provider] ?? { state: 'signed-out' })),
    signIn: vi.fn(() => Promise.resolve('signed-in')),
    submitCode: vi.fn(() => Promise.resolve(true)),
    cancel: vi.fn(() => Promise.resolve()),
  }
}

function list(cli: BridgeDouble) {
  return render(<CliSignInList bridge={cli as never as CliSignInBridge} t={t} />)
}

describe('statusText', () => {
  it('describes each sign-in state', () => {
    expect(statusText(undefined, t)).toBe('Checking…')
    expect(statusText({ state: 'signed-in' }, t)).toBe('Signed in')
    expect(statusText({ state: 'signed-in', email: 'a@b.c' }, t)).toBe('Signed in as a@b.c')
    expect(statusText({ state: 'signed-out' }, t)).toBe('Signed out')
    expect(statusText({ state: 'unavailable' }, t)).toBe('Not installed or cannot run')
  })
})

describe('signInBridge', () => {
  it('reads the Desktop bridge only when the preload exposes it', () => {
    const cli = bridge()
    expect(signInBridge({})).toBeUndefined()
    expect(signInBridge({ dshDesktop: { protocolVersion: 1 } })).toBeUndefined()
    expect(signInBridge({ dshDesktop: { cli } })).toBe(cli)
  })
})

describe('CliSignInList', () => {
  it('lists every CLI with its state and offers sign-in to installed CLIs', async () => {
    const cli = bridge({ 'claude-code': { state: 'signed-in', email: 'me@x.y' }, antigravity: { state: 'unavailable' } })
    cli.status.mockImplementationOnce(() => Promise.reject(new Error('down')))
    list(cli)
    await waitFor(() => { expect(screen.getAllByRole('listitem').every(row => row.getAttribute('data-state') !== 'checking')).toBe(true) })
    expect(screen.getAllByRole('listitem').map(row => row.textContent)).toEqual([
      'Claude CodeNot installed or cannot run',
      'CodexSigned outSign in',
      'AntigravityNot installed or cannot run',
      'Grok BuildSigned outSign in',
      'OpenCodeSigned outSign in',
    ])
    expect(screen.getByText(/Claude Code、Codex、Antigravity、Grok Build、OpenCode/u)).toBeTruthy()
  })

  it('runs a browser login and rechecks the CLI when it completes', async () => {
    const cli = bridge({ codex: { state: 'signed-in' } })
    list(cli)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }))
    expect(cli.signIn).toHaveBeenCalledWith('codex')
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    expect(cli.status).toHaveBeenCalledTimes(6)
  })

  it('takes a pasted authorization code during a Claude Code login and cancels a running login', async () => {
    const cli = bridge()
    let finish!: (result: string) => void
    cli.signIn.mockImplementation(() => new Promise<string>((resolve) => { finish = resolve }))
    list(cli)
    const buttons = await screen.findAllByRole('button', { name: 'Sign in' })
    fireEvent.click(buttons[0]!)
    expect(screen.getByRole('status').textContent).toContain('paste the authorization code')
    const input = screen.getByRole('textbox', { name: 'Authorization code' })
    fireEvent.submit(input.closest('form')!)
    expect(cli.submitCode).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: ' abc ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit code' }))
    expect(cli.submitCode).toHaveBeenCalledWith('claude-code', 'abc')
    await waitFor(() => { expect((input as HTMLInputElement).value).toBe('') })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cli.cancel).toHaveBeenCalledWith('claude-code')
    await act(async () => { finish('cancelled') })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('waits for a terminal login and lets a failed login retry or close', async () => {
    const cli = bridge()
    cli.signIn.mockResolvedValueOnce('terminal').mockRejectedValueOnce(new Error('spawn')).mockResolvedValueOnce('terminal')
    list(cli)
    const [, , , , opencode] = await screen.findAllByRole('button', { name: 'Sign in' })
    fireEvent.click(opencode!)
    expect(await screen.findByText(/running in a Terminal window/u)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Check again' }).at(-1)!)
    await waitFor(() => { expect(cli.status).toHaveBeenLastCalledWith('opencode') })
    expect(screen.getByRole('status')).toBeTruthy()
    cli.status.mockResolvedValueOnce({ state: 'signed-in' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Check again' }).at(-1)!)
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sign in' }))[0]!)
    expect(await screen.findByText(/sign-in failed/u)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1)!)
    expect(await screen.findByText(/running in a Terminal window/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Check again' })[0]!)
    expect(cli.cancel).not.toHaveBeenCalled()
  })

  it('keeps a code the running login did not receive, and ignores a login that ends after unmount', async () => {
    const cli = bridge()
    let finish!: (result: string) => void
    cli.signIn.mockImplementation(() => new Promise<string>((resolve) => { finish = resolve }))
    cli.submitCode.mockResolvedValue(false)
    const view = list(cli)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sign in' }))[0]!)
    const input = screen.getByRole('textbox', { name: 'Authorization code' })
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit code' }))
    await act(async () => { await Promise.resolve() })
    expect((input as HTMLInputElement).value).toBe('abc')
    view.unmount()
    await act(async () => { finish('signed-in') })
    expect(cli.status).toHaveBeenCalledTimes(5)
  })

  it('ignores answers that arrive after the list unmounts', async () => {
    const cli = bridge()
    let answer!: (status: CliSignInStatus) => void
    cli.status.mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    const view = list(cli)
    view.unmount()
    await act(async () => { answer({ state: 'signed-in' }) })
    expect(cli.status).toHaveBeenCalledTimes(5)
  })
})

describe('sign-in list plugin', () => {
  it('registers the list at the Models settings foot in the Desktop app', async () => {
    const cli = bridge()
    Object.defineProperty(globalThis, 'dshDesktop', { configurable: true, value: { protocolVersion: 1, cli } })
    const ctx = new Context()
    const entries: { inject: () => unknown }[] = []
    const dictionaries = new Map<string, unknown>()
    ctx.provide('uiConversation', { events: { register: vi.fn() } } as never)
    ctx.provide('slots', {
      inject: (_name: string, add: () => () => void) => add(),
      register: (entry: { inject: () => unknown }) => { entries.push(entry); return () => { entries.splice(entries.indexOf(entry), 1) } },
    } as never)
    ctx.provide('locale', { register: (name: string, values: unknown) => { dictionaries.set(name, values); return () => { dictionaries.delete(name) } } } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(dictionaries.get('codingCliSignIn')).toEqual({ zh, en })
    expect(entries[0]?.inject()).toEqual({ bridge: cli })
    await fiber.dispose()
    expect(entries).toEqual([])
  })
})
