import { beforeEach, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ partition: vi.fn() }))
vi.mock('electron', () => ({ app: { isPackaged: true }, session: { fromPartition: native.partition } }))
const { DesktopBrowserGuests, SIDEBAR_BROWSER_PARTITION } = await import('../src/browser-guests.ts')

function makeSession() {
  return {
    setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(), on: vi.fn(), webRequest: { onBeforeRequest: vi.fn() },
    clearStorageData: vi.fn(async () => {}), clearAuthCache: vi.fn(async () => {}),
  }
}

let browserSession: ReturnType<typeof makeSession>
beforeEach(() => {
  vi.clearAllMocks()
  browserSession = makeSession()
  native.partition.mockReturnValue(browserSession)
})

it('reserves every guest in the one persistent partition, configured once, and never spoofs the user agent', () => {
  const guests = new DesktopBrowserGuests(() => undefined)
  const owner = {} as never
  const first = guests.acquire(owner)
  const second = guests.acquire(owner)
  expect(SIDEBAR_BROWSER_PARTITION.startsWith('persist:')).toBe(true)
  expect(first.partition).toBe(SIDEBAR_BROWSER_PARTITION)
  expect(second.partition).toBe(SIDEBAR_BROWSER_PARTITION)
  expect(first.lease).not.toBe(second.lease)
  expect(native.partition).toHaveBeenCalledExactlyOnceWith(SIDEBAR_BROWSER_PARTITION)
  expect(browserSession.setPermissionRequestHandler).toHaveBeenCalledOnce()
  expect('setUserAgent' in browserSession).toBe(false)
})

it('clears every cookie, storage entry, and HTTP auth cache of the shared partition', async () => {
  const guests = new DesktopBrowserGuests(() => undefined)
  await guests.clearSignIn()
  expect(browserSession.clearStorageData).toHaveBeenCalledOnce()
  expect(browserSession.clearAuthCache).toHaveBeenCalledOnce()
})
