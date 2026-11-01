/** Locale-owned Browser tab copy. */
export const zh = {
  'type.label': '瀏覽器',
  'guide.title': '瀏覽器',
  'guide.description': '瀏覽網頁',
  'shortcut.noSession': '請先開啟一個工作階段',
  'address.placeholder': '輸入網址或搜尋關鍵詞',
  'address.changed': 'URL 已變化',
  back: '後退',
  forward: '前進',
  reload: '重新整理',
  go: '前往',
  external: '在系統瀏覽器中開啟',
  'sandbox.disable': '關閉沙箱限制',
  'sandbox.enable': '恢復沙箱限制',
  'sandbox.warning': '沙箱限制已關閉；頁面可以導航頂層應用，並使用下載、模態對話方塊與輸入鎖定。',
  start: '輸入網址或搜尋關鍵詞開始瀏覽',
  loading: '正在開啟…',
  'restore.previous': '上次開啟',
  'restore.action': '恢復頁面',
  'error.empty': '請輸入地址。',
  'error.invalid': '這個地址無效或過長。',
  'error.protocol': '只支援 HTTP 和 HTTPS 地址；本地檔案請使用文件預覽。',
  'error.credentials': '地址不能包含使用者名稱或密碼。',
  'error.application-origin': '不能在嵌入瀏覽器中開啟 DSH 應用自身。',
  'error.search': '搜尋設定尚未載入；請稍後再試，或輸入完整網址。',
  'load.failed': '頁面載入失敗；請重新整理重試或在系統瀏覽器中開啟。',
  'load.failed.detail': '頁面載入失敗 ({code}): {description}',
  'address.unknown': '頁面已跳轉；目前載體無法讀取新的 URL。',
  'account.menu': '登入資料',
  'account.clear': '清除登入資料',
  'account.cleared': '已清除所有網站的登入資料。',
  'account.failed': '清除沒有完成；請稍後再試。',
} satisfies Record<string, string>

/** Browser dictionary key union. */
export type SidebarBrowserKey = keyof typeof zh

/** English dictionary with the same keys. */
export const en = {
  'type.label': 'Browser',
  'guide.title': 'Browser',
  'guide.description': 'Browse web pages',
  'shortcut.noSession': 'Open a session first',
  'address.placeholder': 'Enter an address or search terms',
  'address.changed': 'URL changed',
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  go: 'Go',
  external: 'Open in system browser',
  'sandbox.disable': 'Disable sandbox restrictions',
  'sandbox.enable': 'Restore sandbox restrictions',
  'sandbox.warning': 'Sandbox restrictions are disabled; the page can navigate the top-level app and use downloads, modal dialogs, and input locks.',
  start: 'Enter an address or search terms to start browsing',
  loading: 'Opening…',
  'restore.previous': 'Previously opened',
  'restore.action': 'Restore page',
  'error.empty': 'Enter an address.',
  'error.invalid': 'That address is invalid or too long.',
  'error.protocol': 'Only HTTP and HTTPS addresses are supported; use Document Preview for local files.',
  'error.credentials': 'Addresses cannot contain a username or password.',
  'error.application-origin': 'The embedded browser cannot open the DSH application itself.',
  'error.search': 'Search settings have not loaded yet; try again shortly or enter a full address.',
  'load.failed': 'The page could not load; reload or open it in the system browser.',
  'load.failed.detail': 'Page load failed ({code}): {description}',
  'address.unknown': 'The page navigated; this carrier cannot read its new URL.',
  'account.menu': 'Sign-in data',
  'account.clear': 'Clear sign-in data',
  'account.cleared': 'Sign-in data for every site was cleared.',
  'account.failed': 'Clearing did not finish; try again later.',
} satisfies Record<SidebarBrowserKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar Browser labels, navigation controls, and failures. */
    sidebarBrowser: SidebarBrowserKey
  }
}
