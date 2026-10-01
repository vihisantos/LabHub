import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
  setMembership: vi.fn(),
  removeMembership: vi.fn(),
  setMembershipManager: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'u-123' }) }
})

vi.mock('../../../../core/auth/adminService', () => ({
  adminService: mockAdminService,
}))

vi.mock('../../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'me',
      name: 'Admin',
      is_super_admin: true,
      status: 'active',
      workspace_ids: [],
    },
  }),
}))

const mockWorkspaceService = vi.hoisted(() => ({ syncFromSupabase: vi.fn() }))
vi.mock('../../../../core/workspaces/service', () => ({
  workspaceService: mockWorkspaceService,
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: null }),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    roles: [
      { id: 'role-technician', name: 'Técnico', isDefault: false },
      { id: 'role-viewer', name: 'Visualizador', isDefault: true },
      { id: 'role-lider', name: 'Líder', isDefault: false },
      { id: 'role-admin', name: 'Admin de Workspace', isDefault: false },
      { id: 'role-coordinator', name: 'Coordenador', isDefault: false },
    ],
    loading: false,
  }),
}))

const mockGetByUser = vi.hoisted(() => vi.fn())
const mockResolveRoleInfo = vi.hoisted(() => vi.fn())

// Isola a leitura de memberships (RLS); funções puras seguem reais.
vi.mock('../../../../core/memberships/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../core/memberships/service')>()
  return {
    ...actual,
    membershipService: {
      ...actual.membershipService,
      getByUser: mockGetByUser,
      resolveRoleInfo: mockResolveRoleInfo,
    },
    attachMemberships: async (users: any[]) =>
      Promise.all(
        users.map(async (u) => {
          try {
            const rows = await mockGetByUser(u.id)
            return { ...u, memberships: rows, membershipsLoaded: true }
          } catch {
            return { ...u, membershipsLoaded: false }
          }
        }),
      ),
  }
})

function mockMembershipsFromFixtures(users: { id: string; memberships?: unknown[] }[]) {
  mockGetByUser.mockImplementation(async (userId: string) => {
    const u = users.find((x) => x.id === userId)
    return (u?.memberships ?? []) as never[]
  })
}

const mockGetActorLogs = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/logs/useServerLogs', () => ({
  useActorLogs: (actorId: string) => ({
    logs: mockGetActorLogs(actorId) ?? [],
    loading: false,
    reload: vi.fn(),
  }),
}))

import { UserDetailPage } from '../UserDetailPage'
import type { User } from '../../../../core/auth/types'

const activeUser: User = {
  id: 'u-123',
  email: 'maria@mooca.edu.br',
  name: 'Maria Mooca',
  roleId: 'role-technician',
  status: 'active',
  workspace_ids: [],
  memberships: [
    {
      id: 'm-u-123-ws-mooca',
      profile_id: 'u-123',
      workspace_id: 'ws-mooca',
      role_id: 'r-a',
      status: 'active',
      managed_by: null,
      created_at: '',
      updated_at: '',
    },
  ],
  membershipsLoaded: true,
  accent: 'emerald',
  theme_variant: 'dark',
  created_at: '2024-01-10T00:00:00.000Z',
  updated_at: '2024-01-10T00:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UserDetailPage />
    </MemoryRouter>,
  )
}

