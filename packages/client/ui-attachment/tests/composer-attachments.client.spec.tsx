// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type {
  ComposerAttachment, ComposerAttachmentsOwnerProps, ComposerAttachmentsProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ComposerAttachments } from '../src/client/ComposerAttachments.tsx'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = ((key: string, params?: Readonly<Record<string, unknown>>): string => {
  const messages: Record<string, string> = {
    'attachment.pending': '待傳送附件',
    'attachment.scrollLeft': '向左滾動附件',
    'attachment.scrollRight': '向右滾動附件',
    'file.pending': '待傳送檔案',
    'file.uploading': '上傳中…',
    'file.uploadFailed': '上傳失敗，點選重試',
    'file.label': '檔案',
    'image.pending': '待傳送圖片',
    'image.original': '原圖',
    'image.preview': '原圖預覽',
    'image.closePreview': '關閉原圖預覽',
    'image.openOriginal': '檢視原圖',
    'attachment.dropBlocked': '目前無法新增檔案或圖片',
    'attachment.dropTitle': '檔案或圖片拖曳到此處即可新增',
  }
  if (key === 'file.remove') {
    const name = params?.name
    return `移除檔案 ${typeof name === 'string' ? name : ''}`
  }
  if (key === 'file.retry') {
    const name = params?.name
    return `重試上傳 ${typeof name === 'string' ? name : ''}`
  }
  if (key === 'image.remove') {
    const name = params?.name
    return `移除圖片 ${typeof name === 'string' ? name : ''}`
  }
  if (key === 'attachment.dropDesc') {
    const count = params?.count
    const size = params?.size
    return `圖片限制：最多 ${typeof count === 'number' ? String(count) : ''} 張，每張 ${typeof size === 'string' ? size : ''}`
  }
  return messages[key] ?? key
}) as ComposerAttachmentsProps['t']

