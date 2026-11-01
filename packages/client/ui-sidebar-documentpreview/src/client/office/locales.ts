/** Office preview copy and Host render configuration guidance. */
export const zh = {
  title: 'Office 文件',
  loading: '文件渲染中...',
  retry: '重試',
  viewMissingFonts: '缺失 {count} 種字型，點選檢視',
  missingFontsTitle: '缺失的字型',
  missingFontsDescription: '本次預覽無法使用以下字型，預覽中的文字和排版可能與原文件不同。',
  missingFontsCount: '{count} 種字型',
  closeDetails: '關閉字型詳情',
  unavailable: 'Office 預覽不可用。請在執行 DeepSeek Harness 的主機上啟用文件預覽服務。',
  invalid: '無法預覽此 Office 檔案。檔案可能已損壞、受密碼保護，或與副檔名不符。',
  tooLarge: 'Office 檔案或轉換後的 PDF 超過預覽大小上限，請縮小檔案或調整預覽設定。',
  failed: 'Office 轉換失敗，未生成可用的 PDF。請檢查該檔案後重試。',
  timeout: 'Office 轉換超時，請重試。',
  busy: 'Office 預覽任務較多，請稍後重試。',
  changed: '檔案在讀取時已更改，請重新開啟預覽。',
} satisfies Record<string, string>

/** Office preview locale keys. */
export type OfficePreviewKey = keyof typeof zh

/** English translations checked against the Chinese key set. */
export const en = {
  title: 'Office document',
  loading: 'Rendering document...',
  retry: 'Retry',
  viewMissingFonts: 'Missing fonts: {count}. Click to view.',
  missingFontsTitle: 'Missing fonts',
  missingFontsDescription: 'These fonts are unavailable for this preview. Text and layout may differ from the original document.',
  missingFontsCount: 'Fonts: {count}',
  closeDetails: 'Close font details',
  unavailable: 'Office previews are unavailable. Enable the document preview service on the computer running DeepSeek Harness.',
  invalid: 'This Office file cannot be previewed. It may be damaged, password protected, or have the wrong extension.',
  tooLarge: 'The Office file or converted PDF exceeds the preview size limit. Reduce the file size or adjust the preview configuration.',
  failed: 'Office conversion did not produce a usable PDF. Check the file and try again.',
  timeout: 'Office conversion timed out. Try again.',
  busy: 'Office preview is busy. Try again shortly.',
  changed: 'The file changed while being read. Reopen the preview.',
} satisfies Record<OfficePreviewKey, string>
