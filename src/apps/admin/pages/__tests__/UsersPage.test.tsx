import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
  updateUserProfile: vi.fn(),
  updateUserWorkspaces: vi.fn(),
}))

let currentSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.hoisted(() =>
  vi.fn((next: URLSearchParams | Record<string, string>) => {
    currentSearchParams = next instanceof URLSearchParams ? next : new URLSearchParams()
  }),
)

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [currentSearchParams, mockSetSearchParams],
  }
})

vi.mock('../../../../core/auth/adminService', () => ({
  adminService: mockAdminService,
}))

vi.mock('../../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'me',
      name: 'Admin',
      email: 'admin@labhub.com',
      roleId: 'role-technician',
      is_super_admin: true,
      status: 'active',
      workspace_ids: [],
      accent: 'emerald',
      theme_variant: 'dark',
      created_at: '',
      updated_at: '',
    },
  }),
}))

const mockWorkspaceService = vi.hoisted(() => ({
  syncFromSupabase: vi.fn(),
}))

vi.mock('../../../../core/workspaces/service', () => ({
  workspaceService: mockWorkspaceService,
}))

// Workspace atual controlável por teste (default: nenhum selecionado → mostra todos)
const mockWorkspaceCtx = vi.hoisted(() => ({
  workspace: null as { id: string; name: string } | null,
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: mockWorkspaceCtx.workspace }),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    loading: false,
    roles: [
      { id: 'role-technician', key: 'technician', name: 'Técnico', appAccess: { reservalab: 'full' }, isDefault: false },
      { id: 'role-viewer', key: 'viewer', name: 'Visualizador', appAccess: { reservalab: 'read' }, isDefault: true },
    ],
  }),
  useAppAccess: () => ({ getLevel: () => 'full' }),
}))

import { UsersPage } from '../UsersPage'
import type { User } from '../../../../core/auth/types'

const pendingUser: User = {
  id: 'u-123',
  email: 'joao@escola.edu.br',
  name: 'João Silva',
  roleId: 'role-viewer',
  status: 'pending',
  workspace_ids: [],
  accent: 'emerald',
  theme_variant: 'dark',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  )
}

// Acha a linha de um app no modal pelo nome — a linha é o primeiro ancestral com a
// classe `rounded-lg` (acoplamento à classe CSS do componente; se ela mudar, ajustar aqui).
function appRow(name: string): HTMLElement {
  return screen.getByText(name).closest('div.rounded-lg') as HTMLElement
}

describe('UsersPage deep link', () => {
  const workspaces = [
    { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: 'São Paulo', spreadsheet_url: '', created_at: '', updated_at: '' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    currentSearchParams = new URLSearchParams()
    mockAdminService.listAllProfiles.mockResolvedValue([pendingUser])
    mockAdminService.approveUser.mockResolvedValue(true)
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)
  })

  afterEach(() => {
    vi.useFakeTimers()
  })

  it('abre o modal de aprovação quando ?pending=<id> corresponde a um usuário pendente', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Aprovar e conceder acesso' })).toBeInTheDocument()
    expect(mockSetSearchParams).toHaveBeenCalledWith({}, { replace: true })
  })

  it('não abre o modal quando ?pending=<id> não corresponde a um pendente', async () => {
    currentSearchParams.set('pending', 'nao-existe')

    renderPage()

    await waitFor(() => {
      expect(mockAdminService.listAllProfiles).toHaveBeenCalled()
    })
    expect(screen.queryByText('Aprovar cadastro')).not.toBeInTheDocument()
  })

  it('confirma a aprovação com cargo, app_access e campus obrigatório', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })

    // Sem campus selecionado, o botão de aprovar fica desabilitado
    expect(screen.getByRole('button', { name: 'Aprovar e conceder acesso' })).toBeDisabled()
    expect(screen.getByText('Selecione ao menos um campus para aprovar.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Técnico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))
    expect(screen.getByRole('button', { name: 'Aprovar e conceder acesso' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e conceder acesso' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123', {
        roleId: 'role-technician',
        app_access: {},
        workspace_ids: ['ws-mooca'],
      })
    })
  })

  it('permite sobrescrever o acesso por aplicativo no modal de aprovação', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })

    // Sobrescreve o ReservaLab para "Sem acesso" e o Chamados para "Só leitura"
    fireEvent.change(within(appRow('ReservaLab')).getByRole('combobox'), { target: { value: 'none' } })
    fireEvent.change(within(appRow('Chamados')).getByRole('combobox'), { target: { value: 'read' } })

    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e conceder acesso' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123', {
        roleId: 'role-viewer',
        app_access: { reservalab: 'none', chamados: 'read' },
        workspace_ids: ['ws-mooca'],
      })
    })
  })

  it('mostra o nível de acesso padrão do cargo em cada app do modal', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })

    // Cargo padrão é Visualizador → ReservaLab (padrão 'read') mostra "Cargo: Só leitura"
    expect(screen.getByText('Cargo: Só leitura')).toBeInTheDocument()

    // Ao trocar para Técnico, o padrão do ReservaLab (padrão 'full') vira "Acesso total"
    fireEvent.click(screen.getByRole('button', { name: 'Técnico' }))
    expect(screen.getByText('Cargo: Acesso total')).toBeInTheDocument()
    expect(screen.queryByText('Cargo: Só leitura')).not.toBeInTheDocument()
  })

  it('remove um override ao voltar para "Padrão do cargo"', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })

    // Primeiro sobrescreve o ReservaLab, depois volta para o padrão do cargo
    fireEvent.change(within(appRow('ReservaLab')).getByRole('combobox'), { target: { value: 'none' } })
    fireEvent.change(within(appRow('ReservaLab')).getByRole('combobox'), { target: { value: 'inherit' } })

    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e conceder acesso' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123', {
        roleId: 'role-viewer',
        app_access: {},
        workspace_ids: ['ws-mooca'],
      })
    })
  })
})

