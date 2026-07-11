import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../services/actionLogService', () => ({
  actionLogService: {
    getByPC: vi.fn(),
    log: vi.fn(),
  },
}))

import { useActionLog } from '../useActionLog'
import type { ActionLog } from '../../types/actionLog'
import { actionLogService } from '../../services/actionLogService'

const mockLog: ActionLog = {
  id: 'log-1',
  pcId: 'pc-1',
  type: 'pc_created',
  description: 'PC criado',
  timestamp: '2026-01-10T10:00:00Z',
}

describe('useActionLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(actionLogService.getByPC as any).mockReturnValue([mockLog])
    ;(actionLogService.log as any).mockReturnValue(mockLog)
  })

  it('carrega logs de um PC no mount', () => {
    const { result } = renderHook(() => useActionLog('pc-1'))
    expect(result.current.loading).toBe(false)
    expect(result.current.logs).toHaveLength(1)
    expect(actionLogService.getByPC).toHaveBeenCalledWith('pc-1')
  })

  it('log registra uma nova entrada', () => {
    const { result } = renderHook(() => useActionLog('pc-1'))
    act(() => {
      result.current.log('status_changed', 'Status alterado para completed')
    })
    expect(actionLogService.log).toHaveBeenCalledWith('pc-1', 'status_changed', 'Status alterado para completed')
    expect(result.current.logs).toHaveLength(2)
  })

  it('reload recarrega os logs', () => {
    const { result } = renderHook(() => useActionLog('pc-1'))
    ;(actionLogService.getByPC as any).mockReturnValue([])
    act(() => {
      result.current.reload()
    })
    expect(result.current.logs).toHaveLength(0)
  })
})
