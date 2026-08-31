import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
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
  it('renderiza as cinco áreas principais da navegação', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    expect(screen.getByLabelText('Início')).toBeInTheDocument()
    expect(screen.getByLabelText('Pessoas')).toBeInTheDocument()
    expect(screen.getByLabelText('Acesso')).toBeInTheDocument()
    expect(screen.getByLabelText('Alertas')).toBeInTheDocument()
    expect(screen.getByLabelText('Mais')).toBeInTheDocument()
  })

  it('destaca somente Início na raiz /admin', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    expect(isActive('Início')).toBe(true)
    expect(isActive('Pessoas')).toBe(false)
    expect(isActive('Acesso')).toBe(false)
    expect(isActive('Alertas')).toBe(false)
    expect(isActive('Mais')).toBe(false)
  })

  it('em /admin/users destaca Pessoas (e também em subrotas/users/:id e requests)', () => {
    for (const route of ['/admin/users', '/admin/users/u-1', '/admin/requests']) {
      const { unmount } = renderWithProviders(<AdminLayout />, { initialEntries: [route] })
      expect(isActive('Pessoas'), `rota ${route}`).toBe(true)
      expect(isActive('Início')).toBe(false)
      unmount()
    }
  })

  it('em /admin/roles destaca somente Acesso', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin/roles'] })

    expect(isActive('Acesso')).toBe(true)
    expect(isActive('Início')).toBe(false)
    expect(isActive('Pessoas')).toBe(false)
    expect(isActive('Alertas')).toBe(false)
    expect(isActive('Mais')).toBe(false)
  })

  it('em /admin/notifications e /admin/logs destaca somente Alertas', () => {
    for (const route of ['/admin/notifications', '/admin/logs']) {
      const { unmount } = renderWithProviders(<AdminLayout />, { initialEntries: [route] })
      expect(isActive('Alertas'), `rota ${route}`).toBe(true)
      expect(isActive('Início')).toBe(false)
      unmount()
    }
  })

  it('em /admin/settings, /admin/backups, /admin/workspaces e /admin/profile destaca Mais', () => {
    for (const route of ['/admin/settings', '/admin/backups', '/admin/workspaces', '/admin/profile']) {
      const { unmount } = renderWithProviders(<AdminLayout />, { initialEntries: [route] })
      expect(isActive('Mais'), `rota ${route}`).toBe(true)
      expect(isActive('Início')).toBe(false)
      unmount()
    }
  })

  it('o menu Mais lista Configurações, Workspaces, Backups e Perfil', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    fireEvent.click(screen.getByLabelText('Mais'))
    expect(screen.getByText('Configurações')).toBeInTheDocument()
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.getByText('Backups')).toBeInTheDocument()
    expect(screen.getByText('Perfil')).toBeInTheDocument()
  })

  it('o menu Pessoas lista Usuários e Solicitações', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    fireEvent.click(screen.getByLabelText('Pessoas'))
    expect(screen.getByText('Usuários')).toBeInTheDocument()
    expect(screen.getByText('Solicitações')).toBeInTheDocument()
  })

  it('o menu Alertas lista Notificações e Auditoria', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    fireEvent.click(screen.getByLabelText('Alertas'))
    expect(screen.getByText('Notificações')).toBeInTheDocument()
    expect(screen.getByText('Auditoria')).toBeInTheDocument()
  })

  it('no Dashboard (/admin) o nome do Workspace não se repete (Hero assume a apresentação)', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin'] })

    expect(screen.queryByText('Lab A')).not.toBeInTheDocument()
    expect(screen.queryByText('Sala 101')).not.toBeInTheDocument()
  })

  it('nas demais páginas o nome do Workspace permanece no header', () => {
    renderWithProviders(<AdminLayout />, { initialEntries: ['/admin/users'] })

    expect(screen.getByText('Lab A')).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
  })
})
