import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CancelReservationModal } from '../CancelReservationModal'
import type { TabletReserva } from '../../types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

vi.mock('lucide-react', () => ({
  Tablet: () => <span>TabletIcon</span>,
}))

const makeReserva = (over: Partial<TabletReserva> = {}): TabletReserva => ({
  id: '11111111-1111-4111-8111-111111111111',
  sala: 'Sala 1',
  quantidade_tablets: 10,
  professor: 'Prof. Ana',
  horario_inicio: '2026-06-25T15:00:00.000Z',
  horario_fim: '2026-06-25T16:00:00.000Z',
  finalidade: 'Aula prática',
  reservado_por: 'Maria',
  status: 'ativa',
  ...over,
})

function renderModal(
  reservation = makeReserva(),
  onClose = vi.fn(),
  onConfirm = vi.fn(),
  loading = false,
) {
  return render(
    <CancelReservationModal
      reservation={reservation}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
    />
  )
}

describe('CancelReservationModal', () => {
  it('deixa claro que está cancelando uma reserva de tablets', () => {
    renderModal()
    expect(screen.getByText('Cancelar reserva de tablets')).toBeInTheDocument()
    expect(screen.getByText(/cancelar esta reserva de tablets/)).toBeInTheDocument()
  })

  it('mostra os detalhes da reserva', () => {
    renderModal()
    expect(screen.getByText('Sala 1')).toBeInTheDocument()
    expect(screen.getByText('Prof. Ana')).toBeInTheDocument()
    expect(screen.getByText('10 tablets')).toBeInTheDocument()
    expect(screen.getByText('Maria')).toBeInTheDocument()
  })

  it('chama onConfirm ao confirmar o cancelamento', () => {
    const onConfirm = vi.fn()
    renderModal(makeReserva(), vi.fn(), onConfirm)
    fireEvent.click(screen.getByText('Confirmar cancelamento'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('chama onClose ao clicar em Voltar', () => {
    const onClose = vi.fn()
    renderModal(makeReserva(), onClose)
    fireEvent.click(screen.getByText('Voltar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('desabilita os botões e mostra texto de progresso durante o carregamento', () => {
    renderModal(makeReserva(), vi.fn(), vi.fn(), true)
    const confirm = screen.getByText('Cancelando...')
    const voltar = screen.getByText('Voltar')
    expect(confirm).toBeDisabled()
    expect(voltar).toBeDisabled()
  })
})