/** Parsers for the machine-readable output of `git` and `gh`. */
import type { GitChangeKind, GitFileChange, GithubLoginPrompt } from './types.ts'

/** Branch facts from `git status --branch` headers. */
export interface GitBranchStatus {
  readonly branch: string | null
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
}

const KINDS: Readonly<Record<string, GitChangeKind>> = {
  M: 'modified', T: 'type-changed', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'conflicted',
}

/**
 * Map one porcelain status letter.
 * @param letter - `X` or `Y` of an `XY` pair.
 * @returns the change kind, or undefined for `.` (unchanged).
 */
function kind(letter: string | undefined): GitChangeKind | undefined {
  return KINDS[`${letter}`]
}

/**
 * Parse `git status --porcelain=v2 --branch -z`.
 * @param output - NUL-separated records.
 * @returns branch facts and changed paths in Git's order.
 */
export function parseStatus(output: string): GitBranchStatus & { readonly changes: readonly GitFileChange[] } {
  const records = output.split('\0')
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const changes: GitFileChange[] = []
  for (let index = 0; index < records.length; index++) {
    const record = records[index] as string
    if (record.startsWith('# branch.head ')) {
      const head = record.slice('# branch.head '.length)
      branch = head === '(detached)' ? null : head
    } else if (record.startsWith('# branch.upstream ')) {
      upstream = record.slice('# branch.upstream '.length)
    } else if (record.startsWith('# branch.ab ')) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/u.exec(record)
      if (match !== null) {
        ahead = Number(match[1])
        behind = Number(match[2])
      }
    } else if (record.startsWith('1 ') || record.startsWith('2 ')) {
      // `1 XY sub mH mI mW hH hI path`; `2` adds a score field and a NUL-separated original path.
      const fields = record.split(' ')
      const pathStart = record.startsWith('1 ') ? 8 : 9
      const path = fields.slice(pathStart).join(' ')
      const xy = fields[1] as string
      const staged = kind(xy[0])
      const unstaged = kind(xy[1])
      const change: GitFileChange = {
        path,
        ...staged === undefined ? {} : { staged },
        ...unstaged === undefined ? {} : { unstaged },
      }
      if (record.startsWith('2 ')) {
        index++
        changes.push({ ...change, originalPath: records[index] as string })
      } else {
        changes.push(change)
      }
    } else if (record.startsWith('u ')) {
      changes.push({ path: record.split(' ').slice(10).join(' '), unstaged: 'conflicted' })
    } else if (record.startsWith('? ')) {
      changes.push({ path: record.slice(2), unstaged: 'untracked' })
    }
  }
  return { branch, upstream, ahead, behind, changes }
}

/**
 * Find the device-flow code and page in the output of `gh auth login --web`.
 * @param output - everything the command printed so far.
 * @returns the prompt once both appeared.
 */
export function parseLoginPrompt(output: string): GithubLoginPrompt | undefined {
  const code = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/u.exec(output)?.[1]
  const url = /(https:\/\/\S+\/login\/device)\b/u.exec(output)?.[1]
  return code === undefined || url === undefined ? undefined : { code, url }
}
