import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { attachmentErrorText, imageSizeText } from '../src/client/image-labels.ts'
import { en, zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh)
const enT = makeTranslate(en, commonZh)

describe('attachment rejection copy', () => {
  const limits = {
    maxImageBytes: 5 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 100 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    maxImageDimension: 2000,
    mediaTypes: ['image/png'] as const,
  }

  it('renders megabytes without a trailing fraction unless one exists', () => {
    expect(imageSizeText(10 * 1024 * 1024)).toBe('10MB')
    expect(imageSizeText(2.5 * 1024 * 1024)).toBe('2.5MB')
  })

  it('maps user-solvable reasons to limit-naming copy', () => {
    expect(attachmentErrorText(t, 'MODEL_DOES_NOT_SUPPORT_IMAGES')).toBe('目前模型不支援圖片，請切換支援圖片的模型')
    expect(attachmentErrorText(t, 'IMAGE_TOO_MANY_PIXELS')).toBe('圖片解析度過大，請壓縮後重試')
    expect(attachmentErrorText(t, 'INVALID_IMAGE')).toBe('僅支援 PNG、JPG、WebP、GIF 格式的圖片')
    expect(attachmentErrorText(t, 'IMAGE_TYPE_MISMATCH')).toBe('僅支援 PNG、JPG、WebP、GIF 格式的圖片')
    expect(attachmentErrorText(t, 'TOO_MANY_IMAGES', limits)).toBe('一條訊息最多新增 20 張圖片')
    expect(attachmentErrorText(t, 'IMAGE_TOO_LARGE', limits)).toBe('單張圖片不能超過 5MB')
    expect(attachmentErrorText(t, 'IMAGES_TOO_LARGE', limits)).toBe('圖片總大小超過 100MB，請移除部分圖片')
    expect(attachmentErrorText(t, 'IMAGE_DIMENSION_TOO_LARGE', limits)).toBe('圖片寬高不能超過 2000px，請縮小後重試')
    expect(attachmentErrorText(enT, 'TOO_MANY_IMAGES', limits)).toBe('A message can include up to 20 images')
  })

  it('folds unknown reasons and limit reasons without projected limits into the send-failed line', () => {
    expect(attachmentErrorText(t, 'INVALID_IMAGE_BASE64')).toBe('圖片傳送失敗（INVALID_IMAGE_BASE64），請重新新增圖片後再試')
    expect(attachmentErrorText(t, 'TOO_MANY_IMAGES')).toBe('圖片傳送失敗（TOO_MANY_IMAGES），請重新新增圖片後再試')
    expect(attachmentErrorText(t, 'IMAGE_TOO_LARGE')).toBe('圖片傳送失敗（IMAGE_TOO_LARGE），請重新新增圖片後再試')
    expect(attachmentErrorText(t, 'IMAGES_TOO_LARGE')).toBe('圖片傳送失敗（IMAGES_TOO_LARGE），請重新新增圖片後再試')
    expect(attachmentErrorText(t, 'IMAGE_DIMENSION_TOO_LARGE')).toBe('圖片傳送失敗（IMAGE_DIMENSION_TOO_LARGE），請重新新增圖片後再試')
  })
})
