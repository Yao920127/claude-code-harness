import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
/** Localized welcome copy and write-only credential actions. */

import { contextBridge, ipcRenderer } from 'electron'
import { resolveDesktopLocale } from './locale.ts'
import { WELCOME_IPC, type ClaudeCodeLoginResult, type ClaudeCodeStatus, type WelcomeApi, type WelcomeNotice, type WelcomeSaveResult } from './welcome-api.ts'

const prefix = '--dsh-welcome-locale='
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
if (locale === undefined) throw new Error('desktop welcome: missing window locale')
const api: WelcomeApi = {
  ...resolveDesktopLocale(locale),
  claudeCode: process.argv.includes('--dsh-welcome-claude-code'),
  takeNotice: () => ipcRenderer.invoke(WELCOME_IPC.takeNotice) as Promise<WelcomeNotice | undefined>,
  startSignIn: () => ipcRenderer.invoke(WELCOME_IPC.start) as Promise<AccountView>,
  cancelSignIn: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.cancel, id) as Promise<AccountView>,
  copySignInLink: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.copyLink, id) as Promise<void>,
  onAccountState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: AccountView): void =>{  listener(state) }
    ipcRenderer.on(WELCOME_IPC.state, receive)
    return () => { ipcRenderer.removeListener(WELCOME_IPC.state, receive) }
  },
  saveApiKey: (value: string) => ipcRenderer.invoke(WELCOME_IPC.saveApiKey, value) as Promise<WelcomeSaveResult>,
  skip: () => ipcRenderer.invoke(WELCOME_IPC.skip) as Promise<void>,
  claudeCodeStatus: () => ipcRenderer.invoke(WELCOME_IPC.claudeCodeStatus) as Promise<ClaudeCodeStatus>,
  claudeCodeSignIn: () => ipcRenderer.invoke(WELCOME_IPC.claudeCodeSignIn) as Promise<ClaudeCodeLoginResult>,
  claudeCodeSubmitCode: (code: string) => ipcRenderer.invoke(WELCOME_IPC.claudeCodeSubmitCode, code) as Promise<boolean>,
  claudeCodeCancel: () => ipcRenderer.invoke(WELCOME_IPC.claudeCodeCancel) as Promise<void>,
}
contextBridge.exposeInMainWorld('dshWelcome', api)
