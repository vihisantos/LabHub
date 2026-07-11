import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReservationCard } from '../ReservationCard'
import type { TransformedReservation } from '../../types'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, transition, whileHover, whileTap, ...rest } = props
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

describe('ReservationCard', () => {
  it('renderiza subject e professor', () => {
    render(<ReservationCard reservation={makeReservation()} onClick={() => {}} />)
    expect(screen.getByText('Matemática')).toBeInTheDocument()
    expect(screen.getByText('Prof. João')).toBeInTheDocument()
  })

  it('renderiza horário', () => {
    render(<ReservationCard reservation={makeReservation()} onClick={() => {}} />)
    expect(screen.getByText('07h30 - 09h20')).toBeInTheDocument()
  })

  it('renderiza número de alunos', () => {
    render(<ReservationCard reservation={makeReservation()} onClick={() => {}} />)
    expect(screen.getByText('30 alunos')).toBeInTheDocument()
  })

  it('renderiza badge AGORA quando isLive', () => {
    render(<ReservationCard reservation={makeReservation({ isLive: true })} onClick={() => {}} />)
    expect(screen.getByText('AGORA')).toBeInTheDocument()
  })

  it('renderiza badge EM BREVE quando isEmBreve', () => {
    render(<ReservationCard reservation={makeReservation({ isEmBreve: true })} onClick={() => {}} />)
    expect(screen.getByText('EM BREVE')).toBeInTheDocument()
  })

  it('renderiza badge ENCERRADA quando isEnded', () => {
    render(<ReservationCard reservation={makeReservation({ isEnded: true })} onClick={() => {}} />)
    expect(screen.getByText('ENCERRADA')).toBeInTheDocument()
  })

  it('chama onClick ao clicar', () => {
    const onClick = vi.fn()
    render(<ReservationCard reservation={makeReservation()} onClick={onClick} />)
    fireEvent.click(screen.getByText('Matemática'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renderiza professor como "—" quando não informado', () => {
    render(<ReservationCard reservation={makeReservation({ professor: '' })} onClick={() => {}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
