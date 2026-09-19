import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setCol, clearCache } from '../../../../lib/db'
import { notificationService } from '../../../../core/notifications/service'
import { ticketService } from '../ticketService'
import { syncNewTicketAlerts, markLocalTicket, isAlertsMuted, setAlertsMuted, syncSlaAlerts } from '../ticketAlerts'
import { workspaceStore } from '../../../../core/workspaces/store'
import type { Ticket } from '../../types'

const NOW = '2026-06-25T12:00:00.000Z'

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: crypto.randomUUID(),
    ticketNumber: 42,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Sala 101',
    assetName: '',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'aberto',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: NOW,
    updatedAt: NOW,
    resolvedAt: null,
    ...overrides,
  }
}

function seed(...tickets: Ticket[]) {
  setCol('chamados', tickets)
}

describe('syncNewTicketAlerts', () => {
  it('cria notificação para chamado novo e aberto', () => {
    const t = makeTicket()
    seed(t)

    const created = syncNewTicketAlerts()

    expect(created).toHaveLength(1)
    const notification = notificationService.getById(created[0].id)
    expect(notification?.type).toBe('ticket')
    expect(notification?.module).toBe('chamados')
    expect(notification?.actionUrl).toBe(`/chamados/tickets/${t.id}`)
    expect(notification?.title).toContain('#42')
    expect(notification?.body).toContain('Sala 101')
  })

  it('é idempotente: não duplica notificação', () => {
    seed(makeTicket())

    expect(syncNewTicketAlerts()).toHaveLength(1)
    expect(syncNewTicketAlerts()).toHaveLength(0)
  })

  it('não notifica chamado resolvido ou fechado', () => {
    seed(
      makeTicket({ id: 'a', status: 'resolvido' }),
      makeTicket({ id: 'b', status: 'fechado' }),
    )

    expect(syncNewTicketAlerts()).toHaveLength(0)
  })

  it('não notifica chamado aberto diretamente pelo app do TI', () => {
    const t = makeTicket()
    seed(t)
    markLocalTicket(t.id)

    expect(syncNewTicketAlerts()).toHaveLength(0)
  })

  it('gera notificações para chamados já existentes sem som no primeiro carregamento', () => {
    seed(makeTicket({ createdAt: '2026-06-20T12:00:00.000Z' }))
    // alertForNewTickets não toca som para chamados antigos (isRecent=false) — sem lançar erro
    const created = syncNewTicketAlerts()
    expect(created).toHaveLength(1)
  })

  it('filtra por workspace ativo', () => {
    seed(makeTicket({ workspace_id: 'ws-a' }))
    // workspaceStore não configurado no teste → filtro passa em tudo
    const all = ticketService.getAll()
    expect(all).toHaveLength(1)
    expect(syncNewTicketAlerts()).toHaveLength(1)
  })
})

describe('preferências de alerta', () => {
  it('isAlertsMuted reflete setAlertsMuted', () => {
    setAlertsMuted(true)
    expect(isAlertsMuted()).toBe(true)
    setAlertsMuted(false)
    expect(isAlertsMuted()).toBe(false)
  })
})

