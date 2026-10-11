import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { mockList, mockGet, mockListByAsset, mockListLocations, mockListResponsibles } = vi.hoisted(
  () => ({
    mockList: vi.fn(),
    mockGet: vi.fn(),
    mockListByAsset: vi.fn(),
    mockListLocations: vi.fn(),
    mockListResponsibles: vi.fn(),
  }),
)

// Mantém enums/rótulos reais; troca só a fronteira de rede (repositórios).
vi.mock('../../../core/patrimonio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/patrimonio')>()
  return {
    ...actual,
    assetsRepository: { list: mockList, get: mockGet },
    movementsRepository: { listByAsset: mockListByAsset },
    locationsRepository: { list: mockListLocations },
    responsiblesRepository: { list: mockListResponsibles },
  }
})

import { useAssetsList, ASSETS_PAGE_SIZE } from '../hooks/useAssetsList'
import { usePatrimonioReferences } from '../hooks/usePatrimonioReferences'
import { useAssetDetail, MOVEMENTS_PAGE_SIZE } from '../hooks/useAssetDetail'

async function flush() {
  await act(async () => {})
}

function assetRow(over: Record<string, unknown> = {}) {
  return {
    id: 'a-1',
    workspace_id: 'ws-1',
    asset_tag: 'PAT-001',
    serial_number: null,
    equipment_type: 'Notebook',
    manufacturer: '',
    model: '',
    name: 'Notebook',
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

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockResolvedValue([])
  mockGet.mockResolvedValue(assetRow())
  mockListByAsset.mockResolvedValue([])
  mockListLocations.mockResolvedValue([])
  mockListResponsibles.mockResolvedValue([])
})

describe('useAssetsList — paginação por sobre-leitura', () => {
  it('desabilitado não consulta e permanece vazio (escopo fail-closed)', async () => {
    const { result } = renderHook(() =>
      useAssetsList({ search: '', status: '', condition: '', locationId: '', page: 0, enabled: false }),
    )
    await flush()
    expect(mockList).not.toHaveBeenCalled()
    expect(result.current.assets).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('consulta com limit = PAGE_SIZE + 1 e offset da página', async () => {
    mockList.mockResolvedValue(Array.from({ length: 21 }, (_, i) => assetRow({ id: `a-${i}` })))
    const { result } = renderHook(() =>
      useAssetsList({ search: '', status: '', condition: '', locationId: '', page: 2, enabled: true }),
    )
    await flush()

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: ASSETS_PAGE_SIZE + 1, offset: 2 * ASSETS_PAGE_SIZE }),
    )
    expect(result.current.assets).toHaveLength(ASSETS_PAGE_SIZE)
    expect(result.current.hasNext).toBe(true)
  })

  it('página incompleta ⇒ sem próxima página', async () => {
    mockList.mockResolvedValue([assetRow()])
    const { result } = renderHook(() =>
      useAssetsList({ search: '', status: '', condition: '', locationId: '', page: 0, enabled: true }),
    )
    await flush()
    expect(result.current.hasNext).toBe(false)
    expect(result.current.assets).toHaveLength(1)
  })

  it('normaliza erro e esvazia a lista (nunca mantém dado velho)', async () => {
    mockList.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() =>
      useAssetsList({ search: '', status: '', condition: '', locationId: '', page: 0, enabled: true }),
    )
    await flush()
    expect(result.current.assets).toEqual([])
    expect(result.current.error?.message).toBeTruthy()
  })
})

describe('usePatrimonioReferences', () => {
  it('resolve rótulos de local e responsável', async () => {
    mockListLocations.mockResolvedValue([{ id: 'l-1', nome: 'Sala 101' }])
    mockListResponsibles.mockResolvedValue([{ id: 'r-1', nome: 'Fulano' }])

    const { result } = renderHook(() => usePatrimonioReferences(true))
    await flush()

    expect(result.current.locationLabel('l-1')).toBe('Sala 101')
    expect(result.current.locationLabel(null)).toBeNull()
    expect(result.current.responsibleLabel('r-1')).toBe('Fulano')
  })
})

describe('useAssetDetail', () => {
  it('carrega o bem e a primeira página de movimentos', async () => {
    mockListByAsset.mockResolvedValue(
      Array.from({ length: MOVEMENTS_PAGE_SIZE + 1 }, (_, i) => ({
        id: `mv-${i}`,
        workspace_id: 'ws-1',
        asset_id: 'a-1',
        type: 'transferencia',
        to_location_id: null,
        to_responsible_id: null,
        to_status: 'em_uso',
        to_responsible_nome: null,
        to_responsible_matricula: null,
        expected_return_at: null,
        note: '',
        performed_by: null,
        performed_by_nome: null,
        source: 'ui',
        import_batch_id: null,
        created_at: '2026-01-01T00:00:00Z',
      })),
    )

    const { result } = renderHook(() => useAssetDetail('a-1', true))
    await flush()

    expect(mockGet).toHaveBeenCalledWith('a-1')
    expect(result.current.asset?.id).toBe('a-1')
    expect(result.current.movements).toHaveLength(MOVEMENTS_PAGE_SIZE)
    expect(result.current.movementsHasNext).toBe(true)
  })

  it('desabilitado não consulta', async () => {
    renderHook(() => useAssetDetail('a-1', false))
    await flush()
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockListByAsset).not.toHaveBeenCalled()
  })
})
