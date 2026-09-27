import { describe, expect, it } from 'vitest'
import { resolvePermissionMode } from '../src/permissions.ts'

describe('resolvePermissionMode', () => {
  it('applies a pinned native mode unchanged', () => {
    expect(resolvePermissionMode('plan', { sandbox: 'danger-full-access', approval: 'never' })).toBe('plan')
    expect(resolvePermissionMode('default', undefined)).toBe('default')
  })

  it('maps the Session\'s sandbox mode and approval policy under the session setting', () => {
    expect(resolvePermissionMode('session', undefined)).toBe('default')
    expect(resolvePermissionMode('session', { sandbox: 'danger-full-access', approval: 'never' })).toBe('bypassPermissions')
    expect(resolvePermissionMode('session', { sandbox: 'danger-full-access', approval: 'ask' })).toBe('default')
    expect(resolvePermissionMode('session', { sandbox: 'workspace-write', approval: 'ask' })).toBe('acceptEdits')
    expect(resolvePermissionMode('session', { sandbox: 'workspace-write', approval: 'never' })).toBe('acceptEdits')
    expect(resolvePermissionMode('session', { sandbox: 'read-only', approval: 'never' })).toBe('default')
  })
})
