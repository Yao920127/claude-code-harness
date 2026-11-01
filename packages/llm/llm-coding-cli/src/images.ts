/**
 * Image files of one CLI turn.
 *
 * The CLIs attach images by file path, so each prompt image is copied from
 * the attachment store into a turn-owned temporary directory that is removed
 * when the turn ends.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/images
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { CliImage } from './clis.ts'

/** File extensions by the image media types the attachment store admits. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
}

/** Bytes of one image as the CLI receives them. */
export interface TurnImageData {
  readonly data: Uint8Array
  /** Media type of `data`, which a size-reduced version may change. */
  readonly mediaType: string
}

/** Image files written for one turn. */
export interface TurnImages {
  readonly images: readonly CliImage[]
  /** Remove the files; resolves after removal. */
  dispose(): Promise<void>
}

const NO_IMAGES: TurnImages = { images: [], dispose: () => Promise.resolve() }

/**
 * Write a turn's images to a new temporary directory.
 * @param refs - the prompt images.
 * @param read - reads one image's verified bytes.
 * @returns the written files and their disposer; no directory when the turn has no images.
 * @throws the read failure, after removing any files already written.
 */
export async function writeTurnImages(
  refs: readonly ImageAttachmentRef[],
  read: (ref: ImageAttachmentRef) => Promise<TurnImageData>,
): Promise<TurnImages> {
  if (refs.length === 0) return NO_IMAGES
  const directory = await mkdtemp(join(tmpdir(), 'dsh-coding-cli-'))
  const dispose = (): Promise<void> => rm(directory, { recursive: true, force: true })
  try {
    const images: CliImage[] = []
    for (const [index, ref] of refs.entries()) {
      const { data, mediaType } = await read(ref)
      const path = join(directory, `image-${index + 1}.${EXTENSIONS[mediaType] ?? 'img'}`)
      await writeFile(path, data, { mode: 0o600 })
      images.push({ path, mediaType, base64: Buffer.from(data).toString('base64') })
    }
    return { images, dispose }
  } catch (error: unknown) {
    await dispose()
    throw error
  }
}
