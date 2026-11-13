import { describe, expect, it, vi } from 'vitest'
import type { AttachmentStore, ImageAttachmentRef, ImageRequestTarget, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ImageBlock } from '@deepseek-ai/dsh-llm'
import { imagePromptMessage } from '../src/images.ts'

const BUDGET = { maxPixels: 100, maxBytes: 1_000 }

function ref(id: string): ImageAttachmentRef {
  return { attachmentId: id, mediaType: 'image/png', bytes: 3, width: 20, height: 10 } as ImageAttachmentRef
}

function store(hostPath: string | undefined) {
  const readImageRequest = vi.fn(async (
    attachment: ImageAttachmentRef,
    _target: ImageRequestTarget,
  ): Promise<RequestImageAttachment> => ({
    variantId: 'variant' as RequestImageAttachment['variantId'],
    attachment, data: new Uint8Array([255]), mediaType: 'image/png', bytes: 1, width: 14, height: 7,
    depth: 'uchar', space: 'srgb', hasAlpha: false,
  }))
  const imageHostPath = (_ref: ImageAttachmentRef) => hostPath
  const attachments = { imageHostPath, readImageRequest } as Partial<AttachmentStore> as AttachmentStore
  return { attachments, readImageRequest }
}

describe('imagePromptMessage', () => {
  it('reads each attachment once under the pixel budget and sends every occurrence', async () => {
    const { attachments, readImageRequest } = store(undefined)
    const image: ImageBlock = { type: 'image', attachment: ref('a') }
    const message = await imagePromptMessage('[Image #1][Image #2]', [image, image], attachments, BUDGET)
    expect(readImageRequest).toHaveBeenCalledTimes(1)
    expect(readImageRequest.mock.calls[0]?.[1]).toEqual({ width: 14, height: 7, maxBytes: 1_000 })
    const content = message.message.content as { type: string }[]
    expect(content.map(block => block.type)).toEqual(['text', 'text', 'image', 'text', 'image'])
    expect(message).toMatchObject({ type: 'user', parent_tool_use_id: null })
  })

  it('sends offloaded occurrences as placeholder text only', async () => {
    const { attachments, readImageRequest } = store('/store/b.png')
    const message = await imagePromptMessage('[Image #1]', [{ type: 'image', attachment: ref('b'), offloaded: true }], attachments, BUDGET)
    expect(readImageRequest).not.toHaveBeenCalled()
    expect(message.message.content).toEqual([
      { type: 'text', text: '[Image #1]' },
      { type: 'text', text: expect.stringContaining('[Image #1] [image omitted to fit request image limits; b. Normalized copy') as string },
    ])
  })

  it('sends offloaded occurrences without the attachment service', async () => {
    const message = await imagePromptMessage('[Image #1]', [{ type: 'image', attachment: ref('c'), offloaded: true }], undefined, BUDGET)
    expect(message.message.content).toEqual([
      { type: 'text', text: '[Image #1]' },
      { type: 'text', text: expect.stringContaining('No local normalized image path is available') as string },
    ])
  })

  it('refuses a retained image without the attachment service', async () => {
    const failure = imagePromptMessage('[Image #1]', [{ type: 'image', attachment: ref('d') }], undefined, BUDGET)
    await expect(failure).rejects.toBeInstanceOf(LlmError)
    await expect(failure).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
  })
})
