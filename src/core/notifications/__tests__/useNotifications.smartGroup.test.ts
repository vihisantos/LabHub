import { describe, it, expect } from 'vitest'
import { smartGroup } from '../useNotifications'
import type { AppNotification } from '../types'

const n = (id: string, actionUrl: string, over: Partial<AppNotification> = {}): AppNotification => ({
  id,
  title: `Notificação ${id}`,
  body: '',
  type: 'ticket',
  severity: 'warning',
  module: 'chamados',
  actionUrl,
  read: false,
  createdAt: '2026-08-13T10:00:00Z',
  ...over,
})

describe('smartGroup — agrupamento por chamado com query string (Fase 2.2.2)', () => {
  it('near e overdue do mesmo chamado agrupam como o mesmo ticket', () => {
    const groups = smartGroup([
      n('a', '/chamados/tickets/123?sla=near'),
      n('b', '/chamados/tickets/123?sla=overdue', { createdAt: '2026-08-13T11:00:00Z' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
    expect(groups[0].relatedIds).toEqual(['b', 'a'])
    expect(groups[0].notification.id).toBe('b')
  })

  it('chamados diferentes continuam em grupos separados', () => {
    const groups = smartGroup([
      n('a', '/chamados/tickets/123?sla=near'),
      n('b', '/chamados/tickets/456?sla=overdue'),
    ])

    expect(groups).toHaveLength(2)
  })

  it('alerta de novo chamado (sem query) agrupa com os alertas de SLA do mesmo chamado', () => {
    const groups = smartGroup([
      n('a', '/chamados/tickets/123'),
      n('b', '/chamados/tickets/123?sla=overdue'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })

  it('actionUrl sem chamado continua caindo no fallback por título', () => {
    const groups = smartGroup([
      n('a', '/outra-rota', { title: 'Mesmo título' }),
      n('b', '/outra-rota', { title: 'Mesmo título' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })
})