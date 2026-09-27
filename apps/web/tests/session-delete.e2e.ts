// Web e2e: permanently deleting a Session from the sidebar menu through the
// shipped Web composition. The confirmation dialog deletes the stored log,
// the row leaves the sidebar, and the Host's session store no longer knows the
// Session. Keyless: the model is a replay override that answers one prompt.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import { launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'

const MODE = webSnapshotMode()
const PROMPT = 'SESSION_DELETE say hello'
const ANSWER = 'SESSION_DELETE_ANSWER'

function script(): ReplayEntry[] {
  const chunks: StreamChunk[] = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: ANSWER },
    { type: 'block-end', index: 0, block: { type: 'text', text: ANSWER } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  return [{ kind: 'chunks', chunks }]
}

describe.skipIf(MODE === 'record')('web e2e: deleting a Session permanently', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let replayDir: string
  let tripwire: ReturnType<typeof watchConsole>

  /** The one Session row of the fresh workspace group (the group row carries no actions). */
  function sessionRow(): Locator {
    return page.locator('[role="treeitem"]').filter({ has: page.locator('button[aria-label^="Session actions for "]') })
  }

  beforeAll(async () => {
    replayDir = await mkdtemp(join(tmpdir(), 'dsh-session-delete-'))
    const replayOverride = join(replayDir, 'replay.override.json')
    await writeFile(replayOverride, JSON.stringify(script()))
    scaffold = await launchWebScaffold({ replayFixture: join(replayDir, 'override-only.jsonl'), replayOverride })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (replayDir !== undefined) {
      await rm(replayDir, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'session-delete e2e cleanup failed')
  })

  it('removes the row and the stored log after confirmation', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-delete'))
    const input = page.locator('[data-composer-input]').first()
    await input.waitFor({ timeout: 10_000 })
    const settled = scaffold.whenTurnSettled(30_000)
    await writeComposerDraft(page, input, PROMPT)
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText(ANSWER, { exact: false }).last().waitFor({ timeout: 15_000 })
    const sessionId = await settled
    expect(await scaffold.ctx.sessionPersistence.stat(sessionId)).toBeDefined()

    const row = sessionRow()
    const actions = row.getByRole('button', { name: 'Session actions for ' })
    await expect.poll(async () => {
      await row.hover()
      return await actions.isVisible()
    }, { timeout: 10_000 }).toBe(true)
    await actions.click()
    await page.getByRole('menuitem', { name: 'Delete session' }).click()
    const dialog = page.getByRole('dialog', { name: 'Permanently delete this session?' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Delete permanently', exact: true }).click()

    // The modal hides the tree from the accessibility tree, so the row is
    // checked only after the dialog closes.
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 10_000 }).toBe(0)
    await expect.poll(() => sessionRow().count(), { timeout: 10_000 }).toBe(0)
    await expect.poll(() => scaffold.ctx.sessionPersistence.stat(sessionId), { timeout: 10_000 }).toBeUndefined()
    expect(scaffold.ctx.agents.get(sessionId)).toBeUndefined()
  }, 60_000)

  it('kept the console clean', () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
