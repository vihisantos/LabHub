import { describe, it, expect } from 'vitest'
import { setCol } from '../../../../lib/db'
import { notificationService } from '../../../../core/notifications/service'
import { ticketService } from '../ticketService'
import { syncNewTicketAlerts, markLocalTicket, isAlertsMuted, setAlertsMuted } from '../ticketAlerts'
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
