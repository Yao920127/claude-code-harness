/** Assemble Electron navigation and presentation behind the shared BrowserPage interface. */
import type { DesktopBrowserBridge } from '../../types.ts'
import type { BrowserPage, BrowserPageOptions } from '../browser/BrowserPage.ts'
import { ElectronWebViewImpl } from './ElectronWebViewImpl.ts'
import { ElectronWebviewPresentation } from './ElectronWebviewPresentation.ts'

/**
 * Assemble an idle Electron provider; guest creation waits for mounting and navigation.
 * @param options - checkpoint and source-tab callbacks.
 * @param bridge - desktop-only transport.
 * @returns separate navigation and presentation faces.
 */
export function createElectronPage(options: BrowserPageOptions, bridge: DesktopBrowserBridge): BrowserPage {
  const presentation = new ElectronWebviewPresentation({
    mounted: () => { frame.attach() },
    unmounted: () => { frame.detach() },
  })
  const frame = new ElectronWebViewImpl(options, bridge, presentation)
  return { frame, presentation }
}
