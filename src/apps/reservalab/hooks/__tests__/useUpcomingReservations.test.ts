import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../services/api', () => ({ fetchReservas: vi.fn() }))
vi.mock('../../services/supabase', () => ({ fetchTabletReservas: vi.fn() }))

import { useUpcomingReservations } from '../useUpcomingReservations'
import { fetchReservas } from '../../services/api'
import { fetchTabletReservas } from '../../services/supabase'

describe('useUpcomingReservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('começa vazio', () => {
    const { result } = renderHook(() => useUpcomingReservations())
    expect(result.current.labReservas).toEqual([])
    expect(result.current.tabletReservas).toEqual([])
  })

  it('carrega apenas lab e tablet de hoje para o workspace', async () => {
    ;(fetchReservas as any).mockResolvedValue({
      lab_reservas: { LAB01: [{ horario: '07h30 às 09h20', responsavel: 'Prof. A' }] },
      lab1_reservas: [],
      lab2_reservas: [],
    })
    ;(fetchTabletReservas as any).mockResolvedValue([
      { id: 't1', sala: 'Sala 1', quantidade_tablets: 10, professor: 'Prof. B',
        horario_inicio: new Date(2026, 8, 11, 7, 10).toISOString(),
        horario_fim: new Date(2026, 8, 11, 9, 0).toISOString(),
        finalidade: 'Aula', reservado_por: 'Maria', status: 'ativa' },
    ])

    const { result } = renderHook(() =>
      useUpcomingReservations('campus-a', 'ws-1'),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.labReservas).toHaveLength(1)
    expect(result.current.labReservas[0]).toEqual({
      label: 'Lab 01', horario: '07h30 às 09h20', responsavel: 'Prof. A',
    })
    expect(result.current.tabletReservas).toHaveLength(1)
  })

  it('filtra tablets fora do dia atual', async () => {
    ;(fetchReservas as any).mockResolvedValue({
      lab_reservas: {}, lab1_reservas: [], lab2_reservas: [],
    })
    ;(fetchTabletReservas as any).mockResolvedValue([
      { id: 't1', sala: 'Sala 1', quantidade_tablets: 10, professor: 'Prof. X',
        horario_inicio: new Date(2026, 8, 12, 7, 10).toISOString(),
        horario_fim: new Date(2026, 8, 12, 9, 0).toISOString(),
        finalidade: 'Aula', reservado_por: 'Maria', status: 'ativa' },
    ])

    const { result } = renderHook(() => useUpcomingReservations('campus-a', 'ws-1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.tabletReservas).toHaveLength(0)
  })
})
