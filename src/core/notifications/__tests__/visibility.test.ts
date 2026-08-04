import { describe, it, expect, beforeEach } from 'vitest'
import { notificationAppliesTo } from '../visibility'
import { workspaceStore } from '../../workspaces/store'
import type { AppNotification } from '../types'
import type { User } from '../../auth/types'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'a@labhub.com',
    name: 'A',
    role: 'viewer',
    status: 'active',
    is_super_admin: false,
    workspace_ids: [],
    accent: 'emerald',
    theme_variant: 'dark',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n-1',
    title: 't',
    body: 'b',
    type: 'system',
    severity: 'info',
    module: 'auth',
    read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('notificationAppliesTo', () => {
  beforeEach(() => {
    workspaceStore.set(null, false, [])
  })

  it('sem usuário (não autenticado) retorna true', () => {
    expect(notificationAppliesTo(makeNotification(), null)).toBe(true)
  })

  it('sem audience (legado) — só admins veem', () => {
    expect(notificationAppliesTo(makeNotification(), makeUser({ role: 'admin' }))).toBe(true)
    expect(notificationAppliesTo(makeNotification(), makeUser({ role: 'technician' }))).toBe(false)
  })

  it('audience role — filtra por cargo', () => {
    const n = makeNotification({ audience: 'role', targetRole: 'admin' })
    expect(notificationAppliesTo(n, makeUser({ role: 'admin' }))).toBe(true)
    expect(notificationAppliesTo(n, makeUser({ role: 'viewer' }))).toBe(false)
  })

  it('audience role + targetSuperAdmin — só admin absoluto', () => {
    const n = makeNotification({ audience: 'role', targetRole: 'admin', targetSuperAdmin: true })
    expect(notificationAppliesTo(n, makeUser({ role: 'admin', is_super_admin: true }))).toBe(true)
    expect(notificationAppliesTo(n, makeUser({ role: 'admin', is_super_admin: false }))).toBe(false)
  })

  it('audience user — só o destinatário', () => {
    const n = makeNotification({ audience: 'user', targetUserId: 'u-42' })
    expect(notificationAppliesTo(n, makeUser({ id: 'u-42' }))).toBe(true)
    expect(notificationAppliesTo(n, makeUser({ id: 'u-1' }))).toBe(false)
  })

  it('audience workspace — membro do workspace vê, não-membro não', () => {
    const n = makeNotification({ audience: 'workspace', workspace_id: 'ws-1' })
    workspaceStore.set({ id: 'ws-1', name: 'ws', slug: 'ws-1' } as never, false, ['ws-1'])
    expect(notificationAppliesTo(n, makeUser({ workspace_ids: ['ws-1'] }))).toBe(true)
    workspaceStore.set(null, false, ['ws-2'])
    expect(notificationAppliesTo(n, makeUser({ workspace_ids: ['ws-2'] }))).toBe(false)
  })

  it('audience workspace — admin absoluto vê todos', () => {
    const n = makeNotification({ audience: 'workspace', workspace_id: 'ws-x' })
    workspaceStore.set(null, true, [])
    expect(notificationAppliesTo(n, makeUser({ is_super_admin: true, workspace_ids: [] }))).toBe(true)
  })
})
