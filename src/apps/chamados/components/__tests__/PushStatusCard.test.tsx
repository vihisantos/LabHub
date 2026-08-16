import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushStatusCard } from '../PushStatusCard'

const mockNavigate = vi.hoisted(() => vi.fn())
const mockSubscribe = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

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

import { usePushNotifications } from '../../../../lib/usePushNotifications'

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
})

describe('PushStatusCard', () => {
  it('mostra status ativo quando inscrito com permissão concedida', () => {
    mockHook({ permission: 'granted', subscribed: true })
    render(<PushStatusCard />)
    expect(screen.getByText('✅ Push ativo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument()
  })

  it('mostra bloqueado pelo navegador quando permission=denied', () => {
    mockHook({ permission: 'denied' })
    render(<PushStatusCard />)
    expect(screen.getByText('⚠️ Push bloqueado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument()
  })

  it('mostra desativado e chama subscribe ao clicar em Ativar', () => {
    render(<PushStatusCard />)
    expect(screen.getByText('🔔 Push desativado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }))
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('mostra não suportadas quando o navegador não tem Push API', () => {
    mockHook({ supported: false })
    render(<PushStatusCard />)
    expect(screen.getByText('🔔 Não suportadas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument()
  })

  it('mostra estado neutro durante a verificação inicial', () => {
    mockHook({ loading: true })
    render(<PushStatusCard />)
    expect(screen.getByText('Notificações')).toBeInTheDocument()
  })

  it('navega para as Configurações ao clicar no botão de gerenciar', () => {
    render(<PushStatusCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Configurar notificações' }))
    expect(mockNavigate).toHaveBeenCalledWith('/chamados/settings')
  })

  it('exibe o erro retornado pelo hook', () => {
    mockHook({ error: 'VAPID key não configurada' })
    render(<PushStatusCard />)
    expect(screen.getByText('VAPID key não configurada')).toBeInTheDocument()
  })
})
