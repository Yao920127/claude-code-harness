import { describe, expect, it } from 'vitest'
import { parseLoginPrompt, parseStatus } from '../src/git-status.ts'

describe('parseStatus', () => {
  it('reads branch headers and every record kind', () => {
    const output = [
      '# branch.oid 1234',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 aaa bbb src/file name.ts',
      '1 A. N... 000000 100644 100644 000 bbb added.ts',
      '1 MD N... 100644 100644 000000 aaa bbb both.ts',
      '1 T. N... 100644 120000 120000 aaa bbb link',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new name.ts',
      'old name.ts',
      '2 C. N... 100644 100644 100644 aaa bbb C75 copy.ts',
      'source.ts',
      'u UU N... 100644 100644 100644 100644 a b c conflicted file.ts',
      '? untracked file.txt',
      '! ignored.log',
      '',
    ].join('\0')
    expect(parseStatus(output)).toEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      changes: [
        { path: 'src/file name.ts', unstaged: 'modified' },
        { path: 'added.ts', staged: 'added' },
        { path: 'both.ts', staged: 'modified', unstaged: 'deleted' },
        { path: 'link', staged: 'type-changed' },
        { path: 'new name.ts', originalPath: 'old name.ts', staged: 'renamed' },
        { path: 'copy.ts', originalPath: 'source.ts', staged: 'copied' },
        { path: 'conflicted file.ts', unstaged: 'conflicted' },
        { path: 'untracked file.txt', unstaged: 'untracked' },
      ],
    })
  })

  it('reports a detached HEAD without upstream and ignores a malformed ahead-behind header', () => {
    expect(parseStatus('# branch.head (detached)\0# branch.ab garbage\0')).toEqual({
      branch: null, upstream: null, ahead: 0, behind: 0, changes: [],
    })
  })
})

describe('parseLoginPrompt', () => {
  it('waits for both the one-time code and the device page', () => {
    expect(parseLoginPrompt('! One-time code (4641-66F8) copied to clipboard\n')).toBeUndefined()
    expect(parseLoginPrompt('Open this URL: https://github.com/login/device')).toBeUndefined()
    expect(parseLoginPrompt('! One-time code (4641-66F8) copied\nOpen this URL to continue: https://github.com/login/device\n'))
      .toEqual({ code: '4641-66F8', url: 'https://github.com/login/device' })
  })
})
