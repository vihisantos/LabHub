import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

vi.mock('../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (...args: unknown[]) => mockUseCanAccessAction(...args),
}))
vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))
vi.mock('../hooks/useAssetDetail', () => ({
  MOVEMENTS_PAGE_SIZE: 10,
  useAssetDetail: (id: string | undefined, workspaceId: string | null, enabled: boolean) =>
    mockUseAssetDetail(id, workspaceId, enabled),
}))
vi.mock('../hooks/usePatrimonioReferences', () => ({
  usePatrimonioReferences: (workspaceId: string | null, enabled: boolean) =>
    mockUseReferences(workspaceId, enabled),
}))
vi.mock('../components/AssetFormModal', () => ({
  AssetFormModal: ({ open, onSaved }: { open: boolean; onSaved: (asset: unknown) => void }) =>
    open ? (
      <button type="button" onClick={() => onSaved({ id: 'a-1' })}>
        stub-salvar
      </button>
    ) : null,
}))
vi.mock('../components/MovementFormModal', () => ({
  MovementFormModal: ({
    open,
    onSaved,
  }: {
    open: boolean
    onSaved: (movement: unknown) => void
  }) =>
    open ? (
      <button type="button" onClick={() => onSaved({ id: 'mv-new', type: 'transferencia' })}>
        stub-salvar-movimento
      </button>
    ) : null,
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
    locations: [
      { id: 'l-1', nome: 'Sala 101', workspace_id: 'ws-1', predio: '', andar: '', complemento: '', notes: '', created_at: '', updated_at: '' },
      { id: 'l-2', nome: 'Sala 102', workspace_id: 'ws-1', predio: '', andar: '', complemento: '', notes: '', created_at: '', updated_at: '' },
    ],
    responsibles: [
      { id: 'r-1', nome: 'Fulano', workspace_id: 'ws-1', matricula: null, email: null, profile_id: null, notes: '', created_at: '', updated_at: '' },
      { id: 'r-2', nome: 'Ciclano', workspace_id: 'ws-1', matricula: null, email: null, profile_id: null, notes: '', created_at: '', updated_at: '' },
    ],
    loading: false,
    error: null,
    locationLabel: (id: string | null) => (id === 'l-1' ? 'Sala 101' : id === 'l-2' ? 'Sala 102' : null),
    responsibleLabel: (id: string | null) => (id === 'r-1' ? 'Fulano' : id === 'r-2' ? 'Ciclano' : null),
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

describe('AssetDetailPage — movimento', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCanAccessAction.mockImplementation((action: string) => ({
      allowed: action === 'patrimonio.view' || action === 'patrimonio.asset.edit' || action === 'patrimonio.asset.move',
      loading: false,
    }))
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

  it('autorizado a movimentar ⇒ mostra o botão Movimentar', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Movimentar bem' })).toBeInTheDocument()
  })

  it('sem permissão de movimentação ⇒ oculta o botão Movimentar', () => {
    mockUseCanAccessAction.mockImplementation((action: string) => ({
      allowed: action === 'patrimonio.view' || action === 'patrimonio.asset.edit',
      loading: false,
    }))
    renderPage()
    expect(screen.queryByRole('button', { name: 'Movimentar bem' })).not.toBeInTheDocument()
  })

  it('clicar em Movimentar abre o modal de movimentação', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Movimentar bem' }))
    expect(screen.getByText('stub-salvar-movimento')).toBeInTheDocument()
  })

  it('movimentação bem-sucedida recarrega o histórico', () => {
    const reloadMovements = vi.fn()
    mockUseAssetDetail.mockReturnValue({ ...mockUseAssetDetail(), reloadMovements })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Movimentar bem' }))
    fireEvent.click(screen.getByText('stub-salvar-movimento'))

    expect(reloadMovements).toHaveBeenCalled()
  })
})

describe('AssetDetailPage — edição (regressão)', () => {
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

  it('encaminha a unidade ativa ao hook de detalhe', () => {
    renderPage()
    const lastCall = mockUseAssetDetail.mock.calls.at(-1) as [string, string | null, boolean]
    expect(lastCall[0]).toBe('a-1')
    expect(lastCall[1]).toBe('ws-1')
  })

  it('autorizado a editar ⇒ mostra o botão Editar', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Editar bem' })).toBeInTheDocument()
  })

  it('sem permissão de edição ⇒ oculta o botão Editar', () => {
    mockUseCanAccessAction.mockImplementation((action: string) => ({
      allowed: action === 'patrimonio.view',
      loading: false,
    }))
    renderPage()
    expect(screen.queryByRole('button', { name: 'Editar bem' })).not.toBeInTheDocument()
  })

  it('edição bem-sucedida recarrega o bem', () => {
    const reloadAsset = vi.fn()
    mockUseAssetDetail.mockReturnValue({ ...mockUseAssetDetail(), reloadAsset })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Editar bem' }))
    fireEvent.click(screen.getByText('stub-salvar'))

    expect(reloadAsset).toHaveBeenCalled()
  })
})