import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
import type { BrowserWindowConstructorOptions } from 'electron'

const native = vi.hoisted(() => ({
  create: vi.fn<(options: BrowserWindowConstructorOptions) => object>(),
  partition: vi.fn(),
}))
vi.mock('electron', () => ({
  BrowserWindow: function (options: BrowserWindowConstructorOptions) { return native.create(options) },
  app: { isPackaged: true },
  session: { fromPartition: native.partition },
}))
const { DesktopBrowserSignIn, GOOGLE_SIGN_IN_URL } = await import('../src/browser-sign-in.ts')
const { chromeUserAgent, DesktopBrowserGuests, SIDEBAR_BROWSER_PARTITION } = await import('../src/browser-guests.ts')

const ELECTRON_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'DeepSeek Harness/0.1.7 Chrome/140.0.7339.41 Electron/38.1.0 Safari/537.36'

function makeSession() {
  return Object.assign(new EventEmitter(), {
    getUserAgent: () => ELECTRON_AGENT, setUserAgent: vi.fn(),
    setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(), webRequest: { onBeforeRequest: vi.fn() },
    clearStorageData: vi.fn(async () => {}), clearAuthCache: vi.fn(async () => {}),
  })
}

function makeWindow() {
  let destroyed = false
  const instance = Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn<(handler: () => { action: string }) => void>() }),
    show: vi.fn(), focus: vi.fn(), setMenu: vi.fn(), loadURL: vi.fn(async () => {}), isDestroyed: () => destroyed,
    destroy: () => { if (!destroyed) { destroyed = true; instance.emit('closed') } },
  })
  return instance
}

let browserSession: ReturnType<typeof makeSession>
let window: ReturnType<typeof makeWindow>
beforeEach(() => {
  vi.clearAllMocks()
  browserSession = makeSession()
  window = makeWindow()
  native.partition.mockReturnValue(browserSession)
  native.create.mockReturnValue(window)
})

function signIn() {
  return new DesktopBrowserSignIn(() => browserSession as never, () => '使用 Google 登入', () => undefined)
}

it('presents Electron as the Chrome it embeds', () => {
  expect(chromeUserAgent(ELECTRON_AGENT)).toBe(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.41 Safari/537.36')
})

it('gives every guest the one persistent partition, configured once, and clears every sign-in from it', async () => {
  const guests = new DesktopBrowserGuests(() => undefined)
  const owner = {} as never
  const first = guests.acquire(owner)
  const second = guests.acquire(owner)
  expect(first.partition).toBe(SIDEBAR_BROWSER_PARTITION)
  expect(SIDEBAR_BROWSER_PARTITION.startsWith('persist:')).toBe(true)
  expect(second.partition).toBe(SIDEBAR_BROWSER_PARTITION)
  expect(first.lease).not.toBe(second.lease)
  expect(native.partition).toHaveBeenCalledExactlyOnceWith(SIDEBAR_BROWSER_PARTITION)
  expect(browserSession.setUserAgent).toHaveBeenCalledExactlyOnceWith(chromeUserAgent(ELECTRON_AGENT))
  expect(browserSession.setPermissionRequestHandler).toHaveBeenCalledOnce()
  await guests.clearSignIn()
  expect(browserSession.clearStorageData).toHaveBeenCalledOnce()
  expect(browserSession.clearAuthCache).toHaveBeenCalledOnce()
})

it('opens one sandboxed window over the shared Session and finishes on the Google account page', async () => {
  const auth = signIn()
  const pending = auth.signIn()
  expect(auth.signIn()).toBe(pending)
  expect(window.show).toHaveBeenCalledOnce()
  expect(native.create).toHaveBeenCalledTimes(1)
  expect(native.create.mock.calls[0]![0]).toMatchObject({ title: '使用 Google 登入', webPreferences: {
    session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
  } })
  expect(native.create.mock.calls[0]![0].webPreferences?.preload).toBeUndefined()
  expect(window.loadURL).toHaveBeenCalledWith(GOOGLE_SIGN_IN_URL)
  expect(window.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' })
  window.webContents.emit('did-navigate', {}, 'https://accounts.google.com/v3/signin/challenge/pwd')
  expect(window.isDestroyed()).toBe(false)
  window.webContents.emit('did-navigate', {}, 'https://myaccount.google.com/')
  await expect(pending).resolves.toBe('signed-in')
  expect(window.isDestroyed()).toBe(true)
  // A finished window lets the next request open a fresh one.
  window = makeWindow()
  native.create.mockReturnValue(window)
  void auth.signIn()
  expect(native.create).toHaveBeenCalledTimes(2)
})

it('reports a closed window as cancelled', async () => {
  const pending = signIn().signIn()
  window.destroy()
  await expect(pending).resolves.toBe('cancelled')
})

it.each([
  ['a navigation away from HTTPS', (w: ReturnType<typeof makeWindow>) => {
    const event = { preventDefault: vi.fn() }
    w.webContents.emit('will-navigate', event, 'http://accounts.google.com/')
    expect(event.preventDefault).toHaveBeenCalledOnce()
  }],
  ['a redirect carrying credentials', (w: ReturnType<typeof makeWindow>) => {
    w.webContents.emit('will-redirect', { preventDefault: vi.fn() }, 'https://user:pass@example.com/')
  }],
  ['a main-frame load failure', (w: ReturnType<typeof makeWindow>) => {
    w.webContents.emit('did-fail-load', {}, -3, 'aborted', 'https://accounts.google.com/', true)
    expect(w.isDestroyed()).toBe(false)
    w.webContents.emit('did-fail-load', {}, -105, 'name not resolved', 'https://accounts.google.com/', true)
  }],
  ['a crashed renderer', (w: ReturnType<typeof makeWindow>) => { w.webContents.emit('render-process-gone') }],
  ['a rejected first load', (w: ReturnType<typeof makeWindow>) => { void w }],
])('reports %s as failed', async (label, trigger) => {
  if (label === 'a rejected first load') window.loadURL.mockRejectedValueOnce(new Error('offline'))
  const pending = signIn().signIn()
  trigger(window)
  await expect(pending).resolves.toBe('failed')
})

it('keeps HTTPS navigation, denies nested guests and HTTP auth prompts, and pins the window title', () => {
  void signIn().signIn()
  const allowed = { preventDefault: vi.fn() }
  window.webContents.emit('will-navigate', allowed, 'https://accounts.google.com/signin')
  window.webContents.emit('will-navigate', allowed, 'not a url')
  expect(allowed.preventDefault).toHaveBeenCalledOnce()
  const attach = { preventDefault: vi.fn() }
  window.webContents.emit('will-attach-webview', attach)
  expect(attach.preventDefault).toHaveBeenCalledOnce()
  const login = { preventDefault: vi.fn() }
  const callback = vi.fn()
  window.webContents.emit('login', login, {}, {}, callback)
  expect(login.preventDefault).toHaveBeenCalledOnce()
  expect(callback).toHaveBeenCalledWith()
  const title = { preventDefault: vi.fn() }
  window.emit('page-title-updated', title)
  expect(title.preventDefault).toHaveBeenCalledOnce()
})
