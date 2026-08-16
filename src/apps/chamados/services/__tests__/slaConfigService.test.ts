import { describe, it, expect } from 'vitest'
import { slaConfigService } from '../slaConfigService'
import { DEFAULT_SLA_HOURS, TICKET_PRIORITIES } from '../../types'

describe('slaConfigService', () => {
  it('getFor: cria configuração padrão para workspace desconhecido', () => {
    const config = slaConfigService.getFor('ws-x')
    expect(config.workspace_id).toBe('ws-x')
    expect(config.hours).toEqual(DEFAULT_SLA_HOURS)
    // idempotente: segunda chamada reusa a mesma
    expect(slaConfigService.getFor('ws-x').id).toBe(config.id)
  })

  it('getFor sem workspace retorna configuração default sem persistir', () => {
    const config = slaConfigService.getFor('')
    expect(config.workspace_id).toBe('__default__')
    expect(config.hours).toEqual(DEFAULT_SLA_HOURS)
  })

  it('getHours: padrão e customizado', () => {
    expect(slaConfigService.getHours('ws-x')).toEqual(DEFAULT_SLA_HOURS)
    slaConfigService.update('ws-a', { baixa: 10, normal: 4, alta: 3, urgente: 1 })
    expect(slaConfigService.getHours('ws-a')).toEqual({ baixa: 10, normal: 4, alta: 3, urgente: 1 })
  })

  it('getHoursForTickets: agrupa por workspace com os valores salvos', () => {
    slaConfigService.update('ws-a', { baixa: 1, normal: 2, alta: 3, urgente: 4 })
    const map = slaConfigService.getHoursForTickets()
    expect(map['ws-a']).toEqual({ baixa: 1, normal: 2, alta: 3, urgente: 4 })
  })

  it('update: saneia valores inválidos e negativos', () => {
    slaConfigService.update('ws-a', {
      baixa: -5,
      normal: Number.NaN,
      alta: 2.6,
      urgente: 0,
    })
    const hours = slaConfigService.getHours('ws-a')
    expect(hours.baixa).toBe(0)
    expect(hours.normal).toBe(DEFAULT_SLA_HOURS.normal)
    expect(hours.alta).toBe(3)
    expect(hours.urgente).toBe(0)
  })

  it('update: preenche prioridades ausentes com o padrão', () => {
    slaConfigService.update('ws-a', {} as any)
    const hours = slaConfigService.getHours('ws-a')
    for (const p of TICKET_PRIORITIES) {
      expect(hours[p]).toBe(DEFAULT_SLA_HOURS[p])
    }
  })

  it('update: exige escrita (super admin passa)', () => {
    expect(() =>
      slaConfigService.update('ws-a', { baixa: 1, normal: 1, alta: 1, urgente: 1 }),
    ).not.toThrow()
  })
})
