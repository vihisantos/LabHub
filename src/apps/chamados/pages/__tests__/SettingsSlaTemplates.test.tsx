import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockIsFullAccess = vi.hoisted(() => vi.fn())
const mockUpdateSla = vi.hoisted(() => vi.fn())

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
  useAppAccess: () => ({ isFullAccess: mockIsFullAccess }),
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-a', name: 'Campus Anhembi' } }),
}))

vi.mock('../../../../lib/usePushNotifications', () => ({
  usePushNotifications: () => ({
    supported: true,
    permission: 'default',
    subscribed: false,
    loading: false,
    error: null,
    subscribe: vi.fn(),
  }),
}))

vi.mock('../../services/slaConfigService', () => ({
  slaConfigService: {
    getFor: () => ({ hours: { baixa: 72, normal: 24, alta: 8, urgente: 2 } }),
    update: mockUpdateSla,
  },
}))

import { Settings } from '../Settings'

beforeEach(() => {
  vi.clearAllMocks()
  mockIsFullAccess.mockReturnValue(true)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Settings — SLA de atendimento', () => {
  it('carrega os prazos do workspace e salva as alterações', async () => {
    render(<Settings />)
    await act(async () => {})

    expect(screen.getByText(/Prazos para Campus Anhembi/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('72')).toBeInTheDocument()
    expect(screen.getByDisplayValue('24')).toBeInTheDocument()
    expect(screen.getByDisplayValue('8')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '12' } })
    await act(async () => {})
    expect(screen.getByDisplayValue('12')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar prazos' }))
    await act(async () => {})

    expect(mockUpdateSla).toHaveBeenCalledWith('ws-a', expect.objectContaining({ normal: 12 }))
    expect(screen.getByText('Salvo')).toBeInTheDocument()

    // O feedback "Salvo" reverte após 2s
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('button', { name: 'Salvar prazos' })).toBeInTheDocument()
  })

  it('limita o valor mínimo do SLA a 1 hora', async () => {
    render(<Settings />)
    await act(async () => {})

    fireEvent.change(screen.getByDisplayValue('72'), { target: { value: '0' } })
    await act(async () => {})

    expect(screen.getByDisplayValue('1')).toBeInTheDocument()
  })

  it('desabilita os campos de SLA quando o usuário não pode escrever', async () => {
    mockIsFullAccess.mockReturnValue(false)
    render(<Settings />)
    await act(async () => {})

    expect(screen.getByDisplayValue('72')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar prazos' })).not.toBeInTheDocument()
  })
})
