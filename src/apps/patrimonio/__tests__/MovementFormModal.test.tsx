import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockRegister, mockListByAsset, mockListRecent } = vi.hoisted(() => ({
  mockRegister: vi.fn(),
  mockListByAsset: vi.fn(),
  mockListRecent: vi.fn(),
}))

vi.mock('../../../core/patrimonio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/patrimonio')>()
  return {
    ...actual,
    movementsRepository: {
      ...actual.movementsRepository,
      register: mockRegister,
      listByAsset: mockListByAsset,
      listRecent: mockListRecent,
    },
  }
})

import { MovementFormModal } from '../components/MovementFormModal'
import type { PatrimonioAsset, PatrimonioReferences } from '../../../core/patrimonio'

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
    vi.useRealTimers()
    mockRegister.mockResolvedValue({ id: 'mv-1', type: 'manutencao' } as any)
    mockListByAsset.mockResolvedValue([])
    mockListRecent.mockResolvedValue([])
  })

  it('renderiza fechado quando open=false', () => {
    const { queryByRole } = renderModal({ open: false })
    expect(queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra título e estado atual do bem', () => {
    renderModal()
    expect(screen.getByText('Movimentar bem')).toBeInTheDocument()
    expect(screen.getByText('Bem atual')).toBeInTheDocument()
    const currentAssetSection = screen.getByText('Bem atual').closest('div')
    expect(within(currentAssetSection!).getByText('Sala 101')).toBeInTheDocument()
    expect(within(currentAssetSection!).getByText('Fulano')).toBeInTheDocument()
    expect(within(currentAssetSection!).getByText('Em uso')).toBeInTheDocument()
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

  it('transferência exige local', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    await waitFor(() => expect(screen.getByText('Transferência exige o local de destino.')).toBeInTheDocument())
    // Status is pre-filled with valid default, so no status error
  })

  it('troca para empréstimo ⇒ exige responsável', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'emprestimo')
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    await waitFor(() => expect(screen.getByText('Esta operação exige um responsável de destino.')).toBeInTheDocument())
    // Validation stops at first error (responsible), so expected_return_at error not shown yet
  })

  it('troca para devolução ⇒ não exige campos, status padrão disponível', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'devolucao')
    await waitFor(() => expect(screen.getByDisplayValue('Disponível')).toBeInTheDocument())
  })

  it('baixa não permite alterar status (terminal)', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'baixa')
    await waitFor(() =>
      expect(
        screen.getByText((_content, el) => el != null && el.tagName === 'P' && (el.textContent?.includes('Status será alterado automaticamente para Baixado.') ?? false))
      ).toBeInTheDocument()
    )
  })

  it('validação: origem e destino iguais na transferência', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'transferencia')
    await user.selectOptions(screen.getByLabelText('Local de destino'), 'Sala 101')
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    await waitFor(() => expect(screen.getByText('Origem e destino são iguais — nenhuma transferência necessária.')).toBeInTheDocument())
  })

  it('validação: responsável igual na troca de responsável', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'responsavel')
    await user.selectOptions(screen.getByLabelText('Responsável de destino'), 'Fulano')
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    await waitFor(() => expect(screen.getByText('O responsável informado já é o atual — nenhuma alteração necessária.')).toBeInTheDocument())
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
    await waitFor(() => expect(screen.getByText('Equipamento baixado é terminal — apenas correção é permitida.')).toBeInTheDocument())
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
    await waitFor(() => expect(screen.getByText('Este equipamento já está emprestado — registre a devolução primeiro.')).toBeInTheDocument())
  })

  it('devolução sem empréstimo bloqueada', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Tipo de movimentação'), 'devolucao')
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    await waitFor(() => expect(screen.getByText('Só é possível devolver um equipamento que está emprestado.')).toBeInTheDocument())
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

  it('fecha ao clicar em Cancelar', async () => {
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
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('não fecha durante submissão', async () => {
    const onClose = vi.fn()
    let resolveRegister: (value: any) => void = () => {}
    const registerPromise = new Promise((resolve) => {
      resolveRegister = resolve
    })
    mockRegister.mockReturnValue(registerPromise)
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
    await user.click(screen.getByRole('button', { name: 'Registrar movimentação' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled())
    expect(onClose).not.toHaveBeenCalled()
    resolveRegister({ id: 'mv-1', type: 'manutencao' } as any)
    await waitFor(() => expect(mockRegister).toHaveBeenCalled())
  })
})