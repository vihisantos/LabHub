import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickUpcomingReservation } from '../upcomingReservation'
import type { TabletReserva } from '../../types'

afterEach(() => {
  vi.useRealTimers()
})

function makeTablet(overrides: Partial<TabletReserva> = {}): TabletReserva {
  return {
    id: 't1',
    sala: 'Sala 1',
    quantidade_tablets: 10,
    professor: 'Prof. Ana',
    horario_inicio: new Date(2026, 8, 11, 7, 40).toISOString(),
    horario_fim: new Date(2026, 8, 11, 9, 0).toISOString(),
    finalidade: 'Aula',
    reservado_por: 'Maria',
    status: 'ativa',
    ...overrides,
  }
}

describe('pickUpcomingReservation', () => {
  it('acha a próxima reserva dentro da janela', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 10))

    const next = pickUpcomingReservation(
      [{ label: 'Lab 01', horario: '07h30 às 09h20', responsavel: 'Prof. X' }],
      [],
      30,
    )

    expect(next).toMatchObject({ label: 'Lab 01', timeLabel: '07h30 às 09h20', startsIn: 20 })
  })

  it('considera "agora" quando começa na hora exata', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 30))

    const next = pickUpcomingReservation(
      [{ label: 'Lab 01', horario: '07h30 às 09h20', responsavel: 'Prof. X' }],
      [],
      30,
    )

    expect(next).toMatchObject({ kind: 'lab', startsIn: 0 })
  })

  it('não considera nada fora da janela de 30 min', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 10))

    const next = pickUpcomingReservation(
      [{ label: 'Lab 01', horario: '09h00 às 11h00' }],
      [],
      30,
    )

    expect(next).toBeNull()
  })

  it('mescla lab e tablet e pega o que começa primeiro', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 20))

    const next = pickUpcomingReservation(
      [{ label: 'Lab 01', horario: '08h00 às 10h00' }],
      [makeTablet()],
      30,
    )

    expect(next).toMatchObject({ kind: 'tablet', label: 'Sala 1', startsIn: 20 })
  })
})
