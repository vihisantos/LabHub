import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  computeSlaDeadline,
  formatDuration,
  getPriority,
  getSlaHours,
  getSlaInfo,
  getSlaRemainingMs,
  getSlaState,
  isSlaOverdue,
} from '../sla'
import { DEFAULT_SLA_HOURS } from '../../types'

const NOW = new Date('2026-08-13T10:00:00Z')
const HOUR = 1000 * 60 * 60

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getPriority', () => {
  it('undefined → normal', () => {
    expect(getPriority(undefined)).toBe('normal')
  })

  it('valor inválido → normal', () => {
    expect(getPriority('lixo' as any)).toBe('normal')
  })

  it('valor válido passa direto', () => {
    expect(getPriority('urgente')).toBe('urgente')
    expect(getPriority('baixa')).toBe('baixa')
  })
})

describe('getSlaHours', () => {
  it('usa o padrão quando não há config', () => {
    expect(getSlaHours('urgente')).toBe(DEFAULT_SLA_HOURS.urgente)
    expect(getSlaHours('normal')).toBe(DEFAULT_SLA_HOURS.normal)
  })

  it('config personalizada por prioridade', () => {
    const config = { baixa: 10, normal: 5, alta: 2, urgente: 1 }
    expect(getSlaHours('urgente', config)).toBe(1)
    expect(getSlaHours('baixa', config)).toBe(10)
  })

  it('valor inválido na config cai no padrão', () => {
    expect(getSlaHours('alta', { alta: -3 } as any)).toBe(DEFAULT_SLA_HOURS.alta)
    expect(getSlaHours('normal', { normal: Number.NaN } as any)).toBe(DEFAULT_SLA_HOURS.normal)
  })

  it('zero na config desativa o SLA (sem prazo)', () => {
    expect(getSlaHours('urgente', { urgente: 0 } as any)).toBe(0)
  })
})

describe('computeSlaDeadline / getSlaRemainingMs', () => {
  it('prazo = createdAt + horas', () => {
    const deadline = computeSlaDeadline('2026-08-13T08:00:00Z', 2)
    expect(deadline.toISOString()).toBe('2026-08-13T10:00:00.000Z')
  })

  it('remaining negativo quando já passou do prazo', () => {
    const ms = getSlaRemainingMs('2026-08-13T07:00:00Z', 'urgente', null)
    expect(ms).toBeLessThan(0)
  })
})

describe('getSlaState', () => {
  it('resolvido/fechado → sem SLA', () => {
    expect(getSlaState(NOW.toISOString(), 'normal', 'resolvido', null)).toBeNull()
    expect(getSlaState(NOW.toISOString(), 'normal', 'fechado', null)).toBeNull()
  })

  it('prazo estourado → overdue', () => {
    expect(getSlaState('2026-08-12T08:00:00Z', 'urgente', 'aberto', null)).toBe('overdue')
  })

  it('próximo do fim (menos de 25% restante) → near', () => {
    // urgente = 2h; criado 1h50min atrás → restam 10min (≈8%)
    expect(getSlaState('2026-08-13T08:10:00Z', 'urgente', 'aberto', null)).toBe('near')
  })

  it('com folga → ok', () => {
    expect(getSlaState('2026-08-13T09:00:00Z', 'urgente', 'aberto', null)).toBe('ok')
  })
})

describe('isSlaOverdue', () => {
  it('true quando atrasado, false caso contrário', () => {
    expect(isSlaOverdue('2026-08-12T08:00:00Z', 'urgente', 'aberto', null)).toBe(true)
    expect(isSlaOverdue('2026-08-13T09:00:00Z', 'urgente', 'aberto', null)).toBe(false)
  })
})

describe('formatDuration', () => {
  it('minutos, horas e dias', () => {
    expect(formatDuration(30 * 60 * 1000)).toBe('30min')
    expect(formatDuration(2 * HOUR)).toBe('2h')
    expect(formatDuration(27 * HOUR)).toBe('1d 3h')
    expect(formatDuration(72 * HOUR)).toBe('3d')
  })
})

describe('getSlaInfo', () => {
  it('em atraso → rótulo com quanto tempo', () => {
    const info = getSlaInfo('2026-08-13T05:00:00Z', 'urgente', 'aberto', null)
    expect(info).not.toBeNull()
    expect(info!.state).toBe('overdue')
    expect(info!.label).toContain('Atrasado')
  })

  it('no prazo → tempo restante', () => {
    const info = getSlaInfo('2026-08-13T09:00:00Z', 'normal', 'aberto', null)
    expect(info!.state).toBe('ok')
    expect(info!.label).toContain('restantes')
  })
})
