import { describe, it, expect, vi } from 'vitest'
import {
  getPeriodo,
  parseHorario,
  isReservaAtiva,
  isReservaEmBreve,
  isReservaEncerrada,
} from '../timeUtils'

describe('getPeriodo', () => {
  it('retorna manhã para horários matutinos', () => {
    expect(getPeriodo('07h30')).toBe('manhã')
    expect(getPeriodo('08h00 às 10h00')).toBe('manhã')
    expect(getPeriodo('manhã')).toBe('manhã')
    expect(getPeriodo('11h30')).toBe('manhã')
  })

  it('retorna tarde para horários vespertinos', () => {
    expect(getPeriodo('12h00')).toBe('tarde')
    expect(getPeriodo('13h30')).toBe('tarde')
    expect(getPeriodo('tarde')).toBe('tarde')
    expect(getPeriodo('17h00')).toBe('tarde')
  })

  it('retorna noite para horários noturnos', () => {
    expect(getPeriodo('18h00')).toBe('noite')
    expect(getPeriodo('19h30')).toBe('noite')
    expect(getPeriodo('22h00')).toBe('noite')
    expect(getPeriodo('noite')).toBe('noite')
  })

  it('retorna noite como fallback para entradas inválidas ou vazias', () => {
    expect(getPeriodo(null)).toBe('noite')
    expect(getPeriodo(undefined)).toBe('noite')
    expect(getPeriodo('')).toBe('noite')
    expect(getPeriodo('qualquer')).toBe('noite')
  })
})

describe('parseHorario', () => {
  it('parse formato "07h30 às 09h20"', () => {
    expect(parseHorario('07h30 às 09h20')).toEqual({ inicio: 450, fim: 560 })
  })

  it('parse formato "13:00-14:00"', () => {
    expect(parseHorario('13:00-14:00')).toEqual({ inicio: 780, fim: 840 })
  })

  it('parse formato "8h as 10h" (sem leading zero, sem minutos)', () => {
    expect(parseHorario('8h as 10h')).toEqual({ inicio: 480, fim: 600 })
  })

  it('parse formato "07h30 ate 09h20" (com "ate")', () => {
    expect(parseHorario('07h30 ate 09h20')).toEqual({ inicio: 450, fim: 560 })
  })

  it('parse formato com "à"', () => {
    expect(parseHorario('07h30 à 09h20')).toEqual({ inicio: 450, fim: 560 })
  })

  it('parse formato com "ateh"', () => {
    expect(parseHorario('07h30 ateh 09h20')).toEqual({ inicio: 450, fim: 560 })
  })

  it('parse apenas número simples (ex: "7h" → inicio=7h, fim=9h)', () => {
    const result = parseHorario('7h')
    expect(result.inicio).toBe(420)
    expect(result.fim).toBe(540)
  })

  it('parse apenas número simples (ex: "14h" → inicio=14h, fim=16h)', () => {
    const result = parseHorario('14h')
    expect(result.inicio).toBe(840)
    expect(result.fim).toBe(960)
  })

  it('retorna null para null', () => {
    expect(parseHorario(null)).toEqual({ inicio: null, fim: null })
  })

  it('retorna null para undefined', () => {
    expect(parseHorario(undefined)).toEqual({ inicio: null, fim: null })
  })

  it('retorna null para string vazia', () => {
    expect(parseHorario('')).toEqual({ inicio: null, fim: null })
  })

  it('retorna null para string inválida', () => {
    expect(parseHorario('abc')).toEqual({ inicio: null, fim: null })
  })
})

describe('isReservaAtiva', () => {
  it('retorna true se agora está dentro do horário (considerando margem de 5 min)', () => {
    vi.setSystemTime(new Date('2026-06-25T08:00:00'))
    // 08:00 local = 480 min, parseHorario('07h30 às 09h20') = { inicio: 450, fim: 560 }
    // 480 >= 450-5 (445) && 480 < 560 → true
    expect(isReservaAtiva('07h30 às 09h20')).toBe(true)
  })

  it('retorna false se agora está antes do horário (fora da margem de 5 min)', () => {
    vi.setSystemTime(new Date('2026-06-25T07:00:00'))
    // 07:00 local = 420 min, parseHorario('07h30 às 09h20') = { inicio: 450, fim: 560 }
    // 420 >= 445? false → false
    expect(isReservaAtiva('07h30 às 09h20')).toBe(false)
  })

  it('retorna false se agora está depois do fim', () => {
    vi.setSystemTime(new Date('2026-06-25T10:00:00'))
    // 10:00 local = 600 min, parseHorario('07h30 às 09h20') = { inicio: 450, fim: 560 }
    // 600 < 560? false → false
    expect(isReservaAtiva('07h30 às 09h20')).toBe(false)
  })

  it('retorna false para horário inválido', () => {
    vi.setSystemTime(new Date('2026-06-25T08:00:00'))
    expect(isReservaAtiva(null)).toBe(false)
    expect(isReservaAtiva('')).toBe(false)
  })
})

describe('isReservaEmBreve', () => {
  it('retorna true se está entre 5 e 30 min antes do início', () => {
    vi.setSystemTime(new Date('2026-06-25T07:15:00'))
    // 07:15 local = 435 min, parseHorario('07h30 às 09h20') = { inicio: 450, fim: 560 }
    // 435 >= 450-30 (420) && 435 < 450-5 (445) → true
    expect(isReservaEmBreve('07h30 às 09h20')).toBe(true)
  })

  it('retorna false se falta menos de 5 min (já é "ativa")', () => {
    vi.setSystemTime(new Date('2026-06-25T07:28:00'))
    // 07:28 local = 448 min, parseHorario('07h30 às 09h20') = { inicio: 450 }
    // 448 >= 420 && 448 < 445? false → false
    expect(isReservaEmBreve('07h30 às 09h20')).toBe(false)
  })

  it('retorna false se falta mais de 30 min', () => {
    vi.setSystemTime(new Date('2026-06-25T06:30:00'))
    // 06:30 local = 390 min, parseHorario('07h30 às 09h20') = { inicio: 450 }
    // 390 >= 420? false → false
    expect(isReservaEmBreve('07h30 às 09h20')).toBe(false)
  })

  it('retorna false para horário inválido', () => {
    vi.setSystemTime(new Date('2026-06-25T08:00:00'))
    expect(isReservaEmBreve(null)).toBe(false)
  })
})

describe('isReservaEncerrada', () => {
  it('retorna true se já passaram 10+ min do fim', () => {
    vi.setSystemTime(new Date('2026-06-25T09:35:00'))
    // 09:35 local = 575 min, parseHorario('07h30 às 09h20') = { inicio: 450, fim: 560 }
    // 575 >= 560+10 (570) → true
    expect(isReservaEncerrada('07h30 às 09h20')).toBe(true)
  })

  it('retorna false se está dentro da margem de 10 min após o fim', () => {
    vi.setSystemTime(new Date('2026-06-25T09:25:00'))
    // 09:25 local = 565 min, parseHorario('07h30 às 09h20') = { fim: 560 }
    // 565 >= 570? false → false (ainda na margem)
    expect(isReservaEncerrada('07h30 às 09h20')).toBe(false)
  })

  it('retorna false para horário inválido', () => {
    vi.setSystemTime(new Date('2026-06-25T10:00:00'))
    expect(isReservaEncerrada(null)).toBe(false)
    expect(isReservaEncerrada('')).toBe(false)
  })
})
