
// RBAC 2.0 (F2-D-L): a visibilidade de módulo na_notificação vem da nova
// fonte (membership -> roles.slug -> matriz), resolvida em
// `useNotifications`. Sem membership no ambiente de teste, o nível é `none`
// e tudo seria filtrado — então aqui concedemos visibilidade explicitamente.
vi.mock('../../../core/permissions/useModuleVisibility', () => ({
  useModuleVisibilities: () => ({
    levelOf: () => 'read' as const,
    isVisible: () => true,
    loading: false,
  }),
  useModuleLevel: () => ({ level: 'read' as const, visible: true, loading: false }),
}))

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockSubscribe = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockGetSubscription = vi.hoisted(() => vi.fn())
const mockShowNotification = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())
const mockSupabaseState = vi.hoisted(() => ({ defaultDb: null as any }))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      email: 'tecnico@labhub.app',
      name: 'Técnico 1',
      roleId: 'role-technician',
      status: 'active',
      is_super_admin: false,
      workspace_ids: ['ws-a'],
      accent: 'amber',
      theme_variant: 'dark',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    signOut: vi.fn(),
  }),
}))

vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: null, assignedWorkspaces: [] }),
}))

vi.mock('../../../lib/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  get defaultDb() {
    return mockSupabaseState.defaultDb
  },
}))

import { usePushNotifications } from '../../../lib/usePushNotifications'
import { ProfileSheet } from '../ProfileSheet'

function mockHook(overrides: Record<string, unknown> = {}) {
  ;(usePushNotifications as any).mockReturnValue({
    supported: true,
    permission: 'default',
    subscribed: false,
    loading: false,
    error: null,
    subscribe: mockSubscribe,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHook({ permission: 'granted', subscribed: true })
  mockSupabaseState.defaultDb = { auth: { getSession: mockGetSession } }
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'token-123' } },
    error: null,
  })
  vi.stubGlobal('fetch', mockFetch)
  mockGetSubscription.mockResolvedValue({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-qa' })
  mockShowNotification.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: mockGetSubscription },
        showNotification: mockShowNotification,
      }),
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.unstubAllGlobals()
})

describe('ProfileSheet — diagnóstico Push por dispositivo', () => {
  it('mostra os botões de teste quando o push está ativo', () => {
    render(<ProfileSheet open onClose={() => {}} />)
    expect(screen.getByText('Push ativo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Testar notificação' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Testar exibição local' })).toBeEnabled()
  })

  it('oculta os botões de teste quando o push não está ativo', () => {
    mockHook({ permission: 'default', subscribed: false })
    render(<ProfileSheet open onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Testar notificação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Testar exibição local' })).not.toBeInTheDocument()
  })

  it('envia ao próprio endpoint do dispositivo autenticado, não a todos os endpoints', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ sent: true, status: 'accepted' }) })
    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/push/test-device',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-qa' }),
      }),
    )
    expect(screen.getByText(/provedor aceitou o Push para este dispositivo/)).toBeInTheDocument()
  })

  it('rejeita sucesso falso da API se o provedor não confirmou o envio', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ sent: false, status: 'rejected' }) })
    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})
    expect(screen.getByText(/servidor não confirmou a aceitação/)).toBeInTheDocument()
  })

  it('avisa se a inscrição local desapareceu mesmo com permissão concedida', async () => {
    mockGetSubscription.mockResolvedValue(null)
    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})
    expect(screen.getByText(/inscrição Push deste dispositivo não está ativa/)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('oferece teste de exibição local sem requisição à API', async () => {
    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar exibição local' }))
    await act(async () => {})
    expect(mockShowNotification).toHaveBeenCalledWith(
      'LabHub · teste local',
      expect.objectContaining({ icon: '/logo-192.png' }),
    )
    expect(screen.getByText(/Teste local solicitado/)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('mostra erro quando a API falha', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Inscrição deste dispositivo não encontrada. Ative as notificações novamente.' }),
    })
    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})
    expect(screen.getByText(/Inscrição deste dispositivo não encontrada/)).toBeInTheDocument()
  })

  it('avisa quando a sessão expira sem chamar o endpoint', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})
    expect(screen.getByText('Sessão expirada. Faça login novamente.')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
