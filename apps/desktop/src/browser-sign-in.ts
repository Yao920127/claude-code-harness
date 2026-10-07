/** A Google sign-in window whose cookies land in the Sidebar browser's shared persistent partition. */
import { BrowserWindow, type Session } from 'electron'
import type { DesktopBrowserSignInResult } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'

/** First page of the flow; Google returns here once the account is signed in. */
export const GOOGLE_SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F'

/** Origin whose committed document proves the sign-in finished. */
const SIGNED_IN_ORIGIN = 'https://myaccount.google.com'

/**
 * Owns at most one sign-in window. The window shares the Sidebar browser's
 * Session, so a completed sign-in leaves Google's cookies where every Sidebar
 * tab reads them; the window itself carries no preload, Node, or webview.
 */
export class DesktopBrowserSignIn {
  private pending: Promise<DesktopBrowserSignInResult> | undefined
  private window: BrowserWindow | undefined

  /**
   * @param browserSession - the Sidebar browser's shared Session, configured with its isolation policy.
   * @param title - window title in the shell locale.
   * @param parent - current application window.
   */
  constructor(private readonly browserSession: () => Session, private readonly title: () => string,
    private readonly parent: () => BrowserWindow | undefined) {}

  /**
   * Open the sign-in window after a user action; a repeated request focuses and joins the open one.
   * @returns `signed-in` once Google returns to the account page, `cancelled` when the window closes first,
   *   or `failed` when the page cannot load or leaves HTTPS.
   */
  signIn(): Promise<DesktopBrowserSignInResult> {
    if (this.pending !== undefined) {
      this.window?.show()
      this.window?.focus()
      return this.pending
    }
    const result = Promise.withResolvers<DesktopBrowserSignInResult>()
    const parent = this.parent()
    const window = new BrowserWindow({
      width: 520, height: 720, ...(parent === undefined ? {} : { parent }),
      title: this.title(), autoHideMenuBar: true,
      webPreferences: { session: this.browserSession(), nodeIntegration: false, contextIsolation: true,
        sandbox: true, webSecurity: true, webviewTag: false, spellcheck: false },
    })
    this.pending = result.promise
    this.window = window
    let settled = false
    const finish = (outcome: DesktopBrowserSignInResult): void => {
      if (settled) return
      settled = true
      this.pending = undefined
      this.window = undefined
      if (!window.isDestroyed()) window.destroy()
      result.resolve(outcome)
    }
    window.setMenu(null)
    window.on('closed', () => { finish('cancelled') })
    window.on('page-title-updated', (event) => { event.preventDefault() })
    const contents = window.webContents
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const leaveHttps = (event: { preventDefault: () => void }, url: string): void => {
      if (!isHttps(url)) { event.preventDefault(); finish('failed') }
    }
    contents.on('will-navigate', leaveHttps)
    contents.on('will-redirect', leaveHttps)
    contents.on('will-attach-webview', (event) => { event.preventDefault() })
    contents.on('login', (event, _details, _authInfo, callback) => { event.preventDefault(); callback() })
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      // -3 is an aborted load, which every redirect in the flow produces.
      if (mainFrame && code !== -3) finish('failed')
    })
    contents.on('render-process-gone', () => { finish('failed') })
    contents.on('did-navigate', (_event, url) => {
      if (isHttps(url) && new URL(url).origin === SIGNED_IN_ORIGIN) finish('signed-in')
    })
    void window.loadURL(GOOGLE_SIGN_IN_URL).catch(() => { finish('failed') })
    return result.promise
  }
}

function isHttps(value: string): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return url.protocol === 'https:' && url.username === '' && url.password === ''
}
