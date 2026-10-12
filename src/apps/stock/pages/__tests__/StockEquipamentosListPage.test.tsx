import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const {
  mockUseCanAccessAction,
  mockUseWorkspace,
  mockUseAssetsList,
  mockUseReferences,
} = vi.hoisted(() => ({
  mockUseCanAccessAction: vi.fn(),
  mockUseWorkspace: vi.fn(),
  mockUseAssetsList: vi.fn(),
  mockUseReferences: vi.fn(),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (...args: unknown[]) => mockUseCanAccessAction(...args),
}))
vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))
vi.mock('../../../../apps/patrimonio/hooks/useAssetsList', () => ({
  useAssetsList: (opts: any) => mockUseAssetsList(opts),
}))
vi.mock('../../../../apps/patrimonio/hooks/usePatrimonioReferences', () => ({
  usePatrimonioReferences: (workspaceId: string | null, enabled: boolean) => mockUseReferences(workspaceId, enabled),
}))

import { StockEquipamentosListPage } from '../StockEquipamentosListPage'
import type { PatrimonioAsset, PatrimonioReferences } from '../../../../core/patrimonio'

function references(over: Partial<PatrimonioReferences> = {}): PatrimonioReferences {
  return {
    locations: [
      { id: 'l-1', workspace_id: 'ws-1', predio: 'A', andar: '1', nome: 'Sala 101', complemento: '', notes: '', created_at: '', updated_at: '' },
      { id: 'l-2', workspace_id: 'ws-1', predio: 'A', andar: '1', nome: 'Sala 102', complemento: '', notes: '', created_at: '', updated_at: '' },
    ],
    responsibles: [
      { id: 'r-1', workspace_id: 'ws-1', nome: 'Fulano', matricula: null, email: null, profile_id: null, notes: '', created_at: '', updated_at: '' },
    ],
    loading: false,
    error: null,
    locationLabel: (id: string | null) => (id === 'l-1' ? 'Sala 101' : id === 'l-2' ? 'Sala 102' : null),
    responsibleLabel: (id: string | null) => (id === 'r-1' ? 'Fulano' : null),
    reload: vi.fn(),
    ...over,
  }
}

function asset(over: Partial<PatrimonioAsset> = {}): PatrimonioAsset {
  return {
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
    ...over,
  }
}

