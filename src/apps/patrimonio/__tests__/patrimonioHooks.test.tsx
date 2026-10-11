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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

function movementRow(over: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
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
    ...over,
  }
}

function listProps(ws: string | null, enabled = true) {
  return {
    search: '',
    status: '' as const,
    condition: '' as const,
    locationId: '',
    page: 0,
    workspaceId: ws,
    enabled,
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
    const { result } = renderHook(() => useAssetsList(listProps('ws-1', false)))
    await flush()
    expect(mockList).not.toHaveBeenCalled()
    expect(result.current.assets).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('consulta com limit = PAGE_SIZE + 1 e offset da página', async () => {
    mockList.mockResolvedValue(Array.from({ length: 21 }, (_, i) => assetRow({ id: `a-${i}` })))
    const { result } = renderHook(() => useAssetsList({ ...listProps('ws-1'), page: 2 }))
    await flush()

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        limit: ASSETS_PAGE_SIZE + 1,
        offset: 2 * ASSETS_PAGE_SIZE,
      }),
    )
    expect(result.current.assets).toHaveLength(ASSETS_PAGE_SIZE)
    expect(result.current.hasNext).toBe(true)
  })

  it('página incompleta ⇒ sem próxima página', async () => {
    mockList.mockResolvedValue([assetRow()])
    const { result } = renderHook(() => useAssetsList(listProps('ws-1')))
    await flush()
    expect(result.current.hasNext).toBe(false)
    expect(result.current.assets).toHaveLength(1)
  })

  it('normaliza erro e esvazia a lista (nunca mantém dado velho)', async () => {
    mockList.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAssetsList(listProps('ws-1')))
    await flush()
    expect(result.current.assets).toEqual([])
    expect(result.current.error?.message).toBeTruthy()
  })
})

describe('useAssetsList — isolamento por unidade', () => {
  it('troca de unidade A→B mantendo enabled refaz a consulta para B', async () => {
    mockList.mockResolvedValueOnce([assetRow({ id: 'a-A' })])
    const { result, rerender } = renderHook(
      ({ ws }: { ws: string }) => useAssetsList(listProps(ws)),
      { initialProps: { ws: 'A' } },
    )
    await flush()
    expect(result.current.assets.map((a) => a.id)).toEqual(['a-A'])
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: 'A' }))

    mockList.mockResolvedValueOnce([assetRow({ id: 'a-B' })])
    await act(async () => {
      rerender({ ws: 'B' })
    })
    await flush()
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: 'B' }))
    expect(result.current.assets.map((a) => a.id)).toEqual(['a-B'])
  })

  it('limpa a lista imediatamente ao trocar de unidade (nada de A na transição)', async () => {
    mockList.mockResolvedValueOnce([assetRow({ id: 'a-A' })])
    const { result, rerender } = renderHook(
      ({ ws }: { ws: string }) => useAssetsList(listProps(ws)),
      { initialProps: { ws: 'A' } },
    )
    await flush()
    expect(result.current.assets).toHaveLength(1)

    const b = deferred<unknown[]>()
    mockList.mockImplementationOnce(() => b.promise)
    await act(async () => {
      rerender({ ws: 'B' })
    })
    // B ainda não respondeu: a lista de A não pode permanecer visível.
    expect(result.current.assets).toEqual([])

    await act(async () => {
      b.resolve([assetRow({ id: 'a-B' })])
    })
    await flush()
    expect(result.current.assets.map((a) => a.id)).toEqual(['a-B'])
  })

  it('resposta atrasada de A não sobrescreve os dados de B', async () => {
    const a = deferred<unknown[]>()
    const b = deferred<unknown[]>()
    mockList.mockImplementationOnce(() => a.promise)
    const { result, rerender } = renderHook(
      ({ ws }: { ws: string }) => useAssetsList(listProps(ws)),
      { initialProps: { ws: 'A' } },
    )
    await flush()

    mockList.mockImplementationOnce(() => b.promise)
    await act(async () => {
      rerender({ ws: 'B' })
    })
    await flush()

    await act(async () => {
      b.resolve([assetRow({ id: 'a-B' })])
    })
    await flush()
    expect(result.current.assets.map((x) => x.id)).toEqual(['a-B'])

    // A chega DEPOIS de B — deve ser descartada.
    await act(async () => {
      a.resolve([assetRow({ id: 'a-A' })])
    })
    await flush()
    expect(result.current.assets.map((x) => x.id)).toEqual(['a-B'])
  })

  it('revogar a permissão (enabled=false) esvazia os dados e não consulta de novo', async () => {
    mockList.mockResolvedValue([assetRow({ id: 'a-A' })])
    const { result, rerender } = renderHook(
      ({ en }: { en: boolean }) => useAssetsList(listProps('A', en)),
      { initialProps: { en: true } },
    )
    await flush()
    expect(result.current.assets).toHaveLength(1)
    const callsBefore = mockList.mock.calls.length

    await act(async () => {
      rerender({ en: false })
    })
    await flush()
    expect(result.current.assets).toEqual([])
    expect(mockList.mock.calls.length).toBe(callsBefore)
  })

  it('sem unidade ativa não consulta nem mostra dados remanescentes', async () => {
    mockList.mockResolvedValue([assetRow()])
    const { result } = renderHook(() => useAssetsList(listProps(null, true)))
    await flush()
    expect(mockList).not.toHaveBeenCalled()
    expect(result.current.assets).toEqual([])
  })
})

