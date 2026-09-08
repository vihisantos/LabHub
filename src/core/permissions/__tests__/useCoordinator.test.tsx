import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCoordinator } from '../useCoordinator'
import { getCoordinatorScope, getLastCoordinatorServiceError } from '../coordinatorService'

vi.mock('../coordinatorService', () => ({
  getCoordinatorScope: vi.fn(),
  getLastCoordinatorServiceError: vi.fn(),
}))

const mockedScope = vi.mocked(getCoordinatorScope)
const mockedError = vi.mocked(getLastCoordinatorServiceError)

function unit(id: string): import('../coordinatorService').CoordinatedUnit {
  return {
    coordination: {
      id: `coordination-${id}`,
      profile_id: 'u-coord',
      workspace_id: id,
      role_id: 'role-x',
      status: 'active',
      managed_by: null,
      created_at: '',
      updated_at: '',
    },
    unitId: id,
    unitName: `Unidade ${id}`,
    leaders: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useCoordinator — escopo de coordenação multiunidade (fail-closed)', () => {
  it('carrega as unidades do escopo', async () => {
    mockedScope.mockResolvedValue([unit('ws1'), unit('ws2')])
    mockedError.mockReturnValue(null)

    const { result } = renderHook(() => useCoordinator())
    await act(async () => {})

    expect(mockedScope).toHaveBeenCalledTimes(1)
    expect(result.current.units).toHaveLength(2)
    expect(result.current.failed).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('erro no servidor → failed=true (escopo não é inventado)', async () => {
    mockedScope.mockResolvedValue([])
    mockedError.mockReturnValue('RPC negou')

    const { result } = renderHook(() => useCoordinator())
    await act(async () => {})

    expect(result.current.failed).toBe(true)
    expect(result.current.units).toEqual([])
  })

  it('vazio legítimo (sem unidades de coordenação) → failed=false (estado vazio honesto)', async () => {
    mockedScope.mockResolvedValue([])
    mockedError.mockReturnValue(null)

    const { result } = renderHook(() => useCoordinator())
    await act(async () => {})

    expect(result.current.failed).toBe(false)
  })

  it('refresh re-consulta o escopo (retry)', async () => {
    mockedScope.mockResolvedValue([])
    mockedError.mockReturnValue('RPC negou')

    const { result } = renderHook(() => useCoordinator())
    await act(async () => {})

    mockedError.mockReturnValue(null)
    mockedScope.mockResolvedValue([unit('ws1')])

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockedScope).toHaveBeenCalledTimes(2)
    expect(result.current.failed).toBe(false)
    expect(result.current.units).toHaveLength(1)
  })
})