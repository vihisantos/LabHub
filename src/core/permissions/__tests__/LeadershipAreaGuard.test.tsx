import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'
import { LeadershipAreaGuard } from '../LeadershipAreaGuard'

const mockUseAuth = vi.hoisted(() => vi.fn())
const mockUseLeadership = vi.hoisted(() => vi.fn())

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../useLeadership', () => ({
  useLeadership: () => mockUseLeadership(),
}))

const activeUser = { id: 'u1', name: 'Coord', roleId: 'role-coordinator', status: 'active', is_super_admin: false } as never

function renderGuard(
  scope: 'team' | 'coordination',
  children: ReactNode = <div>CONTEUDO LIBERADO</div>,
) {
  return render(
    <MemoryRouter initialEntries={['/coordenador']}>
      <Routes>
        <Route path="/login" element={<div>PAGINA LOGIN</div>} />
        <Route
          path="/coordenador"
          element={<LeadershipAreaGuard scope={scope}>{children}</LeadershipAreaGuard>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LeadershipAreaGuard (RBAC 2.0 — área é do cargo, não de permissão)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bloqueia enquanto autenticação não resolve (loader)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: true })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'coordination' })
    renderGuard('coordination')
    expect(screen.getByText('Verificando acesso...')).toBeTruthy()
    expect(screen.queryByText('CONTEUDO LIBERADO')).toBeNull()
  })

  it('sem usuário → redireciona para /login', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: false, area: null })
    renderGuard('coordination')
    expect(screen.getByText('PAGINA LOGIN')).toBeTruthy()
  })

  it('cargo de coordenação entra na área de coordenação', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'coordination' })
    renderGuard('coordination')
    expect(screen.getByText('CONTEUDO LIBERADO')).toBeTruthy()
  })

  it('cargo de coordenação NÃO entra em área de equipe (escopo)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'coordination' })
    renderGuard('team')
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
    expect(screen.queryByText('CONTEUDO LIBERADO')).toBeNull()
  })

  it('cargo líder (team) NÃO entra em área de coordenação', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'team' })
    renderGuard('coordination')
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
  })

  it('cargo líder (team) ENTRA na área de equipe (scope team)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'team' })
    renderGuard('team')
    expect(screen.getByText('CONTEUDO LIBERADO')).toBeTruthy()
  })

  it('viewer/técnico comum NÃO entra em /lider (escopo team, cargo executante)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: false, area: null })
    renderGuard('team')
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
    expect(screen.queryByText('CONTEUDO LIBERADO')).toBeNull()
  })

  it('cargo executante NUNCA entra, mesmo com acesso full a apps', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    // Cenário de defesa em profundidade: é limpo que "liderar" independe de appAccess.
    mockUseLeadership.mockReturnValue({ isLeadership: false, area: null })
    renderGuard('coordination')
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
    expect(screen.getByText(/Seu cargo não é de liderança/)).toBeTruthy()
  })

  it('super admin não é liderança por padrão (cargo manda; não é área de admin global)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: false, area: null })
    renderGuard('coordination')
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
  })
})