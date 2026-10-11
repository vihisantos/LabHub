import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MovementFormModal } from '../components/MovementFormModal'
import type { PatrimonioAsset, PatrimonioReferences, AssetMovement } from '../../../core/patrimonio'

const {
  mockedMovementsRepository,
  mockedConstants,
} = vi.hoisted(() => {
  return {
    mockedMovementsRepository: {
      register: vi.fn(),
      listByAsset: vi.fn(),
      listRecent: vi.fn(),
    },
    mockedConstants: {
      ASSET_CONDITION_LABELS: {
        novo: 'Novo',
        bom: 'Bom',
        regular: 'Regular',
        danificado: 'Danificado',
        inservivel: 'Inservível',
      },
      ASSET_MOVEMENT_TYPE_LABELS: {
        criacao: 'Criação',
        transferencia: 'Transferência',
        responsavel: 'Troca de responsável',
        emprestimo: 'Empréstimo',
        devolucao: 'Devolução',
        manutencao: 'Manutenção',
        baixa: 'Baixa',
        inventario: 'Inventário',
        correcao: 'Correção',
      },
      ASSET_STATUS_LABELS: {
        draft: 'Rascunho',
        disponivel: 'Disponível',
        em_uso: 'Em uso',
        emprestado: 'Emprestado',
        manutencao: 'Em manutenção',
        em_transito: 'Em trânsito',
        nao_localizado: 'Não localizado',
        baixado: 'Baixado',
      },
      REGISTRABLE_MOVEMENT_TYPES: [
        'transferencia',
        'responsavel',
        'emprestimo',
        'devolucao',
        'manutencao',
        'baixa',
        'inventario',
        'correcao',
      ],
      TRANSFER_TARGET_STATUSES: ['em_transito', 'disponivel', 'em_uso'],
      RESPONSIBLE_TARGET_STATUSES: ['em_uso', 'disponivel'],
      INVENTORY_TARGET_STATUSES: ['nao_localizado', 'disponivel', 'em_uso'],
      ASSET_STATUSES: [
        'draft',
        'disponivel',
        'em_uso',
        'emprestado',
        'manutencao',
        'em_transito',
        'nao_localizado',
        'baixado',
      ],
      ASSET_CONDITIONS: ['novo', 'bom', 'regular', 'danificado', 'inservivel'],
    },
  }
})

vi.mock('../../../core/patrimonio', () => {
  return {
    movementsRepository: mockedMovementsRepository,
    ASSET_CONDITION_LABELS: mockedConstants.ASSET_CONDITION_LABELS,
    ASSET_MOVEMENT_TYPE_LABELS: mockedConstants.ASSET_MOVEMENT_TYPE_LABELS,
    ASSET_STATUS_LABELS: mockedConstants.ASSET_STATUS_LABELS,
    REGISTRABLE_MOVEMENT_TYPES: mockedConstants.REGISTRABLE_MOVEMENT_TYPES,
    TRANSFER_TARGET_STATUSES: mockedConstants.TRANSFER_TARGET_STATUSES,
    RESPONSIBLE_TARGET_STATUSES: mockedConstants.RESPONSIBLE_TARGET_STATUSES,
    INVENTORY_TARGET_STATUSES: mockedConstants.INVENTORY_TARGET_STATUSES,
    ASSET_STATUSES: mockedConstants.ASSET_STATUSES,
    ASSET_CONDITIONS: mockedConstants.ASSET_CONDITIONS,
    toPatrimonioError: vi.fn((err: unknown) => ({
      code: 'query_failed',
      message: 'Falha de rede ao salvar. Tente novamente.',
      diagnostic: String(err),
    })),
    validationError: vi.fn((msg: string) => ({ code: 'validation', message: msg, diagnostic: msg })),
    PatrimonioError: class extends Error {
      readonly code: string
      readonly diagnostic: string
      constructor(code: string, message?: string, diagnostic = '') {
        super(message ?? 'Erro')
        this.name = 'PatrimonioError'
        this.code = code
        this.diagnostic = diagnostic
      }
    },
  }
})

