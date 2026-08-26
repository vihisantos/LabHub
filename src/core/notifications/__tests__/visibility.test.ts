import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../workspaces/store', async () => {
  const actual = await vi.importActual<typeof import('../../workspaces/store')>('../../workspaces/store')
  return actual
})

import { notificationAppliesTo } from '../visibility'
import { workspaceStore } from '../../workspaces/store'
import type { AppNotification } from '../types'
import type { User } from '../../auth/types'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'a@labhub.com',
    name: 'A',
    roleId: 'role-viewer',
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
    workspaceStore.set(
      { id: 'ws-test', name: 'Test', slug: 'test', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' } as never,
      true,
      ['ws-test'],
    )
  })

  it('sem usuário (não autenticado) retorna true', () => {
    expect(notificationAppliesTo(makeNotification(), null)).toBe(true)
  })

  it('sem audience (legado) — só admins absolutos veem', () => {
    expect(notificationAppliesTo(makeNotification(), makeUser({ is_super_admin: true }))).toBe(true)
    expect(notificationAppliesTo(makeNotification(), makeUser({ is_super_admin: false }))).toBe(false)
  })

  it('audience role — filtra por cargo', () => {
    const n = makeNotification({ audience: 'role', targetRole: 'role-technician' })
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-technician' }))).toBe(true)
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-viewer' }))).toBe(false)
  })

  it('audience role + targetSuperAdmin — só admin absoluto', () => {
    const n = makeNotification({
      audience: 'role',
      targetRole: 'role-technician',
      targetSuperAdmin: true,
    })
    expect(
      notificationAppliesTo(n, makeUser({ roleId: 'role-technician', is_super_admin: true })),
    ).toBe(true)
    expect(
      notificationAppliesTo(n, makeUser({ roleId: 'role-technician', is_super_admin: false })),
    ).toBe(false)
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

  it('sem acesso ao app (módulo do appRegistry) → não vê', () => {
    const n = makeNotification({ module: 'tv' })
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-viewer' }))).toBe(false)
  })

  it('com acesso ao app (módulo do appRegistry) → vê', () => {
    const n = makeNotification({ module: 'pc-care' })
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-viewer' }))).toBe(true)
  })

  it('admin absoluto vê de qualquer app', () => {
    const n = makeNotification({ module: 'tv' })
    expect(notificationAppliesTo(n, makeUser({ is_super_admin: true }))).toBe(true)
  })

  it('módulo fora do appRegistry (auth) mantém regra por audience', () => {
    const n = makeNotification({ module: 'auth', audience: 'role', targetRole: 'role-technician' })
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-technician' }))).toBe(true)
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-viewer' }))).toBe(false)
  })

  it('notify_settings.muted → ninguém vê', () => {
    const n = makeNotification({ module: 'pc-care' })
    const user = makeUser({ roleId: 'role-viewer', notify_settings: { muted: true, apps: {} } })
    expect(notificationAppliesTo(n, user)).toBe(false)
  })

  it('notify_settings: canal in-app desligado por app → não vê daquele app', () => {
    const n = makeNotification({ module: 'pc-care' })
    const user = makeUser({
      roleId: 'role-viewer',
      notify_settings: { muted: false, apps: { 'pc-care': { inapp: false, push: true } } },
    })
    expect(notificationAppliesTo(n, user)).toBe(false)
  })

  it('notify_settings: canal in-app ligado por app → vê', () => {
    const n = makeNotification({ module: 'pc-care' })
    const user = makeUser({
      roleId: 'role-viewer',
      notify_settings: { muted: false, apps: { 'pc-care': { inapp: true, push: false } } },
    })
    expect(notificationAppliesTo(n, user)).toBe(true)
  })

  it('workspace_id fora do ativo → não vê (mesmo com audience role)', () => {
    const n = makeNotification({
      audience: 'role',
      targetRole: 'role-viewer',
      workspace_id: 'ws-1',
    })
    workspaceStore.set(null, false, ['ws-2'])
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-viewer' }))).toBe(false)
    workspaceStore.set(null, false, ['ws-1'])
    expect(notificationAppliesTo(n, makeUser({ roleId: 'role-viewer' }))).toBe(true)
  })
})
