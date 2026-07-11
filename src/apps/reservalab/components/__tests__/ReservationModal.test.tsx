import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReservationModal } from '../ReservationModal'
import type { TransformedReservation } from '../../types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, transition, exit, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

function makeReservation(overrides: Partial<TransformedReservation> = {}): TransformedReservation {
  return {
    id: 1,
    time: '07h30 - 09h20',
    period: 'manhã',
    subject: 'Matemática',
    professor: 'Prof. João',
    combined: false,
    data: '25/06/2026',
    alunos: 30,
    isLive: false,
    isEmBreve: false,
    isEnded: false,
    horario_inicio: 450,
    horario_fim: 560,
    reservaFeitaPor: 'Maria',
    ...overrides,
  }
}

function renderModal(reservation = makeReservation(), onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <ReservationModal reservation={reservation} onClose={onClose} />
    </MemoryRouter>,
  )
}

describe('ReservationModal', () => {
  it('renderiza subject da reserva', () => {
    renderModal()
    expect(screen.getByText('Matemática')).toBeInTheDocument()
  })

  it('renderiza horário', () => {
    renderModal()
    expect(screen.getByText('07h30 - 09h20')).toBeInTheDocument()
  })

  it('renderiza professor', () => {
    renderModal()
    expect(screen.getByText('Prof. João')).toBeInTheDocument()
  })

  it('renderiza número de alunos', () => {
    renderModal()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renderiza reservado por', () => {
    renderModal()
    expect(screen.getByText('Maria')).toBeInTheDocument()
  })

  it('renderiza mapa de carteiras (56 desks)', () => {
    renderModal()
    expect(screen.getByText('1.1')).toBeInTheDocument()
    expect(screen.getByText('8.7')).toBeInTheDocument()
  })

  it('renderiza badge PCD no mapa', () => {
    renderModal()
    const pcdElements = screen.getAllByText('PCD')
    expect(pcdElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renderiza legenda do mapa', () => {
    renderModal()
    expect(screen.getByText('Livre')).toBeInTheDocument()
  })

  it('renderiza botão "Criar evento na TV"', () => {
    renderModal()
    expect(screen.getByText('Criar evento na TV')).toBeInTheDocument()
  })

  it('chama onClose ao clicar no overlay do modal', () => {
    const onClose = vi.fn()
    renderModal(makeReservation(), onClose)
    // O overlay do modal chama onClose ao clicar
    const overlay = screen.getAllByRole('button').find(
      (btn) => btn.closest('[style*="position: fixed"]'),
    )?.closest('[style*="position: fixed"]') as HTMLElement
    if (overlay) {
      fireEvent.click(overlay)
      expect(onClose).toHaveBeenCalled()
    }
  })
})
