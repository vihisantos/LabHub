import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { renderWithProviders } from '../../../test/helpers'

const mockUseTickets = vi.hoisted(() => vi.fn())
const mockUseStock = vi.hoisted(() => vi.fn())
const mockUseKits = vi.hoisted(() => vi.fn())
const mockUseMovements = vi.hoisted(() => vi.fn())
const mockUseIsMobile = vi.hoisted(() => vi.fn())

vi.mock('../../../apps/chamados/hooks/useTickets', () => ({ useTickets: mockUseTickets }))
vi.mock('../../../apps/stock/hooks/useStock', () => ({ useStock: mockUseStock }))
vi.mock('../../../apps/stock/hooks/useKits', () => ({ useKits: mockUseKits }))
vi.mock('../../../apps/stock/hooks/useMovements', () => ({ useMovements: mockUseMovements }))
vi.mock('../../../apps/pcare/services/partService', () => ({
  partService: { getAll: vi.fn(() => []) },
}))
vi.mock('../../../apps/pcare/services/maintenanceService', () => ({
  maintenanceService: { getAll: vi.fn(() => []) },
}))
vi.mock('../../../core/auth/AuthContext', () => ({
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
vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: { id: 'ws-1', name: 'Lab A', location: 'Sala 101' },
    workspaces: [{ id: 'ws-1', name: 'Lab A', location: 'Sala 101' }],
  }),
}))
vi.mock('../../../core/notifications/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}))
vi.mock('../../../lib/useFastSync', () => ({
  useFastSync: () => {},
}))
// O ThemeProvider assina realtime em 'profiles' quando há usuário — sem esse
// mock, o teste abre um WebSocket real do Supabase (quebra com fake timers).
vi.mock('../../../lib/useRealtimeSubscription', () => ({
  useRealtimeSubscription: () => {},
}))
vi.mock('../../../apps/reservalab/components/PushNotificationButton', () => ({
  PushNotificationButton: () => null,
}))

// ReservaLab Navbar
vi.mock('../../../apps/reservalab/hooks/useIsMobile', () => ({ useIsMobile: mockUseIsMobile }))

// TV AdminView — hooks (evita Supabase/realtime nos testes)
vi.mock('../../../apps/tv/hooks/useEvents', () => ({
  useAllEvents: () => ({ events: [], loading: false, add: vi.fn(), edit: vi.fn(), remove: vi.fn() }),
}))
vi.mock('../../../apps/tv/hooks/usePlaylists', () => ({
  useAllPlaylists: () => ({ playlists: [], loading: false, add: vi.fn(), edit: vi.fn(), remove: vi.fn() }),
}))
vi.mock('../../../apps/tv/hooks/useNowPlaying', () => ({
  useNowPlaying: () => ({ nowPlaying: null, broadcast: vi.fn() }),
}))
vi.mock('../../../apps/tv/hooks/useAnnouncements', () => ({
  useAnnouncements: () => ({ announcements: [], add: vi.fn(), edit: vi.fn(), remove: vi.fn(), moveUp: vi.fn(), moveDown: vi.fn() }),
}))
vi.mock('../../../apps/tv/hooks/useGallery', () => ({
  useGalleries: () => ({ galleries: [], loading: false, create: vi.fn(), remove: vi.fn(), toggleActive: vi.fn() }),
}))
vi.mock('../../../apps/tv/hooks/useUrgentAnnouncements', () => ({
  useUrgentAnnouncements: () => ({ activeAnnouncement: null, createUrgent: vi.fn(), dismissUrgent: vi.fn() }),
}))
vi.mock('../../../apps/tv/hooks/useDevices', () => ({
  useDevices: () => ({ devices: [], loading: false, rename: vi.fn(), moveWorkspace: vi.fn(), remove: vi.fn() }),
}))

// TV AdminView — gerentes de conteúdo (a varredura cobre a navegação por abas,
// não o conteúdo; os managers puxam Supabase/realtime)
vi.mock('../../../apps/tv/components/EventManager', () => ({ EventManager: () => null }))
vi.mock('../../../apps/tv/components/PlaylistManager', () => ({ PlaylistManager: () => null }))
vi.mock('../../../apps/tv/components/QueueManager', () => ({ QueueManager: () => null }))
vi.mock('../../../apps/tv/components/MusicRequestManager', () => ({ MusicRequestManager: () => null }))
vi.mock('../../../apps/tv/components/AnnouncementManager', () => ({ AnnouncementManager: () => null }))
vi.mock('../../../apps/tv/components/GalleryManager', () => ({ GalleryManager: () => null }))
vi.mock('../../../apps/tv/components/DeviceManager', () => ({ DeviceManager: () => null }))
vi.mock('../../../apps/tv/components/CalendarManager', () => ({ CalendarManager: () => null }))
vi.mock('../../../apps/tv/components/TvDesktopInstall', () => ({ TvDesktopInstall: () => null }))

import { BottomNav as PCareBottomNav } from '../../../apps/pcare/components/BottomNav'
import { StockBottomNav } from '../../../apps/stock/components/StockBottomNav'
import { ChamadosBottomNav } from '../../../apps/chamados/components/ChamadosBottomNav'
import { AdminLayout } from '../../../apps/admin/layouts/AdminLayout'
import { Navbar as ReservaLabNavbar } from '../../../apps/reservalab/components/Navbar'
import { AdminView as TvAdminView } from '../../../apps/tv/pages/Admin'

type GetActive = () => string[]

/** Abas ativas no LiquidBottomNav (classe text-indigo-500 dentro do nav). */
function activeLiquidTabTexts(): string[] {
  const texts: string[] = []
  document.querySelectorAll('nav[aria-label="Navegação principal"] button.text-indigo-500').forEach((btn) => {
    texts.push((btn.textContent || '').trim())
  })
  return texts
}

/** Aba ativa no Navbar do ReservaLab (mobile: cor indigo; desktop: fontWeight 600). */
function activeReservaLabTabTexts(): string[] {
  const nav = document.querySelector('div.bottom-navbar, nav.navbar-fixed')
  if (!nav) return []
  const texts: string[] = []
  nav.querySelectorAll('button').forEach((btn) => {
    const el = btn as HTMLElement
    const color = getComputedStyle(el).color
    const weight = getComputedStyle(el).fontWeight
    if (color === 'rgb(99, 102, 241)' || weight === '600' || weight === '700') {
      texts.push((el.textContent || '').trim())
    }
  })
  return texts
}

/** Aba ativa no painel da TV (aba com fundo branco na barra de abas). */
function activeTvTabTexts(): string[] {
  const tabs = document.querySelector('div.overflow-x-auto')
  if (!tabs) return []
  const texts: string[] = []
  tabs.querySelectorAll('button.bg-white').forEach((btn) => {
    texts.push((btn.textContent || '').trim())
  })
  return texts
}

function runSweep(ui: ReactElement, routes: [string, string | null][], getActive: GetActive = activeLiquidTabTexts) {
  for (const [route, expected] of routes) {
    const { unmount } = renderWithProviders(ui, { initialEntries: [route] })
    expect(getActive(), `rota ${route}`).toEqual(expected ? [expected] : [])
    unmount()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseTickets.mockReturnValue({ tickets: [] })
  mockUseStock.mockReturnValue({ items: [] })
  mockUseKits.mockReturnValue({ kits: [] })
  mockUseMovements.mockReturnValue({ movements: [] })
})

describe('varredura de rotas — aba ativa', () => {
  it('PC Care: aba ativa correta em todas as rotas', () => {
    runSweep(<PCareBottomNav />, [
      ['/pc-care', 'Dashboard'],
      ['/pc-care/assets', 'Ativos'],
      ['/pc-care/assets/new', 'Ativos'],
      ['/pc-care/assets/pc-1', 'Ativos'],
      ['/pc-care/assets/pc-1/edit', 'Ativos'],
      ['/pc-care/pcs', 'Ativos'],
      ['/pc-care/pcs/new', 'Ativos'],
      ['/pc-care/pcs/pc-1', 'Ativos'],
      ['/pc-care/pcs/pc-1/edit', 'Ativos'],
      ['/pc-care/parts', 'Estoque'],
      ['/pc-care/parts/consolidado', 'Consolidado'],
      ['/pc-care/maintenance', 'Manutenção'],
      ['/pc-care/reports', 'Relatórios'],
      ['/pc-care/checklists', 'Checklist'],
      ['/pc-care/checklists/t-1/execute', 'Checklist'],
      ['/pc-care/qr', 'QR Code'],
      ['/pc-care/settings', 'Config'],
    ])
  })

  it('Estoque: aba ativa correta em todas as rotas (incl. /general-stock)', () => {
    runSweep(<StockBottomNav />, [
      ['/stock', 'Dashboard'],
      ['/stock/items', 'Estoque'],
      ['/stock/items/i-1', 'Estoque'],
      ['/stock/entry-exit', 'Ent/Sai'],
      ['/stock/movements', 'Mov.'],
      ['/stock/kits', 'Kits'],
      ['/stock/kits/k-1', 'Kits'],
      ['/stock/inventory', 'Dashboard'],
      ['/stock/inventory/i-1', 'Dashboard'],
      ['/stock/qr', 'QR'],
      ['/stock/maintenance', 'Manut.'],
      ['/stock/pipeline', 'Pipeline'],
      ['/general-stock', 'Dashboard'],
      ['/general-stock/items', 'Estoque'],
      ['/general-stock/kits', 'Kits'],
    ])
  })

  it('Chamados: aba ativa correta em todas as rotas', () => {
    runSweep(<ChamadosBottomNav />, [
      ['/chamados', 'Dashboard'],
      ['/chamados/sla', 'Dashboard'],
      ['/chamados/reports', 'Relatórios'],
      ['/chamados/tickets', 'Chamados'],
      ['/chamados/tickets/t-1', 'Chamados'],
      ['/chamados/qr', 'QR Code'],
      ['/chamados/settings', 'Config'],
    ])
  })

  it('Admin: aba ativa correta em todas as rotas', () => {
    runSweep(<AdminLayout />, [
      ['/admin', 'Início'],
      ['/admin/users', 'Pessoas'],
      ['/admin/requests', 'Pessoas'],
      ['/admin/users/u-1', 'Pessoas'],
      ['/admin/roles', 'Acesso'],
      ['/admin/workspaces', 'Mais'],
      ['/admin/notifications', 'Alertas'],
      ['/admin/logs', 'Alertas'],
      ['/admin/settings', 'Mais'],
      ['/admin/backups', 'Mais'],
      ['/admin/profile', 'Mais'],
    ])
  })

  it('ReservaLab: aba ativa correta em todas as rotas (mobile e desktop)', () => {
    mockUseIsMobile.mockReturnValue(true)
    runSweep(<ReservaLabNavbar />, [
      ['/reservalab', 'Reservas'],
      ['/reservalab/dashboard', 'Dashboard'],
      ['/reservalab/tablets', 'Tablets'],
      ['/reservalab/reservas', 'Reservas'],
    ], activeReservaLabTabTexts)

    mockUseIsMobile.mockReturnValue(false)
    runSweep(<ReservaLabNavbar />, [
      ['/reservalab', 'Reservas'],
      ['/reservalab/dashboard', 'Dashboard'],
      ['/reservalab/tablets', 'Tablets'],
    ], activeReservaLabTabTexts)
  })

  it('TV: aba ativa correta conforme o parâmetro ?tab=', () => {
    runSweep(<TvAdminView />, [
      ['/tv', 'Eventos'],
      ['/tv?tab=events', 'Eventos'],
      ['/tv?tab=playlists', 'Playlists'],
      ['/tv?tab=music', 'Filas de Música'],
      ['/tv?tab=requests', 'Pedidos de Música'],
      ['/tv?tab=gallery', 'Galeria'],
      ['/tv?tab=announcements', 'Avisos'],
      ['/tv?tab=devices', 'Dispositivos'],
      ['/tv?tab=calendar', 'Calendário'],
      ['/tv?tab=install', 'Instalar App'],
      ['/tv?tab=help', 'Ajuda'],
    ], activeTvTabTexts)
  })
})
