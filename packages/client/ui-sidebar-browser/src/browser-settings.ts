/** Settings the Host half serves and the browser half reads, shared by both compiler faces. */

/** Settings namespace of the browser preferences; it is the plugin's Loader row id. */
export const SIDEBAR_BROWSER_NAMESPACE = 'ui-sidebar-browser'

/** Browser preferences as the browser half reads them from the settings projection. */
export interface SidebarBrowserSettings {
  /** HTTPS search address for address-bar keywords; `%s` receives the encoded query. */
  searchUrl?: string
  /** HTTPS page a new Browser tab opens when it has no address of its own; empty opens none. */
  homeUrl?: string
}