describe('usePatrimonioReferences', () => {
  it('resolve rótulos de local e responsável', async () => {
    mockListLocations.mockResolvedValue([{ id: 'l-1', nome: 'Sala 101' }])
    mockListResponsibles.mockResolvedValue([{ id: 'r-1', nome: 'Fulano' }])

    const { result } = renderHook(() => usePatrimonioReferences('ws-1', true))
    await flush()

    expect(mockListLocations).toHaveBeenCalledWith('ws-1')
    expect(mockListResponsibles).toHaveBeenCalledWith('ws-1')
    expect(result.current.locationLabel('l-1')).toBe('Sala 101')
    expect(result.current.locationLabel(null)).toBeNull()
    expect(result.current.responsibleLabel('r-1')).toBe('Fulano')
  })

  it('troca de unidade substitui locais e responsáveis (sem vazar os do A)', async () => {
    mockListLocations.mockResolvedValueOnce([{ id: 'l-A', nome: 'Local A' }])
    mockListResponsibles.mockResolvedValueOnce([{ id: 'r-A', nome: 'Resp A' }])
    const { result, rerender } = renderHook(
      ({ ws }: { ws: string }) => usePatrimonioReferences(ws, true),
      { initialProps: { ws: 'A' } },
    )
    await flush()
    expect(result.current.locationLabel('l-A')).toBe('Local A')
    expect(result.current.responsibleLabel('r-A')).toBe('Resp A')

    mockListLocations.mockResolvedValueOnce([{ id: 'l-B', nome: 'Local B' }])
    mockListResponsibles.mockResolvedValueOnce([{ id: 'r-B', nome: 'Resp B' }])
    await act(async () => {
      rerender({ ws: 'B' })
    })
    await flush()
    expect(mockListLocations).toHaveBeenLastCalledWith('B')
    expect(mockListResponsibles).toHaveBeenLastCalledWith('B')
    expect(result.current.locationLabel('l-B')).toBe('Local B')
    expect(result.current.responsibleLabel('r-B')).toBe('Resp B')
    expect(result.current.locationLabel('l-A')).toBeNull()
    expect(result.current.responsibleLabel('r-A')).toBeNull()
  })

  it('sem unidade ativa não consulta', async () => {
    renderHook(() => usePatrimonioReferences(null, true))
    await flush()
    expect(mockListLocations).not.toHaveBeenCalled()
    expect(mockListResponsibles).not.toHaveBeenCalled()
  })
})

describe('useAssetDetail', () => {
  it('carrega o bem e a primeira página de movimentos', async () => {
    mockListByAsset.mockResolvedValue(
      Array.from({ length: MOVEMENTS_PAGE_SIZE + 1 }, (_, i) => movementRow({ id: `mv-${i}` })),
    )

    const { result } = renderHook(() => useAssetDetail('a-1', 'ws-1', true))
    await flush()

    expect(mockGet).toHaveBeenCalledWith('a-1', 'ws-1')
    expect(mockListByAsset).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ workspaceId: 'ws-1' }),
    )
    expect(result.current.asset?.id).toBe('a-1')
    expect(result.current.movements).toHaveLength(MOVEMENTS_PAGE_SIZE)
    expect(result.current.movementsHasNext).toBe(true)
  })

  it('desabilitado não consulta', async () => {
    renderHook(() => useAssetDetail('a-1', 'ws-1', false))
    await flush()
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockListByAsset).not.toHaveBeenCalled()
  })

  it('sem unidade ativa não consulta', async () => {
    renderHook(() => useAssetDetail('a-1', null, true))
    await flush()
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockListByAsset).not.toHaveBeenCalled()
  })

  it('troca de unidade: o bem anterior não permanece visível', async () => {
    mockGet.mockResolvedValueOnce(assetRow({ id: 'a-1', name: 'Bem A' }))
    const { result, rerender } = renderHook(
      ({ ws }: { ws: string }) => useAssetDetail('a-1', ws, true),
      { initialProps: { ws: 'A' } },
    )
    await flush()
    expect(result.current.asset?.name).toBe('Bem A')
    expect(mockGet).toHaveBeenLastCalledWith('a-1', 'A')

    const b = deferred<Record<string, unknown>>()
    mockGet.mockImplementationOnce(() => b.promise)
    await act(async () => {
      rerender({ ws: 'B' })
    })
    // B ainda carregando: o bem de A foi limpo.
    expect(result.current.asset).toBeNull()

    await act(async () => {
      b.resolve(assetRow({ id: 'a-1', name: 'Bem B' }))
    })
    await flush()
    expect(result.current.asset?.name).toBe('Bem B')
    expect(mockGet).toHaveBeenLastCalledWith('a-1', 'B')
  })

  it('histórico: movimentações de A não aparecem na unidade B', async () => {
    const a = deferred<unknown[]>()
    const b = deferred<unknown[]>()
    mockGet.mockResolvedValue(assetRow({ id: 'a-1' }))
    mockListByAsset.mockImplementationOnce(() => a.promise)
    const { result, rerender } = renderHook(
      ({ ws }: { ws: string }) => useAssetDetail('a-1', ws, true),
      { initialProps: { ws: 'A' } },
    )
    await flush()
    expect(mockListByAsset).toHaveBeenLastCalledWith(
      'a-1',
      expect.objectContaining({ workspaceId: 'A' }),
    )

    mockListByAsset.mockImplementationOnce(() => b.promise)
    await act(async () => {
      rerender({ ws: 'B' })
    })
    await flush()

    await act(async () => {
      b.resolve([movementRow({ id: 'mv-B' })])
    })
    await flush()
    expect(result.current.movements.map((m) => m.id)).toEqual(['mv-B'])

    // Histórico de A chega atrasado — não pode substituir o de B.
    await act(async () => {
      a.resolve([movementRow({ id: 'mv-A' })])
    })
    await flush()
    expect(result.current.movements.map((m) => m.id)).toEqual(['mv-B'])
  })
})
