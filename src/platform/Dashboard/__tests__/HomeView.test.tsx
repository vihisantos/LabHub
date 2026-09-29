import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ThemeVariant } from '../../../core/auth/types'
import { HomeView } from '../HomeView'
import { homeBannersFor } from '../homeBanners'

const mockTheme = vi.hoisted(() => vi.fn<() => ThemeVariant>(() => 'dim'))
const profileOpenSpy = vi.hoisted(() => vi.fn())
const mockIsCoordinator = vi.hoisted(() => vi.fn<() => boolean>(() => false))
const mockIsCoordinatorMultiUnit = vi.hoisted(() => vi.fn<() => boolean>(() => false))

vi.mock('../../../lib/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme(), accent: 'blue', setTheme: vi.fn(), setAccent: vi.fn(), toggle: vi.fn() }),
}))

vi.mock('../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      name: 'Vitor Santos',
      email: 'vitor@labhub.com',
      roleId: 'role-1',
      status: 'active',
      workspace_ids: ['ws-1'],
      accent: 'blue',
      theme_variant: 'dim',
      created_at: '',
      updated_at: '',
    },
    signOut: vi.fn(),
    loading: false,
  }),
}))

vi.mock('../../../core/notifications/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: { id: 'ws-1', name: 'Lab', slug: 'lab', disabled_apps: [] },
    workspaces: [{ id: 'ws-1', name: 'Lab', slug: 'lab', disabled_apps: [] }],
    assignedWorkspaces: [],
  }),
}))

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => ({
    isCoordinator: mockIsCoordinator(),
    isCoordinatorMultiUnit: mockIsCoordinatorMultiUnit(),
  }),
}))

vi.mock('../../../lib/useFastSync', () => ({ useFastSync: vi.fn() }))
vi.mock('../../../lib/useOnlineSync', () => ({ useOnlineSync: vi.fn() }))

vi.mock('../../../apps/reservalab/components/PushNotificationButton', () => ({
  PushNotificationButton: () => null,
}))
vi.mock('../../NotificationCenter/NotificationsSheet', () => ({
  NotificationsSheet: () => null,
}))
vi.mock('../../Profile/ProfileSheet', () => ({
  ProfileSheet: ({ open }: { open: boolean }) => {
    profileOpenSpy(open)
    return open ? <div data-testid="profile-sheet" /> : null
  },
}))
vi.mock('../../Onboarding/OnboardingOverlay', () => ({
  OnboardingOverlay: () => null,
  completeOnboarding: vi.fn(),
  hasCompletedOnboarding: () => true,
}))
vi.mock('../QuickActions', () => ({ QuickActions: () => <div data-testid="acoes-rapidas" /> }))
vi.mock('../ModuleStats', () => ({ ModuleStats: () => <div data-testid="resumo-modulos" /> }))

function bannerSrcs(): string[] {
  return Array.from(document.querySelectorAll('img[src^="/banners/"]')).map(
    (img) => img.getAttribute('src') ?? '',
  )
}