describe('syncSlaAlerts — alertas de SLA (Fase 2.2.2)', () => {
  const NOW = new Date('2026-08-13T10:00:00.000Z')
  const HOUR = 1000 * 60 * 60

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    clearCache()
    workspaceStore.set(null, false, [])
    setAlertsMuted(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    clearCache()
  })

  const slaTicket = (overrides: Partial<Ticket> = {}): Ticket =>
    makeTicket({ createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(), ...overrides })

  it('Caso 1 — near: 1 notificação com actionUrl ?sla=near e severity warning', () => {
    const t = slaTicket()
    seed(t)

    const created = syncSlaAlerts()

    expect(created).toHaveLength(1)
    const n = notificationService.getById(created[0].id)
    expect(n?.actionUrl).toBe(`/chamados/tickets/${t.id}?sla=near`)
    expect(n?.severity).toBe('warning')
    expect(n?.type).toBe('ticket')
    expect(n?.module).toBe('chamados')
    expect(n?.audience).toBe('workspace')
    expect(n?.workspace_id).toBe('ws-a')
    expect(n?.title).toBe('SLA próximo do vencimento')
    expect(n?.body).toContain('#42')
  })

  it('Caso 2 — polling repetido: nenhuma duplicata', () => {
    seed(slaTicket())
    expect(syncSlaAlerts()).toHaveLength(1)
    expect(syncSlaAlerts()).toHaveLength(0)
  })

  it('Caso 3 — near → overdue: exatamente uma segunda notificação', () => {
    const t = slaTicket()
    seed(t)
    expect(syncSlaAlerts()).toHaveLength(1)

    seed({ ...t, createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() })
    const second = syncSlaAlerts()

    expect(second).toHaveLength(1)
    expect(second[0].actionUrl).toBe(`/chamados/tickets/${t.id}?sla=overdue`)
    expect(second[0].severity).toBe('critical')
    expect(second[0].title).toBe('SLA vencido')
  })

  it('Caso 4 — overdue repetido: nenhuma duplicata (total segue 1 por estado)', () => {
    const t = slaTicket({ createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() })
    seed(t)
    expect(syncSlaAlerts()).toHaveLength(1)
    expect(syncSlaAlerts()).toHaveLength(0)
    expect(
      notificationService
        .getAll()
        .filter((n) => n.actionUrl?.startsWith(`/chamados/tickets/${t.id}`)),
    ).toHaveLength(1)
  })

  it('Caso 5 — resolvido: nenhuma notificação', () => {
    seed(slaTicket({ status: 'resolvido' }))
    expect(syncSlaAlerts()).toHaveLength(0)
  })

  it('Caso 6 — fechado: nenhuma notificação', () => {
    seed(slaTicket({ status: 'fechado' }))
    expect(syncSlaAlerts()).toHaveLength(0)
  })

  it('Caso 7 — ok: nenhuma notificação', () => {
    seed(slaTicket({ createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }))
    expect(syncSlaAlerts()).toHaveLength(0)
  })

  it('Caso 8 — SLA desabilitado (horas = 0): nenhuma notificação', () => {
    seed(slaTicket())
    setCol('sla_configs', [
      {
        id: 'ws-a',
        workspace_id: 'ws-a',
        hours: { baixa: 72, normal: 0, alta: 8, urgente: 2 },
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ])
    expect(syncSlaAlerts()).toHaveLength(0)
  })

  it('Caso 9 — cada notificação usa o workspace do próprio ticket', () => {
    const a = slaTicket({ id: 'a', workspace_id: 'ws-a' })
    const b = slaTicket({ id: 'b', workspace_id: 'ws-b', priority: 'urgente' })
    seed(a, b)

    syncSlaAlerts()

    const byWs = notificationService
      .getAll()
      .filter((n) => n.actionUrl?.includes('sla='))
    expect(byWs.map((n) => n.workspace_id).sort()).toEqual(['ws-a', 'ws-b'])
    expect(byWs.map((n) => n.actionUrl).sort()).toEqual([
      '/chamados/tickets/a?sla=near',
      '/chamados/tickets/b?sla=overdue',
    ])
  })

  it('Caso 10 — workspace ativo diferente: workspace_id vem do ticket, nunca do ativo', () => {
    workspaceStore.set(
      { id: 'ws-b', name: 'WS B', slug: 'ws-b' } as any,
      false,
      ['ws-b'],
    )
    const t = slaTicket({ workspace_id: 'ws-a' })
    seed(t)

    const created = syncSlaAlerts()

    expect(created).toHaveLength(1)
    expect(created[0].workspace_id).toBe('ws-a')
    expect(created[0].workspace_id).not.toBe('ws-b')
  })

  it('Caso 11 — multiunidade: A → near e B → overdue simultâneos', () => {
    const a = slaTicket({ id: 'a', workspace_id: 'ws-a' })
    const b = slaTicket({ id: 'b', workspace_id: 'ws-b', priority: 'urgente' })
    seed(a, b)

    const created = syncSlaAlerts()

    expect(created).toHaveLength(2)
    expect(created.find((n) => n.workspace_id === 'ws-a')?.actionUrl).toBe('/chamados/tickets/a?sla=near')
    expect(created.find((n) => n.workspace_id === 'ws-b')?.actionUrl).toBe('/chamados/tickets/b?sla=overdue')
  })

  it('Caso 13 — mute de áudio não bloqueia a criação in-app (semântica atual; exibição é filtrada à parte)', () => {
    setAlertsMuted(true)
    seed(slaTicket())
    expect(syncSlaAlerts()).toHaveLength(1)
  })

  it('chamado sem workspace_id no cache → nenhum alerta (unidade indeterminável)', () => {
    seed(slaTicket({ workspace_id: undefined }))
    expect(syncSlaAlerts()).toHaveLength(0)
  })

  it('Caso 14 — alertas de novo chamado continuam funcionando junto', () => {
    const t = slaTicket()
    seed(t)

    const newOnes = syncNewTicketAlerts()
    const slaOnes = syncSlaAlerts()

    expect(newOnes).toHaveLength(1)
    expect(newOnes[0].actionUrl).toBe(`/chamados/tickets/${t.id}`)
    expect(slaOnes).toHaveLength(1)
    expect(slaOnes[0].actionUrl).toBe(`/chamados/tickets/${t.id}?sla=near`)
  })
})
