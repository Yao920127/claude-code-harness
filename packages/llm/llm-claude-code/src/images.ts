/**
 * Image input for Claude Code turns.
 *
 * A turn whose prompt marks images is sent as one native user message whose
 * content is the prompt text followed, for each `[Image #k]` marker, by a
 * handle line and the request version of the image as a base64 block.
 * Offloaded occurrences send only their placeholder text. Claude Code runs on
 * the host, so each handle names the attachment's host path, which Claude
 * Code's own tools can read.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/images
 */

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AttachmentId, AttachmentStore, ImageAttachmentRef, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import { LlmError, offloadedImageText, requestImageHandleText, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentAccess, ImageBlock } from '@deepseek-ai/dsh-llm'

/** Per-image budgets from which each request version is derived. */
export interface ClaudeCodeImageBudget {
  /** Total-pixel budget; larger sources are downscaled proportionally. */
  readonly maxPixels: number
  /** Encoded-byte target for one request image. */
  readonly maxBytes: number
}

type UserContent = Exclude<SDKUserMessage['message']['content'], string>

/**
 * Host-path access for one attachment; Claude Code reads host paths directly.
 * @param attachments - provider owning the normalized bytes.
 * @param ref - durable attachment reference.
 * @returns the read-only host path, when the provider exposes one.
 */
function hostAccess(attachments: AttachmentStore, ref: ImageAttachmentRef): ImageAttachmentAccess | undefined {
  return resolveImageAttachmentAccess(attachments, hostPath => hostPath, ref)
}

/**
 * Read the request version of every retained occurrence, once per attachment.
 * @param images - occurrences in marker order.
 * @param attachments - provider owning the normalized bytes.
 * @param budget - per-image budgets.
 * @param signal - cancels the reads.
 * @returns request versions keyed by attachment id.
 */
async function requestVersions(
  images: readonly ImageBlock[],
  attachments: AttachmentStore,
  budget: ClaudeCodeImageBudget,
  signal: AbortSignal | undefined,
): Promise<ReadonlyMap<AttachmentId, RequestImageAttachment>> {
  const refs = new Map<AttachmentId, ImageAttachmentRef>()
  for (const image of images) {
    if (image.offloaded !== true) refs.set(image.attachment.attachmentId, image.attachment)
  }
  const entries = await Promise.all([...refs].map(async ([id, ref]) => {
    const target = { ...requestImageDimensions(ref.width, ref.height, budget.maxPixels), maxBytes: budget.maxBytes }
    return [id, await attachments.readImageRequest(ref, target, signal)] as const
  }))
  return new Map(entries)
}

/**
 * Build the native user message for a prompt that marks images.
 * @param prompt - prompt text holding `[Image #k]` markers.
 * @param images - occurrences in marker order.
 * @param attachments - provider owning the normalized bytes; undefined refuses retained images.
 * @param budget - per-image budgets.
 * @param signal - cancels the attachment reads.
 * @returns one user message carrying the text, a handle per image, and each retained image.
 * @throws {LlmError} code `UNSUPPORTED_CONTENT` when a retained image needs the absent attachment service.
 */
export async function imagePromptMessage(
  prompt: string,
  images: readonly ImageBlock[],
  attachments: AttachmentStore | undefined,
  budget: ClaudeCodeImageBudget,
  signal?: AbortSignal,
): Promise<SDKUserMessage> {
  const retained = images.some(image => image.offloaded !== true)
  if (retained && attachments === undefined) {
    throw new LlmError('llm-claude-code: image input requires the durable attachment service', 'UNSUPPORTED_CONTENT')
  }
  const versions = attachments === undefined
    ? new Map<AttachmentId, RequestImageAttachment>()
    : await requestVersions(images, attachments, budget, signal)
  const content: UserContent = [{ type: 'text', text: prompt }]
  for (const [index, image] of images.entries()) {
    const marker = `[Image #${index + 1}]`
    const access = attachments === undefined ? undefined : hostAccess(attachments, image.attachment)
    const version = versions.get(image.attachment.attachmentId)
    if (version === undefined) {
      content.push({ type: 'text', text: `${marker} ${offloadedImageText(image.attachment, access)}` })
      continue
    }
    content.push({ type: 'text', text: `${marker} ${requestImageHandleText(image.attachment, version, access)}` })
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: version.mediaType, data: Buffer.from(version.data).toString('base64') },
    })
  }
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }
}
