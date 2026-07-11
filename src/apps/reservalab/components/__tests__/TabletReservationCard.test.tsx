import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabletReservationCard } from '../TabletReservationCard'
import type { TabletReserva } from '../../types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, transition, whileHover, whileTap, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

function makeTabletReservation(overrides: Partial<TabletReserva> = {}): TabletReserva {
  return {
    id: 1,
    sala: 'Lab 101',
    professor: 'Prof. Ana',
    horario_inicio: '2026-06-25T08:00:00.000Z',
    horario_fim: '2026-06-25T10:00:00.000Z',
    quantidade_tablets: 15,
    reservado_por: 'Carlos',
    finalidade: 'Aula prática',
    status: 'ativa',
    ...overrides,
  }
}

describe('TabletReservationCard', () => {
  it('renderiza nome da sala', () => {
    render(<TabletReservationCard reservation={makeTabletReservation()} onClick={() => {}} />)
    expect(screen.getByText('Lab 101')).toBeInTheDocument()
  })

  it('renderiza professor', () => {
    render(<TabletReservationCard reservation={makeTabletReservation()} onClick={() => {}} />)
    expect(screen.getByText('Prof. Ana')).toBeInTheDocument()
  })

  it('renderiza finalidade quando presente', () => {
    render(<TabletReservationCard reservation={makeTabletReservation()} onClick={() => {}} />)
    expect(screen.getByText('Aula prática')).toBeInTheDocument()
  })

  it('não renderiza finalidade quando ausente', () => {
    render(
      <TabletReservationCard reservation={makeTabletReservation({ finalidade: '' })} onClick={() => {}} />,
    )
    // Não deve haver parágrafo vazio para finalidade
    expect(screen.queryByText('Aula prática')).not.toBeInTheDocument()
  })

  it('chama onClick com a reserva ao clicar', () => {
    const onClick = vi.fn()
    const reservation = makeTabletReservation()
    render(<TabletReservationCard reservation={reservation} onClick={onClick} />)
    fireEvent.click(screen.getByText('Lab 101'))
    expect(onClick).toHaveBeenCalledWith(reservation)
  })
})
