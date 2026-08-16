import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockSubscribe = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock('../../../../lib/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

vi.mock('../../../../core/auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      email: 'tecnico@labhub.app',
      name: 'Técnico 1',
      roleId: 'role-admin',
      status: 'active',
      is_super_admin: false,
      workspace_ids: ['ws-a'],
      accent: 'amber',
      theme_variant: 'dark',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  }),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({ isFullAccess: () => true }),
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-a', name: 'Campus Anhembi' } }),
}))

vi.mock('../../hooks/useProblemTemplates', () => ({
  useProblemTemplates: () => ({
    templates: [],
    loading: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getByAssetType: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('../../services/slaConfigService', () => ({
  slaConfigService: {
    getFor: () => ({ hours: { baixa: 72, normal: 24, alta: 8, urgente: 2 } }),
    update: vi.fn(),
  },
}))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: { auth: { getSession: mockGetSession } },
}))

import { usePushNotifications } from '../../../../lib/usePushNotifications'
import { Settings } from '../Settings'

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
  mockHook()
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'token-123' } },
    error: null,
  })
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Settings — Notificações Push', () => {
  it('mostra "Não ativadas" com botão de ativar quando não inscrito', () => {
    render(<Settings />)
    expect(screen.getByText('🔔 Não ativadas')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Ativar notificações' })
    fireEvent.click(button)
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('mostra "Ativas" quando inscrito e oculta o botão de ativar', () => {
    mockHook({ permission: 'granted', subscribed: true })
    render(<Settings />)
    expect(screen.getByText('✅ Ativas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Testar notificação' })).toBeEnabled()
  })

  it('mostra "Bloqueadas pelo navegador" com instruções quando permission=denied', () => {
    mockHook({ permission: 'denied' })
    render(<Settings />)
    expect(screen.getByText('⚠️ Bloqueadas pelo navegador')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reativar notificações' })).toBeInTheDocument()
    expect(screen.getByText(/Configurações → Privacidade e segurança → Notificações/)).toBeInTheDocument()
  })

  it('avisa quando o navegador não suporta push', () => {
    mockHook({ supported: false })
    render(<Settings />)
    expect(screen.getByText(/não suporta notificações push/)).toBeInTheDocument()
  })

  it('mostra a verificação inicial durante o loading', () => {
    mockHook({ loading: true })
    render(<Settings />)
    expect(screen.getByText('Verificando suporte do navegador…')).toBeInTheDocument()
  })

  it('exibe o erro retornado pelo hook', () => {
    mockHook({ error: 'VAPID key não configurada' })
    render(<Settings />)
    expect(screen.getByText('VAPID key não configurada')).toBeInTheDocument()
  })

  it('Testar notificação: envia para /api/chamados/push/test com o token da sessão', async () => {
    mockHook({ permission: 'granted', subscribed: true })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sent: 1, total: 1 }),
    })

    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chamados/push/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    )
    expect(screen.getByText(/Push de teste enviado \(1\/1\)/)).toBeInTheDocument()
  })

  it('Testar notificação: avisa quando o usuário não tem inscrições', async () => {
    mockHook({ permission: 'granted', subscribed: true })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sent: 0, total: 0, message: 'Nenhuma inscrição push encontrada para este usuário. Ative as notificações primeiro.' }),
    })

    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})

    expect(screen.getByText(/Ative as notificações primeiro/)).toBeInTheDocument()
  })

  it('Testar notificação: mostra erro quando a API falha', async () => {
    mockHook({ permission: 'granted', subscribed: true })
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Sessão inválida ou expirada. Faça login novamente.' }),
    })

    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})

    expect(screen.getByText(/Faça login novamente/)).toBeInTheDocument()
  })

  it('Testar notificação fica desabilitado quando o push não está ativo', () => {
    render(<Settings />)
    expect(screen.getByRole('button', { name: 'Testar notificação' })).toBeDisabled()
  })
})
