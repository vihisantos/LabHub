import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TechnicianPushReminder } from '../TechnicianPushReminder'

const mockSubscribe = vi.fn()

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('../../permissions/useActiveWorkspaceRole', () => ({
  useActiveWorkspaceRole: vi.fn(),
}))
vi.mock('../../../lib/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

import { useAuth } from '../../auth/AuthContext'
import { useActiveWorkspaceRole } from '../../permissions/useActiveWorkspaceRole'
import { usePushNotifications } from '../../../lib/usePushNotifications'

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>
const mockUseActiveWorkspaceRole = useActiveWorkspaceRole as ReturnType<typeof vi.fn>
const mockUsePushNotifications = usePushNotifications as ReturnType<typeof vi.fn>

function mockPush(overrides: Record<string, unknown> = {}) {
  mockUsePushNotifications.mockReturnValue({
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
  localStorage.clear()
  mockUseAuth.mockReturnValue({ user: { id: 'tech-1', name: 'Técnico' } })
  mockUseActiveWorkspaceRole.mockReturnValue({ isTechnician: true, loading: false, roleSlug: 'tec' })
  mockSubscribe.mockResolvedValue(true)
  mockPush()
})

describe('TechnicianPushReminder', () => {
  it('exibe o aviso somente para técnico com membership ativa no workspace selecionado', () => {
    mockUseActiveWorkspaceRole.mockReturnValue({ isTechnician: false, loading: false, roleSlug: 'viewer' })
    const { container } = render(<TechnicianPushReminder />)
    expect(container.textContent).toBe('')
  })

  it('pede confirmação mesmo quando o navegador já tem Push, até o técnico reconectar', () => {
    mockPush({ permission: 'granted', subscribed: true })
    render(<TechnicianPushReminder />)
    expect(screen.getByText('Reative as notificações do LabHub')).toBeInTheDocument()
    expect(screen.getByText('Confirmar e reconectar')).toBeInTheDocument()
  })

  it('chama subscribe somente após clique e grava confirmação por usuário', async () => {
    render(<TechnicianPushReminder />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ativar notificações' }))
      await Promise.resolve()
    })

    expect(mockSubscribe).toHaveBeenCalledOnce()
    expect(localStorage.getItem('labhub:push-activation:v1:tech-1')).toBe('1')
  })

  it('não tenta solicitar permissão quando o navegador bloqueou Push', () => {
    mockPush({ permission: 'denied' })
    render(<TechnicianPushReminder />)

    expect(screen.getByText(/As notificações estão bloqueadas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Como liberar no navegador' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('permite adiar por 24 horas sem dispensar permanentemente', () => {
    render(<TechnicianPushReminder />)
    fireEvent.click(screen.getByRole('button', { name: 'Lembrar mais tarde' }))

    expect(screen.queryByTestId('technician-push-reminder')).not.toBeInTheDocument()
    expect(Number(localStorage.getItem('labhub:push-activation-snooze:v1:tech-1'))).toBeGreaterThan(Date.now())
  })

  it('não mostra quando a confirmação existe e o Push continua ativo', () => {
    localStorage.setItem('labhub:push-activation:v1:tech-1', '1')
    mockPush({ permission: 'granted', subscribed: true })
    const { container } = render(<TechnicianPushReminder />)
    expect(container.textContent).toBe('')
  })

  it('mostra novamente se o técnico revogou a permissão após confirmar', () => {
    localStorage.setItem('labhub:push-activation:v1:tech-1', '1')
    mockPush({ permission: 'denied', subscribed: false })
    render(<TechnicianPushReminder />)
    expect(screen.getByText(/As notificações estão bloqueadas/)).toBeInTheDocument()
  })
})