describe('UserDetailPage', () => {
  const workspaces = [
    { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: 'São Paulo', spreadsheet_url: '', created_at: '', updated_at: '' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockAdminService.listAllProfiles.mockResolvedValue([activeUser])
    mockMembershipsFromFixtures([activeUser])
    mockAdminService.setMembership.mockResolvedValue({
      id: 'm-u-123-ws-mooca', profile_id: 'u-123', workspace_id: 'ws-mooca',
      role_id: 'r-b', status: 'active', managed_by: null, created_at: '', updated_at: '',
    })
    mockAdminService.removeMembership.mockResolvedValue(true)
    mockAdminService.setMembershipManager.mockResolvedValue({
      id: 'm-u-123-ws-mooca', profile_id: 'u-123', workspace_id: 'ws-mooca',
      role_id: 'r-a', status: 'active', managed_by: 'm-lider', created_at: '', updated_at: '',
    })
    mockResolveRoleInfo.mockImplementation(async (ids: string[]) => {
      const map = new Map()
      for (const id of ids) {
        if (id === 'r-a') map.set(id, { slug: 'tec', name: 'Técnico' })
        else if (id === 'r-b') map.set(id, { slug: 'lider', name: 'Líder' })
      }
      return map
    })
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)
    mockGetActorLogs.mockReturnValue([])
  })

  it('mostra o cabeçalho da pessoa com nome, e-mail, status e cargo', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    expect(screen.getByText('maria@mooca.edu.br')).toBeInTheDocument()
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    expect(screen.getAllByText('Técnico').length).toBeGreaterThanOrEqual(1)
  })

  it('não oferece mais edição legacy e mantém o cargo em modo somente leitura', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    // F2-B: a edição de "Cargo de acesso" e "Acesso por aplicativo" foi removida.
    expect(screen.queryByText('Cargo de acesso')).not.toBeInTheDocument()
    expect(screen.queryByText('Acesso por aplicativo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    // A leitura do cargo segue presente como informação (badge read-only).
    expect(screen.getAllByText('Técnico').length).toBeGreaterThanOrEqual(1)
    // O caminho RBAC2 por unidade continua intacto.
    expect(screen.getByText('Configuração de acesso')).toBeInTheDocument()
  })

  it('mostra estado vazio de atividade quando não há logs', async () => {
    mockGetActorLogs.mockReturnValue([])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Atividade')).toBeInTheDocument()
    })
    expect(screen.getByText('Nenhuma atividade registrada.')).toBeInTheDocument()
  })

  it('mostra aprovação/rejeição para usuário pendente', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([{ ...activeUser, status: 'pending', roleId: 'role-viewer' }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Recusar solicitação' })).toBeInTheDocument()
    expect(screen.getByText('Esta conta aguarda aprovação da administração.')).toBeInTheDocument()
  })

  it('aprova a conta direto (sem campus/cargo): approveUser recebe só o id', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([{ ...activeUser, status: 'pending', roleId: 'role-viewer' }])
    mockAdminService.approveUser.mockResolvedValue(true)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123')
    })
    expect(mockAdminService.approveUser).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Conta aprovada — acesso ainda não configurado')).toBeInTheDocument()
  })

  it('conta ativa sem membership mostra "acesso ainda não configurado"', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([{
      ...activeUser,
      status: 'active',
      memberships: [],
      membershipsLoaded: true,
    }])
    mockMembershipsFromFixtures([{ id: 'u-123', memberships: [] }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    expect(screen.getByText('Conta aprovada')).toBeInTheDocument()
    expect(screen.getByText('Acesso ainda não configurado.')).toBeInTheDocument()
  })

  it('conta pendente não mostra configuração de acesso', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([{ ...activeUser, status: 'pending', roleId: 'role-viewer' }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    })
    // Nenhum controle de acesso antes da aprovação
    expect(screen.queryByText('Configuração de acesso')).not.toBeInTheDocument()
    expect(screen.queryByText('Cargo de acesso')).not.toBeInTheDocument()
    expect(screen.queryByText('Acesso por aplicativo')).not.toBeInTheDocument()
  })

  it('conta ativa sem membership pode iniciar configuração', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([{
      ...activeUser,
      status: 'active',
      memberships: [],
      membershipsLoaded: true,
    }])
    mockMembershipsFromFixtures([{ id: 'u-123', memberships: [] }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Nenhuma unidade configurada ainda.')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Adicionar unidade' })).toBeInTheDocument()
  })

  it('adicionar unidade chama setMembership com unidade + cargo', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([{
      ...activeUser,
      status: 'active',
      memberships: [],
      membershipsLoaded: true,
    }])
    mockMembershipsFromFixtures([{ id: 'u-123', memberships: [] }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Adicionar unidade' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar unidade' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      expect(mockAdminService.setMembership).toHaveBeenCalledWith('u-123', 'ws-mooca', 'role-viewer')
    })
    expect(screen.getByText('Unidade adicionada')).toBeInTheDocument()
  })

  it('cada unidade tem seu cargo; trocar chama setMembership só daquela unidade', async () => {
    const sjcMembership = {
      id: 'm-u-123-ws-sjc', profile_id: 'u-123', workspace_id: 'ws-sjc',
      role_id: 'r-b', status: 'active', managed_by: null, created_at: '', updated_at: '',
    }
    const twoUnits = {
      ...activeUser,
      memberships: [...(activeUser.memberships ?? []), sjcMembership],
      membershipsLoaded: true,
    }
    mockAdminService.listAllProfiles.mockResolvedValue([twoUnits])
    mockMembershipsFromFixtures([{ id: 'u-123', memberships: twoUnits.memberships }])
    mockWorkspaceService.syncFromSupabase.mockResolvedValue([
      ...workspaces,
      { id: 'ws-sjc', name: 'Campus São José', slug: 'sjc', location: '', spreadsheet_url: '', created_at: '', updated_at: '' },
    ])

    renderPage()

    // Mooca = Técnico, São José = Líder (cargos diferentes por unidade)
    const moocaRole = await screen.findByRole('combobox', { name: 'Cargo em Campus Mooca' })
    const sjcRole = await screen.findByRole('combobox', { name: 'Cargo em Campus São José' })
    // O nome/slug do cargo vem de roleInfo, que é assíncrono: até resolver, o
    // select mostra o placeholder "…". findByRole só garante que o <select>
    // existe, então a espera é pelo VALOR — sem isso a asserção roda antes do
    // resolveRoleInfo e falha com ["…"].
    await waitFor(() => {
      expect(moocaRole).toHaveDisplayValue('Técnico')
      expect(sjcRole).toHaveDisplayValue('Líder')
    })

    fireEvent.change(sjcRole, { target: { value: 'role-technician' } })

    await waitFor(() => {
      expect(mockAdminService.setMembership).toHaveBeenCalledWith('u-123', 'ws-sjc', 'role-technician')
    })
    expect(mockAdminService.setMembership).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Cargo atualizado')).toBeInTheDocument()
  })

  it('remover uma unidade não remove as demais', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    try {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Cargo em Campus Mooca' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: 'Remover' }))

      await waitFor(() => {
        expect(mockAdminService.removeMembership).toHaveBeenCalledWith('u-123', 'ws-mooca')
      })
      expect(screen.getByText('Acesso removido')).toBeInTheDocument()
    } finally {
      confirmSpy.mockRestore()
    }
  })

  it('remover cancelado não chama o endpoint', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    try {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Cargo em Campus Mooca' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: 'Remover' }))

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalled()
      })
      expect(mockAdminService.removeMembership).not.toHaveBeenCalled()
    } finally {
      confirmSpy.mockRestore()
    }
  })

  it('trocar responsável chama setMembershipManager da unidade', async () => {
    const liderUser = {
      ...activeUser,
      id: 'u-lider',
      name: 'Líder Léo',
      email: 'leo@mooca.edu.br',
      roleId: 'role-lider',
      memberships: [{
        id: 'm-lider-ws-mooca', profile_id: 'u-lider', workspace_id: 'ws-mooca',
        role_id: 'r-b', status: 'active', managed_by: null, created_at: '', updated_at: '',
      }],
      membershipsLoaded: true,
    }
    mockAdminService.listAllProfiles.mockResolvedValue([activeUser, liderUser])
    mockMembershipsFromFixtures([activeUser, liderUser])

    renderPage()

    // Aguarda os candidatos (dependem de roleInfo assíncrono)
    await screen.findByRole('option', { name: 'Líder Léo · Líder' })
    const managerSelect = await screen.findByRole('combobox', { name: 'Responsável em Campus Mooca' })
    expect(managerSelect).toHaveDisplayValue('Sem responsável')
    fireEvent.change(managerSelect, {
      target: { value: 'm-lider-ws-mooca' },
    })

    await waitFor(() => {
      expect(mockAdminService.setMembershipManager).toHaveBeenCalledWith(
        'u-123', 'ws-mooca', 'm-lider-ws-mooca',
      )
    })
    expect(screen.getByText('Responsável atualizado')).toBeInTheDocument()
  })

  it('só cargos de liderança são oferecidos como responsável', async () => {
    const tecUser = {
      ...activeUser,
      id: 'u-tec',
      name: 'Téc Nico',
      email: 'nico@mooca.edu.br',
      roleId: 'role-technician',
      memberships: [{
        id: 'm-tec-ws-mooca', profile_id: 'u-tec', workspace_id: 'ws-mooca',
        role_id: 'r-a', status: 'active', managed_by: null, created_at: '', updated_at: '',
      }],
      membershipsLoaded: true,
    }
    mockAdminService.listAllProfiles.mockResolvedValue([activeUser, tecUser])
    mockMembershipsFromFixtures([activeUser, tecUser])

    renderPage()

    // O filtro roda após carregar os cargos (não confundir com "ainda carregando")
    await waitFor(() => {
      expect(mockResolveRoleInfo).toHaveBeenCalled()
    })
    const managerSelect = await screen.findByRole('combobox', { name: 'Responsável em Campus Mooca' })
    // Técnico não é liderança (trigger 045+046) → só "Sem responsável"
    expect(managerSelect.querySelectorAll('option')).toHaveLength(1)
    expect(screen.queryByText(/Nico/)).not.toBeInTheDocument()
  })
})
