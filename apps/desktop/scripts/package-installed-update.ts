/** Operator-only signed packaging; default checks do not launch children, sign, install, or publish. */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { InstalledUpdateSigningHoldError, packageInstalledUpdate } from './installed-update-packaging.ts'

async function main(): Promise<void> {
  const [manifest, version, mode, ...extra] = process.argv.slice(2)
  if (!manifest || !version || extra.length !== 0 || (mode !== undefined && mode !== '--check' && mode !== '--execute')) {
    throw new Error('invalid invocation')
  }
  const result = await packageInstalledUpdate(manifest, version, { execute: mode === '--execute',
    confirm: async (id, selectedVersion) => {
      if (!stdin.isTTY || !stdout.isTTY) return false
      const terminal = createInterface({ input: stdin, output: stdout })
      try {
        console.log('僅在管理員已稽核並恢復簽名保護後繼續。確認已登出權杖、剩餘 5/5、PIN 正確且無其他簽名任務。')
        console.log('本次打包會有多次簽名；不重試失敗操作，驅動內部認證次數無法保證。出現密碼彈出視窗請取消，不要補輸。')
        console.log('PIN 只從 .env.windows 讀取；簽名介面要求它短暫出現在 SignTool 參數中。不會安裝或上傳。')
        const expected = `PACKAGE ${selectedVersion} ${id}`
        return (await terminal.question(`僅授權這個版本，請輸入 ${expected}：`)) === expected
      } finally { terminal.close() }
    } })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof InstalledUpdateSigningHoldError ? error.message
    : 'installed update packaging stopped. Check prepared files and the retained record; do not retry or remove protection automatically.')
  process.exitCode = 1
})
