import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'

vi.mock('../../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      name: 'Admin',
      roleId: 'admin',
      accent: 'indigo',
      avatar: null,
      is_super_admin: true,
      workspace_ids: ['ws-1'],
      notify_settings: {},
    },
    signOut: vi.fn(),
  }),
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: { id: 'ws-1', name: 'Lab A', location: 'Sala 101' },
    workspaces: [{ id: 'ws-1', name: 'Lab A', location: 'Sala 101' }],
  }),
}))

vi.mock('../../../../core/notifications/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../../../../lib/useFastSync', () => ({
  useFastSync: () => {},
}))
// O ThemeProvider assina realtime em 'profiles' quando há usuário — sem esse
// mock, o teste abre um WebSocket real do Supabase (quebra com fake timers).
vi.mock('../../../../lib/useRealtimeSubscription', () => ({
  useRealtimeSubscription: () => {},
}))

vi.mock('../../../../apps/reservalab/components/PushNotificationButton', () => ({
  PushNotificationButton: () => null,
}))

import { AdminLayout } from '../AdminLayout'

function isActive(label: string): boolean {
  const btn = screen.getByText(label).closest('button')
  expect(btn).not.toBeNull()
  return btn!.classList.contains('text-indigo-500')
}

describe('AdminLayout', () => {
  it('renderiza os itens de navegação e o menu "Mais"', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Usuários')).toBeInTheDocument()
    expect(screen.getByText('Permissões')).toBeInTheDocument()
    expect(screen.getByText('Notificações')).toBeInTheDocument()
    expect(screen.getByText('Configurações')).toBeInTheDocument()
    expect(screen.getByLabelText('Mais opções')).toBeInTheDocument()
  })

  it('destaca somente o Dashboard na raiz /admin', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    expect(isActive('Dashboard')).toBe(true)
    expect(isActive('Usuários')).toBe(false)
    expect(isActive('Permissões')).toBe(false)
    expect(isActive('Notificações')).toBe(false)
    expect(isActive('Configurações')).toBe(false)
  })

  it('em /admin/users destaca somente Usuários (Dashboard não fica selecionado)', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin/users'] })

    expect(isActive('Usuários')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Permissões')).toBe(false)
    expect(isActive('Notificações')).toBe(false)
    expect(isActive('Configurações')).toBe(false)
  })

  it('em /admin/roles destaca somente Permissões', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin/roles'] })

    expect(isActive('Permissões')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Usuários')).toBe(false)
    expect(isActive('Notificações')).toBe(false)
    expect(isActive('Configurações')).toBe(false)
  })

  it('em /admin/notifications destaca somente Notificações', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin/notifications'] })

    expect(isActive('Notificações')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Usuários')).toBe(false)
    expect(isActive('Permissões')).toBe(false)
    expect(isActive('Configurações')).toBe(false)
  })

  it('em /admin/settings destaca somente Configurações', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin/settings'] })

    expect(isActive('Configurações')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Usuários')).toBe(false)
    expect(isActive('Permissões')).toBe(false)
    expect(isActive('Notificações')).toBe(false)
  })

  it('em rota do menu "Mais" mostra o item ativo no botão e desativa o Dashboard', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin/backups'] })

    const moreBtn = screen.getByLabelText('Mais opções')
    expect(moreBtn).toHaveTextContent('Backups')
    expect(moreBtn.classList.contains('text-indigo-500')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
  })
})