function attachment(id: string, name = `${id}.png`): ComposerAttachment {
  return {
    kind: 'image',
    id: id as ComposerAttachment['id'],
    file: new File([Uint8Array.of(1)], name, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
  }
}

function fileDraft(id: string, name = `${id}.pdf`): ComposerAttachment {
  return {
    kind: 'file',
    id: id as ComposerAttachment['id'],
    file: new File([Uint8Array.of(1, 2, 3)], name, { type: 'application/pdf' }),
  }
}

function props(overrides: Partial<ComposerAttachmentsOwnerProps> = {}): ComposerAttachmentsProps {
  return {
    attachments: [],
    canAcceptDrop: true,
    onAddFiles: () => {},
    onRemoveAttachment: () => {},
    uploads: {},
    onRetryFile: () => {},
    t,
    ...overrides,
  } as unknown as ComposerAttachmentsProps
}

describe('ComposerAttachments', () => {
  it('accepts file drops anywhere on the document and keeps non-file drags native', () => {
    const onAddFiles = vi.fn()
    const view = render(<ComposerAttachments {...props({
      onAddFiles,
      dropLimits: { count: 20, size: '5MB' },
    })} />)

    expect(fireEvent.dragEnter(document.body, { dataTransfer: null })).toBe(true)
    const textTransfer = { types: ['text/plain'], files: [], dropEffect: 'none' }
    expect(fireEvent.dragEnter(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(fireEvent.dragOver(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(fireEvent.drop(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(view.queryByRole('status')).toBeNull()

    const image = attachment('dropped').file
    const dataTransfer = { types: ['Files'], files: [image], items: [], dropEffect: 'none' }
    expect(fireEvent.dragEnter(document.body, { dataTransfer })).toBe(false)
    expect(view.getByRole('status').textContent).toContain('檔案或圖片拖曳到此處即可新增')
    expect(view.getByRole('status').textContent).toContain('圖片限制：最多 20 張，每張 5MB')
    expect(fireEvent.dragOver(document.body, { dataTransfer })).toBe(false)
    expect(dataTransfer.dropEffect).toBe('copy')
    expect(fireEvent.drop(document.body, { dataTransfer })).toBe(false)
    expect(onAddFiles).toHaveBeenCalledWith([image], new Set())
    expect(view.queryByRole('status')).toBeNull()
  })

  it('reports dropped directories from the entry API beside the dropped files', () => {
    const onAddFiles = vi.fn()
    render(<ComposerAttachments {...props({ onAddFiles })} />)
    const folder = new File([], 'project')
    const note = new File([Uint8Array.of(1)], 'notes.md', { type: 'text/markdown' })
    const entry = (isDirectory: boolean | null, file: File) => ({
      kind: 'file', getAsFile: () => new File([], file.name), webkitGetAsEntry: () => (isDirectory === null ? null : { isDirectory }),
    })
    fireEvent.drop(document.body, {
      dataTransfer: {
        types: ['Files'],
        files: [folder, note],
        items: [entry(true, folder), entry(false, note), { kind: 'string', getAsFile: () => null }],
        dropEffect: 'none',
      },
    })
    expect(onAddFiles).toHaveBeenCalledWith([folder, note], new Set([folder]))
    // An entry API that answers nothing, or a browser without it, reports no directories.
    fireEvent.drop(document.body, {
      dataTransfer: {
        types: ['Files'],
        files: [note],
        items: [entry(null, note), { kind: 'file', getAsFile: () => note }, entry(true, folder)],
        dropEffect: 'none',
      },
    })
    expect(onAddFiles).toHaveBeenLastCalledWith([note], new Set())
  })

  it('tracks nested file drags and clears an aborted drag', () => {
    const view = render(<ComposerAttachments {...props()} />)
    const dataTransfer = { types: ['Files'], files: [], items: [], dropEffect: 'none' }
    fireEvent.dragLeave(document.body, {
      dataTransfer: { types: ['text/plain'], files: [], dropEffect: 'none' },
    })
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 })
    expect(view.getByRole('status')).toBeTruthy()
    fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 })
    expect(view.queryByRole('status')).toBeNull()
    fireEvent.dragEnter(document.documentElement, { dataTransfer })
    const leftViewport = new Event('dragleave', { bubbles: true, cancelable: true })
    Object.defineProperties(leftViewport, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: -1 },
      clientY: { value: 5 },
    })
    fireEvent(document.documentElement, leftViewport)
    expect(view.queryByRole('status')).toBeNull()
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragEnd(window, { dataTransfer })
    expect(view.queryByRole('status')).toBeNull()
  })

  it('shows a blocked drop without forwarding its files', () => {
    const onAddFiles = vi.fn()
    const view = render(<ComposerAttachments {...props({ canAcceptDrop: false, onAddFiles })} />)
    const image = attachment('blocked').file
    const dataTransfer = { types: ['Files'], files: [image], items: [], dropEffect: 'copy' }
    fireEvent.dragEnter(document.body, { dataTransfer })
    expect(view.getByRole('status').textContent).toBe('目前無法新增檔案或圖片')
    fireEvent.dragOver(document.body, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('none')
    fireEvent.drop(document.body, { dataTransfer })
    expect(onAddFiles).not.toHaveBeenCalled()
    expect(view.queryByRole('status')).toBeNull()
  })

  it('routes rail removal and closes previews on Escape or attachment removal', () => {
    const onRemoveAttachment = vi.fn()
    const image = attachment('draft-1', 'pixel.png')
    const initial = props({ attachments: [image], onRemoveAttachment })
    const view = render(<ComposerAttachments {...initial} />)

    fireEvent.click(view.getByRole('button', { name: '移除圖片 pixel.png' }))
    expect(onRemoveAttachment).toHaveBeenCalledWith(image.id)
    fireEvent.click(view.getByTitle('檢視原圖'))
    expect(view.getByRole('dialog', { name: '原圖預覽' })).toBeTruthy()
    view.rerender(<ComposerAttachments {...props({ attachments: [], onRemoveAttachment })} />)
    expect(view.queryByRole('dialog', { name: '原圖預覽' })).toBeNull()

    view.rerender(<ComposerAttachments {...initial} />)
    fireEvent.click(view.getByTitle('檢視原圖'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(view.queryByRole('dialog', { name: '原圖預覽' })).toBeNull()
  })

  it('keeps images and files in pick order inside one attachment rail', () => {
    const view = render(<ComposerAttachments {...props({
      attachments: [attachment('first'), fileDraft('middle'), attachment('last')],
      uploads: {
        middle: {
          status: 'ready', receiptId: 'receipt-middle' as never,
          file: { attachmentId: 'file-middle' as never, name: 'middle.pdf', bytes: 3 },
        },
      },
    })} />)
    const rail = view.getByRole('group', { name: '待傳送附件' })
    expect([...rail.children].map((child) => {
      const image = child.querySelector('img')
      return image?.getAttribute('alt') ?? child.querySelector('[title]')?.getAttribute('title')
    })).toEqual(['first.png', 'middle.pdf', 'last.png'])
    expect(view.queryByRole('group', { name: '待傳送檔案' })).toBeNull()
  })

  it('labels an unnamed attachment and its original-image preview', () => {
    const image = attachment('unnamed', '')
    const view = render(<ComposerAttachments {...props({ attachments: [image] })} />)
    expect(view.getByAltText('待傳送圖片')).toBeTruthy()
    fireEvent.click(view.getByTitle('檢視原圖'))
    expect(view.getByAltText('原圖')).toBeTruthy()
  })
})

describe('ComposerAttachments file drafts', () => {
  it('renders uploading, ready, and failed cards with remove and retry affordances', () => {
    const onRemoveAttachment = vi.fn()
    const onRetryFile = vi.fn()
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('up'), fileDraft('ok'), fileDraft('bad')],
      uploads: {
        up: { status: 'uploading', loaded: 1, total: 4 },
        ok: {
          status: 'ready', receiptId: 'receipt-ok' as never,
          file: { attachmentId: 'file-ok' as never, name: 'ok.pdf', bytes: 3 },
        },
        bad: { status: 'error', message: 'boom' },
      },
      onRemoveAttachment,
      onRetryFile,
    })} />)
    const group = view.getByRole('group', { name: '待傳送附件' })
    expect(group.textContent).toContain('上傳中…')
    expect(view.container.querySelector('[style="width: 25%;"]')).toBeTruthy()
    expect(group.textContent).toContain('ok.pdf')
    expect(group.textContent).toContain('PDF 3B')
    expect(group.textContent).toContain('上傳失敗，點選重試')
    fireEvent.click(view.getByRole('button', { name: '重試上傳 bad.pdf' }))
    expect(onRetryFile).toHaveBeenCalledWith('bad')
    fireEvent.click(view.getByRole('button', { name: '移除檔案 ok.pdf' }))
    expect(onRemoveAttachment).toHaveBeenCalledWith('ok')
  })

  it('treats a draft without upload state as uploading and keeps retry separate from remove', () => {
    const onRetryFile = vi.fn()
    const onRemoveAttachment = vi.fn()
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('pending'), fileDraft('bad')],
      uploads: { bad: { status: 'error', message: 'boom' } },
      onRetryFile,
      onRemoveAttachment,
    })} />)
    expect(view.getByRole('group', { name: '待傳送附件' }).textContent).toContain('上傳中…')
    const retry = view.getByRole('button', { name: '重試上傳 bad.pdf' })
    const remove = view.getByRole('button', { name: '移除檔案 bad.pdf' })
    expect(retry.contains(remove)).toBe(false)
    fireEvent.click(remove)
    expect(onRemoveAttachment).toHaveBeenCalledWith('bad')
    expect(onRetryFile).not.toHaveBeenCalled()
    fireEvent.click(retry)
    expect(onRetryFile).toHaveBeenCalledWith('bad')
  })

  it('uses the localized file label when the browser supplies no name', () => {
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('unnamed', '')],
      uploads: {
        unnamed: {
          status: 'ready', receiptId: 'receipt-unnamed' as never,
          file: { attachmentId: 'file-unnamed' as never, name: 'file', bytes: 3 },
        },
      },
    })} />)
    const group = view.getByRole('group', { name: '待傳送附件' })
    expect(group.textContent).toContain('檔案')
    expect(group.textContent).toContain('3B')
  })

  it('uses the shared leading-dot suffix in ready-file metadata', () => {
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('env', '.env')],
      uploads: {
        env: {
          status: 'ready', receiptId: 'receipt-env' as never,
          file: { attachmentId: 'file-env' as never, name: '.env', bytes: 3 },
        },
      },
    })} />)
    expect(view.getByTitle('.env').textContent).toContain('ENV 3B')
  })
})