function refs(): PatrimonioReferences {
  return {
    locations: [
      { id: 'l-1', workspace_id: 'ws-1', predio: 'A', andar: '1', nome: 'Sala 101', complemento: '', notes: '', created_at: '', updated_at: '' },
      { id: 'l-2', workspace_id: 'ws-1', predio: 'A', andar: '1', nome: 'Sala 102', complemento: '', notes: '', created_at: '', updated_at: '' },
    ],
    responsibles: [
      { id: 'r-1', workspace_id: 'ws-1', nome: 'Fulano', matricula: null, email: null, profile_id: null, notes: '', created_at: '', updated_at: '' },
      { id: 'r-2', workspace_id: 'ws-1', nome: 'Ciclano', matricula: null, email: null, profile_id: null, notes: '', created_at: '', updated_at: '' },
    ],
    loading: false,
    error: null,
    locationLabel: (id: string | null) => (id === 'l-1' ? 'Sala 101' : id === 'l-2' ? 'Sala 102' : null),
    responsibleLabel: (id: string | null) => (id === 'r-1' ? 'Fulano' : id === 'r-2' ? 'Ciclano' : null),
    reload: vi.fn(),
  }
}

const asset: PatrimonioAsset = {
  id: 'a-1',
  workspace_id: 'ws-1',
  asset_tag: 'PAT-001',
  serial_number: 'SN-1',
  equipment_type: 'Notebook',
  manufacturer: 'Dell',
  model: 'Latitude',
  name: 'Notebook Dell',
  location_id: 'l-1',
  responsible_id: 'r-1',
  status: 'em_uso',
  condition: 'bom',
  notes: '',
  metadata: {},
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
}

