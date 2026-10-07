/** Shipped terminal panel over the real Loader, Remote mux, Chromium and local PTY. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterEach, beforeEach, describe, expect, it, onTestFailed, vi } from 'vitest'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-terminal-controller'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import { createProcessInspector, type ProcessIdentity } from '@deepseek-ai/dsh-subprocess-local/src/process-inspector.ts'
import { compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { openSettings, connectFreshWorkspace, saveFailureShot } from './support.ts'

const expected = fileURLToPath(new URL('./expected/terminal-panel/running.expected.md', import.meta.url))
const shots = fileURLToPath(new URL('../../../.artifacts/screenshots/terminal-panel/', import.meta.url))

const PANEL = '[data-terminal-panel]'
const BODY = '[data-terminal-panel-body]:visible'
const NEW = '[data-terminal-panel-new]'

/** A hidden panel is empty in every caller, so showing it opens the first terminal; a shown panel adds one. */
async function openTerminal(page: Page, waitForShell = true): Promise<void> {
  const panel = page.locator(PANEL)
  if (await panel.isVisible()) await panel.locator(NEW).click()
  else await showPanel(page)
  if (waitForShell) await expect.poll(async () => await page.locator('.xterm-rows:visible').innerText()).toContain('bash-')
}

async function showPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Toggle terminal panel', exact: true }).click()
  await page.locator(PANEL).waitFor()
}

async function hidePanel(page: Page): Promise<void> {
  await page.locator(PANEL).getByRole('button', { name: 'Hide terminal panel', exact: true }).click()
  await page.locator(PANEL).waitFor({ state: 'detached' })
}

function tabs(page: Page) {
  return page.locator(`${PANEL} [data-terminal-tab]`)
}

async function closeTab(tab: ReturnType<Page['locator']>): Promise<void> {
  await tab.getByRole('button', { name: /^Close terminal/u }).click()
}

async function command(page: Page, text: string): Promise<void> {
  await page.locator('.xterm-helper-textarea:visible').click()
  await page.keyboard.insertText(text)
  await page.keyboard.press('Enter')
}

async function controlTransport(page: Page) {
  let blocked = false
  let close: (() => Promise<void>) | undefined
  await page.routeWebSocket('**/api/remote.mux', async (socket) => {
    if (blocked) { await socket.close(); return }
    const upstream = socket.connectToServer()
    close = async () => { await upstream.close(); await socket.close() }
  })
  return {
    async disconnect() {
      blocked = true
      if (close === undefined) throw new Error('Window did not establish its Remote mux')
      await close()
    },
    reconnect() { blocked = false },
  }
}

async function selectTerminalTheme(page: Page, name: string): Promise<void> {
  await openSettings(page, 'en')
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  const [response] = await Promise.all([
    page.waitForResponse(candidate => new URL(candidate.url()).pathname === '/api/settings/mutate' && candidate.request().method() === 'POST'),
    dialog.getByRole('button', { name, exact: true }).click(),
  ])
  expect(response.ok()).toBe(true)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
}

