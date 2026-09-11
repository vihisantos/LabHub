import { describe, it, expect } from 'vitest'
import { appNotificationFromRow } from '../service'

describe('appNotificationFromRow', () => {
  it('mapeia snake_case do servidor para AppNotification', () => {
    const row = {
      id: 'n1',
      title: 'Título',
      body: 'Corpo',
      type: 'ticket',
      severity: 'warning',
      module: 'chamados',
      audience: 'user',
      target_role: 'role-technician',
      target_super_admin: true,
      target_user_id: 'u-1',
      action_url: '/chamados',
      created_at: '2026-01-01T00:00:00Z',
    }
    const n = appNotificationFromRow(row)
    expect(n.id).toBe('n1')
    expect(n.title).toBe('Título')
    expect(n.type).toBe('ticket')
    expect(n.severity).toBe('warning')
    expect(n.module).toBe('chamados')
    expect(n.audience).toBe('user')
    expect(n.targetRole).toBe('role-technician')
    expect(n.targetSuperAdmin).toBe(true)
    expect(n.targetUserId).toBe('u-1')
    expect(n.actionUrl).toBe('/chamados')
    expect(n.createdAt).toBe('2026-01-01T00:00:00Z')
    expect(n.read).toBe(false)
  })

  it('preenche defaults quando campos esparsos', () => {
    const n = appNotificationFromRow({ id: 'x', title: 'T', body: 'B' })
    expect(n.type).toBe('system')
    expect(n.severity).toBe('info')
    expect(n.audience).toBeUndefined()
    expect(n.targetSuperAdmin).toBeUndefined()
    expect(n.createdAt).toBeTruthy()
  })
})