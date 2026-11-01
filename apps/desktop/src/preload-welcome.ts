import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
/** Localized welcome copy and write-only credential actions. */

import { contextBridge, ipcRenderer } from 'electron'
import { resolveDesktopLocale } from './locale.ts'
import { WELCOME_IPC, type CliLoginResult, type CliProviderId, type CliStatus, type WelcomeApi, type WelcomeNotice, type WelcomeSaveResult } from './welcome-api.ts'

const prefix = '--dsh-welcome-locale='
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
if (locale === undefined) throw new Error('desktop welcome: missing window locale')
const api: WelcomeApi = {
  ...resolveDesktopLocale(locale),
  cliLogin: process.argv.includes('--dsh-welcome-cli'),
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
  cliStatus: (provider: CliProviderId) => ipcRenderer.invoke(WELCOME_IPC.cliStatus, provider) as Promise<CliStatus>,
  cliSignIn: (provider: CliProviderId) => ipcRenderer.invoke(WELCOME_IPC.cliSignIn, provider) as Promise<CliLoginResult>,
  cliSubmitCode: (provider: CliProviderId, code: string) =>
    ipcRenderer.invoke(WELCOME_IPC.cliSubmitCode, provider, code) as Promise<boolean>,
  cliCancel: (provider: CliProviderId) => ipcRenderer.invoke(WELCOME_IPC.cliCancel, provider) as Promise<void>,
}
contextBridge.exposeInMainWorld('dshWelcome', api)
