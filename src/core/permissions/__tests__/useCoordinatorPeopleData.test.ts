import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCoordinatorPeopleData } from '../useCoordinatorPeopleData'
import {
  getCoordinatorRequests,
  getCoordinatorInactiveMembers,
  getCoordinatorUnitOverview,
  getLastCoordinatorServiceError,
} from '../coordinatorService'

vi.mock('../coordinatorService', () => ({
  getCoordinatorRequests: vi.fn(),
  getCoordinatorInactiveMembers: vi.fn(),
  getCoordinatorUnitOverview: vi.fn(),
  getLastCoordinatorServiceError: vi.fn(),
}))

const mockGetRequests = vi.mocked(getCoordinatorRequests)
const mockGetInactive = vi.mocked(getCoordinatorInactiveMembers)
const mockGetOverview = vi.mocked(getCoordinatorUnitOverview)
const mockGetLastError = vi.mocked(getLastCoordinatorServiceError)

// ---------------------------------------------------------------------------
// Fixtures mínimas — apenas o que o hook usa dos tipos
// ---------------------------------------------------------------------------

function makeRequest(id: string): import('../coordinatorService').CoordinatorRequest {
  return {
    membership: {
      id: `ms-${id}`,
      profile_id: `u-${id}`,
      workspace_id: 'ws1',
      role_id: 'role-tec',
      status: 'pending',
      managed_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    profile: {
      id: `u-${id}`,
      name: `Pessoa ${id}`,
      email: `${id}@b.com`,
      status: 'active',
      roleId: 'role-tec',
    },
  }
}

function makeInactive(
  id: string,
  status: 'suspended' | 'removed',
): import('../coordinatorService').CoordinatorInactiveMember {
  return {
    membership: {
      id: `ms-${id}`,
      profile_id: `u-${id}`,
      workspace_id: 'ws1',
      role_id: 'role-tec',
      status,
      managed_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    profile: {
      id: `u-${id}`,
      name: `Inativo ${id}`,
      email: `${id}@b.com`,
      status: 'active',
      roleId: 'role-tec',
    },
  }
}

function makeOverview(): import('../coordinatorService').CoordinatorUnitOverview {
  return {
    workspace: { id: 'ws1', name: 'Campus A' },
    tickets: { open: 2, in_progress: 1, unassigned: 1, high_priority: 0, urgent: 0 },
    recent: [],
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Padrão seguro: sem erro, retornos vazios
  mockGetLastError.mockReturnValue(null)
  mockGetRequests.mockResolvedValue([])
  mockGetInactive.mockResolvedValue([])
  mockGetOverview.mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('useCoordinatorPeopleData', () => {
  describe('unidades vazias', () => {
    it('unitsKey vazio → não chama RPCs, todos os estados em branco', async () => {
      const { result } = renderHook(() => useCoordinatorPeopleData(''))
      await act(async () => {})

      expect(mockGetRequests).not.toHaveBeenCalled()
      expect(mockGetInactive).not.toHaveBeenCalled()
      expect(mockGetOverview).not.toHaveBeenCalled()

      expect(result.current.requestsByUnit).toEqual({})
      expect(result.current.requestsLoading).toBe(false)
      expect(result.current.requestsFailed).toBe(false)

      expect(result.current.inactiveByUnit).toEqual({})
      expect(result.current.inactiveLoading).toBe(false)
      expect(result.current.inactiveFailed).toBe(false)

      expect(result.current.overviewByUnit).toEqual({})
      expect(result.current.overviewLoading).toBe(false)
      expect(result.current.overviewFailed).toBe(false)
    })
  })

  describe('carregamento normal — uma unidade', () => {
    it('carrega os três loaders e preenche os maps', async () => {
      mockGetRequests.mockResolvedValue([makeRequest('r1')])
      mockGetInactive.mockResolvedValue([makeInactive('i1', 'suspended')])
      mockGetOverview.mockResolvedValue(makeOverview())

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))
      await act(async () => {})

      expect(mockGetRequests).toHaveBeenCalledWith('ws1')
      expect(mockGetInactive).toHaveBeenCalledWith('ws1')
      expect(mockGetOverview).toHaveBeenCalledWith('ws1')

      expect(result.current.requestsByUnit['ws1']).toHaveLength(1)
      expect(result.current.inactiveByUnit['ws1']).toHaveLength(1)
      expect(result.current.overviewByUnit['ws1']).toBeDefined()

      expect(result.current.requestsLoading).toBe(false)
      expect(result.current.inactiveLoading).toBe(false)
      expect(result.current.overviewLoading).toBe(false)

      expect(result.current.requestsFailed).toBe(false)
      expect(result.current.inactiveFailed).toBe(false)
      expect(result.current.overviewFailed).toBe(false)
    })
  })

  describe('múltiplas unidades', () => {
    it('chama os RPCs para cada unidade e preenche entradas distintas', async () => {
      mockGetRequests.mockImplementation(async (ws: string) =>
        ws === 'ws1' ? [makeRequest('r1')] : [],
      )
      mockGetInactive.mockResolvedValue([])
      mockGetOverview.mockResolvedValue(makeOverview())

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1|ws2'))
      await act(async () => {})

      expect(mockGetRequests).toHaveBeenCalledWith('ws1')
      expect(mockGetRequests).toHaveBeenCalledWith('ws2')

      expect(result.current.requestsByUnit['ws1']).toHaveLength(1)
      expect(result.current.requestsByUnit['ws2']).toHaveLength(0)
    })
  })

  describe('erro parcial em uma unidade', () => {
    it('requestsFailed=true e nenhum dado é inventado quando uma unidade falha', async () => {
      let callCount = 0
      mockGetRequests.mockImplementation(async () => {
        callCount++
        if (callCount === 1) return [makeRequest('r1')]
        // Simula falha na segunda unidade
        mockGetLastError.mockReturnValue('RPC negou')
        return []
      })

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1|ws2'))
      await act(async () => {})

      expect(result.current.requestsFailed).toBe(true)
      expect(result.current.requestsLoading).toBe(false)
      // ws1 pode ter sido preenchido (o loop para na primeira falha — ws2)
      // mas ws2 NÃO deve ter dado inventado
      expect(result.current.requestsByUnit['ws2']).toBeUndefined()
    })

    it('overviewFailed=true quando a RPC de visão falha em uma unidade', async () => {
      let overviewCallCount = 0
      mockGetOverview.mockImplementation(async () => {
        overviewCallCount++
        if (overviewCallCount === 1) return makeOverview()
        mockGetLastError.mockReturnValue('timeout')
        return null
      })

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1|ws2'))
      await act(async () => {})

      expect(result.current.overviewFailed).toBe(true)
      expect(result.current.overviewByUnit['ws2']).toBeUndefined()
    })

    it('inactiveFailed=true quando a RPC de inativos falha', async () => {
      mockGetInactive.mockImplementation(async () => {
        mockGetLastError.mockReturnValue('negado')
        return []
      })

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))
      await act(async () => {})

      expect(result.current.inactiveFailed).toBe(true)
      expect(result.current.inactiveByUnit).toEqual({})
    })
  })

  describe('estado de loading', () => {
    it('overview em loading durante a chamada e false após concluir', async () => {
      let resolveOverview!: (v: null) => void
      mockGetOverview.mockImplementation(
        () => new Promise<null>((resolve) => { resolveOverview = resolve }),
      )

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))

      // Após montar, loadOverview está em voo — loading deve ser true
      expect(result.current.overviewLoading).toBe(true)

      await act(async () => {
        resolveOverview(null)
      })

      expect(result.current.overviewLoading).toBe(false)
    })
  })

  describe('refresh após mutação', () => {
    it('loadRequests() chamado manualmente recarrega o mapa', async () => {
      mockGetRequests.mockResolvedValueOnce([makeRequest('r1')])
      mockGetRequests.mockResolvedValueOnce([makeRequest('r1'), makeRequest('r2')])

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))
      await act(async () => {})

      expect(result.current.requestsByUnit['ws1']).toHaveLength(1)

      await act(async () => {
        await result.current.loadRequests()
      })

      expect(result.current.requestsByUnit['ws1']).toHaveLength(2)
    })

    it('loadInactive() chamado manualmente recarrega o mapa', async () => {
      mockGetInactive.mockResolvedValueOnce([])
      mockGetInactive.mockResolvedValueOnce([makeInactive('i1', 'suspended')])

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))
      await act(async () => {})

      expect(result.current.inactiveByUnit['ws1']).toHaveLength(0)

      await act(async () => {
        await result.current.loadInactive()
      })

      expect(result.current.inactiveByUnit['ws1']).toHaveLength(1)
    })

    it('loadOverview() chamado manualmente atualiza a visão da unidade', async () => {
      mockGetOverview.mockResolvedValueOnce(null)
      mockGetOverview.mockResolvedValueOnce(makeOverview())

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))
      await act(async () => {})

      expect(result.current.overviewByUnit['ws1']).toBeUndefined()

      await act(async () => {
        await result.current.loadOverview()
      })

      expect(result.current.overviewByUnit['ws1']).toBeDefined()
    })
  })

  describe('ausência de dados inventados', () => {
    it('overview null não é inserido no mapa (nenhum zero inventado)', async () => {
      mockGetOverview.mockResolvedValue(null)

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))
      await act(async () => {})

      expect(result.current.overviewByUnit['ws1']).toBeUndefined()
      expect(result.current.overviewFailed).toBe(false)
    })

    it('requests vazia é inserida como [] (correto — unidade sem pendências)', async () => {
      mockGetRequests.mockResolvedValue([])

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1'))
      await act(async () => {})

      expect(result.current.requestsByUnit['ws1']).toEqual([])
      expect(result.current.requestsFailed).toBe(false)
    })

    it('dados das unidades que carregaram com sucesso são preservados quando a seguinte falha', async () => {
      let requestCallCount = 0
      mockGetRequests.mockImplementation(async () => {
        requestCallCount++
        if (requestCallCount === 1) return [makeRequest('r1')]
        // Segunda unidade falha
        mockGetLastError.mockReturnValue('timeout na segunda')
        return []
      })

      const { result } = renderHook(() => useCoordinatorPeopleData('ws1|ws2'))
      await act(async () => {})

      // ws1 carregou com sucesso antes de ws2 falhar
      expect(result.current.requestsByUnit['ws1']).toHaveLength(1)
      // ws2 não inventou nada
      expect(result.current.requestsByUnit['ws2']).toBeUndefined()
      // flag de falha está correta
      expect(result.current.requestsFailed).toBe(true)
    })
  })

  describe('re-execução quando unitsKey muda', () => {
    it('adicionar uma unidade ao key dispara novos carregamentos', async () => {
      mockGetRequests.mockResolvedValue([])
      mockGetInactive.mockResolvedValue([])
      mockGetOverview.mockResolvedValue(null)

      const { rerender } = renderHook(
        ({ key }: { key: string }) => useCoordinatorPeopleData(key),
        { initialProps: { key: 'ws1' } },
      )
      await act(async () => {})

      const firstCallCount = mockGetRequests.mock.calls.length

      await act(async () => {
        rerender({ key: 'ws1|ws2' })
      })
      await act(async () => {})

      // Deve ter mais chamadas após o rerender com nova key
      expect(mockGetRequests.mock.calls.length).toBeGreaterThan(firstCallCount)
    })
  })
})
