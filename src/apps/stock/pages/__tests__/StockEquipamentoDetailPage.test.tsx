import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const {
  mockUseCanAccessAction,
  mockUseWorkspace,
  mockUseAssetDetail,
  mockUseReferences,
} = vi.hoisted(() => ({
  mockUseCanAccessAction: vi.fn(),
  mockUseWorkspace: vi.fn(),
  mockUseAssetDetail: vi.fn(),
  mockUseReferences: vi.fn(),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (...args: unknown[]) => mockUseCanAccessAction(...args),
}))
vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))
vi.mock('../../../../apps/patrimonio/hooks/useAssetDetail', () => ({
  useAssetDetail: (id: string | undefined, workspaceId: string | null, enabled: boolean) => mockUseAssetDetail(id, workspaceId, enabled),
}))
vi.mock('../../../../apps/patrimonio/hooks/usePatrimonioReferences', () => ({
  usePatrimonioReferences: (workspaceId: string | null, enabled: boolean) => mockUseReferences(workspaceId, enabled),
}))

import { StockEquipamentoDetailPage } from '../StockEquipamentoDetailPage'
import type { PatrimonioAsset, PatrimonioReferences, AssetMovement } from '../../../../core/patrimonio'

function references(over: Partial<PatrimonioReferences> = {}): PatrimonioReferences {
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
    ...over,
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
  notes: 'Observação importante',
  metadata: {},
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
}

const movement: AssetMovement = {
  id: 'mv-1',
  workspace_id: 'ws-1',
  asset_id: 'a-1',
  type: 'transferencia',
  to_location_id: 'l-1',
  to_responsible_id: null,
  to_status: 'em_uso',
  to_responsible_nome: null,
  to_responsible_matricula: null,
  expected_return_at: null,
  note: '',
  performed_by: 'u-1',
  performed_by_nome: 'Admin',
  source: 'ui',
  import_batch_id: null,
  created_at: '2026-02-01T00:00:00Z',
}

