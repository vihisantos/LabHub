import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockUseRoles = vi.hoisted(() => ({
  loading: false,
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  roles: [] as Array<Record<string, unknown>>,
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    roles: mockUseRoles.roles,
    loading: mockUseRoles.loading,
    update: mockUseRoles.update,
    create: mockUseRoles.create,
    remove: mockUseRoles.remove,
  }),
}))

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
}))

vi.mock('../../../../core/auth/adminService', () => ({
  adminService: mockAdminService,
}))

// Workspace atual controlável por teste (default: nenhum selecionado → mostra todos)
const mockWorkspaceCtx = vi.hoisted(() => ({
  workspace: null as { id: string; name: string } | null,
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: mockWorkspaceCtx.workspace }),
}))

import { RolesPage } from '../RolesPage'
import type { User } from '../../../../core/auth/types'

const roles = [
  {
    id: 'role-technician',
    key: 'technician',
    name: 'Técnico',
    description: 'Acesso aos aplicativos de operação',
    appAccess: { 'pc-care': 'full', stock: 'full' },
    manageQr: true,
    isDefault: false,
    leaderId: null,
  },
  {
    id: 'role-viewer',
    key: 'viewer',
    name: 'Visualizador',
    description: 'Somente leitura',
    appAccess: {},
    manageQr: false,
    isDefault: true,
    leaderId: null,
  },
]

function makeUser(partial: Partial<User> & Pick<User, 'id' | 'name' | 'email'>): User {
  return {
    roleId: 'role-technician',
    status: 'active',
    workspace_ids: [],
    accent: 'emerald',
    theme_variant: 'dark',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  } as User
}

const moocaUser = makeUser({
  id: 'u-mooca', name: 'Maria Mooca', email: 'maria@mooca.edu.br', workspace_ids: ['ws-mooca'],
})
const sjcUser = makeUser({
  id: 'u-sjc', name: 'José São José', email: 'jose@sjc.edu.br', workspace_ids: ['ws-sjc'],
})
const unassignedUser = makeUser({
  id: 'u-sem-ws', name: 'Paulo Semworkspace', email: 'paulo@semws.edu.br', roleId: 'role-viewer', workspace_ids: [],
})
const superAdminUser = makeUser({
  id: 'u-abs', name: 'Ana Absoluta', email: 'ana@labhub.com', is_super_admin: true, workspace_ids: [],
})

function renderPage() {
  return render(
    <MemoryRouter>
      <RolesPage />
    </MemoryRouter>,
  )
}

describe('RolesPage escopo por workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockWorkspaceCtx.workspace = null
    mockUseRoles.roles = roles
    mockAdminService.listAllProfiles.mockResolvedValue([
      moocaUser, sjcUser, unassignedUser, superAdminUser,
    ])
  })

  it('mostra apenas os membros do workspace atual (admin absoluto e sem workspace sempre visíveis)', async () => {
    mockWorkspaceCtx.workspace = { id: 'ws-mooca', name: 'Campus Mooca' }

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Técnico')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Técnico'))

    // Subordinados do cargo Técnico no workspace Mooca: Maria + Ana absoluta
    // (o nome também aparece no select de líder, por isso getAllByText)
    await waitFor(() => {
      expect(screen.getAllByText('Maria Mooca').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('Ana Absoluta').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('José São José')).toHaveLength(0)
    // Badge de membros conta apenas o escopo (2 = Maria + Ana)
    expect(screen.getByText('2 membros')).toBeInTheDocument()
  })

  it('sem workspace selecionado mostra todos os usuários', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Técnico')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Técnico'))

    await waitFor(() => {
      expect(screen.getAllByText('Maria Mooca').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('José São José').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Paulo Semworkspace').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ana Absoluta').length).toBeGreaterThan(0)
    expect(screen.getByText('3 membros')).toBeInTheDocument()
  })

  it('o seletor de líder só lista usuários do workspace atual', async () => {
    mockWorkspaceCtx.workspace = { id: 'ws-sjc', name: 'Campus São José' }

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Técnico')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Técnico'))

    const select = await screen.findByRole('combobox')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('José São José')
    expect(options).toContain('Paulo Semworkspace')
    expect(options).toContain('Ana Absoluta')
    expect(options).not.toContain('Maria Mooca')
  })

  it('subordinados do cargo refletem a troca de workspace', async () => {
    mockWorkspaceCtx.workspace = { id: 'ws-sjc', name: 'Campus São José' }

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Técnico')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Técnico'))

    await waitFor(() => {
      expect(screen.getAllByText('José São José').length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByText('Maria Mooca')).toHaveLength(0)
    expect(screen.getAllByText('Ana Absoluta').length).toBeGreaterThan(0)
    expect(screen.getByText('2 membros')).toBeInTheDocument()
  })
})
