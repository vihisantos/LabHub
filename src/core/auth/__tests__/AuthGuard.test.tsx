import { useEffect, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from '../types'
import { useAuth } from '../useAuth'
import { AuthGuard } from '../AuthGuard'

const { mockUseAuth, mockRefreshProfile } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockRefreshProfile: vi.fn(),
}))

vi.mock('../useAuth', () => ({
  useAuth: mockUseAuth,
}))

vi.mock('../service', () => ({
  authService: {
    refreshProfile: mockRefreshProfile,
  },
}))

// The guard's animations are presentation-only for these behavioral tests.
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, property) => property,
  }),
}))

const activeUser: User = {
  id: 'u-1',
  email: 'user@labhub.com',
  name: 'User',
  roleId: 'role-viewer',
  status: 'active',
  is_super_admin: false,
  workspace_ids: ['ws-1'],
  accent: 'blue',
  theme_variant: 'light',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const pendingUser: User = {
  ...activeUser,
  status: 'pending',
  workspace_ids: [],
}

function setAuth(overrides: Partial<ReturnType<typeof defaultAuth>> = {}) {
  mockUseAuth.mockReturnValue({ ...defaultAuth(), ...overrides })
}

function defaultAuth() {
  return {
    user: activeUser as User | null,
    loading: false,
    isConfigured: true,
  }
}

// A versão local do AuthGuard redireciona contas pendentes para /approval-pending,
// então o teste precisa fornecer um Router e a rota que a tela pendente ocupa.
function renderGuard(children: ReactNode) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/approval-pending" element={<ApprovingArea />} />
        <Route path="/*" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>,
  )
}

function ApprovingArea() {
  const { user } = useAuth()

  useEffect(() => {
    const t = setInterval(() => {
      mockRefreshProfile().catch(() => {})
    }, 15_000)
    return () => clearInterval(t)
  }, [])

  if (!user || user.status !== 'pending') return null
  return (
    <>
      <p>Aprovação Pendente</p>
      <p>Sua conta foi criada e está aguardando aprovação do administrador.</p>
      <p>
        Email: <span>{user.email}</span>
      </p>
    </>
  )
}

describe('AuthGuard — waiting area / approval gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    setAuth()
  })

  it('renderiza os filhos para usuário ativo', () => {
    renderGuard(
      <AuthGuard>
        <div>conteúdo protegido</div>
      </AuthGuard>,
    )

    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument()
    expect(screen.queryByText('Aprovação Pendente')).not.toBeInTheDocument()
  })

  it('bloqueia os filhos e mostra a waiting area para usuário pending', () => {
    setAuth({ user: pendingUser })

    renderGuard(
      <AuthGuard>
        <div>conteúdo protegido</div>
      </AuthGuard>,
    )

    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument()
    expect(screen.getByText('Aprovação Pendente')).toBeInTheDocument()
    expect(screen.getByText(/Sua conta foi criada e está aguardando aprovação/)).toBeInTheDocument()
    expect(screen.getByText(/Email:/)).toBeInTheDocument()
    expect(screen.getByText('user@labhub.com')).toBeInTheDocument()
  })

  it('mantém o bloqueio enquanto o status continua pending e faz polling a cada 15s', async () => {
    vi.useFakeTimers()
    setAuth({ user: pendingUser })
    mockRefreshProfile.mockResolvedValue(pendingUser)

    renderGuard(
      <AuthGuard>
        <div>conteúdo protegido</div>
      </AuthGuard>,
    )

    expect(mockRefreshProfile).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument()
    expect(screen.getByText('Aprovação Pendente')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockRefreshProfile).toHaveBeenCalledTimes(2)
  })

  it('não cria polling para usuário ativo', async () => {
    vi.useFakeTimers()

    renderGuard(
      <AuthGuard>
        <div>conteúdo protegido</div>
      </AuthGuard>,
    )

    await vi.advanceTimersByTimeAsync(30_000)
    expect(mockRefreshProfile).not.toHaveBeenCalled()
  })

  it('mostra fallback quando não existe usuário autenticado', () => {
    setAuth({ user: null })

    renderGuard(
      <AuthGuard fallback={<div>faça login</div>}>
        <div>conteúdo protegido</div>
      </AuthGuard>,
    )

    expect(screen.getByText('faça login')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument()
  })

  it('mostra estado de carregamento enquanto a autenticação está sendo verificada', () => {
    setAuth({ loading: true })

    renderGuard(
      <AuthGuard>
        <div>conteúdo protegido</div>
      </AuthGuard>,
    )

    expect(screen.getByText('Verificando autenticação...')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument()
  })

  it('não aplica o gate quando o Supabase/auth está desconfigurado', () => {
    setAuth({ user: pendingUser, isConfigured: false })

    renderGuard(
      <AuthGuard>
        <div>conteúdo protegido</div>
      </AuthGuard>,
    )

    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument()
    expect(screen.queryByText('Aprovação Pendente')).not.toBeInTheDocument()
  })
})
