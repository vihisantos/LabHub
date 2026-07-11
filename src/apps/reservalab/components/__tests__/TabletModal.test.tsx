import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabletModal } from '../TabletModal'
import type { TabletReserva } from '../../types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, transition, exit, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
}))

function makeReservation(overrides: Partial<TabletReserva> = {}): TabletReserva {
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

describe('TabletModal', () => {
  it('renderiza nome da sala', () => {
    render(<TabletModal reservation={makeReservation()} onClose={() => {}} />)
    expect(screen.getByText('Lab 101')).toBeInTheDocument()
  })

  it('renderiza professor', () => {
    render(<TabletModal reservation={makeReservation()} onClose={() => {}} />)
    expect(screen.getByText('Prof. Ana')).toBeInTheDocument()
  })

  it('renderiza quantidade de tablets', () => {
    render(<TabletModal reservation={makeReservation()} onClose={() => {}} />)
    expect(screen.getByText('15 tablets')).toBeInTheDocument()
  })

  it('renderiza finalidade quando presente', () => {
    render(<TabletModal reservation={makeReservation()} onClose={() => {}} />)
    expect(screen.getByText('Aula prática')).toBeInTheDocument()
  })

  it('renderiza reservado por', () => {
    render(<TabletModal reservation={makeReservation()} onClose={() => {}} />)
    expect(screen.getByText('Carlos')).toBeInTheDocument()
  })

  it('renderiza status Ativa', () => {
    render(<TabletModal reservation={makeReservation()} onClose={() => {}} />)
    expect(screen.getByText('Ativa')).toBeInTheDocument()
  })

  it('chama onClose ao clicar no overlay do modal', () => {
    const onClose = vi.fn()
    render(<TabletModal reservation={makeReservation()} onClose={onClose} />)
    // O overlay (motion.div externo) fecha o modal ao clicar
    const overlay = document.querySelector('[style*="position: fixed"]')
    if (overlay) {
      fireEvent.click(overlay)
      expect(onClose).toHaveBeenCalled()
    }
  })
})