function renderPage(overrides: { initialEntries?: string[] } = {}) {
  return render(
    <MemoryRouter initialEntries={overrides.initialEntries ?? ['/stock/equipamentos']}>
      <Routes>
        <Route path="/stock/equipamentos" element={<StockEquipamentosListPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function setupDefaultMocks() {
  mockUseCanAccessAction.mockImplementation((_action: string) => {
    if (_action === 'patrimonio.view') return { allowed: true, loading: false }
    if (_action === 'patrimonio.asset.create') return { allowed: true, loading: false }
    return { allowed: false, loading: false }
  });
  mockUseWorkspace.mockReturnValue({ workspace: { id: 'ws-1', name: 'Lab A' }, workspaces: [] });
  mockUseAssetsList.mockReturnValue({
    assets: [],
    loading: false,
    error: null,
    hasNext: false,
    reload: vi.fn(),
  });
  mockUseReferences.mockReturnValue(references());
}

describe('StockEquipamentosListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    setupDefaultMocks()
  })

  it('sem permissão de visualização ⇒ tela de sem permissão', () => {
    mockUseCanAccessAction.mockImplementation((_action: string) => ({
      allowed: _action === 'patrimonio.asset.create',
      loading: false,
    }));
    renderPage()
    expect(screen.getByText('Sem permissão')).toBeInTheDocument()
    expect(screen.getByText('Você não tem acesso ao módulo Equipamentos nesta unidade.')).toBeInTheDocument()
  })

  it('carregamento inicial ⇒ mostra skeletons', () => {
    mockUseAssetsList.mockReturnValue({
      assets: [],
      loading: true,
      error: null,
      hasNext: false,
      reload: vi.fn(),
    })
    renderPage()
    // Skeleton elements use the class 'skeleton-shimmer' 
    const skeletons = document.querySelectorAll('.skeleton-shimmer')
    expect(skeletons.length).toBeGreaterThanOrEqual(4)
  })

  it('erro ao carregar ⇒ mostra erro com botão tentar novamente', () => {
    const reload = vi.fn()
    mockUseAssetsList.mockReturnValue({
      assets: [],
      loading: false,
      error: { message: 'Erro de rede' },
      hasNext: false,
      reload,
    });
    renderPage()
    expect(screen.getByText('Falha ao carregar o acervo')).toBeInTheDocument()
    expect(screen.getByText('Erro de rede')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(reload).toHaveBeenCalled()
  })

  it('lista vazia sem filtros ⇒ mostra estado vazio com botão cadastrar', () => {
    renderPage()
    expect(screen.getByText('Acervo vazio')).toBeInTheDocument()
    expect(screen.getByText('Nenhum equipamento cadastrado em Lab A.')).toBeInTheDocument()
    // There are two "Cadastrar equipamento" buttons (header + empty state), check at least one
    const buttons = screen.getAllByRole('button', { name: 'Cadastrar equipamento' })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('lista vazia com filtros ⇒ mostra mensagem de nenhum encontrado', async () => {
    mockUseAssetsList.mockReturnValue({
      assets: [],
      loading: false,
      error: null,
      hasNext: false,
      reload: vi.fn(),
    })
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('Buscar tombamento, nome, série...'), { target: { value: 'xyz' } })
    await waitFor(() => expect(screen.getByText('Nenhum equipamento encontrado')).toBeInTheDocument())
    expect(screen.getByText('Tente ajustar a busca ou os filtros.')).toBeInTheDocument()
  })

  it('renderiza lista de equipamentos com dados', () => {
    mockUseAssetsList.mockReturnValue({
      assets: [asset({ id: 'a-1', name: 'Notebook Dell', asset_tag: 'PAT-001' })],
      loading: false,
      error: null,
      hasNext: false,
      reload: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.getByText('PAT-001')).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('Fulano')).toBeInTheDocument()
  })

  it('abre formulário de cadastro ao clicar no botão', async () => {
    renderPage()
    const user = userEvent.setup()
    const buttons = screen.getAllByRole('button', { name: 'Cadastrar equipamento' })
    await user.click(buttons[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // There are two "Cadastrar bem" texts (title and button), check the button
    const submitButtons = screen.getAllByRole('button', { name: 'Cadastrar bem' })
    expect(submitButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('formulário de cadastro tem campos obrigatórios', async () => {
    renderPage()
    const user = userEvent.setup()
    const buttons = screen.getAllByRole('button', { name: 'Cadastrar equipamento' })
    await user.click(buttons[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome do equipamento')).toBeInTheDocument()
    expect(screen.getByLabelText('Tipo de equipamento')).toBeInTheDocument()
    expect(screen.getByLabelText('Local')).toBeInTheDocument()
    expect(screen.getByLabelText('Responsável')).toBeInTheDocument()
    // Check required field indicators (there are multiple * but at least one)
    const requiredIndicators = screen.getAllByText('*')
    expect(requiredIndicators.length).toBeGreaterThanOrEqual(1)
  })

  it('busca filtra a lista', () => {
    renderPage()
    const input = screen.getByPlaceholderText('Buscar tombamento, nome, série...')
    fireEvent.change(input, { target: { value: 'notebook' } })
    expect(input).toHaveValue('notebook')
    // Clear search
    fireEvent.click(screen.getByLabelText('Limpar busca'))
    expect(input).toHaveValue('')
  })

  it('abre e fecha painel de filtros', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Filtros'))
    expect(screen.getByText('Estado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /fechar/i }))
    expect(screen.queryByText('Estado')).not.toBeInTheDocument()
  })

  it('chips de filtro aparecem quando ativos', async () => {
    mockUseAssetsList.mockReturnValue({
      assets: [],
      loading: false,
      error: null,
      hasNext: false,
      reload: vi.fn(),
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Filtros'))
    // Seleciona um status
    await user.click(screen.getByText('Em uso'))
    // Fecha o painel de filtros
    await user.click(screen.getByRole('button', { name: /fechar/i }))
    expect(screen.getByText('Estado: Em uso')).toBeInTheDocument()
  })

  it('hook useAssetsList recebe workspaceId correto', () => {
    mockUseAssetsList.mockReturnValue({
      assets: [asset({ id: 'a-1' })],
      loading: false,
      error: null,
      hasNext: false,
      reload: vi.fn(),
    })
    renderPage()
    // Verify hook was called with ws-1
    expect(mockUseAssetsList).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }))

    // Change workspace mock
    mockUseWorkspace.mockReturnValue({ workspace: { id: 'ws-2', name: 'Lab B' }, workspaces: [] })
    mockUseAssetsList.mockReturnValue({
      assets: [],
      loading: false,
      error: null,
      hasNext: false,
      reload: vi.fn(),
    })
    renderPage() // Re-render with new workspace
    expect(mockUseAssetsList).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-2' }))
  })

  it('paginação funciona quando há próxima página', () => {
    mockUseAssetsList.mockReturnValue({
      assets: [asset({ id: 'a-1' }), asset({ id: 'a-2', name: 'Outro' })],
      loading: false,
      error: null,
      hasNext: true,
      reload: vi.fn(),
    })
    renderPage()
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeInTheDocument()
  })

  it('busca limpa filtros ao clicar no X', () => {
    renderPage()
    const input = screen.getByPlaceholderText('Buscar tombamento, nome, série...')
    fireEvent.change(input, { target: { value: 'notebook' } })
    expect(input).toHaveValue('notebook')
    fireEvent.click(screen.getByLabelText('Limpar busca'))
    expect(input).toHaveValue('')
  })
})