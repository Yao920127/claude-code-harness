/** Typed English and Traditional Chinese (Taiwan) copy owned by the Electron shell. */

import { zhTW } from './locale-zh-tw.ts'

export const en = {
  application: 'Application',
  fileMenu: 'File',
  closePage: 'Close Page or Window',
  aboutMenu: 'About Claude Code Harness',
  aboutProduct: 'Claude Code Harness',
  aboutVersion: 'Version V{version}',
  hideApplication: 'Hide Claude Code Harness',
  hideOtherApplications: 'Hide Others',
  showAllApplications: 'Show All',
  quitApplication: 'Quit Claude Code Harness',
  openApplication: 'Open Claude Code Harness',
  quit: 'Quit',
  cancel: 'Cancel',
  quitTitle: 'Quit Claude Code Harness?',
  quitActiveTasks: 'Running tasks will be interrupted.',
  quitScheduledTasks: 'Scheduled tasks will not run while the app is closed.',
  quitActiveAndScheduledTasks: 'Running tasks will be interrupted, and scheduled tasks will not run while the app is closed.',
  backgroundNoticeBody: 'Running tasks will continue. You can reopen the window from the system tray.',
  backgroundNoticeConfirm: 'Confirm',
  edit: 'Edit',
  menuBar: 'Application menu',
  delete: 'Delete',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  startupFailed: 'Claude Code Harness is unavailable',
  fatalSummary: 'The application could not start or stopped unexpectedly.',
  startupAddressInUse: 'Another DSH instance (such as dsh web or the desktop app) is running. They cannot start at the same time. Quit the other running DSH instance, then restart.',
  diagnosticTruncated: '… Error details shortened.',
  reportWrittenTo: 'Diagnostic report: {path}',
  startupReinstallAdvice: 'If application files are missing or damaged, close the application and reinstall it. Your tasks are stored separately.',
  exitApplication: 'Exit',
  restartApplication: 'Restart',
  recoveryOperationFailed: 'The recovery operation failed',
  disableThirdPartyPlugins: 'Disable third-party plugins, back up profile patch, and restart',
  welcomeTitle: 'Claude Code Harness',
  welcomeBrand: 'Claude Code Harness',
  welcomeTaglineBefore: 'Welcome to ',
  welcomeTaglineBrand: 'Claude Code Harness',
  welcomeTaglineAfter: '',
  welcomeDescription: 'Build potential. Explore intelligence.',
  welcomeAuthStarting: 'Opening sign in…',
  welcomeAuthWaiting: 'Browser didn’t open automatically?',
  welcomeAuthWaitingDescription: 'Copy the sign-in link and open it in your browser to sign in.',
  welcomeAuthExchanging: 'Completing sign in…',
  welcomeAuthExpired: 'Sign in timed out',
  welcomeAuthExpiredDescription: 'Sign in again to continue',
  welcomeAuthFailed: 'Could not complete sign in. Please try again.',
  welcomeAuthCopyLink: 'Copy sign-in link',
  welcomeAuthCopied: 'Copied',
  welcomeAuthCopyFailed: 'Could not copy. Try again.',
  welcomeAuthCancel: 'Cancel',
  welcomeAuthRetry: 'Sign in again',
  welcomeSignIn: 'Sign in',
  welcomeApiKey: 'Add API Key',
  welcomeKeyTitle: 'Add an API key to get started',
  welcomeKeyDescription: 'Configure official DeepSeek models to start using Harness',
  welcomeKeyPlaceholder: 'Enter API key',
  welcomeKeySave: 'Save and continue',
  welcomeKeyLater: 'Set up later',
  welcomeKeyBack: 'Back to sign in',
  welcomeSessionExpired: 'You have signed out of your account, please log in again.',
  welcomeKeyBlank: 'Enter an API key.',
  welcomeKeyInvalid: 'Enter the API key itself, without quotes, spaces, or an environment-variable assignment.',
  welcomeKeyFailed: 'Could not save the API key. Please try again.',
  welcomeContinueFailed: 'Could not open the workspace. Please try again.',
  cliChooseTitle: 'Sign in to a coding CLI',
  cliChooseDescription: 'Sign in to any of these CLIs, or set up later. Each one uses its own installed CLI and account.',
  cliStatusChecking: 'Checking…',
  cliStatusSignedIn: 'Signed in',
  cliStatusSignedInAs: 'Signed in as {email}',
  cliStatusSignedOut: 'Not signed in',
  cliStatusUnavailable: 'Not installed',
  cliSignIn: 'Sign in',
  cliRecheck: 'Check again',
  cliLater: 'Set up later',
  cliContinue: 'Continue',
  cliBack: 'Back',
  cliWaitingTitle: 'Finish signing in to {name}',
  cliWaitingBrowser: 'Complete the sign-in in your browser.',
  cliWaitingCode: 'If the browser shows an authorization code, paste it below.',
  cliTerminalTitle: 'Finish signing in to {name} in the terminal',
  cliTerminalDescription: 'A terminal window opened with the {name} login. Finish there, then check again.',
  cliCodePlaceholder: 'Paste authorization code',
  cliSubmitCode: 'Submit code',
  cliFailed: 'Sign in to {name} was not completed. Please try again.',
  checkUpdatesMenu: 'Check for Updates…',
  reloadPageMenu: 'Reload Page',
  restartAppHostMenu: 'Restart App and Host',
  updateCheckFailedTitle: 'Update Check Failed',
  updateCheckFailed: 'Could not check for updates. Please try again later.',
  updateDownloadFailed: 'Could not download the update. Please try again.',
  updateInstallFailed: 'Could not install the update. Please try again later.',
  updateCheckNetworkFailed: 'Could not check for updates. Please try again later. The connection was interrupted. Check your network and try again.',
  updateDownloadNetworkFailed: 'Could not download the update. Please try again. The connection was interrupted. Check your network and try again.',
  updateInstallNetworkFailed: 'Could not install the update. Please try again later. The connection was interrupted. Check your network and try again.',
  unknownError: 'Unknown error',
  updateCheckTitle: 'Check for Updates',
  updateCurrent: 'No updates available. Current version: V{version}',
  updateChecking: 'Checking for updates…',
  updateDownload: 'Download update',
  updateDownloadedTitle: 'Claude Code Harness v{version} downloaded',
  updateDownloadedDetail: 'The update package has downloaded. Select “Install and Restart” to restart the app and begin installation.',
  updateDownloadedTitleWindows: 'New version v{version} is ready',
  updateDownloadedDetailWindows: 'The app will close temporarily during the update and reopen automatically when it is complete.\n\nThe update may take some time. Please wait and do not launch the app again during installation.',
  updateClose: 'Close',
  updateAcknowledge: 'OK',
  updateLater: 'Update later',
  updateDownloading: 'Downloading {percent}%…',
  updateVerifying: 'Verifying update files…',
  updateInstalling: 'Preparing to restart…',
  updateRetry: 'Retry update',
  updateActiveTasks: 'Tasks are still in progress',
  updateActiveTasksDetail: 'Restarting to update may interrupt these tasks. Continue updating?',
  updateStopTasks: 'Stop tasks and update',
  updateTasksChanged: 'New tasks started. Review the update confirmation again.',
  updateTasksUnavailable: 'Task status is unavailable. Try updating again when the workspace is ready.',
  updateStopFailed: 'Tasks could not be stopped safely. The update was not installed. Please try again later.',
  updateTechnicalDetails: 'View technical details',
  updateTitle: 'Claude Code Harness Update',
  updateAvailable: 'An update is available',
  updateDetail: 'Claude Code Harness {version}\n\nCCH will restart to complete the update.',
  installAndRestart: 'Install and Restart',
  later: 'Later',
  updateFailedTitle: 'Update Failed',
  mandatoryTitle: 'Update required',
  mandatoryDetail: 'This version is no longer supported. Update to continue. Existing tasks can keep running until you approve a restart.',
  mandatoryUnavailable: 'The update requirement could not be checked. Retry when the connection is available.',
  policyLoginTitle: 'Sign in to the test environment',
  policyLoginRequired: 'This is a test build. Checking update requirements needs Feishu sign-in. Signing in does not download or install an update.',
  policyLogin: 'Sign in with Feishu',
  policyLoginFailed: 'Test environment sign-in did not complete. Please check your connection and try again.',
  policyLoginLoading: 'Loading sign-in page…',
  mandatoryNoRelease: 'No applicable update is available. Check again or contact support.',
  mandatoryRefresh: 'Check again',
  mandatoryPage: 'Open download page',
  mandatoryCopy: 'Copy download address',
  mandatoryPageFailed: 'The download page could not be opened. Copy the address below and open it in your browser.',
  mandatoryActionFailed: 'The update action failed. Retry; the update requirement remains active.',
  mandatoryReady: 'Update ready',
  mandatoryVersion: 'V{version}',
  mandatoryReadyDetail: 'Installing the update will restart the application.',
  mandatoryDeferred: 'Existing tasks can keep running. Update to continue using the application.',
  mandatoryContinue: 'Continue installing update',
  mandatoryInspecting: 'Checking tasks…',
  mandatoryStopping: 'Safely stopping tasks in the application.',
  mandatoryRestarting: 'The application will restart shortly. Please wait.',
  mandatoryDownloadFailed: 'The update files could not be downloaded or prepared. Please retry.',
  mandatoryInstallFailed: 'The update was not installed. Check tasks again and retry.',
  mandatoryOpenHelp: 'If the page did not open, you can',
  mandatoryReopen: 'Open download page again',
  mandatoryCopied: 'Link copied',
  mandatoryCopyFailed: 'Copy failed. Select and copy the address below manually.',
  mandatoryAddress: 'Download address',
  mandatoryNotification: 'Return to the application to confirm installation and restart.',
} as const

