/** Operator entry for separate test binary uploads and fixed-feed publication; default mode is local-only. */
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { verifiedInstalledUpdateDistribution, executeInstalledUpdatePublication } from './installed-update-publication.ts'
import { createInstalledUpdateCos } from './installed-update-cos.ts'

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    execute: { type: 'boolean', default: false }, journals: { type: 'string' },
  } })
  const [action, manifest, version, receipt, ...extra] = positionals
  if ((action !== 'upload-binaries' && action !== 'publish-feed') || !manifest || !version || !receipt || extra.length) {
    throw new Error('invalid invocation')
  }
  const prepared = await verifiedInstalledUpdateDistribution(manifest, version, receipt)
  console.log(JSON.stringify({ action, version, runId: prepared.run.id, destination: prepared.distribution,
    mode: values.execute ? 'awaiting-operator' : 'local-check', networkStarted: false }, null, 2))
  if (!values.execute) return
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('operator terminal required')
  const expected = `${action === 'upload-binaries' ? 'UPLOAD' : 'PUBLISH'} ${version} ${prepared.run.id}`
  const terminal = createInterface({ input: stdin, output: stdout })
  let confirmed = false
  try {
    console.log(action === 'upload-binaries'
      ? '僅授權此批次 test 二進位制上傳。確認沒有其他釋出者；會完整回讀安裝檔，可能產生較大下載流量。'
      : '僅授權此批次 test 清單釋出。確認沒有其他釋出者；複用成功上傳回執，僅回讀清單，不重複下載安裝檔。')
    if (action === 'publish-feed' && version === prepared.run.versions[1]) {
      console.log('確認版本 1 已透過安裝後的入口啟動並仍在執行；必須提供該批次 journals 目錄。')
    }
    confirmed = (await terminal.question(`請輸入 ${expected}：`)) === expected
  } finally { terminal.close() }
  if (!confirmed) throw new Error('operator declined')
  console.log(await executeInstalledUpdatePublication(manifest, version, receipt, action, createInstalledUpdateCos(), values.journals))
}

main().catch(() => {
  console.error('installed update: upload/publication stopped. Review local prerequisites and any retained operation record; no automatic retry.')
  process.exitCode = 1
})
