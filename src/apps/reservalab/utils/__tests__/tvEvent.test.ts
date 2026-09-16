import { describe, expect, it } from 'vitest'
import { brDateToIso, isoToBrDate, minutesToTime, timeToMinutes, mapReserveError } from '../tvEvent'

describe('brDateToIso', () => {
  it('converte DD/MM/YYYY para YYYY-MM-DD', () => {
    expect(brDateToIso('20/09/2026')).toBe('2026-09-20')
    expect(brDateToIso('01/03/2026')).toBe('2026-03-01')
  })

  it('passa valor intacto quando não está no formato DD/MM/YYYY', () => {
    expect(brDateToIso('2026-09-20')).toBe('2026-09-20')
    expect(brDateToIso('20/09')).toBe('20/09')
    expect(brDateToIso('')).toBe('')
  })
})

describe('isoToBrDate', () => {
  it('converte YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(isoToBrDate('2026-09-20')).toBe('20/09/2026')
    expect(isoToBrDate('2026-03-01')).toBe('01/03/2026')
  })

  it('passa valor intacto quando não está no formato ISO', () => {
    expect(isoToBrDate('20/09/2026')).toBe('20/09/2026')
    expect(isoToBrDate('')).toBe('')
  })
})

describe('minutesToTime', () => {
  it('converte minutos em HH:MM', () => {
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(450)).toBe('07:30')
    expect(minutesToTime(540)).toBe('09:00')
    expect(minutesToTime(1439)).toBe('23:59')
  })

  it('retorna null para valores inválidos/ausentes', () => {
    expect(minutesToTime(null)).toBeNull()
    expect(minutesToTime(undefined)).toBeNull()
    expect(minutesToTime(-1)).toBeNull()
    expect(minutesToTime(Number.NaN)).toBeNull()
  })
})

describe('timeToMinutes', () => {
  it('converte HH:MM em minutos', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('07:30')).toBe(450)
    expect(timeToMinutes('09:00')).toBe(540)
    expect(timeToMinutes('23:59')).toBe(1439)
  })

  it('retorna null para formatos inválidos/ausentes', () => {
    expect(timeToMinutes('')).toBeNull()
    expect(timeToMinutes(null)).toBeNull()
    expect(timeToMinutes(undefined)).toBeNull()
    expect(timeToMinutes('730')).toBeNull()
    expect(timeToMinutes('aa:bb')).toBeNull()
  })
})

describe('mapReserveError', () => {
  it('mapeia cada erro conhecido do RPC para mensagem amigável sem detalhes internos', () => {
    const cases: Array<[string, string]> = [
      ['TV_WORKSPACE_FULL_REQUIRED', 'acesso completo'],
      ['TV_DEVICE_WRITE_FORBIDDEN', 'não é permitida'],
      ['RESERVATION_DATE_REQUIRED', 'data da reserva'],
      ['INVALID_RESERVATION_TIMES', 'início e fim juntos'],
      ['RESERVATION_TIME_AFTER_END', 'não pode ser menor'],
      ['ADDITIONAL_DATE_BEFORE_RESERVATION', 'anteriores à data da reserva'],
      ['NULL_DEVICE_ID', 'Selecione ao menos uma TV'],
      ['DEVICE_WORKSPACE_MISMATCH', 'devem pertencer a este campus'],
      ['EVENT_NOT_FOUND', 'não foi encontrado'],
    ]
    for (const [token, expected] of cases) {
      expect(mapReserveError({ message: token })).toContain(expected)
      expect(mapReserveError({ message: token })).not.toContain(token)
    }
  })

  it('mapeia code 42501 sem expor detalhes', () => {
    const msg = mapReserveError({ code: '42501', message: 'new row violates row-level security policy' })
    expect(msg).toContain('permissão')
    expect(msg).not.toContain('row-level security')
  })

  it('usa fallback genérico para erros desconhecidos', () => {
    expect(mapReserveError({ message: 'outro erro interno' })).toContain('Não foi possível')
    expect(mapReserveError(null)).toContain('Não foi possível')
    expect(mapReserveError(undefined)).toContain('Não foi possível')
  })
})