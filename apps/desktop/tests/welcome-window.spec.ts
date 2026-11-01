import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { needsWelcome, WELCOME_IPC } from '../src/welcome-api.ts'

const electron = vi.hoisted(() => ({
  create: vi.fn<(options: unknown) => ReturnType<typeof createWindow>>(),
  root: '/desktop-app',
  handlers: new Map<string, (event: unknown, value?: unknown) => Promise<unknown>>(),
}))
vi.mock('electron', () => ({
  app: { getAppPath: () => electron.root },
  BrowserWindow: vi.fn(function (options: unknown) { return electron.create(options) }),
  ipcMain: {
    handle: (name: string, handler: (event: unknown, value?: unknown) => Promise<unknown>) => {
      if (electron.handlers.has(name)) throw new Error(`duplicate IPC handler: ${name}`)
      electron.handlers.set(name, handler)
    },
    removeHandler: (name: string) => electron.handlers.delete(name),
  },
}))

const { openWelcomeWindow, welcomeWindowOptions } = await import('../src/welcome-window.ts')

function createWindow() {
  return {
    webContents: {
      mainFrame: {},
      setWindowOpenHandler: vi.fn<(handler: () => { action: string }) => void>(),
      on: vi.fn<(name: string, handler: (event: { preventDefault(): void }) => void) => void>(),
    },
    loadFile: vi.fn<(path: string) => Promise<undefined>>().mockResolvedValue(undefined),
    isDestroyed: vi.fn().mockReturnValue(false),
    destroy: vi.fn(),
    show: vi.fn(),
    once: vi.fn<(name: string, callback: () => void) => void>(),
  }
}

beforeEach(() => { electron.create.mockReset(); electron.handlers.clear() })

