import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ApprovalWaitingPage, ApprovalRoute } from '../ApprovalWaitingPage'
import type { User } from '../../../core/auth/types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    g: ({ children, ...props }: any) => <g {...props}>{children}</g>,
    circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
    footer: ({ children, ...props }: any) => <footer {...props}>{children}</footer>,
  },
}))

const mockUseAuth = vi.hoisted(() => vi.fn())

vi.mock('../../../core/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../../core/auth/service', () => ({
  authService: {
    refreshProfile: vi.fn().mockResolvedValue({ status: 'pending' }),
    signOut: vi.fn().mockResolvedValue(undefined),
  },
}))

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-pending',
    email: 'prof@escola.edu.br',
    name: 'Prof. Ana',
    roleId: 'role-viewer',
    status: 'pending',
    is_super_admin: false,
    workspace_ids: [],
    accent: 'blue',
    theme_variant: 'dark',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function routeTree(initialEntries = ['/approval-pending']) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/approval-pending" element={<ApprovalRoute />} />
        <Route path="/login" element={<div>Página de Login</div>} />
        <Route path="/" element={<div>LabHub Inicial</div>} />
        <Route path="/chamados" element={<div>Chamados</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ApprovalWaitingPage — página de aprovação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra a espera com o mascote waiting e a nota de segurança', () => {
    render(<ApprovalWaitingPage status="waiting" email="prof@escola.edu.br" />)

    expect(screen.getByText('Aprovação Pendente')).toBeInTheDocument()
    expect(screen.getByText('Aguardando aprovação')).toBeInTheDocument()
    expect(screen.getByText(/prof@escola.edu.br/)).toBeInTheDocument()
    expect(screen.getByText('Sua conta é protegida')).toBeInTheDocument()
    expect(document.querySelector('[data-mascot-state]')).toHaveAttribute('data-mascot-state', 'waiting')
  })

  it('no modo controlado mostra "Voltar para Login" apenas quando onRetry existe', () => {
    const { rerender } = render(
      <ApprovalWaitingPage status="waiting" onRetry={() => { }} />,
    )
    expect(screen.getByText('Voltar para Login')).toBeInTheDocument()
    expect(screen.queryByText('Sair da conta')).not.toBeInTheDocument()

    rerender(<ApprovalWaitingPage status="waiting" onSignOut={() => { }} />)
    expect(screen.queryByText('Voltar para Login')).not.toBeInTheDocument()
    expect(screen.getByText('Sair da conta')).toBeInTheDocument()
  })

  it('estado aprovado celebra com o mascote e chama onEnter', () => {
    const onEnter = vi.fn()
    render(<ApprovalWaitingPage status="approved" secondsLeft={2} totalSeconds={3} onEnter={onEnter} />)

    expect(screen.getByText('Conta Aprovada!')).toBeInTheDocument()
    expect(document.querySelector('[data-mascot-state]')).toHaveAttribute('data-mascot-state', 'celebration')
    expect(screen.getByText('2s')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Entrar no LabHub'))
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('estado rejeitado mostra o mascote error e chama onRetry', () => {
    const onRetry = vi.fn()
    render(<ApprovalWaitingPage status="rejected" onRetry={onRetry} />)

    expect(screen.getByText('Conta Negada')).toBeInTheDocument()
    expect(document.querySelector('[data-mascot-state]')).toHaveAttribute('data-mascot-state', 'error')

    fireEvent.click(screen.getByText('Tentar novamente'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('estado loading usa o mascote loading', () => {
    render(<ApprovalWaitingPage status="loading" />)
    expect(document.querySelector('[data-mascot-state]')).toHaveAttribute('data-mascot-state', 'loading')
  })
})

describe('ApprovalRoute — roteamento da página de aprovação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sessão pendente permanece na página de espera', () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), loading: false })
    render(routeTree())

    expect(screen.getByText('Aprovação Pendente')).toBeInTheDocument()
    expect(document.querySelector('[data-mascot-state]')).toHaveAttribute('data-mascot-state', 'waiting')
  })

  it('usuário ativo que abre a URL diretamente vai direto para o início (sem celebração)', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ status: 'active', workspace_ids: ['ws-1'] }), loading: false })

    render(routeTree())

    expect(screen.getByText('LabHub Inicial')).toBeInTheDocument()
  })

  it('transição real pending → active celebra com o mascote e navega para o início no fim da contagem', () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), loading: false })
    const { rerender } = render(routeTree())

    expect(screen.getByText('Aprovação Pendente')).toBeInTheDocument()

    // Admin aprova: o AuthContext entrega o usuário ativo e o ApprovalRoute
    // renderiza a celebração antes de liberar o LabHub.
    mockUseAuth.mockReturnValue({ user: makeUser({ status: 'active', workspace_ids: ['ws-1'] }), loading: false })
    rerender(routeTree())

    expect(screen.getByText('Conta Aprovada!')).toBeInTheDocument()
    expect(document.querySelector('[data-mascot-state]')).toHaveAttribute('data-mascot-state', 'celebration')
    expect(screen.getByText('Entrar no LabHub')).toBeInTheDocument()
    expect(screen.getByText('3s')).toBeInTheDocument()

    // Fim da contagem (3s) → entra no LabHub
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(screen.getByText('LabHub Inicial')).toBeInTheDocument()
  })

  it('sem sessão redireciona para o login', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    render(routeTree())

    expect(screen.getByText('Página de Login')).toBeInTheDocument()
  })
})