import { describe, expect, it } from 'vitest'
import { parseBrowserAddress, resolveBrowserInput } from '../src/client/browser/url.ts'

const APP = 'https://dsh.example'

describe('Browser address policy', () => {
  it('normalizes host names and HTTPS addresses', () => {
    expect(parseBrowserAddress('example.com/path', APP)).toEqual({
      ok: true, target: { kind: 'https', url: 'https://example.com/path', title: 'example.com' },
    })
    expect(parseBrowserAddress('https://docs.example/a?q=1#x', APP)).toEqual({
      ok: true, target: { kind: 'https', url: 'https://docs.example/a?q=1#x', title: 'docs.example' },
    })
    expect(parseBrowserAddress('example.com:8443/path', APP)).toEqual({
      ok: true, target: { kind: 'https', url: 'https://example.com:8443/path', title: 'example.com' },
    })
  })

  it('accepts HTTP including loopback hosts', () => {
    expect(parseBrowserAddress('http://localhost:5173/app', APP)).toEqual({
      ok: true, target: { kind: 'http', url: 'http://localhost:5173/app', title: 'localhost' },
    })
    expect(parseBrowserAddress('http://127.42.0.9/', APP)).toMatchObject({ ok: true, target: { kind: 'http' } })
    expect(parseBrowserAddress('http://[::1]:8080/', APP)).toMatchObject({ ok: true, target: { kind: 'http' } })
    expect(parseBrowserAddress('http://example.com/', APP)).toEqual({
      ok: true, target: { kind: 'http', url: 'http://example.com/', title: 'example.com' },
    })
    expect(parseBrowserAddress('http://128.0.0.1/', APP)).toMatchObject({ ok: true, target: { kind: 'http' } })
    expect(parseBrowserAddress('http:/example.com/path', APP)).toEqual({
      ok: true, target: { kind: 'http', url: 'http://example.com/path', title: 'example.com' },
    })
    expect(parseBrowserAddress('https:/example.com/path', APP)).toEqual({
      ok: true, target: { kind: 'https', url: 'https://example.com/path', title: 'example.com' },
    })
  })

  it('rejects every undeclared or privileged form', () => {
    expect(parseBrowserAddress('', APP)).toEqual({ ok: false, reason: 'empty' })
    expect(parseBrowserAddress('javascript:alert(1)', APP)).toEqual({ ok: false, reason: 'protocol' })
    expect(parseBrowserAddress('https://user:secret@example.com', APP)).toEqual({ ok: false, reason: 'credentials' })
    expect(parseBrowserAddress(`${APP}/session`, APP)).toEqual({ ok: false, reason: 'application-origin' })
    expect(parseBrowserAddress(`https://${'a'.repeat(17_000)}.example`, APP)).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBrowserAddress('file:///work/index.html', APP)).toEqual({ ok: false, reason: 'protocol' })
    expect(parseBrowserAddress('file:////server/share/index.html', APP)).toEqual({ ok: false, reason: 'protocol' })
    expect(parseBrowserAddress('file:/work/index.html', APP)).toEqual({ ok: false, reason: 'protocol' })
    expect(parseBrowserAddress('ftp:/example.com/file', APP)).toEqual({ ok: false, reason: 'protocol' })
    expect(parseBrowserAddress(':::', APP)).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBrowserAddress('https://example.test', 'not an origin')).toMatchObject({ ok: true })
    expect(parseBrowserAddress('https://example.test')).toMatchObject({ ok: true })
    expect(parseBrowserAddress('https://example.test', 'null')).toMatchObject({ ok: true })
  })

  it('turns keywords into a search and keeps address-like input an address', () => {
    const search = 'https://www.google.com/search?q=%s'
    expect(resolveBrowserInput(' youtube ', APP, search)).toEqual({
      ok: true, target: { kind: 'https', url: 'https://www.google.com/search?q=youtube', title: 'youtube' },
    })
    expect(resolveBrowserInput('天氣 台北', APP, search)).toMatchObject({
      ok: true, target: { url: `https://www.google.com/search?q=${encodeURIComponent('天氣 台北')}`, title: '天氣 台北' },
    })
    expect(resolveBrowserInput('c++ & rust', APP, search)).toMatchObject({
      ok: true, target: { url: 'https://www.google.com/search?q=c%2B%2B%20%26%20rust' },
    })
    expect(resolveBrowserInput('youtube/watch', APP, search)).toMatchObject({ ok: true, target: { title: 'youtube/watch' } })
    for (const address of ['youtube.com', 'localhost', 'localhost:3000/app', 'intranet:8080', '[::1]:8080', '192.168.0.1', 'https://a.test']) {
      expect(resolveBrowserInput(address, APP, search)).toEqual(parseBrowserAddress(address, APP))
    }
    expect(resolveBrowserInput('', APP, search)).toEqual({ ok: false, reason: 'empty' })
    expect(resolveBrowserInput('youtube', APP, undefined)).toEqual({ ok: false, reason: 'search' })
    expect(resolveBrowserInput('youtube', APP, `${APP}/search?q=%s`)).toEqual({ ok: false, reason: 'application-origin' })
  })
})
