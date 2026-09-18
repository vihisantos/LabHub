import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'
import { LeadershipAreaGuard } from '../LeadershipAreaGuard'

const mockUseAuth = vi.hoisted(() => vi.fn())
const mockUseLeadership = vi.hoisted(() => vi.fn())
const mockUseCoordinator = vi.hoisted(() => vi.fn())

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../useLeadership', () => ({
  useLeadership: () => mockUseLeadership(),
}))

vi.mock('../useCoordinator', () => ({
  useCoordinator: () => mockUseCoordinator(),
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

function setCoordinator({ isCoordinator, failed = false, loading = false, refresh = vi.fn() }: {
  isCoordinator: boolean
  failed?: boolean
  loading?: boolean
  refresh?: ReturnType<typeof vi.fn>
}) {
  mockUseCoordinator.mockReturnValue({
    units: isCoordinator ? [{ unitId: 'ws1' }] : [],
    isCoordinator,
    failed,
    loading,
    refresh,
  })
}

describe('LeadershipAreaGuard (RBAC 2.0 — coordenação por membership ativa; equipe por cargo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCoordinator({ isCoordinator: false })
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

  it('regressão coord.test: membership ativa de coordenação entra mesmo sem cargo global de liderança', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    // profiles.role legado NÃO é liderança — quem concede é a membership ativa.
    mockUseLeadership.mockReturnValue({ isLeadership: false, area: null })
    setCoordinator({ isCoordinator: true })

    renderGuard('coordination')

    expect(screen.getByText('CONTEUDO LIBERADO')).toBeTruthy()
  })

  it('NÃO entra só por possuir cargo coordinator global sem membership ativa (escopo vem da unidade)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    // Cargo global diz "coordenador", mas o usuário não coordena unidade alguma.
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'coordination' })
    setCoordinator({ isCoordinator: false })

    renderGuard('coordination')

    expect(screen.getByText('Acesso restrito')).toBeTruthy()
    expect(screen.queryByText('CONTEUDO LIBERADO')).toBeNull()
  })

  it('cargo de coordenação com membership ativa entra na área de coordenação', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'coordination' })
    setCoordinator({ isCoordinator: true })

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

  it('cargo líder (team) NÃO entra em área de coordenação (não coordena unidade alguma)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'team' })
    setCoordinator({ isCoordinator: false })

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

  it('cargo executante NUNCA entra em coordenação, mesmo com acesso full a apps', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: false, area: null })
    setCoordinator({ isCoordinator: false })
    renderGuard('coordination')
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
    expect(screen.queryByText('CONTEUDO LIBERADO')).toBeNull()
  })

  it('super admin não é coordenador por padrão (área vem das unidades, não do admin global)', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: false, area: null })
    setCoordinator({ isCoordinator: false })
    renderGuard('coordination')
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
  })

  it('coordenação: mostra loader enquanto o escopo ainda não confirmou as unidades', () => {
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'coordination' })
    setCoordinator({ isCoordinator: false, loading: true })

    renderGuard('coordination')

    expect(screen.getByText('Verificando acesso...')).toBeTruthy()
    expect(screen.queryByText('CONTEUDO LIBERADO')).toBeNull()
  })

  it('coordenação: falha de confirmação do escopo → nega com retry que re-consulta', () => {
    const refresh = vi.fn()
    mockUseAuth.mockReturnValue({ user: activeUser, loading: false })
    mockUseLeadership.mockReturnValue({ isLeadership: true, area: 'coordination' })
    setCoordinator({ isCoordinator: false, failed: true, refresh })

    const view = renderGuard('coordination')

    expect(screen.queryByText('CONTEUDO LIBERADO')).toBeNull()
    fireEvent.click(screen.getByText('Tentar novamente'))
    expect(refresh).toHaveBeenCalledWith({ silent: true })

    // Após o retry, o escopo confirma a coordenação → área liberada.
    setCoordinator({ isCoordinator: true, failed: false, refresh })
    view.rerender(
      <MemoryRouter initialEntries={['/coordenador']}>
        <Routes>
          <Route path="/login" element={<div>PAGINA LOGIN</div>} />
          <Route
            path="/coordenador"
            element={<LeadershipAreaGuard scope="coordination"><div>CONTEUDO LIBERADO</div></LeadershipAreaGuard>}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('CONTEUDO LIBERADO')).toBeTruthy()
  })
})