function renderModal(overrides: Partial<{ open: boolean; workspaceId: string | null }> = {}) {
  return render(
    <MovementFormModal
      open={overrides.open ?? true}
      workspaceId={overrides.workspaceId ?? 'ws-1'}
      asset={asset}
      references={refs()}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
}

describe('MovementFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // userEvent precisa de timers reais.
    vi.useRealTimers()
    // Mock padrão: registro bem-sucedido
    vi.mocked(vi.mocked(mockedMovementsRepository.register)).mockResolvedValue({ id: 'mv-1', type: 'manutencao' } as any)
  })

  it('renderiza fechado quando open=false', () => {
    const { queryByRole } = renderModal({ open: false })
    expect(queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra título e estado atual do bem', () => {
    renderModal()
    expect(screen.getByText('Movimentar bem')).toBeInTheDocument()
    expect(screen.getByText('Bem atual')).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('Fulano')).toBeInTheDocument()
    expect(screen.getByText('Em uso')).toBeInTheDocument()
  })

  it('lista todos os tipos de movimentação registráveis', () => {
    renderModal()
    const select = screen.getByLabelText('Tipo de movimentação')
    expect(select).toBeInTheDocument()
    const options = select.querySelectorAll('option')
    const types = Array.from(options).map((o) => o.value).filter(Boolean)
    expect(types).toContain('transferencia')
    expect(types).toContain('responsavel')
    expect(types).toContain('emprestimo')
    expect(types).toContain('devolucao')
    expect(types).toContain('manutencao')
    expect(types).toContain('baixa')
    expect(types).toContain('inventario')
    expect(types).toContain('correcao')
  })

  it('transferência exige local e status', async () => {
    renderModal()
    // Make register reject to see if validation runs
    vi.mocked(mockedMovementsRepository.register).mockRejectedValue(new Error('Test error'))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    await waitFor(() => expect(screen.getByText('Transferência exige o local de destino.')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Status de destino inválido para esta operação.')).toBeInTheDocument())
  })

  it('troca para empréstimo ⇒ exige responsável e data de devolução', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'emprestimo')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    expect(screen.getByText('Esta operação exige um responsável de destino.')).toBeInTheDocument()
    expect(screen.getByText('Empréstimo exige uma data de devolução prevista válida.')).toBeInTheDocument()
  })

  it('troca para devolução ⇒ não exige campos, status padrão disponível', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'devolucao')
    expect(screen.getByDisplayValue('Disponível')).toBeInTheDocument()
  })

  it('baixa não permite alterar status (terminal)', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'baixa')
    expect(screen.getByText(/Status será alterado automaticamente para <strong>Baixado<\/strong>/)).toBeInTheDocument()
  })

  it('validação: origem e destino iguais na transferência', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'transferencia')
    await user.selectOptions(screen.getByLabelText('Local de destino'), 'Sala 101')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    expect(screen.getByText('Origem e destino são iguais — nenhuma transferência necessária.')).toBeInTheDocument()
  })

  it('validação: responsável igual na troca de responsável', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'responsavel')
    await user.selectOptions(screen.getByLabelText('Responsável de destino'), 'Fulano')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    expect(screen.getByText('O responsável informado já é o atual — nenhuma alteração necessária.')).toBeInTheDocument()
  })

  it('equipamento baixado ⇒ só correção permitida', async () => {
    const baixadoAsset = { ...asset, status: 'baixado' as const }
    render(
      <MovementFormModal
        open={true}
        workspaceId="ws-1"
        asset={baixadoAsset}
        references={refs()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    expect(screen.getByText('Equipamento baixado é terminal — apenas correção é permitida.')).toBeInTheDocument()
  })

  it('empréstimo duplo bloqueado', async () => {
    const emprestadoAsset = { ...asset, status: 'emprestado' as const }
    render(
      <MovementFormModal
        open={true}
        workspaceId="ws-1"
        asset={emprestadoAsset}
        references={refs()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'emprestimo')
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    expect(screen.getByText('Este equipamento já está emprestado — registre a devolução primeiro.')).toBeInTheDocument()
  })

  it('devolução sem empréstimo bloqueada', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'devolucao')
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    expect(screen.getByText('Só é possível devolver um equipamento que está emprestado.')).toBeInTheDocument()
  })

  it('mudança de unidade bloqueia o formulário', () => {
    const { rerender } = renderModal()
    expect(screen.getByRole('button', { name: 'Registrar movimentação' })).not.toBeDisabled()
    rerender(
      <MovementFormModal
        open={true}
        workspaceId="ws-2"
        asset={asset}
        references={refs()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.getByText('A unidade de trabalho mudou durante o preenchimento. Feche e reabra para continuar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar movimentação' })).toBeDisabled()
  })

  it('fecha ao clicar em Cancelar', () => {
    const onClose = vi.fn()
    render(
      <MovementFormModal
        open={true}
        workspaceId="ws-1"
        asset={asset}
        references={refs()}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('não fecha durante submissão', async () => {
    const onClose = vi.fn()
    let resolveRegister: (value: AssetMovement) => void = () => {}
    const registerPromise = new Promise<AssetMovement>((resolve) => {
      resolveRegister = resolve
    })
    vi.mocked(mockedMovementsRepository.register).mockReturnValue(registerPromise)
    render(
      <MovementFormModal
        open={true}
        workspaceId="ws-1"
        asset={asset}
        references={refs()}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'manutencao')
    // Dispara submit
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    // Aguarda o botão Cancelar ficar desabilitado (estado submitting)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled())
    // O botão Cancelar está desabilitado, então onClose não deve ser chamado
    expect(onClose).not.toHaveBeenCalled()
    // Resolve o registro para limpar
    resolveRegister({ id: 'mv-1', type: 'manutencao' } as any)
    await waitFor(() => expect(vi.mocked(mockedMovementsRepository.register)).toHaveBeenCalled())
  })
})