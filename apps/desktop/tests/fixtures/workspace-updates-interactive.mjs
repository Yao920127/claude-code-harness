/** Operator-controlled qualification using the real workspace; synthetic payloads never execute. */
import { app, BrowserWindow, Menu, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Keep the private workspace open until the operator closes the control window or exits the application.
 * @param {object} options Real workspace and fixture-owned delivery, task, and installation controls.
 * @returns {Promise<void>} Resolves after operator exit and removal of control listeners.
 */
export async function runInteractiveUpdates({ mainWindow, server, fixture, checkMenu, control, root }) {
  const panel = new BrowserWindow({ title: '本地升級驗收控制', width: 640, height: 460,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } })
  const finished = Promise.withResolvers()
  const finish = () => finished.resolve()
  panel.once('closed', finish)
  app.once('before-quit', finish)
  let closing = false
  const originalInstall = fixture.updater.quitAndInstall
  fixture.updater.quitAndInstall = (...args) => {
    fixture.installations.push(args)
    void dialog.showMessageBox(panel, { type: 'info', title: '本地驗收結束',
      message: '已完成下載、驗證、安裝確認和任務收尾。',
      detail: '安裝器呼叫已攔截，未安裝或重新啟動到新版本。確認後退出本輪演練；重新執行命令可開始下一輪。',
      buttons: ['結束演練'] }).then(finish).catch(finish)
  }
  const action = (label, operation) => ({ label, click: () => {
    if (closing) return
    void Promise.resolve().then(operation).catch(error => {
      console.error(error)
      if (!panel.isDestroyed()) dialog.showErrorBox('本地驗收操作失敗', String(error))
    })
  } })
  const select = mode => server.select(mode, '0.1.6-nightly.1')
  select('hold-download')
  const check = () => checkMenu.click()
  panel.setMenu(Menu.buildFromTemplate([
    { label: '更新情境', submenu: [
      action('普通更新（點選下載後保持進度）', () => { server.policy('clear'); select('hold-download'); check() }),
      action('強制更新（點選下載後保持進度）', () => { server.policy('force'); select('hold-download'); check() }),
      action('放行目前下載 → 驗證與安裝確認', () => server.release()),
      { type: 'separator' },
      action('下一次下載：驗證失敗', () => select('corrupt')),
      action('下一次下載：404 失敗', () => select('download-404')),
      action('下一次下載：恢復正常', () => select('healthy')),
      action('檢查失敗', () => { select('feed-404'); check() }),
      action('沒有可用更新（未下載前使用）', () => { server.select('healthy', '0.1.5-rc.1'); check() }),
      action('解除強更阻塞', () => { server.policy('clear'); check() }),
    ] },
    { label: '任務狀態', submenu: [
      action('新增排隊任務', () => control('queue')),
      action('清空排隊任務', () => control('clear')),
      action('模擬任務停止失敗（本輪有效）', () => control('hold-shutdown')),
    ] },
    { label: '視窗', submenu: [
      action('返回應用', () => { mainWindow.restore(); mainWindow.show(); mainWindow.focus() }),
      action('結束演練', finish),
    ] },
  ]))
  try {
    await panel.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="zh-CN">
      <meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
      <style>body{font:16px/1.8 system-ui;padding:24px;color:#222}h2{margin-top:0}strong{color:#165dff}</style>
      <h2>手動升級驗收 · 不執行安裝器</h2>
      <p>使用本視窗頂部的<strong>更新情境</strong>選單選擇普通更新或強制更新，再到應用裡點選下載。</p>
      <p>下載會保持進度，供你檢視。回到這裡選擇<strong>放行目前下載</strong>，才會進入總和檢查碼安裝確認。</p>
      <p>用<strong>任務狀態</strong>選單新增排隊任務，檢視安裝前的任務警告。失敗模式須在下載前選擇。</p>
      <p>資料和更新伺服器均為本地隔離測試。下載地址為範例地址。關閉此視窗結束演練；重跑命令重置狀態。</p>
      </html>`)}`)
    console.log(`Interactive updater ready: ${root}`)
    await finished.promise
    closing = true
    await writeFile(join(root, 'interactive-result.json'), JSON.stringify({ installerExecuted: false,
      interceptedInstallations: fixture.installations.length, phases: fixture.states.map(state => state.phase) }, null, 2) + '\n')
  } finally {
    closing = true
    fixture.updater.quitAndInstall = originalInstall
    app.off('before-quit', finish)
    panel.off('closed', finish)
    if (!panel.isDestroyed()) panel.destroy()
  }
}