const operations = {
  takeNotice: async () => undefined,
  startSignIn: async () => ({ links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out' as const, attempt: null }),
  cancelSignIn: async () => ({ links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out' as const, attempt: null }),
  copySignInLink: async () => undefined,
  saveApiKey: () => Promise.resolve({ ok: true as const }),
  skip: () => Promise.resolve(),
  cliStatus: async () => ({ state: 'signed-out' as const }),
  cliSignIn: async () => 'signed-in' as const,
  cliSubmitCode: async () => true,
  cliCancel: async () => undefined,
}

describe('desktop welcome window', () => {
  it.each(['darwin', 'win32', 'linux'] as const)('keeps the %s preview fixed-size and sandboxed', (platform) => {
    const options = welcomeWindowOptions(platform, resolveDesktopLocale('zh-CN'))
    expect(options).toMatchObject({
      width: 600, height: 700, useContentSize: true, center: true, show: false,
      resizable: false, maximizable: false, fullscreenable: false,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
        additionalArguments: ['--dsh-welcome-locale=zh-CN'],
      },
    })
    expect(options.webPreferences?.preload).toMatch(/preload-welcome\.cjs$/u)
    if (platform === 'darwin') {
      expect(options.vibrancy).toBe('menu')
      expect(options.visualEffectState).toBe('active')
      expect(options.trafficLightPosition).toEqual({ x: 21, y: 21 })
    } else if (platform === 'win32') {
      expect(options.backgroundMaterial).toBe('acrylic')
      expect(options.titleBarOverlay).toMatchObject({ height: 42 })
    } else {
      expect(options.backgroundColor).toBe('#FFFFFF')
      expect(options.vibrancy).toBeUndefined()
      expect(options.backgroundMaterial).toBeUndefined()
    }
  })

  it('starts the renderer in the CLI sign-in view only when asked', () => {
    expect(welcomeWindowOptions('darwin', resolveDesktopLocale('en'), true).webPreferences?.additionalArguments)
      .toEqual(['--dsh-welcome-locale=en', '--dsh-welcome-cli'])
  })

  it('routes CLI sign-in actions from its own frame and rejects unknown CLIs and malformed codes', async () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    const cliStatus = vi.fn(operations.cliStatus)
    const cliSubmitCode = vi.fn(operations.cliSubmitCode)
    const cliCancel = vi.fn(operations.cliCancel)
    await openWelcomeWindow(resolveDesktopLocale('en'), { ...operations, cliStatus, cliSubmitCode, cliCancel }, true)
    expect(electron.create.mock.calls[0]![0]).toMatchObject({ webPreferences: { additionalArguments: ['--dsh-welcome-locale=en', '--dsh-welcome-cli'] } })
    const own = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    const status = electron.handlers.get(WELCOME_IPC.cliStatus)!
    await expect(status({ ...own, senderFrame: {} }, 'codex')).rejects.toThrow('unowned frame')
    await expect(status(own, 'unknown-cli')).rejects.toThrow('invalid CLI')
    expect(await status(own, 'codex')).toEqual({ state: 'signed-out' })
    expect(cliStatus).toHaveBeenCalledWith('codex')
    expect(await electron.handlers.get(WELCOME_IPC.cliSignIn)!(own, 'grok')).toBe('signed-in')
    const submit = electron.handlers.get(WELCOME_IPC.cliSubmitCode)!
    expect(await submit(own, 'claude-code', 'has space')).toBe(false)
    expect(await submit(own, 'claude-code', 42)).toBe(false)
    expect(cliSubmitCode).not.toHaveBeenCalled()
    expect(await submit(own, 'claude-code', 'code#123')).toBe(true)
    expect(cliSubmitCode).toHaveBeenCalledWith('claude-code', 'code#123')
    expect(await electron.handlers.get(WELCOME_IPC.cliCancel)!(own, 'opencode')).toBeUndefined()
    expect(cliCancel).toHaveBeenCalledWith('opencode')
  })

  it('waits for its local document and blocks renderer navigation', async () => {
    const window = createWindow()
    const loaded = Promise.withResolvers<undefined>()
    window.loadFile.mockReturnValue(loaded.promise)
    electron.create.mockReturnValue(window)
    const opening = openWelcomeWindow(resolveDesktopLocale('en'), operations)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.loadFile).toHaveBeenCalledWith(join(electron.root, 'renderer', 'welcome.html'))
    expect(window.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' })
    const event = { preventDefault: vi.fn() }
    window.webContents.on.mock.calls[0]![1](event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    loaded.resolve(undefined)
    expect(await opening).toBe(window)
    expect(window.show).toHaveBeenCalledOnce()
  })

  it('destroys a window whose document fails to load', async () => {
    const window = createWindow()
    window.loadFile.mockRejectedValue(new Error('missing welcome document'))
    electron.create.mockReturnValue(window)
    await expect(openWelcomeWindow(resolveDesktopLocale('en'), operations)).rejects.toThrow('missing welcome document')
    expect(window.destroy).toHaveBeenCalledOnce()
    expect(electron.handlers.size).toBe(0)
    expect(window.show).not.toHaveBeenCalled()
  })

  it('does not show a window closed while its document was loading', async () => {
    const window = createWindow()
    window.isDestroyed.mockReturnValue(true)
    electron.create.mockReturnValue(window)
    await openWelcomeWindow(resolveDesktopLocale('en'), operations)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.destroy).not.toHaveBeenCalled()
  })

  it('accepts actions only from its own top frame and removes handlers on close', async () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    const saveApiKey = vi.fn(operations.saveApiKey)
    const skip = vi.fn(operations.skip)
    const copySignInLink = vi.fn(operations.copySignInLink)
    const takeNotice = vi.fn(async () => 'session-expired' as const)
    await openWelcomeWindow(resolveDesktopLocale('en'), { ...operations, saveApiKey, skip, copySignInLink, takeNotice })
    const own = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    const take = electron.handlers.get(WELCOME_IPC.takeNotice)!
    await expect(take({ ...own, senderFrame: {} })).rejects.toThrow('unowned frame')
    expect(takeNotice).not.toHaveBeenCalled()
    expect(await take(own)).toBe('session-expired')
    expect(takeNotice).toHaveBeenCalledOnce()
    const save = electron.handlers.get(WELCOME_IPC.saveApiKey)!
    await expect(save({ sender: {}, senderFrame: {} }, 'sk-test')).rejects.toThrow('unowned frame')
    await expect(save({ ...own, senderFrame: {} }, 'sk-test')).rejects.toThrow('unowned frame')
    expect(await save(own, 'bad key')).toEqual({ ok: false })
    expect(saveApiKey).not.toHaveBeenCalled()
    expect(await save(own, 'sk-test')).toEqual({ ok: true })
    await electron.handlers.get(WELCOME_IPC.skip)!(own)
    expect(skip).toHaveBeenCalledOnce()
    const copy = electron.handlers.get(WELCOME_IPC.copyLink)!
    await expect(copy({ ...own, senderFrame: {} }, 'attempt')).rejects.toThrow('unowned frame')
    await expect(copy(own, 42)).rejects.toThrow('invalid attempt')
    await copy(own, 'attempt')
    expect(copySignInLink).toHaveBeenCalledExactlyOnceWith('attempt')
    window.once.mock.calls[0]![1]()
    expect(electron.handlers.size).toBe(0)
  })

  it('does not show a superseded window when its delayed document finishes loading', async () => {
    const previous = createWindow()
    const current = createWindow()
    const loaded = Promise.withResolvers<undefined>()
    previous.loadFile.mockReturnValue(loaded.promise)
    electron.create.mockReturnValueOnce(previous).mockReturnValueOnce(current)
    const opening = openWelcomeWindow(resolveDesktopLocale('en'), operations)
    await openWelcomeWindow(resolveDesktopLocale('en'), operations)
    loaded.resolve(undefined)
    await opening
    expect(previous.show).not.toHaveBeenCalled()
    expect(current.show).toHaveBeenCalledOnce()
    previous.once.mock.calls[0]![1]()
    current.once.mock.calls[0]![1]()
  })

  it('replaces handlers before the previous native window emits closed', async () => {
    const previous = createWindow()
    const current = createWindow()
    electron.create.mockReturnValueOnce(previous).mockReturnValueOnce(current)
    const previousStart = vi.fn(operations.startSignIn)
    const currentStart = vi.fn(operations.startSignIn)
    await openWelcomeWindow(resolveDesktopLocale('en'), { ...operations, startSignIn: previousStart })
    const previousHandler = electron.handlers.get(WELCOME_IPC.start)!
    const previousSender = { sender: previous.webContents, senderFrame: previous.webContents.mainFrame }
    await openWelcomeWindow(resolveDesktopLocale('en'), { ...operations, startSignIn: currentStart })
    const currentHandler = electron.handlers.get(WELCOME_IPC.start)!
    await expect(previousHandler(previousSender)).rejects.toThrow('unowned frame')
    await expect(currentHandler(previousSender)).rejects.toThrow('unowned frame')
    previous.once.mock.calls[0]![1]()
    expect(electron.handlers.get(WELCOME_IPC.start)).toBe(currentHandler)
    await currentHandler({ sender: current.webContents, senderFrame: current.webContents.mainFrame })
    expect(currentStart).toHaveBeenCalledOnce()
    expect(previousStart).not.toHaveBeenCalled()
    current.once.mock.calls[0]![1]()
    expect(electron.handlers.size).toBe(0)
  })

  it('shows the entry only when no route can serve the workspace, and opens it on a CLI profile only while no CLI is signed in', () => {
    expect(needsWelcome({ loggedIn: true, hasApiKey: false, cli: 'absent' })).toBe(false)
    expect(needsWelcome({ loggedIn: false, hasApiKey: false, cli: 'absent' })).toBe(true)
    expect(needsWelcome({ loggedIn: false, hasApiKey: true, cli: 'absent' })).toBe(false)
    expect(needsWelcome({ loggedIn: true, hasApiKey: true, cli: 'absent' })).toBe(false)
    expect(needsWelcome({ loggedIn: false, hasApiKey: false, cli: 'signed-in' })).toBe(false)
    expect(needsWelcome({ loggedIn: true, hasApiKey: true, cli: 'signed-out' })).toBe(true)
  })
})
