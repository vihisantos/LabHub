import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockIsFullAccess = vi.hoisted(() => vi.fn())
const mockCreateTemplate = vi.hoisted(() => vi.fn())
const mockUpdateTemplate = vi.hoisted(() => vi.fn())
const mockRemoveTemplate = vi.hoisted(() => vi.fn())
const mockUpdateSla = vi.hoisted(() => vi.fn())
const mockTemplateState = vi.hoisted(() => ({ templates: [] as any[] }))

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

vi.mock('../../hooks/useProblemTemplates', () => ({
  useProblemTemplates: () => ({
    templates: mockTemplateState.templates,
    loading: false,
    create: mockCreateTemplate,
    update: mockUpdateTemplate,
    remove: mockRemoveTemplate,
    getByAssetType: vi.fn(),
    reload: vi.fn(),
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
  mockTemplateState.templates = []
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

describe('Settings — Templates de problema', () => {
  it('lista os templates com suas categorias', async () => {
    mockTemplateState.templates = [
      { id: 'tpl-1', assetType: 'Projetor', categories: ['Não liga', 'HDMI'] },
      { id: 'tpl-2', assetType: 'Ar-condicionado', categories: ['Não gela'] },
    ]
    render(<Settings />)
    await act(async () => {})

    expect(screen.getByText('2 templates')).toBeInTheDocument()
    expect(screen.getByText('Projetor')).toBeInTheDocument()
    expect(screen.getByText('Não liga')).toBeInTheDocument()
    expect(screen.getByText('HDMI')).toBeInTheDocument()
    expect(screen.getByText('Ar-condicionado')).toBeInTheDocument()
    expect(screen.getByText('Não gela')).toBeInTheDocument()
  })

  it('cria um template novo com categorias separadas por linha', async () => {
    render(<Settings />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Novo Template' }))
    fireEvent.change(screen.getByPlaceholderText('Ex: Projetor'), { target: { value: 'Internet' } })
    fireEvent.change(screen.getByPlaceholderText(/Não liga/), { target: { value: 'Sem sinal\nLento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))
    await act(async () => {})

    expect(mockCreateTemplate).toHaveBeenCalledWith({
      assetType: 'Internet',
      categories: ['Sem sinal', 'Lento'],
    })
  })

  it('não cria template sem tipo ou categorias', async () => {
    render(<Settings />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Novo Template' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))
    await act(async () => {})

    expect(mockCreateTemplate).not.toHaveBeenCalled()
  })

  it('edita as categorias de um template existente', async () => {
    mockTemplateState.templates = [{ id: 'tpl-1', assetType: 'Projetor', categories: ['Não liga', 'HDMI'] }]
    render(<Settings />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Editar template Projetor' }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('Não liga\nHDMI')
    fireEvent.change(textarea, { target: { value: 'Não liga\nHDMI\nSem imagem' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await act(async () => {})

    expect(mockUpdateTemplate).toHaveBeenCalledWith('tpl-1', {
      categories: ['Não liga', 'HDMI', 'Sem imagem'],
    })
  })

  it('remove um template', async () => {
    mockTemplateState.templates = [{ id: 'tpl-1', assetType: 'Projetor', categories: ['Não liga'] }]
    render(<Settings />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Remover template Projetor' }))
    await act(async () => {})

    expect(mockRemoveTemplate).toHaveBeenCalledWith('tpl-1')
  })

  it('oculta as ações de template quando o usuário não pode escrever', async () => {
    mockIsFullAccess.mockReturnValue(false)
    mockTemplateState.templates = [{ id: 'tpl-1', assetType: 'Projetor', categories: ['Não liga'] }]
    render(<Settings />)
    await act(async () => {})

    // O template ainda aparece, mas sem botões de ação
    expect(screen.getByText('Projetor')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo Template' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar template Projetor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover template Projetor' })).not.toBeInTheDocument()
  })
})
