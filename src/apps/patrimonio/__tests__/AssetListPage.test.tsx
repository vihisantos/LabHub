import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { mockUseCanAccessAction, mockUseWorkspace, mockUseAssetsList, mockUseReferences } =
  vi.hoisted(() => ({
    mockUseCanAccessAction: vi.fn(),
    mockUseWorkspace: vi.fn(),
    mockUseAssetsList: vi.fn(),
    mockUseReferences: vi.fn(),
  }))

vi.mock('../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (...args: unknown[]) => mockUseCanAccessAction(...args),
}))

vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))

vi.mock('../hooks/useAssetsList', () => ({
  ASSETS_PAGE_SIZE: 20,
  useAssetsList: (options: unknown) => mockUseAssetsList(options),
}))

vi.mock('../hooks/usePatrimonioReferences', () => ({
  usePatrimonioReferences: (enabled: boolean) => mockUseReferences(enabled),
}))

import { AssetListPage } from '../pages/AssetListPage'
import type { PatrimonioAsset } from '../../../core/patrimonio'

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
    location_id: null,
    responsible_id: null,
    status: 'disponivel',
    condition: 'bom',
    notes: '',
    metadata: {},
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function references() {
  return {
    locations: [{ id: 'l-1', nome: 'Sala 101' }],
    responsibles: [{ id: 'r-1', nome: 'Fulano' }],
    loading: false,
    error: null,
    locationLabel: (id: string | null) => (id === 'l-1' ? 'Sala 101' : null),
    responsibleLabel: (id: string | null) => (id === 'r-1' ? 'Fulano' : null),
    reload: vi.fn(),
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AssetListPage />
    </MemoryRouter>,
  )
}

describe('AssetListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCanAccessAction.mockReturnValue({ allowed: true, loading: false })
    mockUseWorkspace.mockReturnValue({ workspace: { id: 'ws-1', name: 'Escola A' } })
    mockUseAssetsList.mockReturnValue({
      assets: [asset()],
      loading: false,
      error: null,
      hasNext: false,
      reload: vi.fn(),
    })
    mockUseReferences.mockReturnValue(references())
  })

  it('renderiza os bens do acervo', () => {
    renderPage()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.getByText('PAT-001')).toBeInTheDocument()
    expect(screen.getByText('Escola A')).toBeInTheDocument()
  })

  it('mostra skeleton no carregamento inicial', () => {
    mockUseAssetsList.mockReturnValue({ assets: [], loading: true, error: null, hasNext: false, reload: vi.fn() })
    const { container } = renderPage()
    expect(container.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0)
  })

  it('acervo vazio e sem filtros ⇒ estado vazio da unidade', () => {
    mockUseAssetsList.mockReturnValue({ assets: [], loading: false, error: null, hasNext: false, reload: vi.fn() })
    renderPage()
    expect(screen.getByText('Acervo vazio')).toBeInTheDocument()
  })

  it('sem resultados com filtros ativos ⇒ mensagem de "nenhum encontrado"', () => {
    mockUseAssetsList.mockReturnValue({ assets: [], loading: false, error: null, hasNext: false, reload: vi.fn() })
    renderPage()
    fireEvent.click(screen.getByLabelText('Filtros'))
    fireEvent.click(screen.getByText('Disponível'))
    expect(screen.getByText('Nenhum bem encontrado')).toBeInTheDocument()
  })

  it('erro na consulta ⇒ estado de erro com retry que recarrega', () => {
    const reload = vi.fn()
    mockUseAssetsList.mockReturnValue({
      assets: [],
      loading: false,
      error: { message: 'Sem conexão' },
      hasNext: false,
      reload,
    })
    renderPage()
    expect(screen.getByText('Falha ao carregar o acervo')).toBeInTheDocument()
    expect(screen.getByText('Sem conexão')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tentar novamente'))
    expect(reload).toHaveBeenCalled()
  })

  it('sem permissão ⇒ bloqueia sem chamar a listagem', () => {
    mockUseCanAccessAction.mockReturnValue({ allowed: false, loading: false })
    renderPage()
    expect(screen.getByText('Sem permissão')).toBeInTheDocument()
    const lastCall = mockUseAssetsList.mock.calls.at(-1)?.[0] as { enabled: boolean }
    expect(lastCall.enabled).toBe(false)
  })

  it('sem unidade ativa ⇒ mensagem de contexto ausente', () => {
    mockUseWorkspace.mockReturnValue({ workspace: null })
    renderPage()
    expect(screen.getByText('Nenhuma unidade ativa')).toBeInTheDocument()
  })

  it('não exibe paginação quando há uma única página', () => {
    renderPage()
    expect(screen.queryByLabelText('Paginação')).not.toBeInTheDocument()
  })

  it('paginação: avançar incrementa a página enviada ao hook', () => {
    mockUseAssetsList.mockReturnValue({
      assets: [asset()],
      loading: false,
      error: null,
      hasNext: true,
      reload: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Página 1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Próxima'))
    expect(screen.getByText('Página 2')).toBeInTheDocument()
    const lastCall = mockUseAssetsList.mock.calls.at(-1)?.[0] as { page: number }
    expect(lastCall.page).toBe(1)
  })

  it('busca é debounced e reinicia a página', async () => {
    renderPage()
    const input = screen.getByPlaceholderText(/Buscar/)
    fireEvent.change(input, { target: { value: 'notebook' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    const lastCall = mockUseAssetsList.mock.calls.at(-1)?.[0] as { search: string; page: number }
    expect(lastCall.search).toBe('notebook')
    expect(lastCall.page).toBe(0)
  })
})
