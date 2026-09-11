import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpcomingReservationBanner } from '../UpcomingReservationBanner'
import type { TabletReserva } from '../../types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

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

describe('UpcomingReservationBanner', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra a reserva de lab começando dentro da janela', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 10))

    render(
      <UpcomingReservationBanner
        labReservas={[{ label: 'Lab 01', horario: '07h30 às 09h20', responsavel: 'Prof. X' }]}
        tabletReservas={[]}
      />,
    )

    expect(screen.getByText('Reserva chegando em 20 min')).toBeInTheDocument()
    expect(screen.getByText(/Lab 01 · 07h30 às 09h20 · Prof. X/)).toBeInTheDocument()
  })

  it('não mostra nada fora da janela de 30 minutos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 10))

    render(
      <UpcomingReservationBanner
        labReservas={[{ label: 'Lab 01', horario: '09h00 às 11h00', responsavel: 'Prof. X' }]}
        tabletReservas={[]}
      />,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('considera reservas de tablet', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 20))

    render(<UpcomingReservationBanner labReservas={[]} tabletReservas={[makeTablet()]} />)

    expect(screen.getByText('Reserva chegando em 20 min')).toBeInTheDocument()
    expect(screen.getByText(/Sala 1 · 07:40 · Prof. Ana/)).toBeInTheDocument()
  })
})