/** `a` aparece antes de `b` na ordem do documento? */
function antes(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeView />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockTheme.mockReturnValue('dim')
  mockIsCoordinator.mockReturnValue(false)
  mockIsCoordinatorMultiUnit.mockReturnValue(false)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('HomeView — composição única', () => {
  it('renderiza a saudação com nome e subtítulo', () => {
    renderHome()
    expect(screen.getByText(/^(Bom dia|Boa tarde|Boa noite),$/)).toBeInTheDocument()
    expect(screen.getByText('Vitor Santos')).toBeInTheDocument()
    expect(screen.getByText('Que bom te ver por aqui!')).toBeInTheDocument()
  })

  it('avatar abre o ProfileSheet existente (sem rota /perfil)', () => {
    renderHome()
    expect(screen.queryByTestId('profile-sheet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Meu perfil'))
    expect(screen.getByTestId('profile-sheet')).toBeInTheDocument()
    expect(profileOpenSpy).toHaveBeenCalledWith(true)
  })

  it('renderiza o par de banners do tema global ativo', () => {
    renderHome()
    const srcs = bannerSrcs()
    expect(srcs).toContain('/banners/tema-2/principal.svg')
    expect(srcs).toContain('/banners/tema-2/secundario.svg')
    expect(new Set(srcs.map((s) => s.split('/')[2])).size).toBe(1)
  })

  it('mantém a hierarquia exata: saudação → banner principal → ações → resumo → banner secundário', () => {
    const { container } = renderHome()
    const saudacao = container.querySelector('header') as HTMLElement
    const principal = document.querySelector('img[src="/banners/tema-2/principal.svg"]') as Element
    const acoes = screen.getByTestId('acoes-rapidas')
    const resumo = screen.getByTestId('resumo-modulos')
    const secundario = document.querySelector('img[src="/banners/tema-2/secundario.svg"]') as Element

    expect(antes(saudacao, principal)).toBe(true)
    expect(antes(principal, acoes)).toBe(true)
    expect(antes(acoes, resumo)).toBe(true)
    expect(antes(resumo, secundario)).toBe(true)
  })

  it('não existe controle de tema/seletor de banner na Home', () => {
    renderHome()
    expect(screen.queryByRole('button', { name: /Escuro|Sutil|Claro/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Tema$/)).not.toBeInTheDocument()
  })

  it('sem autoplay: os banners não trocam sozinhos com o tempo', () => {
    vi.useFakeTimers()
    try {
      renderHome()
      const antesSrcs = bannerSrcs()
      vi.advanceTimersByTime(60_000)
      expect(bannerSrcs()).toEqual(antesSrcs)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('HomeView — "Seus Apps" removido (Resumo por módulos é a fonte)', () => {
  it('a seção "Seus Apps" não existe mais na composição da Home', () => {
    renderHome()
    expect(screen.queryByText('Seus Apps')).not.toBeInTheDocument()
    // O atalho interno da seção (Pedir Música) saiu junto com ela.
    expect(screen.queryByText('Pedir Música')).not.toBeInTheDocument()
  })

  it('Resumo por módulos e Ações rápidas permanecem — nenhum acesso funcional perdido', () => {
    renderHome()
    expect(screen.getByTestId('resumo-modulos')).toBeInTheDocument()
    expect(screen.getByTestId('acoes-rapidas')).toBeInTheDocument()
  })
})

describe('HomeView — Coordenador Multiunidade', () => {
  it.each([
    ['light', 'tema-1'],
    ['dim', 'tema-2'],
    ['dark', 'tema-3'],
  ] as const)('tema %s: principal coordenador.svg + secundário %s', (theme, folder) => {
    mockTheme.mockReturnValue(theme)
    mockIsCoordinator.mockReturnValue(true)
    mockIsCoordinatorMultiUnit.mockReturnValue(true)
    renderHome()

    const srcs = bannerSrcs()
    expect(srcs).toContain('/banners/coordenador.svg')
    expect(srcs).toContain(homeBannersFor(theme).secondary)
    expect(srcs).toContain(`/banners/${folder}/secundario.svg`)
    expect(srcs).not.toContain(homeBannersFor(theme).main)

    // O acesso à área de Coordenação virou o CTA "Entrar" do próprio banner.
    const cta = screen.getByRole('link', { name: 'Entrar na área de Coordenação' })
    expect(cta).toHaveAttribute('href', '/coordenador')
  })

  it('sem o cargo, o banner do coordenador não aparece (sem vazamento)', () => {
    mockIsCoordinator.mockReturnValue(false)
    mockIsCoordinatorMultiUnit.mockReturnValue(false)
    renderHome()
    expect(bannerSrcs()).not.toContain('/banners/coordenador.svg')
    expect(bannerSrcs()).toContain('/banners/tema-2/principal.svg')
  })

  it('o card separado "Coordenação" saiu da Home — para qualquer cargo', () => {
    mockIsCoordinator.mockReturnValue(true)
    mockIsCoordinatorMultiUnit.mockReturnValue(true)
    renderHome()
    expect(screen.queryByText('Coordenação')).not.toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador Multiunidades')).not.toBeInTheDocument()
  })

  it('usuário comum também não vê o card nem o CTA do coordenador', () => {
    mockIsCoordinator.mockReturnValue(false)
    mockIsCoordinatorMultiUnit.mockReturnValue(false)
    renderHome()
    expect(screen.queryByText('Coordenação')).not.toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador Multiunidades')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Entrar na área de Coordenação' })).not.toBeInTheDocument()
  })

  it('o CTA fica acima do banner secundário e abaixo do resumo por módulo', () => {
    mockIsCoordinator.mockReturnValue(true)
    mockIsCoordinatorMultiUnit.mockReturnValue(true)
    renderHome()
    const order = Array.from(document.body.querySelectorAll('img[src^="/banners/"]'))
    const main = order.find((el) => el.getAttribute('src') === '/banners/coordenador.svg')!
    const secondary = order.find((el) => el.getAttribute('src') === homeBannersFor('dim').secondary)!
    // o CTA vive dentro do banner principal, logo antes do secundário
    expect(main.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
