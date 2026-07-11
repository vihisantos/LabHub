import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../services/maintenanceService', () => ({
  maintenanceService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

import { useMaintenance } from '../useMaintenance'
import type { ScheduledMaintenance } from '../../types/maintenance'
import { maintenanceService } from '../../services/maintenanceService'

const mockMaintenance: ScheduledMaintenance = {
  id: 'mnt-1',
  pcId: 'pc-1',
  labName: 'Lab A',
  pcNumber: 'PC-001',
  type: 'cleaning',
  scheduledDate: '2026-06-30T10:00:00Z',
  notes: 'Limpeza semestral',
  completed: false,
  completedAt: null,
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-01T10:00:00Z',
}

const mockCompleted: ScheduledMaintenance = {
  ...mockMaintenance,
  id: 'mnt-2',
  completed: true,
  completedAt: '2026-06-25T10:00:00Z',
}

describe('useMaintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(maintenanceService.getAll as any).mockReturnValue([mockMaintenance, mockCompleted])
    ;(maintenanceService.create as any).mockReturnValue(mockMaintenance)
    ;(maintenanceService.update as any).mockReturnValue(mockMaintenance)
    ;(maintenanceService.remove as any).mockReturnValue(true)
  })

  it('carrega manutenções no mount', () => {
    const { result } = renderHook(() => useMaintenance())
    expect(result.current.loading).toBe(false)
    expect(result.current.all).toHaveLength(2)
  })

  it('upcoming retorna apenas manutenções não completadas', () => {
    const { result } = renderHook(() => useMaintenance())
    expect(result.current.upcoming).toHaveLength(1)
    expect(result.current.upcoming[0].completed).toBe(false)
  })

  it('cria uma nova manutenção', () => {
    const { result } = renderHook(() => useMaintenance())
    act(() => {
      result.current.create({
        pcId: 'pc-2',
        labName: 'Lab B',
        pcNumber: 'PC-002',
        type: 'restoration',
        scheduledDate: '2026-07-01T10:00:00Z',
        notes: '',
      })
    })
    expect(maintenanceService.create).toHaveBeenCalled()
    expect(result.current.all).toHaveLength(3)
  })

  it('atualiza uma manutenção', () => {
    const { result } = renderHook(() => useMaintenance())
    act(() => {
      result.current.update('mnt-1', { notes: 'Nota atualizada' })
    })
    expect(maintenanceService.update).toHaveBeenCalledWith('mnt-1', { notes: 'Nota atualizada' })
  })

  it('remove uma manutenção', () => {
    const { result } = renderHook(() => useMaintenance())
    act(() => {
      result.current.remove('mnt-1')
    })
    expect(maintenanceService.remove).toHaveBeenCalledWith('mnt-1')
    expect(result.current.all).toHaveLength(1)
  })

  it('complete marca como concluída', () => {
    const { result } = renderHook(() => useMaintenance())
    act(() => {
      result.current.complete('mnt-1')
    })
    expect(maintenanceService.update).toHaveBeenCalledWith('mnt-1', {
      completed: true,
      completedAt: expect.any(String),
    })
  })

  it('reload recarrega todas as manutenções', () => {
    const { result } = renderHook(() => useMaintenance())
    ;(maintenanceService.getAll as any).mockReturnValue([mockMaintenance])
    act(() => {
      result.current.reload()
    })
    expect(result.current.all).toHaveLength(1)
  })
})
