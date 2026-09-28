/**
 * In-process MCP tool that lets Claude Code show a web page in the app's own
 * Browser instead of an external browser. The tool hands the address to the
 * Host's `sidebarBrowser` channel, which opens a new Browser tab in the
 * Session of the current turn.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/browser-tool
 */

import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

/** MCP server name the route registers for the browser tool. */
export const BROWSER_MCP_SERVER = 'app_browser'

/** Tool name inside {@link BROWSER_MCP_SERVER}. */
export const BROWSER_TOOL_NAME = 'open_browser_tab'

/** Fully qualified Claude Code tool name, used to allow the tool without a permission prompt. */
export const BROWSER_TOOL_ID = `mcp__${BROWSER_MCP_SERVER}__${BROWSER_TOOL_NAME}`

/** Server instructions Claude Code shows the model with the tool. */
export const BROWSER_TOOL_INSTRUCTIONS = 'The user works in an app that has its own browser. To show the user a web page, '
  + `including a local development server, call ${BROWSER_TOOL_NAME} with its http or https URL. `
  + 'Do not open an external browser, for example with the open, xdg-open, or start commands.'

/** Tool description Claude Code shows the model. */
export const BROWSER_TOOL_DESCRIPTION = 'Open an http or https URL in a new tab of the browser the user sees in the app.'

function result(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: 'text', text }], ...isError ? { isError: true } : {} }
}

/**
 * Handle one tool call: accept only an absolute HTTP(S) address, then open it.
 * @param url - address the model supplied.
 * @param open - opens the address in a new app Browser tab; returns how many app windows received it.
 * @returns the tool result the model reads.
 */
export function openBrowserTab(url: string, open: (url: string) => number): CallToolResult {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (_error: unknown) {
    // An unparsable address is a model input error reported back as the tool result.
    return result(`"${url}" is not an absolute URL. Pass a full http or https URL.`, true)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return result(`Only http and https URLs can be opened; got ${parsed.protocol}`, true)
  }
  if (open(parsed.href) === 0) {
    return result('No app window is open, so the page was not shown. Give the user the URL instead.', true)
  }
  return result(`Opened ${parsed.href} in a new browser tab in the app.`, false)
}

/** Input the browser tool accepts. */
const BROWSER_TOOL_INPUT = { url: z.string().describe('The http or https URL to open.') }

/**
 * Define the browser tool for one turn.
 * @param open - opens an address in a new app Browser tab of the turn's Session.
 * @returns the SDK tool definition, loaded with the turn rather than deferred behind tool search.
 */
export function browserTool(open: (url: string) => number): SdkMcpToolDefinition<typeof BROWSER_TOOL_INPUT> {
  return tool(
    BROWSER_TOOL_NAME,
    BROWSER_TOOL_DESCRIPTION,
    BROWSER_TOOL_INPUT,
    ({ url }) => Promise.resolve(openBrowserTab(url, open)),
    { alwaysLoad: true },
  )
}

/**
 * Build the MCP server carrying the browser tool for one turn.
 * @param open - opens an address in a new app Browser tab of the turn's Session.
 * @returns the in-process server configuration for the SDK `mcpServers` option.
 */
export function browserToolServer(open: (url: string) => number): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({ name: BROWSER_MCP_SERVER, instructions: BROWSER_TOOL_INSTRUCTIONS, tools: [browserTool(open)] })
}
