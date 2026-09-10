import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LiderHome } from '../LiderHome'
import type { TeamMember } from '../../../core/permissions/membership'

const mockUseAuth = vi.hoisted(() => vi.fn())
const mockUseLeadership = vi.hoisted(() => vi.fn())
const mockUseWorkspace = vi.hoisted(() => vi.fn())
const mockUseTeam = vi.hoisted(() => vi.fn())
const mockGetRoleForUser = vi.hoisted(() => vi.fn())

vi.mock('../../../core/auth/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('../../../core/permissions/useLeadership', () => ({
  useLeadership: () => mockUseLeadership(),
}))
vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))
vi.mock('../../../core/permissions/useTeam', () => ({ useTeam: () => mockUseTeam() }))
vi.mock('../../../core/permissions/service', () => ({
  permissionService: { getRoleForUser: () => mockGetRoleForUser() },
}))

const liderUser = {
  id: 'u-lider',
  name: 'Líder',
  roleId: 'role-lider',
  status: 'active',
  is_super_admin: false,
  workspace_ids: ['ws1'],
}

const ws1 = { id: 'ws1', name: 'Campus A' }

function member(id: string, name: string, email: string, roleId: string): TeamMember {
  return {
    membership: {
      id: `ms-${id}`,
      profile_id: id,
      workspace_id: 'ws1',
      role_id: 'role-x',
      status: 'active',
      managed_by: 'ms-u-lider',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    profile: { id, name, email, status: 'active', roleId },
  }
}

function setupOverrides(overrides: Partial<ReturnType<typeof mockUseTeam>>) {
  mockUseTeam.mockReturnValue({
    team: [],
    loading: false,
    failed: false,
    workspaceId: 'ws1',
    refresh: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: liderUser })
  mockUseLeadership.mockReturnValue({
    isLeadership: true,
    area: 'team',
    role: { id: 'role-lider', key: 'lider', name: 'Líder', appAccess: {} },
  })
  mockUseWorkspace.mockReturnValue({ workspace: ws1 })
  mockGetRoleForUser.mockReturnValue({ name: 'Técnico' })
})

describe('LiderHome (Fase 7 — Área do Líder, dados reais)', () => {
  it('estado de carregamento', () => {
    setupOverrides({ loading: true })
    render(
      <MemoryRouter initialEntries={['/lider']}>
        <LiderHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Carregando sua equipe...')).toBeTruthy()
    expect(screen.getByText('Área do Líder')).toBeTruthy()
  })

  it('sem unidade selecionada → pede para escolher (sem inventar dados)', () => {
    mockUseWorkspace.mockReturnValue({ workspace: null })
    setupOverrides({})
    render(
      <MemoryRouter>
        <LiderHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Nenhuma unidade selecionada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Escolher unidade' })).toBeTruthy()
  })

  it('falha ao buscar → tela de erro honesta + retry chama refresh', () => {
    const refresh = vi.fn()
    setupOverrides({ failed: true, refresh })
    render(
      <MemoryRouter>
        <LiderHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Não foi possível carregar sua equipe')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Tentar novamente' })
    retry.click()
    expect(refresh).toHaveBeenCalled()
  })

  it('estado vazio legítimo → honesto, orienta ao administrador', () => {
    setupOverrides({ team: [] })
    render(
      <MemoryRouter>
        <LiderHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Você ainda não tem equipe atribuída')).toBeTruthy()
    expect(screen.getByText(/administrador para configurar a sua equipe/)).toBeTruthy()
  })

  it('mostra a equipe real: unidade, membros, indicadores e carga por cargo', () => {
    setupOverrides({
      team: [
        member('u1', 'Técnico A', 'a@b.com', 'role-technician'),
        member('u2', 'Técnico B', 'b@b.com', 'role-technician'),
      ],
    })
    render(
      <MemoryRouter>
        <LiderHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Área do Líder')).toBeTruthy()
    expect(screen.getByText(/Sua equipe na unidade "Campus A"\./)).toBeTruthy()
    expect(screen.getByText('Membros da equipe')).toBeTruthy()
    expect(screen.getByText('Técnico A')).toBeTruthy()
    expect(screen.getByText('Técnico B')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('membros ativos')).toBeTruthy()
    expect(screen.getByText('2 Técnico')).toBeTruthy()
    expect(screen.getAllByText('Técnico').length).toBeGreaterThanOrEqual(2)
  })

  it('sem CTA de gestão (nenhuma ação além do voltar) — nenhuma funcionalidade falsa', () => {
    setupOverrides({
      team: [member('u1', 'Técnico A', 'a@b.com', 'role-technician')],
    })
    render(
      <MemoryRouter>
        <LiderHome />
      </MemoryRouter>,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].title).toBe('Voltar ao início')
  })
})