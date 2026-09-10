import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Mascot } from '../Mascot'
import type { MascotState } from '../types'

vi.mock('framer-motion', () => ({
  motion: {
    g: ({ children, ...props }: any) => <g {...props}>{children}</g>,
    circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
  },
}))

const STATES: MascotState[] = [
  'idle',
  'loading',
  'thinking',
  'waiting',
  'approved',
  'celebration',
  'error',
  'notification',
  'sleeping',
]

describe('Mascot — componente reutilizável do LabHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza o estado idle por padrão', () => {
    render(<Mascot />)
    const svg = screen.getByRole('img')
    expect(svg).toHaveAttribute('data-mascot-state', 'idle')
  })

  it('expõe o estado atual no atributo data-mascot-state', () => {
    const { rerender } = render(<Mascot state="approved" />)
    expect(screen.getByRole('img')).toHaveAttribute('data-mascot-state', 'approved')

    rerender(<Mascot state="error" />)
    expect(screen.getByRole('img')).toHaveAttribute('data-mascot-state', 'error')
  })

  it('mapeia todos os estados do contrato', () => {
    for (const state of STATES) {
      const { unmount } = render(<Mascot state={state} />)
      expect(screen.getByRole('img')).toHaveAttribute('data-mascot-state', state)
      unmount()
    }
  })

  it('expõe aria-label descritivo com o estado', () => {
    render(<Mascot state="celebration" />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Mascote do LabHub — celebration')
  })

  it('aceita aria-label customizado', () => {
    render(<Mascot state="waiting" aria-label="Mascote aguardando" />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Mascote aguardando')
  })

  it('respeita o tamanho informado', () => {
    render(<Mascot state="waiting" size={240} />)
    expect(screen.getByRole('img')).toHaveAttribute('width', '240')
  })

  it('renderiza a silhueta do frasco independente do estado', () => {
    render(<Mascot state="waiting" />)
    expect(document.querySelector('.mascot-creature')).not.toBeNull()
    expect(document.querySelector('[clip-path]')).not.toBeNull()
  })
})