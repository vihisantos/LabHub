import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockSubscribe = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProfileSheet — Testar notificação (push global)', () => {
  it('mostra o botão de teste quando o push está ativo', () => {
    render(<ProfileSheet open onClose={() => {}} />)
    expect(screen.getByText('Push ativo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Testar notificação' })).toBeEnabled()
  })

  it('oculta o botão de teste quando o push não está ativo', () => {
    mockHook({ permission: 'default', subscribed: false })
    render(<ProfileSheet open onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Testar notificação' })).not.toBeInTheDocument()
  })

  it('envia para /api/chamados/push/test com o token da sessão', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sent: 1, total: 1 }),
    })

    render(<ProfileSheet open onClose={() => {}} />)
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

  it('avisa quando o usuário não tem inscrições', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sent: 0, total: 0, message: 'Nenhuma inscrição encontrada para este usuário' }),
    })

    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})

    expect(screen.getByText(/Nenhuma inscrição encontrada/)).toBeInTheDocument()
  })

  it('mostra erro quando a API falha', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Sessão inválida ou expirada. Faça login novamente.' }),
    })

    render(<ProfileSheet open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar notificação' }))
    await act(async () => {})

    expect(screen.getByText(/Faça login novamente/)).toBeInTheDocument()
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
