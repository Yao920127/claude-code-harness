/**
 * Syntax highlighting for the editor, chosen by file name. Every language is a
 * static import of the editor's own lazy chunk: a lazily split language would
 * share CodeMirror's core with that chunk, and the client module loader serves
 * only self-contained chunks.
 */
import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { go } from '@codemirror/lang-go'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { csharp, kotlin, scala } from '@codemirror/legacy-modes/mode/clike'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { toml } from '@codemirror/legacy-modes/mode/toml'

/** Language support by lowercase file extension, created on first use. */
const BY_EXTENSION: Readonly<Record<string, () => Extension>> = {
  js: () => javascript(), mjs: () => javascript(), cjs: () => javascript(), jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }), mts: () => javascript({ typescript: true }), cts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  py: () => python(), pyi: () => python(),
  json: () => json(), jsonc: () => json(),
  md: () => markdown(), markdown: () => markdown(), mdx: () => markdown(),
  html: () => html(), htm: () => html(), vue: () => html(), svelte: () => html(),
  css: () => css(), scss: () => css(), less: () => css(),
  yaml: () => yaml(), yml: () => yaml(),
  sql: () => sql(),
  xml: () => xml(), svg: () => xml(), plist: () => xml(),
  rs: () => rust(), go: () => go(), java: () => java(),
  c: () => cpp(), h: () => cpp(), cc: () => cpp(), cpp: () => cpp(), cxx: () => cpp(), hpp: () => cpp(), m: () => cpp(), mm: () => cpp(),
  cs: () => StreamLanguage.define(csharp), kt: () => StreamLanguage.define(kotlin), kts: () => StreamLanguage.define(kotlin),
  scala: () => StreamLanguage.define(scala),
  lua: () => StreamLanguage.define(lua), rb: () => StreamLanguage.define(ruby), swift: () => StreamLanguage.define(swift),
  sh: () => StreamLanguage.define(shell), bash: () => StreamLanguage.define(shell), zsh: () => StreamLanguage.define(shell),
  toml: () => StreamLanguage.define(toml),
}

/** Language support by exact file name, for files named without a telling extension. */
const BY_NAME: Readonly<Record<string, () => Extension>> = {
  dockerfile: () => StreamLanguage.define(dockerFile),
  '.zshrc': () => StreamLanguage.define(shell), '.bashrc': () => StreamLanguage.define(shell), '.profile': () => StreamLanguage.define(shell),
}

/** Every file extension and exact file name the editor highlights. */
export const HIGHLIGHTED_FILES: readonly string[] = [
  ...Object.keys(BY_EXTENSION).map(extension => `file.${extension}`),
  ...Object.keys(BY_NAME),
]

/**
 * Select syntax highlighting for a file.
 * @param filename - the file's base name.
 * @returns the language support, or undefined for plain text.
 */
export function languageForFile(filename: string): Extension | undefined {
  const name = filename.toLowerCase()
  const byName = BY_NAME[name]
  if (byName !== undefined) return byName()
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? undefined : BY_EXTENSION[name.slice(dot + 1)]?.()
}
