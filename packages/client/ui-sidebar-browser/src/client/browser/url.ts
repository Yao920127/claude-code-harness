/** Address parsing for the Sidebar browser's HTTP(S) allowlist. */

/** Maximum accepted address length; this bounds persisted navigation state. */
export const MAX_BROWSER_URL_LENGTH = 16 * 1024

/** A normalized Browser navigation target. */
export type BrowserTarget =
  | { readonly kind: 'https'; readonly url: string; readonly title: string }
  | { readonly kind: 'http'; readonly url: string; readonly title: string }

/** Why an address was refused before navigation; `search` means keywords arrived before a search address is known. */
export type BrowserAddressFailure = 'empty' | 'invalid' | 'protocol' | 'credentials' | 'application-origin' | 'search'

/** Token a search address template carries where the encoded query goes. */
export const SEARCH_QUERY_TOKEN = '%s'

/** Result of parsing an address-bar value. */
export type BrowserAddressResult =
  | { readonly ok: true; readonly target: BrowserTarget }
  | { readonly ok: false; readonly reason: BrowserAddressFailure }

/**
 * Parse one address-bar value into the fixed protocol allowlist.
 * @param input - user or typed-open input.
 * @param applicationOrigin - current DSH document origin, blocked for HTTPS.
 * @returns a canonical target or the refusal reason.
 */
export function parseBrowserAddress(input: string, applicationOrigin?: string): BrowserAddressResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  if (trimmed.length > MAX_BROWSER_URL_LENGTH) return { ok: false, reason: 'invalid' }
  const candidate = hasExplicitScheme(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try { url = new URL(candidate) } catch { return { ok: false, reason: 'invalid' } }
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'credentials' }
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    if (applicationOrigin !== undefined && applicationOrigin !== 'null') {
      try {
        if (url.origin === new URL(applicationOrigin).origin) return { ok: false, reason: 'application-origin' }
      } catch {
        // An unavailable application origin cannot grant access to a target.
      }
    }
    return { ok: true, target: { kind: url.protocol === 'https:' ? 'https' : 'http', url: url.href, title: url.hostname } }
  }
  return { ok: false, reason: 'protocol' }
}

/**
 * Resolve address-bar input: keywords become a search through the configured
 * search address, and anything address-like is parsed as an address.
 * Input is keywords when it has no scheme and either contains whitespace or
 * names a host with no dot, port, or bracketed IPv6 literal other than
 * `localhost`, so `youtube` searches while `youtube.com` and `localhost:3000`
 * navigate.
 * @param input - address-bar or typed-open input.
 * @param applicationOrigin - current DSH document origin, blocked for HTTPS.
 * @param searchUrl - search address template containing {@link SEARCH_QUERY_TOKEN}; undefined while unknown.
 * @returns the address or search target, or the refusal reason.
 */
export function resolveBrowserInput(
  input: string, applicationOrigin: string | undefined, searchUrl: string | undefined,
): BrowserAddressResult {
  const trimmed = input.trim()
  if (!isSearchQuery(trimmed)) return parseBrowserAddress(trimmed, applicationOrigin)
  if (searchUrl === undefined) return { ok: false, reason: 'search' }
  const parsed = parseBrowserAddress(searchUrl.replace(SEARCH_QUERY_TOKEN, encodeURIComponent(trimmed)), applicationOrigin)
  return parsed.ok ? { ok: true, target: { ...parsed.target, title: trimmed } } : parsed
}

function hasExplicitScheme(value: string): boolean {
  return /^[A-Za-z][A-Za-z\d+.-]*:(?!\d+(?:[/?#]|$))/u.test(value)
}

function isSearchQuery(value: string): boolean {
  if (value === '' || hasExplicitScheme(value)) return false
  if (/\s/u.test(value)) return true
  const [authority = ''] = value.split(/[/?#]/u, 1)
  if (authority.startsWith('[') || /:\d+$/u.test(authority)) return false
  return authority !== 'localhost' && !authority.includes('.')
}
