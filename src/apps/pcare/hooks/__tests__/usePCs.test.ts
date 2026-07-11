import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../services/pcService', () => ({
  pcService: {
    getAll: vi.fn(),
    update: vi.fn(),
  },
}))

import { usePCs } from '../usePCs'
import type { PC } from '../../types'
import { pcService } from '../../services/pcService'

const mockPC: PC = {
  id: 'pc-1',
  labName: 'Lab A',
  pcNumber: 'PC-001',
  assetTag: 'TAG-001',
  roomLocation: 'Sala 101',
  specs: { cpu: 'i5', ram: '8GB', storage: '256GB' },
  config: { osType: 'windows10', osVersion: '10', osEdition: 'enterprise', pcType: 'academico', domain: '' },
  cleaningStatus: 'pending',
  restorationStatus: 'pending',
  softwareInstalled: ['Chrome'],
  partsReplaced: [],
  observations: '',
  photos: [],
  lastIntervention: null,
  createdAt: { seconds: 1700000000, nanoseconds: 0 } as any,
  updatedAt: { seconds: 1700000000, nanoseconds: 0 } as any,
}

describe('usePCs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(pcService.getAll as any).mockReturnValue([mockPC])
    ;(pcService.update as any).mockReturnValue(mockPC)
  })

  it('carrega PCs no mount', () => {
    const { result } = renderHook(() => usePCs())
    expect(result.current.loading).toBe(false)
    expect(result.current.pcs).toHaveLength(1)
    expect(result.current.pcs[0].pcNumber).toBe('PC-001')
  })

  it('atualiza um PC existente', () => {
    const { result } = renderHook(() => usePCs())
    act(() => {
      result.current.update('pc-1', { cleaningStatus: 'done' })
    })
    expect(pcService.update).toHaveBeenCalledWith('pc-1', { cleaningStatus: 'completed' })
  })

  it('reload recarrega os PCs', () => {
    const { result } = renderHook(() => usePCs())
    ;(pcService.getAll as any).mockReturnValue([])
    act(() => {
      result.current.reload()
    })
    expect(result.current.pcs).toHaveLength(0)
  })

  it('update não altera lista se retornar null', () => {
    ;(pcService.update as any).mockReturnValue(null)
    const { result } = renderHook(() => usePCs())
    act(() => {
      result.current.update('pc-1', { cleaningStatus: 'done' })
    })
    expect(result.current.pcs).toHaveLength(1)
  })
})
