import { describe, it, expect } from 'vitest'
import { stockService } from '../stockService'
import { notificationService } from '../../../../core/notifications/service'
import { getExpiryAlert, syncExpiryNotifications, hasExpiryNotification } from '../expiryAlerts'
import { daysUntil, getExpiryState, formatExpiryDate, EXPIRY_ALERT_WINDOW_DAYS } from '../../utils/expiry'
import type { StockItemFormData, StockSection, StockItemStatus } from '../../types'

// O setup global de testes fixa o relógio em 2026-06-25T12:00:00Z.

function makeForm(overrides: Partial<StockItemFormData> = {}): StockItemFormData {
  return {
    name: 'Resma de Papel A4',
    section: 'material_escritorio' as StockSection,
    subcategory: 'Papel',
    serialNumber: '',
    room: 'Sala 5',
    status: 'ativo' as StockItemStatus,
    condition: 'Bom',
    notes: '',
    ...overrides,
  }
}

describe('utils/expiry', () => {
  it('daysUntil calcula dias corretamente', () => {
    expect(daysUntil('2026-06-25')).toBe(0)
    expect(daysUntil('2026-06-20')).toBe(-5)
    expect(daysUntil('2026-07-25')).toBe(30)
  })

  it('getExpiryState classifica vencido/em breve/ok', () => {
    expect(getExpiryState('2026-06-10').status).toBe('expired')
    expect(getExpiryState('2026-07-10').status).toBe('soon')
    expect(getExpiryState('2026-07-10').days).toBe(15)
    expect(getExpiryState('2026-09-01').status).toBe('ok')
    expect(getExpiryState('2026-06-25').status).toBe('soon')
  })

  it('janela de alerta é de 30 dias', () => {
    expect(EXPIRY_ALERT_WINDOW_DAYS).toBe(30)
  })

  it('formatExpiryDate usa formato pt-BR', () => {
    expect(formatExpiryDate('2026-07-10')).toBe('10/07/2026')
  })
})

describe('getExpiryAlert', () => {
  it('retorna null sem expiresAt', () => {
    const item = stockService.create(makeForm())
    expect(getExpiryAlert(item)).toBeNull()
  })

  it('retorna alerta crítico para item vencido', () => {
    const item = stockService.create(makeForm({ expiresAt: '2026-06-01' }))
    const alert = getExpiryAlert(item)
    expect(alert?.severity).toBe('critical')
    expect(alert?.title).toBe('Item vencido')
    expect(alert?.body).toContain(item.name)
  })

  it('retorna alerta de warning para item vencendo', () => {
    const item = stockService.create(makeForm({ expiresAt: '2026-07-10' }))
    const alert = getExpiryAlert(item)
    expect(alert?.severity).toBe('warning')
    expect(alert?.title).toBe('Validade próxima')
  })

  it('retorna null para item com validade longe', () => {
    const item = stockService.create(makeForm({ expiresAt: '2026-09-01' }))
    expect(getExpiryAlert(item)).toBeNull()
  })

  it('ignora itens descartados', () => {
    const item = stockService.create(makeForm({ expiresAt: '2026-06-01', status: 'descartado' }))
    expect(getExpiryAlert(item)).toBeNull()
  })
})

describe('syncExpiryNotifications', () => {
  it('cria notificações para itens vencidos e vencendo', () => {
    const expired = stockService.create(makeForm({ name: 'Tinta', expiresAt: '2026-06-01' }))
    const soon = stockService.create(makeForm({ name: 'Papel', expiresAt: '2026-07-10' }))
    stockService.create(makeForm({ name: 'Item ok', expiresAt: '2026-09-01' }))

    const created = syncExpiryNotifications()
    expect(created).toBe(2)

    const notifs = notificationService.getAll()
    expect(notifs).toHaveLength(2)

    const expiredNotif = notifs.find((n) => n.title === 'Item vencido')
    expect(expiredNotif?.severity).toBe('critical')
    expect(expiredNotif?.module).toBe('stock')
    expect(expiredNotif?.actionUrl).toBe(`/stock/items/${expired.id}`)

    const soonNotif = notifs.find((n) => n.title === 'Validade próxima')
    expect(soonNotif?.severity).toBe('warning')
    expect(soonNotif?.actionUrl).toBe(`/stock/items/${soon.id}`)
  })

  it('é idempotente — não duplica notificações', () => {
    stockService.create(makeForm({ name: 'Papel', expiresAt: '2026-07-01' }))

    syncExpiryNotifications()
    syncExpiryNotifications()

    expect(notificationService.getAll()).toHaveLength(1)
  })

  it('não cria notificação se já existe para o item', () => {
    const item = stockService.create(makeForm({ name: 'Papel', expiresAt: '2026-07-01' }))

    notificationService.create({
      title: 'Validade próxima',
      body: 'x',
      type: 'asset',
      severity: 'warning',
      module: 'stock',
      actionUrl: `/stock/items/${item.id}`,
    })

    expect(hasExpiryNotification(item.id)).toBe(true)
    expect(syncExpiryNotifications()).toBe(0)
    expect(notificationService.getAll()).toHaveLength(1)
  })
})