describe('UsersPage fluxo completo', () => {
  const workspaces = [
    { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: 'São Paulo', spreadsheet_url: '', created_at: '', updated_at: '' },
    { id: 'ws-sjc', name: 'Campus São José', slug: 'sjc', location: 'São José dos Campos', spreadsheet_url: '', created_at: '', updated_at: '' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    currentSearchParams = new URLSearchParams()
    mockWorkspaceCtx.workspace = null
    mockAdminService.listAllProfiles.mockResolvedValue([pendingUser])
    mockAdminService.approveUser.mockResolvedValue(true)
    mockAdminService.rejectUser.mockResolvedValue(true)
    mockAdminService.updateUserWorkspaces.mockResolvedValue(true)
    mockAdminService.updateUserProfile.mockResolvedValue(true)
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)
  })

  afterEach(() => {
    vi.useFakeTimers()
  })

  it('aprova um usuário pendente com campus obrigatório e ajusta os workspaces pela interface', async () => {
    renderPage()

    // 1. Usuário pendente aparece na seção de aprovações
    await waitFor(() => {
      expect(screen.getByText('Aprovações Pendentes (1)')).toBeInTheDocument()
    })

    // 2. Abre o modal de aprovação a partir da lista
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()

    // 3. Escolhe o cargo Técnico + campus obrigatório e confirma
    fireEvent.click(screen.getByRole('button', { name: 'Técnico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e conceder acesso' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123', {
        roleId: 'role-technician',
        app_access: {},
        workspace_ids: ['ws-mooca'],
      })
    })

    // 4. Modal fecha e o usuário vira ativo com feedback de sucesso
    await waitFor(() => {
      expect(screen.queryByText('Aprovar cadastro')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Usuário aprovado como Técnico')).toBeInTheDocument()

    // 5. Expande o card do usuário ativo (botão de cargo)
    // Restrição: /Técnico/ só é único enquanto o card está fechado — após expandir,
    // a seção "Cargo" renderiza outro botão com o mesmo nome.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Técnico/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Técnico/ }))

    // 6. O campus escolhido na aprovação já aparece; adiciona o segundo pela interface
    expect(screen.getByText(/Workspaces \(1 de 2\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Campus São José/ }))

    await waitFor(() => {
      expect(mockAdminService.updateUserWorkspaces).toHaveBeenCalledWith('u-123', ['ws-mooca', 'ws-sjc'])
    })
    expect(screen.getByText('Acesso concedido')).toBeInTheDocument()
    expect(screen.getByText(/Workspaces \(2 de 2\)/)).toBeInTheDocument()
  })

  it('permite remover o acesso do usuário a um workspace', async () => {
    // Usuário já ativo com acesso ao Campus Mooca
    mockAdminService.listAllProfiles.mockResolvedValue([
      { ...pendingUser, status: 'active', roleId: 'role-technician', workspace_ids: ['ws-mooca'] },
    ])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Técnico/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Técnico/ }))

    expect(screen.getByText(/Workspaces \(1 de 2\)/)).toBeInTheDocument()

    // Remove o acesso clicando no mesmo workspace
    fireEvent.click(screen.getByRole('button', { name: /Campus Mooca/ }))

    await waitFor(() => {
      expect(mockAdminService.updateUserWorkspaces).toHaveBeenCalledWith('u-123', [])
    })
    expect(screen.getByText('Acesso removido')).toBeInTheDocument()
    expect(screen.getByText(/Workspaces \(0 de 2\)/)).toBeInTheDocument()
  })

  it('mostra erro quando a atribuição de workspace falha', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([
      { ...pendingUser, status: 'active', roleId: 'role-technician' },
    ])
    mockAdminService.updateUserWorkspaces.mockResolvedValue(false)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Técnico/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Técnico/ }))

    fireEvent.click(screen.getByRole('button', { name: /Campus Mooca/ }))

    await waitFor(() => {
      expect(mockAdminService.updateUserWorkspaces).toHaveBeenCalledWith('u-123', ['ws-mooca'])
    })
    expect(screen.getByText('Erro ao atualizar workspaces')).toBeInTheDocument()
    // Estado não muda: o usuário continua sem acesso ao campus
    expect(screen.getByText(/Workspaces \(0 de 2\)/)).toBeInTheDocument()
  })

  it('permite sobrescrever o acesso por aplicativo no card do usuário', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([
      { ...pendingUser, status: 'active', roleId: 'role-technician' },
    ])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Técnico/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Técnico/ }))

    // Padrão do cargo (Técnico → ReservaLab 'full') aparece no label; o select começa no padrão
    expect(screen.getByText('Cargo: Acesso total')).toBeInTheDocument()
    expect(within(appRow('ReservaLab')).getByRole('combobox')).toHaveValue('inherit')

    // Sobrescreve o ReservaLab para "Sem acesso"
    fireEvent.change(within(appRow('ReservaLab')).getByRole('combobox'), { target: { value: 'none' } })

    await waitFor(() => {
      expect(mockAdminService.updateUserProfile).toHaveBeenCalledWith('u-123', {
        app_access: { reservalab: 'none' },
      })
      // Semântica de "sobrescreve o cargo": label segue o padrão do cargo, select reflete o override
      expect(screen.getByText('Acesso individual atualizado')).toBeInTheDocument()
      expect(screen.getByText('Cargo: Acesso total')).toBeInTheDocument()
      expect(within(appRow('ReservaLab')).getByRole('combobox')).toHaveValue('none')
    })
  })

  it('restaura o acesso ao cargo ao voltar para "Padrão do cargo"', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([
      { ...pendingUser, status: 'active', roleId: 'role-technician', app_access: { reservalab: 'none' } },
    ])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Técnico/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Técnico/ }))

    // Select já vem com o override aplicado
    expect(within(appRow('ReservaLab')).getByRole('combobox')).toHaveValue('none')

    fireEvent.change(within(appRow('ReservaLab')).getByRole('combobox'), { target: { value: 'inherit' } })

    await waitFor(() => {
      expect(mockAdminService.updateUserProfile).toHaveBeenCalledWith('u-123', { app_access: {} })
    })
    expect(screen.getByText('Acesso restaurado para o padrão do cargo')).toBeInTheDocument()
    expect(within(appRow('ReservaLab')).getByRole('combobox')).toHaveValue('inherit')
  })

  it('mostra erro quando a atualização de acesso por app falha', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([
      { ...pendingUser, status: 'active', roleId: 'role-technician' },
    ])
    mockAdminService.updateUserProfile.mockResolvedValue(false)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Técnico/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Técnico/ }))

    fireEvent.change(within(appRow('ReservaLab')).getByRole('combobox'), { target: { value: 'none' } })

    await waitFor(() => {
      // O override é calculado mesmo quando a API falha
      expect(mockAdminService.updateUserProfile).toHaveBeenCalledWith('u-123', {
        app_access: { reservalab: 'none' },
      })
      expect(screen.getByText('Erro ao atualizar acesso')).toBeInTheDocument()
      // Estado não muda: o select continua no padrão do cargo
      expect(within(appRow('ReservaLab')).getByRole('combobox')).toHaveValue('inherit')
    })
  })

  it('rejeita um usuário pendente', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovações Pendentes (1)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar' }))

    await waitFor(() => {
      expect(mockAdminService.rejectUser).toHaveBeenCalledWith('u-123')
    })
    expect(screen.getByText('Usuário rejeitado e removido')).toBeInTheDocument()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })
})

