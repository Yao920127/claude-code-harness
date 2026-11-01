// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DropOverlay } from '../src/DropOverlay.tsx'

afterEach(cleanup)

describe('DropOverlay', () => {
  it('portals the invitation with its title and limits desc to the body', () => {
    const view = render(
      <DropOverlay disabled={false} labels={{ title: '圖片拖曳到此處即可新增', desc: '最多 20 張，每張 5MB' }} />,
    )
    const overlay = view.getByRole('status')
    expect(overlay.parentElement).toBe(document.body)
    expect(overlay.textContent).toContain('圖片拖曳到此處即可新增')
    expect(overlay.textContent).toContain('最多 20 張，每張 5MB')
  })

  it('omits the desc line when none is resolved', () => {
    const view = render(<DropOverlay disabled={false} labels={{ title: '圖片拖曳到此處即可新增' }} />)
    expect(view.getByRole('status').textContent).toBe('圖片拖曳到此處即可新增')
  })

  it('drops the desc and switches the illustration while disabled', () => {
    const enabled = render(
      <DropOverlay disabled={false} labels={{ title: '拖入', desc: '限制' }} />,
    )
    const enabledSvg = enabled.getByRole('status').querySelector('svg')!.innerHTML
    enabled.unmount()
    const disabled = render(
      <DropOverlay disabled labels={{ title: '目前無法新增圖片', desc: '限制' }} />,
    )
    const overlay = disabled.getByRole('status')
    expect(overlay.textContent).toBe('目前無法新增圖片')
    expect(overlay.querySelector('svg')!.innerHTML).not.toBe(enabledSvg)
  })
})
