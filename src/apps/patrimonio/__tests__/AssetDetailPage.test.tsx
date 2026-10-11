import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const { mockUseCanAccessAction, mockUseWorkspace, mockUseAssetDetail, mockUseReferences } =
  vi.hoisted(() => ({
    mockUseCanAccessAction: vi.fn(),
    mockUseWorkspace: vi.fn(),
    mockUseAssetDetail: vi.fn(),
    mockUseReferences: vi.fn(),
  }))

vi.mock('../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (...args: unknown[]) => mockUseCanAccessAction(...args),
}))
vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))
vi.mock('../hooks/useAssetDetail', () => ({
  MOVEMENTS_PAGE_SIZE: 10,
  useAssetDetail: (id: string | undefined, enabled: boolean) => mockUseAssetDetail(id, enabled),
}))
vi.mock('../hooks/usePatrimonioReferences', () => ({
  usePatrimonioReferences: (enabled: boolean) => mockUseReferences(enabled),
}))

import { AssetDetailPage } from '../pages/AssetDetailPage'
import type { AssetMovement, PatrimonioAsset } from '../../../core/patrimonio'

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
  created_by: null,
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
    <MemoryRouter initialEntries={['/patrimonio/a-1']}>
      <Routes>
        <Route path="/patrimonio/:id" element={<AssetDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AssetDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCanAccessAction.mockReturnValue({ allowed: true, loading: false })
    mockUseWorkspace.mockReturnValue({ workspace: { id: 'ws-1', name: 'Escola A' } })
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
    })
    mockUseReferences.mockReturnValue(references())
  })

  it('exibe todos os campos do bem', () => {
    renderPage()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.getByText('PAT-001')).toBeInTheDocument()
    expect(screen.getAllByText('Sala 101').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fulano').length).toBeGreaterThan(0)
    expect(screen.getByText('Observação importante')).toBeInTheDocument()
  })

  it('exibe o histórico de movimentações', () => {
    renderPage()
    expect(screen.getByText('Histórico de movimentações')).toBeInTheDocument()
    expect(screen.getByText('Transferência')).toBeInTheDocument()
    expect(screen.getByText('por Admin')).toBeInTheDocument()
  })

  it('histórico vazio ⇒ mensagem explícita', () => {
    mockUseAssetDetail.mockReturnValue({
      ...mockUseAssetDetail(),
      movements: [],
    })
    renderPage()
    expect(screen.getByText('Nenhuma movimentação registrada.')).toBeInTheDocument()
  })

  it('bem não encontrado ⇒ estado dedicado', () => {
    mockUseAssetDetail.mockReturnValue({
      asset: null,
      loading: false,
      error: null,
      reloadAsset: vi.fn(),
      movements: [],
      movementsLoading: false,
      movementsError: null,
      movementsHasNext: false,
      loadMoreMovements: vi.fn(),
      reloadMovements: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Bem não encontrado')).toBeInTheDocument()
  })

  it('erro ao carregar o bem ⇒ retry', () => {
    const reloadAsset = vi.fn()
    mockUseAssetDetail.mockReturnValue({
      asset: null,
      loading: false,
      error: { message: 'Falha de rede' },
      reloadAsset,
      movements: [],
      movementsLoading: false,
      movementsError: null,
      movementsHasNext: false,
      loadMoreMovements: vi.fn(),
      reloadMovements: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Falha ao carregar o bem')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tentar novamente'))
    expect(reloadAsset).toHaveBeenCalled()
  })

  it('sem permissão ⇒ bloqueia sem habilitar consulta', () => {
    mockUseCanAccessAction.mockReturnValue({ allowed: false, loading: false })
    renderPage()
    expect(screen.getByText('Sem permissão')).toBeInTheDocument()
    const lastCall = mockUseAssetDetail.mock.calls.at(-1) as [string, boolean]
    expect(lastCall[1]).toBe(false)
  })
})
