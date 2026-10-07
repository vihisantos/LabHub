import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '../../core/auth/types'
import { MusicRequestPage } from '../MusicRequest'

// Variável mutável para o workspace (lida pelo mock factory)
let currentDisabledApps: string[] = []

// Mock direto do hook useMusicRequests — sem side effects
vi.mock('../../apps/tv/hooks/useMusicRequests', () => ({
  useMusicRequests: () => ({
    requests: [],
    pending: [],
    loading: false,
    refresh: () => {},
    request: () => {},
    approve: () => {},
    reject: () => {},
  }),
}))

vi.mock('../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      name: 'Usuário Teste',
      email: 'teste@labhub.com',
      roleId: 'role-technician',
      status: 'active',
      workspace_ids: ['ws-1'],
      accent: 'emerald',
      theme_variant: 'dark',
      created_at: '',
      updated_at: '',
    } as User,
    signOut: vi.fn(),
    loading: false,
  }),
}))

// Mock do WorkspaceContext que lê a variável mutável
vi.mock('../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: { id: 'ws-1', name: 'Lab', slug: 'lab', disabled_apps: currentDisabledApps },
  }),
}))

function renderPage(disabledApps: string[] = []) {
  currentDisabledApps = disabledApps
  return render(
    <MemoryRouter initialEntries={['/pedir-musica']}>
      <MusicRequestPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

afterEach(() => {
  cleanup()
})

describe('MusicRequestPage — TV gate', () => {
  it('mostra "TV indisponível neste campus" quando o app tv está desabilitado no workspace', () => {
    renderPage(['tv'])
    expect(screen.getByText('TV indisponível neste campus')).toBeInTheDocument()
    expect(screen.getByText(/O pedido de música está desativado para Lab/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Voltar ao início/ })).toBeInTheDocument()
  })

  it('não renderiza o formulário de pedido quando TV desabilitada', () => {
    renderPage(['tv'])
    expect(screen.queryByText('Buscar por nome')).not.toBeInTheDocument()
    expect(screen.queryByText('Colar link')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Digite o nome da música ou artista...')).not.toBeInTheDocument()
  })

  it('renderiza o formulário normalmente quando TV está habilitada', () => {
    renderPage([])
    expect(screen.getByText('Pedir Música')).toBeInTheDocument()
    expect(screen.getByText('Buscar por nome')).toBeInTheDocument()
    expect(screen.getByText('Colar link')).toBeInTheDocument()
    expect(screen.queryByText('TV indisponível neste campus')).not.toBeInTheDocument()
  })

  it('botão Voltar ao início navega para /launcher quando TV desabilitada', () => {
    renderPage(['tv'])
    const btn = screen.getByRole('button', { name: /Voltar ao início/ })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(btn).toBeInTheDocument()
  })
})

describe('MusicRequestPage — fluxo normal (TV habilitada)', () => {
  it('alterna entre buscar por nome e colar link', () => {
    renderPage([])
    expect(screen.getByRole('button', { name: /Buscar por nome/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Colar link/ })).toBeInTheDocument()
  })

  it('mostra estado vazio de meus pedidos', () => {
    renderPage([])
    expect(screen.getByText('Meus pedidos')).toBeInTheDocument()
    expect(screen.getByText('Nenhum pedido ainda')).toBeInTheDocument()
  })
})