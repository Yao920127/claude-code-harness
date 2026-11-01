import type {
  DiffBlockLabels,
  JsonTreeLabels,
  MarkdownLabels,
  ReadBlockLabels,
  SearchBlockLabels,
  TerminalBlockLabels,
  WebBlockLabels,
} from '../src/index.ts'

export const markdownLabels: MarkdownLabels = {
  code: { copyLabel: '複製', copiedLabel: '複製成功' },
  footnotes: 'Footnotes',
}

export const diffBlockLabels: DiffBlockLabels = {
  codeLabel: '程式碼塊', wrapLabel: '自動換行', unwrapLabel: '取消自動換行',
  copy: '複製', copied: '複製成功', collapseAria: '收起差異',
  expandAria: hidden => `展開其餘 ${hidden} 行差異`,
  collapse: '收起', expand: hidden => `… 其餘 ${hidden} 行`,
}

export const readBlockLabels: ReadBlockLabels = {
  codeLabel: '程式碼塊', wrapLabel: '自動換行', unwrapLabel: '取消自動換行',
  window: (shown, total) => `顯示 ${shown} / ${total} 行`,
  copy: '複製', copied: '複製成功', collapseAria: '收起內容',
  expandAria: hidden => `展開其餘 ${hidden} 行`,
  collapse: '收起', expand: hidden => `… 其餘 ${hidden} 行`,
}

export const searchBlockLabels: SearchBlockLabels = {
  pathsSummary: (shown, total, truncated) => truncated
    ? `顯示 ${shown} / 共 ${total} 個路徑`
    : `${shown} 個路徑`,
  matchesSummary: (shown, total, files, truncated) => truncated
    ? `顯示 ${shown} / 共 ${total} 處匹配 · ${files} 個檔案`
    : `${shown} 處匹配 · ${files} 個檔案`,
  copy: '複製', copied: '複製成功', noResults: '無結果',
  collapseAria: '收起結果',
  expandAria: hidden => `展開其餘 ${hidden} 行結果`,
  collapse: '收起', expand: hidden => `… 其餘 ${hidden} 行`,
}

export const terminalBlockLabels: TerminalBlockLabels = {
  signal: signal => `訊號 ${signal}`,
  exitCode: code => `結束代碼 ${code}`,
  noExitCode: '未正常退出',
  running: '執行中', failed: '失敗', done: '已完成',
  copy: '複製', copied: '複製成功', noOutput: '無輸出',
  collapseAria: '收起輸出', collapse: '收起',
  expandAria: hidden => `展開其餘 ${hidden} 行輸出`,
  expand: hidden => `… 其餘 ${hidden} 行`,
}

export const jsonTreeLabels: JsonTreeLabels = {
  copyValue: 'Copy value', copyJson: 'Copy JSON', copyPath: 'Copy property path',
  copyPrettyJson: 'Copy pretty JSON', copyCompactJson: 'Copy compact JSON',
  copied: 'Copied', copyFailed: 'Copy failed',
  collapseNode: 'Collapse JSON node', expandNode: 'Expand JSON node',
  copyButtonTitle: action => `${action}; right-click for copy options`,
}

export const webBlockLabels: WebBlockLabels = {
  noResults: '未找到結果', sourcesTruncated: '來源列表已截斷',
  http: 'HTTP', contentTruncated: '內容已截斷', markdown: markdownLabels,
}
