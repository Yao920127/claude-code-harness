/**
 * `sidebarRight` namespace dictionaries.
 *
 * Everything a user reads in this column is here, including the strings handed
 * to the docking kit — the kit renders no copy of its own, so its whole
 * vocabulary is this package's to own and translate.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'command.close': '關閉目前頁面／視窗',
  'command.refresh': '重新整理目前頁面',
  'command.noRefresh': '目前頁面不支援重新整理',
  'command.toggle': '展開／收起右側欄',
  'command.fullscreen': '面板全螢幕／退出全螢幕',
  'command.noSession': '請先選擇工作階段',
  'command.noFocus': '請先聚焦右側面板',
  'command.stale': '頁面已切換，請重新聚焦',
  'command.collapsed': '請先展開右側欄',
  'command.float': '浮動面板不支援此操作',
  'command.empty': '請先開啟頁面',
  'command.budget': '已達兩格上限',
  'command.width': '欄寬不足，拖寬側邊欄後再分欄',
  'chrome.expand': '開啟側邊欄',
  'chrome.expandAria': '開啟右側邊欄',
  'chrome.collapse': '收起側邊欄',
  'chrome.collapseAria': '收起右側邊欄',
  'chrome.toFullscreen': '全螢幕',
  'chrome.exitFullscreen': '退出全螢幕',
  'dock.emptyPane': '空面板',
  'dock.splitPane': '分欄',
  'dock.splitPaneDisabled': '已達兩格上限',
  'dock.splitPaneNarrow': '欄寬不足，拖寬側邊欄後再分欄',
  'dock.closeTab': '關閉',
  'dock.addTab': '新標籤頁',
  'dock.dockFloat': '收回到側邊欄',
  'dock.closeFloat': '關閉',
  'dock.drop.center': '移到這裡',
  'dock.drop.left': '左分欄',
  'dock.drop.right': '右分欄',
  'dock.drop.top': '上分欄',
  'dock.drop.bottom': '下分欄',
  'tab.guide.title': '開始',
  'tab.unavailable': '這類內容還沒有可用的檢視方式。',
} satisfies Record<string, string>

/** Right-Sidebar dictionary key union. */
export type SidebarRightKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'command.close': 'Close current page or window',
  'command.refresh': 'Refresh current page',
  'command.noRefresh': 'This page cannot be refreshed',
  'command.toggle': 'Toggle right sidebar',
  'command.fullscreen': 'Toggle panel fullscreen',
  'command.noSession': 'Select a session first',
  'command.noFocus': 'Focus a right sidebar pane first',
  'command.stale': 'The page changed; focus it again',
  'command.collapsed': 'Expand the right sidebar first',
  'command.float': 'This action is unavailable in a floating panel',
  'command.empty': 'Open a page first',
  'command.budget': 'Two panes is the limit',
  'command.width': 'Not enough width to split, widen the sidebar',
  'chrome.expand': 'Open sidebar',
  'chrome.expandAria': 'Open right sidebar',
  'chrome.collapse': 'Collapse sidebar',
  'chrome.collapseAria': 'Collapse right sidebar',
  'chrome.toFullscreen': 'Fullscreen',
  'chrome.exitFullscreen': 'Exit fullscreen',
  'dock.emptyPane': 'Empty pane',
  'dock.splitPane': 'Split',
  'dock.splitPaneDisabled': 'Two panes is the limit',
  'dock.splitPaneNarrow': 'Not enough width to split, widen the sidebar',
  'dock.closeTab': 'Close',
  'dock.addTab': 'New tab',
  'dock.dockFloat': 'Send back to the sidebar',
  'dock.closeFloat': 'Close',
  'dock.drop.center': 'Move here',
  'dock.drop.left': 'Add left split',
  'dock.drop.right': 'Add right split',
  'dock.drop.top': 'Add top split',
  'dock.drop.bottom': 'Add bottom split',
  'tab.guide.title': 'Start',
  'tab.unavailable': 'Nothing here can view this kind of content yet.',
} satisfies Record<SidebarRightKey, string>
