/** `open-in-app` namespace dictionaries: the workspace split button and the document-preview path controls. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'open-in-app'

/** Application labels shared verbatim by both dictionaries (product names). */
const PRODUCT_NAMES = {
  'app.cursor': 'Cursor',
  'app.vscode': 'VS Code',
  'app.vscodeinsiders': 'VS Code Insiders',
  'app.windsurf': 'Windsurf',
  'app.zed': 'Zed',
  'app.sublimetext': 'Sublime Text',
  'app.xcode': 'Xcode',
  'app.androidstudio': 'Android Studio',
  'app.intellij': 'IntelliJ IDEA',
  'app.pycharm': 'PyCharm',
  'app.webstorm': 'WebStorm',
  'app.phpstorm': 'PhpStorm',
  'app.goland': 'GoLand',
  'app.rider': 'Rider',
  'app.rustrover': 'RustRover',
  'app.fork': 'Fork',
  'app.sourcetree': 'Sourcetree',
  'app.github': 'GitHub Desktop',
  'app.tower': 'Tower',
  'app.gitkraken': 'GitKraken',
  'app.smartgit': 'SmartGit',
  'app.sublimemerge': 'Sublime Merge',
  'app.ghostty': 'Ghostty',
  'app.warp': 'Warp',
  'app.iterm': 'iTerm2',
  'app.kitty': 'kitty',
  'app.windowsterminal': 'Windows Terminal',
  'app.gitbash': 'Git Bash',
  'app.gnometerminal': 'GNOME Terminal',
  'app.konsole': 'Konsole',
} as const

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'open.title': '用 {app} 開啟',
  'path.appDefault': '{app}（預設）',
  'path.appsError': '無法取得應用列表',
  'shortcut.busy': '正在開啟工作區',
  'shortcut.unavailable': '目前工作區或本地應用不可用',
  'open.tooltip': '在本地開啟',
  'path.open': '開啟',
  'path.more': '更多開啟方式',
  'path.reveal': '顯示檔案位置',
  'path.openError': '開啟失敗，請重試',
  'path.revealError': '無法顯示檔案位置，請重試',
  ...PRODUCT_NAMES,
  'app.finder': '訪達',
  'app.explorer': '檔案資源管理器',
  'app.filemanager': '檔案管理器',
  'app.terminal': '終端',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<OpenInAppKey, string> = {
  'open.title': 'Open in {app}',
  'path.appDefault': '{app} (default)',
  'path.appsError': 'Could not load applications',
  'shortcut.busy': 'Opening workspace',
  'shortcut.unavailable': 'Current workspace or local application unavailable',
  'open.tooltip': 'Open locally',
  'path.open': 'Open',
  'path.more': 'More ways to open',
  'path.reveal': 'Show file location',
  'path.openError': 'Could not open. Try again.',
  'path.revealError': 'Could not show the file location. Try again.',
  ...PRODUCT_NAMES,
  'app.finder': 'Finder',
  'app.explorer': 'File Explorer',
  'app.filemanager': 'Files',
  'app.terminal': 'Terminal',
}

/** Key domain of the `open-in-app` namespace (zh is the source of truth). */
export type OpenInAppKey = keyof typeof zh
