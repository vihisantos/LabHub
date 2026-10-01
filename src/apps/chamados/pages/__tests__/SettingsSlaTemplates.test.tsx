import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockCanAccessAction = vi.hoisted(() => vi.fn())
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

// RBAC 2.0 (F2-D-G): o gate do SLA é a Action `chamados.settings.manage`
// (migration 079) — não mais `isFullAccess('chamados')`, que vinha de
// `Role.appAccess`/`profiles.app_access`.
vi.mock('../../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (...args: unknown[]) => mockCanAccessAction(...args),
  useAppAccess: () => ({ isFullAccess: () => true }),
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
    // Leitura pura (F2-D-G §8): devolve o salvo ou o padrão, nunca cria.
    getFor: () => ({ hours: { baixa: 72, normal: 24, alta: 8, urgente: 2 } }),
    update: mockUpdateSla,
  },
}))

import { Settings } from '../Settings'

beforeEach(() => {
  vi.clearAllMocks()
  mockCanAccessAction.mockReturnValue({ allowed: true, loading: false })
  mockUpdateSla.mockResolvedValue(undefined)
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
    mockCanAccessAction.mockReturnValue({ allowed: false, loading: false })
    render(<Settings />)
    await act(async () => {})

    expect(screen.getByDisplayValue('72')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar prazos' })).not.toBeInTheDocument()
  })
})

describe('Settings — SLA gateado por Action (RBAC 2.0 / F2-D-G)', () => {
  it('consulta a Action chamados.settings.manage', async () => {
    render(<Settings />)
    await act(async () => {})

    expect(mockCanAccessAction).toHaveBeenCalledWith('chamados.settings.manage')
  })

  it('fail-closed enquanto a Action não responde (loading=true esconde a escrita)', async () => {
    mockCanAccessAction.mockReturnValue({ allowed: false, loading: true })
    render(<Settings />)
    await act(async () => {})

    expect(screen.queryByRole('button', { name: 'Salvar prazos' })).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('72')).toBeDisabled()
  })

  it('sem a Action, clicar em salvar é impossível (o service rejeitaria de qualquer forma)', async () => {
    mockCanAccessAction.mockReturnValue({ allowed: false, loading: false })
    render(<Settings />)
    await act(async () => {})

    expect(mockUpdateSla).not.toHaveBeenCalled()
  })

  it('falha do service (Action revogada entre o clique e a escrita) aparece como erro', async () => {
    mockUpdateSla.mockRejectedValue(new Error('Permissão insuficiente: seu acesso não permite gerenciar as configurações de Chamados.'))
    render(<Settings />)
    await act(async () => {})

    fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '12' } })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prazos' }))
    await act(async () => {})

    expect(screen.getByText(/Permissão insuficiente/)).toBeInTheDocument()
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument()
  })
})
