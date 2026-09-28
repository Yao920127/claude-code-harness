import { describe, expect, it, vi } from 'vitest'
import { BROWSER_TOOL_ID, BROWSER_TOOL_INSTRUCTIONS, browserTool, browserToolServer, openBrowserTab } from '../src/browser-tool.ts'

describe('app browser tool', () => {
  it('opens an absolute http or https URL and reports the tab', () => {
    const open = vi.fn(() => 1)
    expect(openBrowserTab('http://localhost:8501', open)).toEqual({
      content: [{ type: 'text', text: 'Opened http://localhost:8501/ in a new browser tab in the app.' }],
    })
    expect(open).toHaveBeenCalledWith('http://localhost:8501/')
  })

  it('refuses addresses the app browser cannot open without opening anything', () => {
    const open = vi.fn(() => 1)
    expect(openBrowserTab('localhost:8501/x y', open)).toMatchObject({ isError: true })
    expect(openBrowserTab('not a url', open)).toMatchObject({
      isError: true, content: [{ text: '"not a url" is not an absolute URL. Pass a full http or https URL.' }],
    })
    expect(openBrowserTab('file:///etc/passwd', open)).toMatchObject({
      isError: true, content: [{ text: 'Only http and https URLs can be opened; got file:' }],
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('tells the model to hand over the URL when no app window is open', () => {
    expect(openBrowserTab('https://example.com', () => 0)).toMatchObject({
      isError: true, content: [{ text: 'No app window is open, so the page was not shown. Give the user the URL instead.' }],
    })
  })

  it('names the tool and instructs the model to avoid external browsers', () => {
    expect(BROWSER_TOOL_ID).toBe('mcp__app_browser__open_browser_tab')
    expect(BROWSER_TOOL_INSTRUCTIONS).toContain('Do not open an external browser')
    expect(browserToolServer(() => 1)).toMatchObject({ type: 'sdk', name: 'app_browser' })
  })

  it('handles a tool call through the SDK definition', async () => {
    const open = vi.fn(() => 1)
    const definition = browserTool(open)
    expect(definition).toMatchObject({ name: 'open_browser_tab' })
    await expect(definition.handler({ url: 'https://example.com/a' }, undefined)).resolves.toMatchObject({
      content: [{ text: 'Opened https://example.com/a in a new browser tab in the app.' }],
    })
    expect(open).toHaveBeenCalledWith('https://example.com/a')
  })
})
