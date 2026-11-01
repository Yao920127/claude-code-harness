/** Locale-owned Excel preview controls and parser feedback. */
export const zh = {
  title: '表格', language: 'zh', loading: '文件渲染中...',
  invalid: '無法開啟此表格。請檢查檔案格式、內容或密碼保護。',
  tooLarge: '此表格超過預覽大小限制。', timeout: '開啟表格超時。請縮小檔案後重試。',
  encoding: '無法識別此文字檔案的編碼。請另存為 UTF-8 或帶 BOM 的 UTF-16 後重試。',
  formulaWarning: '此工作簿包含公式，顯示結果可能缺失或不準確。',
  unsupportedNotice: '目前預覽不支援此工作簿中的{features}。請使用系統應用開啟，以獲得完整體驗。',
  charts: '圖表', images: '圖片', shapes: '形狀', conditionalFormatting: '條件格式', featureSeparator: '、',
  retry: '重試',
} satisfies Record<string, string>

/** Excel preview dictionary keys. */
export type ExcelPreviewKey = keyof typeof zh

/** English Excel preview copy. */
export const en = {
  title: 'Spreadsheet', language: 'en', loading: 'Rendering document...',
  invalid: 'This spreadsheet could not be opened. Check its format, contents, or password protection.',
  tooLarge: 'This workbook exceeds the preview size limit.', timeout: 'Opening this workbook timed out. Try a smaller file.',
  encoding: 'This text encoding could not be read. Save the file as UTF-8 or UTF-16 with a BOM and retry.',
  formulaWarning: 'This workbook contains formulas. Displayed results may be missing or inaccurate.',
  unsupportedNotice: 'This preview does not support {features} in this workbook. Open it in a system application for the full experience.',
  charts: 'charts', images: 'images', shapes: 'shapes', conditionalFormatting: 'conditional formatting', featureSeparator: ', ',
  retry: 'Retry',
} satisfies Record<ExcelPreviewKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Excel preview status and third-party locale selection. */
    sidebarExcel: ExcelPreviewKey
  }
}