/** Every Desktop locale supplies the complete English key set. */
export type DesktopMessages = { readonly [Key in keyof typeof en]: string }

/** Locale payload exposed to the Desktop-owned renderer. */
export interface DesktopLocale {
  readonly id: 'en' | 'zh-TW'
  readonly messages: DesktopMessages
}

/** Resolve Electron's locale or a language tag to one shipped Desktop dictionary; every Chinese tag selects Traditional Chinese. */
export function resolveDesktopLocale(locale: string): DesktopLocale {
  return locale.toLowerCase().split('-')[0] === 'zh'
    ? { id: 'zh-TW', messages: zhTW }
    : { id: 'en', messages: en }
}

/**
 * Choose a built-in dictionary from the shared preference, then ordered OS languages.
 * @param preference - explicit locale.preference, or null when no language was selected.
 * @param languages - operating-system languages in preference order.
 * @returns the supported dictionary, falling back to English.
 */
export function resolveDesktopStartupLocale(preference: string | null, languages: readonly string[]): DesktopLocale {
  const selected = preference?.toLowerCase().split('-')[0]
  if (preference !== null && (selected === 'zh' || selected === 'en')) return resolveDesktopLocale(preference)
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0]
    if (primary === 'zh' || primary === 'en') return resolveDesktopLocale(language)
  }
  return resolveDesktopLocale('en')
}

/** Replace named placeholders in one locale-owned message. */
export function formatDesktopMessage(
  message: string,
  values: Readonly<Record<string, string>>,
): string {
  return message.replaceAll(/\{([^{}]+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder)
}

/**
 * Select localized copy for an ordinary downloaded-update confirmation.
 * @param messages - Selected Desktop dictionary.
 * @param version - Prepared update version without a leading v.
 * @param platform - Operating system presenting the confirmation.
 * @returns The versioned title and installation guidance.
 */
export function desktopUpdateReadyConfirmation(
  messages: DesktopMessages,
  version: string,
  platform: string,
): { message: string; detail: string } {
  return {
    message: formatDesktopMessage(platform === 'win32' ? messages.updateDownloadedTitleWindows : messages.updateDownloadedTitle, { version }),
    detail: platform === 'win32' ? messages.updateDownloadedDetailWindows : messages.updateDownloadedDetail,
  }
}
