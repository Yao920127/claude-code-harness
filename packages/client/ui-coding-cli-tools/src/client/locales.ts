/** Copy owned by the coding-CLI sign-in list on the Models settings page. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    codingCliSignIn: keyof typeof zh
  }
}

/** Chinese sign-in list copy. */
export const zh = {
  title: '以登入使用（不需 API 金鑰）',
  description: '這些模型使用各 CLI 自己的登入，不使用上方的 API 金鑰供應商。登入後，模型會出現在模型選擇器的 {names} 群組中。',
  checking: '檢查中…',
  signedIn: '已登入',
  signedInAs: '已登入：{email}',
  signedOut: '未登入',
  unavailable: '未安裝或無法執行',
  signIn: '登入',
  signInAgain: '重新登入',
  recheck: '重新檢查',
  cancel: '取消',
  waitingBrowser: '請在瀏覽器完成 {name} 登入…',
  waitingCode: '請在瀏覽器完成 {name} 登入，並貼上頁面顯示的授權碼。',
  codePlaceholder: '授權碼',
  submitCode: '送出授權碼',
  terminal: '已開啟終端機執行 {name} 登入，完成後按「重新檢查」。',
  failed: '{name} 登入失敗，請再試一次。',
} satisfies Record<string, string>

/** English sign-in list copy. */
export const en = {
  title: 'Use with sign-in (no API key)',
  description: 'These models use each CLI\'s own sign-in, not the API-key providers above. Once signed in, their models appear in the model selector under {names}.',
  checking: 'Checking…',
  signedIn: 'Signed in',
  signedInAs: 'Signed in as {email}',
  signedOut: 'Signed out',
  unavailable: 'Not installed or cannot run',
  signIn: 'Sign in',
  signInAgain: 'Sign in again',
  recheck: 'Check again',
  cancel: 'Cancel',
  waitingBrowser: 'Finish the {name} sign-in in your browser…',
  waitingCode: 'Finish the {name} sign-in in your browser, then paste the authorization code it shows.',
  codePlaceholder: 'Authorization code',
  submitCode: 'Submit code',
  terminal: 'The {name} sign-in is running in a Terminal window; choose Check again when it finishes.',
  failed: 'The {name} sign-in failed. Try again.',
} satisfies Record<keyof typeof zh, string>