function renderPage(overrides: { initialEntries?: string[]; assetId?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={overrides.initialEntries ?? [`/stock/equipamentos/${overrides.assetId ?? 'a-1'}`]}>
      <Routes>
        <Route path="/stock/equipamentos/:id" element={<StockEquipamentoDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function setupDefaultMocks() {
  mockUseCanAccessAction.mockImplementation((_action: string) => ({
    allowed: ['patrimonio.view', 'patrimonio.asset.edit', 'patrimonio.asset.move'].includes(_action),
    loading: false,
  }));
  mockUseWorkspace.mockReturnValue({ workspace: { id: 'ws-1', name: 'Lab A' }, workspaces: [] });
  mockUseAssetDetail.mockReturnValue({
    asset,
    loading: false,
    error: null,
    reloadAsset: vi.fn(),
    movements: [movement],
    movementsLoading: false,
    movementsError: null,
    movementsHasNext: false,
    loadMoreMovements: vi.fn(),
    reloadMovements: vi.fn(),
  });
  mockUseReferences.mockReturnValue(references());
}

describe('StockEquipamentoDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    setupDefaultMocks()
  })

  it('sem permissão de visualização ⇒ tela de sem permissão', () => {
    mockUseCanAccessAction.mockImplementation((_action: string) => ({
      allowed: false,
      loading: false,
    }));
    renderPage()
    expect(screen.getByText('Sem permissão')).toBeInTheDocument()
    expect(screen.getByText('Você não tem acesso ao módulo Equipamentos nesta unidade.')).toBeInTheDocument()
  })

  it('carregamento ⇒ mostra skeletons', () => {
    mockUseAssetDetail.mockReturnValue({
      asset: undefined,
      loading: true,
      error: null,
      reloadAsset: vi.fn(),
      movements: [],
      movementsLoading: true,
      movementsError: null,
      movementsHasNext: false,
      loadMoreMovements: vi.fn(),
      reloadMovements: vi.fn(),
    });
    renderPage()
    // Skeleton elements use the class 'skeleton-shimmer'
    const skeletons = document.querySelectorAll('.skeleton-shimmer')
    expect(skeletons.length).toBeGreaterThanOrEqual(4)
  })

  it('erro ao carregar ⇒ mostra erro com botão tentar novamente', () => {
    const reloadAsset = vi.fn()
    mockUseAssetDetail.mockReturnValue({
      asset: undefined,
      loading: false,
      error: { message: 'Erro de rede' },
      reloadAsset,
      movements: [],
      movementsLoading: false,
      movementsError: null,
      movementsHasNext: false,
      loadMoreMovements: vi.fn(),
      reloadMovements: vi.fn(),
    });
    renderPage()
    expect(screen.getByText('Falha ao carregar o equipamento')).toBeInTheDocument()
    expect(screen.getByText('Erro de rede')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(reloadAsset).toHaveBeenCalled()
  })

  it('equipamento inexistente ⇒ tela de não encontrado', () => {
    mockUseAssetDetail.mockReturnValue({
      asset: undefined,
      loading: false,
      error: null,
      reloadAsset: vi.fn(),
      movements: [],
      movementsLoading: false,
      movementsError: null,
      movementsHasNext: false,
      loadMoreMovements: vi.fn(),
      reloadMovements: vi.fn(),
    });
    renderPage()
    expect(screen.getByText('Equipamento não encontrado')).toBeInTheDocument()
    expect(screen.getByText('Este equipamento não existe ou não pertence à unidade ativa.')).toBeInTheDocument()
  })

  it('renderiza dados do equipamento', () => {
    renderPage()
    expect(screen.getByText('PAT-001')).toBeInTheDocument()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.getByText('Notebook')).toBeInTheDocument()
    expect(screen.getByText('Dell Latitude')).toBeInTheDocument()
    expect(screen.getByText('SN-1')).toBeInTheDocument()
    expect(screen.getByText('Lab A')).toBeInTheDocument()
    // There are multiple "Sala 101" elements (detail + movement history), check at least one
    expect(screen.getAllByText('Sala 101').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Fulano')).toBeInTheDocument()
    // "Bom" appears twice (badge + detail), check at least one
    expect(screen.getAllByText('Bom').length).toBeGreaterThanOrEqual(1)
    // "Em uso" appears multiple times (badge + detail + history), check at least one
    expect(screen.getAllByText('Em uso').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Observação importante')).toBeInTheDocument()
    expect(screen.getByText(/Registrado em/)).toBeInTheDocument()
  })

  it('renderiza histórico de movimentações', () => {
    renderPage()
    expect(screen.getByText('Histórico de movimentações')).toBeInTheDocument()
    expect(screen.getByText('Transferência')).toBeInTheDocument()
    // The movement is performed by 'Admin' but rendered as 'por Admin'
    expect(screen.getByText('por Admin')).toBeInTheDocument()
  })

  it('sem permissão de edição ⇒ oculta botão Editar', () => {
    mockUseCanAccessAction.mockImplementation((_action: string) => ({
      allowed: _action === 'patrimonio.view' || _action === 'patrimonio.asset.move',
      loading: false,
    }));
    renderPage()
    expect(screen.queryByLabelText('Editar equipamento')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Movimentar equipamento')).toBeInTheDocument()
  })

  it('sem permissão de movimentação ⇒ oculta botão Movimentar', () => {
    mockUseCanAccessAction.mockImplementation((_action: string) => ({
      allowed: _action === 'patrimonio.view' || _action === 'patrimonio.asset.edit',
      loading: false,
    }));
    renderPage()
    expect(screen.getByLabelText('Editar equipamento')).toBeInTheDocument()
    expect(screen.queryByLabelText('Movimentar equipamento')).not.toBeInTheDocument()
  })

  it('abre formulário de edição com dados pré-preenchidos', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Editar equipamento'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Editar bem')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome do equipamento')).toHaveValue('Notebook Dell')
  })

  it('abre formulário de movimentação', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Movimentar equipamento'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Movimentar bem')).toBeInTheDocument()
  })

  it('encaminha workspaceId ativo ao hook de detalhe', () => {
    renderPage()
    const lastCall = mockUseAssetDetail.mock.calls.at(-1) as [string, string | null, boolean]
    expect(lastCall[0]).toBe('a-1')
    expect(lastCall[1]).toBe('ws-1')
    expect(lastCall[2]).toBe(true)
  })

  it('erro de permissão não vaza dados de outra unidade', () => {
    mockUseCanAccessAction.mockImplementation((_action: string) => ({
      allowed: false,
      loading: false,
    }));
    renderPage()
    expect(screen.queryByText('Notebook Dell')).not.toBeInTheDocument()
    expect(screen.getByText('Sem permissão')).toBeInTheDocument()
  })

  it('erro de carregamento não vaza dados de outra unidade', () => {
    mockUseAssetDetail.mockReturnValue({
      asset: undefined,
      loading: false,
      error: { message: 'Erro' },
      reloadAsset: vi.fn(),
      movements: [],
      movementsLoading: false,
      movementsError: null,
      movementsHasNext: false,
      loadMoreMovements: vi.fn(),
      reloadMovements: vi.fn(),
    });
    renderPage()
    expect(screen.queryByText('Notebook Dell')).not.toBeInTheDocument()
    expect(screen.getByText('Falha ao carregar o equipamento')).toBeInTheDocument()
  })

  it('encaminha workspaceId ativo ao hook de detalhe', () => {
    renderPage()
    const lastCall = mockUseAssetDetail.mock.calls.at(-1) as [string, string | null, boolean]
    expect(lastCall[0]).toBe('a-1')
    expect(lastCall[1]).toBe('ws-1')
    expect(lastCall[2]).toBe(true)
  })

  it('mostra badges de status e condição corretos', () => {
    renderPage()
    // Check the status badge specifically (blue badge with "Em uso")
    const statusBadge = screen.getAllByText('Em uso').find(el => 
      el.closest('span[class*="bg-blue-100"]')
    )
    expect(statusBadge).toBeDefined()
    // For "Bom", check the badge specifically (sky badge)
    const conditionBadge = screen.getAllByText('Bom').find(el => 
      el.closest('span[class*="bg-sky-100"]')
    )
    expect(conditionBadge).toBeDefined()
  })
})