describe.skipIf(process.platform === 'win32')('Web terminal panel', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  let handles: SubprocessTerminalHandle[]
  const inspector = createProcessInspector()
  const alive = (identity: ProcessIdentity) => inspector.isAlive(identity)
  const processIdentity = (index: number): ProcessIdentity => {
    const pid = handles[index]!.pid
    const identity = inspector.snapshot().tree(pid).find(member => member.pid === pid)
    if (identity === undefined) throw new Error(`Terminal process ${pid} is missing`)
    return identity
  }

  beforeEach(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('./fixtures/terminal-panel.patch.yml', import.meta.url)) })
    browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'en-US', timezoneId: 'Asia/Shanghai' })
    // These snapshots use the Linux Web shortcut defaults.
    await context.addInitScript(() => { Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Linux x86_64' }) })
    page = await context.newPage()
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    const agent = scaffold.ctx.agents.list()[0]
    if (agent === undefined) throw new Error('Workspace did not create a Session')
    handles = []
    const subprocess = agent.ctx.get('subprocess')
    if (subprocess === undefined) throw new Error('Session subprocess provider is missing')
    const spawn = subprocess.spawnTerminal.bind(subprocess)
    vi.spyOn(subprocess, 'spawnTerminal').mockImplementation(async (spec) => {
      const handle = await spawn(spec)
      handles.push(handle)
      return handle
    })
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Open a terminal.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    agent.session.append('step/start', { turn: 1, step: 1 })
    agent.session.append('assistant/message', { stream: [], turn: 1, step: 1, message: createMessage({ role: 'assistant', content: [{ type: 'text', text: 'Ready for terminal input.' }], source: { kind: 'model', provider: 'fixture', model: 'fixture' } }) }, { surfaceOp: 'append' })
    agent.session.append('step/end', { turn: 1, step: 1 })
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await scaffold.ctx.sessions.flush(agent.session)
    await page.getByText('Ready for terminal input.').waitFor()
    await mkdir(shots, { recursive: true })
  }, 180_000)

  afterEach(async () => {
    try { await browser?.close() } finally {
      try { await scaffold?.close() } finally { vi.restoreAllMocks() }
    }
  })

  it('preserves program palettes and keeps ANSI text and cursors readable across DSH themes', async () => {
    onTestFailed(() => saveFailureShot(page, 'terminal-colors'))
    await page.emulateMedia({ colorScheme: 'light' })
    await openTerminal(page)
    const terminal = page.locator(BODY)
    const screen = page.locator('.xterm-rows:visible')
    await command(page, "PS1=''; printf '\\033c\\033[97mBRIGHT_WHITE\\033[0m\\n'")
    const colorOf = async (text: string) => {
      const cell = screen.getByText(text, { exact: true })
      await cell.waitFor()
      return cell.evaluate(element => ({
        foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
      }))
    }
    const lightText = await colorOf('BRIGHT_WHITE')
    // Compare the rendered glyph with its real surface; the raw ANSI palette remains untouched.
    expect(contrastRatio(lightText.foreground, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(4.5)
    await command(page, "printf '\\033]4;1;#009900;255;#990099\\007\\033[31mANSI_CUSTOM\\033[38;5;255mEXTENDED_CUSTOM\\033[0m\\n'")
    const customLight = { ansi: await colorOf('ANSI_CUSTOM'), extended: await colorOf('EXTENDED_CUSTOM') }
    await selectTerminalTheme(page, 'Dark')
    await expect.poll(() => screen.evaluate(element => getComputedStyle(element).color)).toBe('rgb(249, 250, 251)')
    await selectTerminalTheme(page, 'Light')
    await expect.poll(() => screen.evaluate(element => getComputedStyle(element).color)).toBe('rgb(15, 17, 21)')
    expect({ ansi: await colorOf('ANSI_CUSTOM'), extended: await colorOf('EXTENDED_CUSTOM') }).toEqual(customLight)
    await command(page, "printf '\\033]104;1;255\\007'")
    await expect.poll(async () => (await colorOf('ANSI_CUSTOM')).foreground).not.toBe(customLight.ansi.foreground)
    await expect.poll(async () => (await colorOf('EXTENDED_CUSTOM')).foreground).not.toBe(customLight.extended.foreground)

    await command(page, "printf '\\033]10;#112233;#ddeeff;#990099\\007'")
    const defaults = () => terminal.evaluate(root => ({
      foreground: getComputedStyle(root.querySelector('.xterm-rows')!).color,
      background: getComputedStyle(root.querySelector('.xterm-scrollable-element')!).backgroundColor,
    }))
    const applicationDefaults = { foreground: 'rgb(17, 34, 51)', background: 'rgb(221, 238, 255)' }
    await expect.poll(defaults).toEqual(applicationDefaults)
    await selectTerminalTheme(page, 'Dark')
    await expect.poll(() => terminal.evaluate(root => getComputedStyle(root.querySelector('.xterm')!.parentElement!).backgroundColor))
      .toBe('rgb(21, 21, 23)')
    expect(await defaults()).toEqual(applicationDefaults)
    await command(page, "printf '\\033]110\\007\\033]111\\007\\033]112\\007'")
    await expect.poll(defaults).toEqual({ foreground: 'rgb(249, 250, 251)', background: 'rgb(21, 21, 23)' })
    await selectTerminalTheme(page, 'Light')
    await expect.poll(defaults).toEqual({ foreground: 'rgb(15, 17, 21)', background: 'rgb(255, 255, 255)' })

    const cursorColors = () => screen.locator('.xterm-cursor').evaluate((cursor) => {
      const style = getComputedStyle(cursor)
      return {
        background: style.backgroundColor, foreground: style.color,
        shadow: style.boxShadow, border: style.borderBottomColor, outline: style.outlineColor,
      }
    })
    const paintCursor = async (sgr: string, shape = 2) => {
      await command(page, `printf '\\033[0m\\033[2J\\033[H\\033[${sgr}mCURSOR\\033[1G\\033[${shape} q'`)
      await expect.poll(() => screen.locator('.xterm-cursor').innerText()).toBe('C')
    }
    // ron uses foreground 51 and background 16; no installed Vim is required by CI.
    await paintCursor('38;5;51;48;5;16')
    await expect.poll(async () => (await cursorColors()).background).toBe('rgb(255, 255, 255)')
    const ronLight = await cursorColors()
    expect(ronLight.foreground).toBe('rgb(0, 0, 0)')
    await terminal.screenshot({ path: `${shots}/ron-light.png`, animations: 'disabled' })
    await selectTerminalTheme(page, 'Dark')
    await page.locator('.xterm-helper-textarea:visible').click()
    await expect.poll(async () => (await cursorColors()).background).toBe('rgb(249, 250, 251)')
    await paintCursor('38;2;0;0;0;48;2;255;255;255')
    await expect.poll(async () => (await cursorColors()).background).toBe('rgb(0, 0, 0)')
    const whiteInDark = await cursorColors()
    await paintCursor('0;7')
    await expect.poll(async () => (await cursorColors()).background).toBe('rgb(0, 0, 0)')
    for (const shape of [4, 6]) {
      await paintCursor('38;5;51;48;5;16', shape)
      await expect.poll(async () => shape === 4 ? (await cursorColors()).border : (await cursorColors()).shadow).toContain('rgb(249, 250, 251)')
    }
    await paintCursor('38;2;0;0;0;48;2;255;255;255', 1)
    await page.addStyleTag({ content: '.xterm-cursor { animation-delay: -0.1s !important; animation-play-state: paused !important; }' })
    await expect.poll(async () => (await cursorColors()).background).toBe('rgb(0, 0, 0)')
    await page.addStyleTag({ content: '.xterm-cursor { animation-delay: -0.6s !important; }' })
    await expect.poll(async () => (await cursorColors()).background).toBe('rgb(255, 255, 255)')
    await page.locator('.xterm-helper-textarea:visible').evaluate((element) =>{  element.blur() })
    await expect.poll(async () => (await cursorColors()).outline).toBe('rgb(0, 0, 0)')
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/terminal-panel/colors.expected.md', import.meta.url)),
      JSON.stringify({ lightText, customLight, ronLight, whiteInDark }, null, 2), webSnapshotMode())
    expect(handles).toHaveLength(1)
    expect(tripwire.pageErrors).toEqual([])
  })

  it('follows light, dark and system themes while preserving the running shell and its output', async () => {
    await page.emulateMedia({ colorScheme: 'light' })
    await openTerminal(page)
    const process = processIdentity(0)
    const terminal = page.locator(BODY)
    const screen = page.locator('.xterm-rows:visible')
    await command(page, "DSH_THEME_PROBE=retained; PS1=''; printf '\\033cTHEME_CONTENT_RETAINED\\n'")
    await expect.poll(() => screen.innerText()).toContain('THEME_CONTENT_RETAINED')
    const readColors = () => terminal.evaluate((root) => {
      const xterm = root.querySelector('.xterm')!
      const rows = root.querySelector('.xterm-rows')!
      return {
        surface: getComputedStyle(xterm.parentElement!).backgroundColor,
        viewport: getComputedStyle(root.querySelector('.xterm-scrollable-element')!).backgroundColor,
        underlay: getComputedStyle(root.querySelector('.xterm-viewport')!).backgroundColor,
        foreground: getComputedStyle(rows).color,
      }
    })

    const light = await readColors()
    expect(light.viewport).toBe(light.surface)
    expect(light.underlay).toBe(light.surface)
    await terminal.screenshot({ path: `${shots}/theme-light.png`, animations: 'disabled' })
    await selectTerminalTheme(page, 'Dark')
    await expect.poll(async () => (await readColors()).viewport).not.toBe(light.viewport)
    const dark = await readColors()
    expect(dark.viewport).toBe(dark.surface)
    expect(dark.underlay).toBe(dark.surface)
    expect(dark.foreground).not.toBe(light.foreground)
    await terminal.screenshot({ path: `${shots}/theme-dark.png`, animations: 'disabled' })
    await selectTerminalTheme(page, 'Light')
    await expect.poll(readColors).toEqual(light)
    await selectTerminalTheme(page, 'System')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(readColors).toEqual(dark)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(readColors).toEqual(light)
    await expect.poll(() => screen.innerText()).toContain('THEME_CONTENT_RETAINED')
    await command(page, 'printf "THEME_STATE:%s\\n" "$DSH_THEME_PROBE"')
    await expect.poll(() => screen.innerText()).toContain('THEME_STATE:retained')
    expect(handles).toHaveLength(1)
    expect(alive(process)).toBe(true)
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/terminal-panel/theme.expected.md', import.meta.url)),
      JSON.stringify({ light, dark }, null, 2), webSnapshotMode())
    expect(tripwire.pageErrors).toEqual([])
  })

  it('completes commands, preserves the process through hiding and reload, resizes, and kills on tab close', async () => {
    onTestFailed(() => saveFailureShot(page, 'terminal-panel'))
    await openTerminal(page)
    const terminal = page.locator(BODY)
    await command(page, "PS1=''; printf '\\033cTERMINAL_READY\\n'")
    const screen = page.locator('.xterm-rows:visible')
    await expect.poll(async () => await screen.innerText()).toContain('TERMINAL_READY')
    const aria = await terminal.ariaSnapshot()
    await compareOrRefreshGolden(expected, aria, webSnapshotMode())
    await command(page, "printf 'DSH_PID:%s\\n' \"$$\"")
    await expect.poll(async () => await screen.innerText()).toMatch(/DSH_PID:\d+/u)
    const pid = Number((await screen.innerText()).match(/DSH_PID:(\d+)/u)?.[1])
    const firstProcess = processIdentity(0)
    expect(alive(firstProcess)).toBe(true)
    await command(page, 'dsh_terminal_completion_probe(){ printf "completed_from_shell\\n"; }')
    await page.keyboard.press('Control+l')
    await page.keyboard.insertText('dsh_terminal_completion_pro')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect.poll(async () => await screen.innerText()).toContain('completed_from_shell')
    await command(page, "printf 'PERSIST:%s\\n' \"$TERM\"")
    await expect.poll(async () => await screen.innerText()).toContain('PERSIST:xterm-256color')
    await tabs(page).filter({ hasText: 'bash' }).dblclick()
    await page.getByRole('textbox', { name: 'Terminal name', exact: true }).fill('Development')
    await page.getByRole('textbox', { name: 'Terminal name', exact: true }).press('Enter')
    await expect.poll(async () => await tabs(page).allInnerTexts()).toContain('Development')
    await openTerminal(page)
    await command(page, "printf 'SECOND_PID:%s\\n' \"$$\"")
    await expect.poll(async () => await screen.innerText()).toMatch(/SECOND_PID:\d+/u)
    const secondPid = Number((await screen.innerText()).match(/SECOND_PID:(\d+)/u)?.[1])
    // Shell PIDs belong to the sandbox namespace; process liveness uses Host identities.
    const secondProcess = processIdentity(1)
    expect(secondProcess.pid).not.toBe(firstProcess.pid)
    await tabs(page).filter({ hasText: 'Development' }).click()
    await expect.poll(async () => await screen.innerText()).toContain('PERSIST:xterm-256color')
    expect(alive(secondProcess)).toBe(true)
    await hidePanel(page)
    expect(alive(firstProcess)).toBe(true)
    await showPanel(page)
    const terminals = () => scaffold.ctx.terminalController.list(scaffold.ctx.agents.list()[0]!.id)
    const initialRows = terminals()[0]!.rows
    const handle = page.getByRole('separator', { name: 'Resize terminal panel', exact: true })
    await handle.focus()
    for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowUp')
    await expect.poll(() => terminals()[0]!.rows).toBeGreaterThan(initialRows)
    await command(page, "printf 'SIZE:'; stty size")
    await expect.poll(async () => await screen.innerText()).toContain(`SIZE:${terminals()[0]!.rows} ${terminals()[0]!.cols}`)
    await page.screenshot({ path: `${shots}/resized.png`, fullPage: true })
    const height = await page.locator(PANEL).evaluate(panel => panel.getBoundingClientRect().height)
    const tabIds = await tabs(page).evaluateAll(entries => entries.map(tab => tab.id))
    await page.reload({ waitUntil: 'load' })
    await tabs(page).filter({ hasText: 'Development' }).waitFor({ timeout: 15_000 })
    await expect.poll(async () => await tabs(page).allInnerTexts()).toEqual(['Development', 'bash'])
    expect(terminals()).toHaveLength(2)
    expect(alive(firstProcess)).toBe(true)
    expect(alive(secondProcess)).toBe(true)
    expect(await tabs(page).evaluateAll(entries => entries.map(tab => tab.id))).toEqual(tabIds)
    expect(await page.locator(PANEL).evaluate(panel => panel.getBoundingClientRect().height)).toBe(height)
    await expect.poll(async () => await screen.innerText()).toContain('PERSIST:xterm-256color')
    await hidePanel(page)
    await page.reload({ waitUntil: 'load' })
    await page.getByRole('button', { name: 'Toggle terminal panel', exact: true }).waitFor()
    expect(await page.locator(BODY).count()).toBe(0)
    expect(terminals()).toHaveLength(2)
    await showPanel(page)
    await expect.poll(async () => await screen.innerText()).toContain('PERSIST:xterm-256color')
    const secondTab = tabs(page).filter({ hasText: 'bash' })
    await secondTab.click()
    await expect.poll(async () => await screen.innerText()).toContain(`SECOND_PID:${secondPid}`)
    await closeTab(secondTab)
    await expect.poll(async () => await secondTab.count()).toBe(0)
    await expect.poll(() => alive(secondProcess), { timeout: 10_000 }).toBe(false)
    await expect.poll(async () => await screen.innerText()).toContain('PERSIST:xterm-256color')
    await command(page, "printf 'RECOVERED_PID:%s\\n' \"$$\"")
    await expect.poll(async () => await screen.innerText()).toContain(`RECOVERED_PID:${pid}`)
    await page.screenshot({ path: `${shots}/recovered.png`, fullPage: true })
    const previousMembers = new Set(inspector.snapshot().tree(firstProcess.pid).map(member => member.pid))
    await command(page, "sleep 120 & printf 'CHILD_PID:%s\\n' $!")
    await expect.poll(async () => await screen.innerText()).toMatch(/CHILD_PID:\d+/u)
    const descendants = inspector.snapshot().tree(firstProcess.pid).filter(member => member.pid !== firstProcess.pid)
    expect(descendants.some(member => !previousMembers.has(member.pid))).toBe(true)
    expect(descendants.every(alive)).toBe(true)
    await closeTab(tabs(page).filter({ hasText: 'Development' }))
    // Closing the last tab hides the panel.
    await page.locator(PANEL).waitFor({ state: 'detached' })
    await expect.poll(() => alive(firstProcess), { timeout: 10_000 }).toBe(false)
    await expect.poll(() => descendants.some(alive), { timeout: 10_000 }).toBe(false)
    await expect.poll(() => scaffold.ctx.terminalController.list(scaffold.ctx.agents.list()[0]!.id).length).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  })

  it('chooses a shell from the panel menu, opens it directly, and remembers it after reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'terminal-panel-shell-choice'))
    await openTerminal(page)
    expect(handles).toHaveLength(1)
    const panel = page.locator(PANEL)
    const selector = panel.getByRole('button', { name: 'Choose shell', exact: true })
    await page.emulateMedia({ colorScheme: 'dark' })
    await selector.click()
    await page.getByRole('menuitem', { name: 'bash', exact: true }).waitFor()
    // Discovery alone allocates no terminal.
    expect(handles).toHaveLength(1)
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/terminal-panel/shell-menu.expected.md', import.meta.url)),
      await page.getByRole('menu').ariaSnapshot(), webSnapshotMode())
    await page.screenshot({ path: `${shots}/shell-menu.png`, fullPage: true })
    await page.keyboard.press('Escape')
    expect(handles).toHaveLength(1)
    await selector.click()
    await page.getByRole('menuitem', { name: 'sh', exact: true }).click()
    expect(await page.evaluate(() => localStorage.getItem('dsh.terminal.shell'))).toBe('/bin/sh')
    await expect.poll(() => handles.length).toBe(2)
    await expect.poll(() => tabs(page).count()).toBe(2)
    await command(page, "printf 'CHOSEN_SHELL:%s\\n' \"$0\"")
    const screen = page.locator('.xterm-rows:visible')
    await expect.poll(() => screen.innerText()).toContain('CHOSEN_SHELL:/bin/sh')
    const retained = processIdentity(1)
    await page.reload({ waitUntil: 'load' })
    await page.locator('.xterm-helper-textarea:visible').waitFor()
    expect(alive(retained)).toBe(true)
    await selector.click()
    await page.getByRole('menuitem', { name: 'sh', exact: true }).waitFor()
    expect(await page.getByRole('menuitem', { name: 'sh', exact: true }).locator('svg').count()).toBe(1)
    await page.keyboard.press('Escape')
    // The fixture allows two terminals; close the first bash to make room.
    const terminals = () => scaffold.ctx.terminalController.list(scaffold.ctx.agents.list()[0]!.id)
    await closeTab(tabs(page).first())
    await expect.poll(() => terminals().length).toBe(1)
    await panel.locator(NEW).click()
    await expect.poll(() => handles.length).toBe(3)
    await expect.poll(() => terminals().map(info => info.shell.path)).toEqual(['/bin/sh', '/bin/sh'])
    expect(tripwire.pageErrors).toEqual([])
  })

  it('explains that exited terminals count toward the quota and permits creation after closing one', async () => {
    onTestFailed(() => saveFailureShot(page, 'terminal-panel-quota'))
    const terminals = () => scaffold.ctx.terminalController.list(scaffold.ctx.agents.list()[0]!.id)
    for (let count = 1; count <= 2; count++) {
      await openTerminal(page)
      await command(page, 'exit')
      await expect.poll(() => terminals().filter(info => info.state === 'exited').length).toBe(count)
    }
    await openTerminal(page, false)
    const alert = page.getByRole('alert')
    await expect.poll(async () => await alert.innerText()).toContain('Exited terminals also count toward the limit.')
    const expectedLimit = fileURLToPath(new URL('./expected/terminal-panel/limit.expected.md', import.meta.url))
    await compareOrRefreshGolden(expectedLimit, await alert.ariaSnapshot(), webSnapshotMode())
    await closeTab(tabs(page).and(page.locator('[aria-selected="true"]')))
    await closeTab(tabs(page).filter({ hasText: 'bash' }).first())
    await expect.poll(() => terminals().length).toBe(1)
    await openTerminal(page)
    await expect.poll(() => terminals().filter(info => info.state === 'running').length).toBe(1)
    expect(tripwire.pageErrors).toEqual([])
  })

  it('keeps new terminals independent when two same-origin windows mint the same tab id', async () => {
    onTestFailed(() => saveFailureShot(page, 'terminal-panel-shared-storage'))
    const second = await page.context().newPage()
    const secondErrors = watchConsole(second)
    await second.goto(page.url(), { waitUntil: 'load' })
    await second.getByText('Ready for terminal input.').waitFor()
    await openTerminal(page)
    const firstTab = await tabs(page).and(page.locator('[aria-selected="true"]')).getAttribute('id')
    const firstProcess = processIdentity(0)
    // Busy activity isolates layout recovery from unattended idle reclamation.
    vi.spyOn(handles[0]!, 'inspectActivity').mockResolvedValue({ state: 'busy', revision: 1 })
    await command(page, "printf 'WINDOW_A\\n'")
    await expect.poll(() => page.locator('.xterm-rows:visible').innerText()).toContain('WINDOW_A')
    await openTerminal(second)
    const secondTab = await tabs(second).and(second.locator('[aria-selected="true"]')).getAttribute('id')
    expect(secondTab).toBe(firstTab)
    expect(handles).toHaveLength(2)
    const secondProcess = processIdentity(1)
    expect(secondProcess.pid).not.toBe(firstProcess.pid)
    await command(second, "printf 'WINDOW_B\\n'")
    await expect.poll(() => second.locator('.xterm-rows:visible').innerText()).toContain('WINDOW_B')
    expect(await second.locator('.xterm-rows:visible').innerText()).not.toContain('WINDOW_A')
    expect(await page.locator('.xterm-rows:visible').innerText()).not.toContain('WINDOW_B')
    const bindings = () => page.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('dsh.terminal.binding.v1.')).map(key => localStorage.getItem(key)))
    const saved = await bindings()
    expect(saved).toHaveLength(2)
    await closeTab(tabs(second).and(second.locator('[aria-selected="true"]')))
    await expect.poll(() => alive(secondProcess)).toBe(false)
    expect(alive(firstProcess)).toBe(true)
    await expect.poll(() => bindings()).toHaveLength(1)
    expect(saved).toContain((await bindings())[0])
    await page.reload({ waitUntil: 'load' })
    await page.getByText('Ready for terminal input.').waitFor()
    // The second window saved an empty panel; disabled recovery does not recreate the first window's tab.
    expect(await page.locator(BODY).count()).toBe(0)
    expect(alive(firstProcess)).toBe(true)
    expect(handles).toHaveLength(2)
    expect(tripwire.pageErrors).toEqual([])
    expect(secondErrors.pageErrors).toEqual([])
  })

  it('holds a hidden panel across windows and reclaims only after the last transport disappears', async () => {
    onTestFailed(() => saveFailureShot(page, 'terminal-panel-window-holds'))
    const retains = vi.spyOn(scaffold.ctx.terminalController, 'retain')
    await openTerminal(page)
    const original = processIdentity(0)
    const sessionId = scaffold.ctx.agents.list()[0]!.id
    // Shell activity is exercised with real PTYs in the provider tests; this scenario isolates window ownership.
    vi.spyOn(handles[0]!, 'inspectActivity').mockResolvedValue({ state: 'idle', revision: 1 })
    await hidePanel(page)
    const second = await page.context().newPage()
    const transport = await controlTransport(second)
    await second.goto(page.url(), { waitUntil: 'load' })
    await second.getByRole('button', { name: 'Toggle terminal panel', exact: true }).waitFor()
    await expect.poll(() => retains.mock.calls.filter(call => !call[2].aborted).length).toBe(2)
    await page.close()
    page = second
    tripwire = watchConsole(page)
    await expect.poll(() => retains.mock.calls.filter(call => !call[2].aborted).length).toBe(1)
    const disconnectedAt = performance.now()
    await expect.poll(() => performance.now() - disconnectedAt, { timeout: 10_000 }).toBeGreaterThan(2500)
    expect(alive(original)).toBe(true)
    expect(await page.locator(BODY).count()).toBe(0)
    await page.context().setOffline(true)
    await transport.disconnect()
    await expect.poll(() => retains.mock.calls.every(call => call[2].aborted), { timeout: 15_000 }).toBe(true)
    await expect.poll(() => scaffold.ctx.terminalController.list(sessionId), { timeout: 15_000 }).toEqual([])
    expect(alive(original)).toBe(false)
    transport.reconnect()
    await page.context().setOffline(false)
    const environmentReady = Promise.withResolvers<undefined>()
    const environmentUrl = new URL('/api/terminal/environment', scaffold.baseUrl).href
    await page.route(environmentUrl, async (route) => {
      await environmentReady.promise
      await route.continue()
    })
    const terminal = page.locator(BODY)
    try {
      await page.reload({ waitUntil: 'load' })
      await showPanel(page)
      // The title starts discovery before the lazy body mounts; keep that request pending through mounting.
      await terminal.getByRole('status').getByText('Reading terminal environment…', { exact: true }).waitFor()
    } finally {
      environmentReady.resolve(undefined)
      await page.unrouteAll({ behavior: 'wait' })
    }
    let unavailableSnapshot = ''
    // Mounting can refresh a failed recovered view; readiness and comparison use the same DOM sample.
    await expect.poll(async () => {
      unavailableSnapshot = await terminal.ariaSnapshot()
      return unavailableSnapshot
    }).toContain('no longer exists')
    expect(handles).toHaveLength(1)
    const unavailable = fileURLToPath(new URL('./expected/terminal-panel/unavailable.expected.md', import.meta.url))
    await compareOrRefreshGolden(unavailable, unavailableSnapshot, webSnapshotMode())
    await terminal.screenshot({ path: `${shots}/unavailable.png`, animations: 'disabled' })
    const tabCount = await tabs(page).count()
    const create = terminal.getByRole('button', { name: 'New terminal', exact: true })
    await create.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => handles.length).toBe(2)
    await expect.poll(() => page.locator('.xterm-rows:visible').innerText()).toContain('bash-')
    expect(await tabs(page).count()).toBe(tabCount)
    expect(scaffold.ctx.terminalController.list(sessionId)).toHaveLength(1)
    expect(alive(processIdentity(1))).toBe(true)
    await command(page, "printf 'NEW_TERMINAL_READY\\n'")
    await expect.poll(() => page.locator('.xterm-rows:visible').innerText()).toContain('NEW_TERMINAL_READY')
    expect(tripwire.pageErrors).toEqual([])
  })

  it('offers reconnection after transport loss and resumes the same process without a new terminal', async () => {
    onTestFailed(() => saveFailureShot(page, 'terminal-panel-reconnect'))
    await openTerminal(page)
    const original = processIdentity(0)
    await command(page, "printf 'RECONNECT_READY\\n'")
    await expect.poll(() => page.locator('.xterm-rows:visible').innerText()).toContain('RECONNECT_READY')
    const transport = await controlTransport(page)
    await page.reload({ waitUntil: 'load' })
    await expect.poll(() => page.locator('.xterm-rows:visible').innerText()).toContain('RECONNECT_READY')
    await transport.disconnect()
    const reconnect = page.getByRole('button', { name: 'Reconnect', exact: true })
    await reconnect.waitFor()
    expect(await page.getByRole('alert').count()).toBe(0)
    expect(alive(original)).toBe(true)
    const disconnected = fileURLToPath(new URL('./expected/terminal-panel/disconnected.expected.md', import.meta.url))
    await compareOrRefreshGolden(disconnected, await page.locator(BODY).getByRole('status').ariaSnapshot(), webSnapshotMode())
    await page.screenshot({ path: `${shots}/disconnected.png`, fullPage: true })
    await reconnect.click()
    transport.reconnect()
    await page.locator(BODY).getByRole('status').waitFor({ state: 'hidden' })
    await command(page, "printf 'RECONNECTED_INPUT\\n'")
    await expect.poll(() => page.locator('.xterm-rows:visible').innerText()).toContain('RECONNECTED_INPUT')
    expect(handles).toHaveLength(1)
    expect(alive(original)).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  })

})

function contrastRatio(first: string, second: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = color.match(/[\d.]+/gu)!.map(Number).map(channel => channel / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  const a = luminance(first), b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