describe('UsersPage escopo por workspace', () => {
  const workspaces = [
    { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: 'São Paulo', spreadsheet_url: '', created_at: '', updated_at: '' },
    { id: 'ws-sjc', name: 'Campus São José', slug: 'sjc', location: 'São José dos Campos', spreadsheet_url: '', created_at: '', updated_at: '' },
  ]

  const moocaUser: User = {
    ...pendingUser,
    id: 'u-mooca',
    name: 'Maria Mooca',
    email: 'maria@mooca.edu.br',
    status: 'active',
    roleId: 'role-technician',
    workspace_ids: ['ws-mooca'],
  }
  const sjcUser: User = {
    ...pendingUser,
    id: 'u-sjc',
    name: 'José São José',
    email: 'jose@sjc.edu.br',
    status: 'active',
    roleId: 'role-technician',
    workspace_ids: ['ws-sjc'],
  }
  const unassignedUser: User = {
    ...pendingUser,
    id: 'u-sem-ws',
    name: 'Paulo Semworkspace',
    email: 'paulo@semws.edu.br',
    status: 'active',
    roleId: 'role-viewer',
    workspace_ids: [],
  }
  const superAdminUser: User = {
    ...pendingUser,
    id: 'u-abs',
    name: 'Ana Absoluta',
    email: 'ana@labhub.com',
    status: 'active',
    roleId: 'role-technician',
    is_super_admin: true,
    workspace_ids: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    currentSearchParams = new URLSearchParams()
    mockWorkspaceCtx.workspace = null
    mockAdminService.listAllProfiles.mockResolvedValue([moocaUser, sjcUser, unassignedUser, superAdminUser])
    mockAdminService.updateUserWorkspaces.mockResolvedValue(true)
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)
  })

  afterEach(() => {
    vi.useFakeTimers()
  })

  it('mostra apenas os usuários do workspace atual (admin absoluto sempre visível)', async () => {
    mockWorkspaceCtx.workspace = workspaces[0] // Campus Mooca

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    expect(screen.getByText('Ana Absoluta')).toBeInTheDocument()
    expect(screen.getByText('Paulo Semworkspace')).toBeInTheDocument()
    expect(screen.queryByText('José São José')).not.toBeInTheDocument()
    // O contador reflete o escopo (3 = mooca + absoluto + sem workspace)
    expect(screen.getByText('3 usuários em Campus Mooca')).toBeInTheDocument()
  })

  it('sem workspace selecionado mostra todos os usuários', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    expect(screen.getByText('José São José')).toBeInTheDocument()
    expect(screen.getByText('Paulo Semworkspace')).toBeInTheDocument()
    expect(screen.getByText('Ana Absoluta')).toBeInTheDocument()
    expect(screen.getByText('4 usuários no sistema')).toBeInTheDocument()
  })

  it('ao trocar de workspace, a lista acompanha', async () => {
    mockWorkspaceCtx.workspace = workspaces[1] // Campus São José

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('José São José')).toBeInTheDocument()
    })
    expect(screen.queryByText('Maria Mooca')).not.toBeInTheDocument()
    expect(screen.getByText('Ana Absoluta')).toBeInTheDocument()
    expect(screen.getByText('Paulo Semworkspace')).toBeInTheDocument()
    expect(screen.getByText('3 usuários em Campus São José')).toBeInTheDocument()
  })

  it('usuários pendentes continuam visíveis para aprovação em qualquer workspace', async () => {
    mockWorkspaceCtx.workspace = workspaces[0]
    mockAdminService.listAllProfiles.mockResolvedValue([moocaUser, sjcUser, pendingUser])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovações Pendentes (1)')).toBeInTheDocument()
    })
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    // Ativos do workspace atual aparecem; o de outro workspace não
    expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    expect(screen.queryByText('José São José')).not.toBeInTheDocument()
  })
})
