import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsCard } from '../StatsCard'

// framer-motion motion.div renderiza sem animação em teste
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

describe('StatsCard', () => {
  it('renderiza título e subtitle', () => {
    render(
      <StatsCard
        title="Total Reservas"
        value={42}
        subtitle="últimos 7 dias"
        icon={<span data-testid="icon">📊</span>}
        color="#6366f1"
        index={0}
      />,
    )
    expect(screen.getByText('Total Reservas')).toBeInTheDocument()
    expect(screen.getByText('últimos 7 dias')).toBeInTheDocument()
  })

  it('renderiza ícone', () => {
    render(
      <StatsCard
        title="Test"
        value={10}
        subtitle="teste"
        icon={<span data-testid="icon">🔔</span>}
        color="#6366f1"
        index={0}
      />,
    )
    expect(screen.getByTestId('icon')).toHaveTextContent('🔔')
  })

  it('renderiza valor numérico começando em 0', () => {
    render(
      <StatsCard
        title="Alunos"
        value={50}
        subtitle="total"
        icon={<span>🎓</span>}
        color="#22c55e"
        index={1}
      />,
    )
    // O AnimatedValue começa em 0 e anima até 50
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renderiza valor string diretamente (sem animação)', () => {
    render(
      <StatsCard
        title="Status"
        value="Online"
        subtitle="API"
        icon={<span>✅</span>}
        color="#22c55e"
        index={2}
      />,
    )
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('aceita prop isMobile', () => {
    render(
      <StatsCard
        title="Test"
        value={5}
        subtitle="mobile"
        icon={<span>📱</span>}
        color="#6366f1"
        index={3}
        isMobile
      />,
    )
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
})
