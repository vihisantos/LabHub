import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../services/checklistService', () => ({
  checklistTemplateService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  pcChecklistService: {
    getByPC: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

import { useChecklistTemplates, usePCChecklists } from '../useChecklists'
import type { ChecklistTemplate, PCChecklist } from '../../types/checklist'
import { checklistTemplateService, pcChecklistService } from '../../services/checklistService'

const mockTemplate: ChecklistTemplate = {
  id: 'tpl-1',
  name: 'Limpeza Geral',
  labName: 'Lab A',
  items: [
    { id: 'item-1', label: 'Limpar teclado', category: 'cleaning', optional: false },
  ],
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
}

const mockPCChecklist: PCChecklist = {
  id: 'cl-1',
  pcId: 'pc-1',
  templateId: 'tpl-1',
  templateName: 'Limpeza Geral',
  labName: 'Lab A',
  items: [
    { itemId: 'item-1', label: 'Limpar teclado', category: 'cleaning', done: false, doneAt: null },
  ],
  completedAt: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
}

describe('useChecklistTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(checklistTemplateService.getAll as any).mockReturnValue([mockTemplate])
    ;(checklistTemplateService.create as any).mockReturnValue(mockTemplate)
    ;(checklistTemplateService.update as any).mockReturnValue(mockTemplate)
    ;(checklistTemplateService.remove as any).mockReturnValue(true)
  })

  it('carrega templates no mount', () => {
    const { result } = renderHook(() => useChecklistTemplates())
    expect(result.current.loading).toBe(false)
    expect(result.current.templates).toHaveLength(1)
    expect(result.current.templates[0].name).toBe('Limpeza Geral')
  })

  it('cria um novo template', () => {
    const { result } = renderHook(() => useChecklistTemplates())
    act(() => {
      result.current.create({
        name: 'Novo Template',
        labName: 'Lab B',
        items: [],
      })
    })
    expect(checklistTemplateService.create).toHaveBeenCalled()
    expect(result.current.templates).toHaveLength(2)
  })

  it('atualiza um template existente', () => {
    const { result } = renderHook(() => useChecklistTemplates())
    act(() => {
      result.current.update('tpl-1', { name: 'Atualizado' })
    })
    expect(checklistTemplateService.update).toHaveBeenCalledWith('tpl-1', { name: 'Atualizado' })
  })

  it('remove um template', () => {
    const { result } = renderHook(() => useChecklistTemplates())
    act(() => {
      result.current.remove('tpl-1')
    })
    expect(checklistTemplateService.remove).toHaveBeenCalledWith('tpl-1')
    expect(result.current.templates).toHaveLength(0)
  })

  it('reload recarrega os templates', () => {
    const { result } = renderHook(() => useChecklistTemplates())
    ;(checklistTemplateService.getAll as any).mockReturnValue([])
    act(() => {
      result.current.reload()
    })
    expect(result.current.templates).toHaveLength(0)
  })
})

describe('usePCChecklists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(pcChecklistService.getByPC as any).mockReturnValue([mockPCChecklist])
    ;(pcChecklistService.create as any).mockReturnValue(mockPCChecklist)
    ;(pcChecklistService.update as any).mockReturnValue(mockPCChecklist)
    ;(pcChecklistService.remove as any).mockReturnValue(true)
  })

  it('carrega checklists de um PC', () => {
    const { result } = renderHook(() => usePCChecklists('pc-1'))
    expect(result.current.loading).toBe(false)
    expect(result.current.checklists).toHaveLength(1)
    expect(pcChecklistService.getByPC).toHaveBeenCalledWith('pc-1')
  })

  it('cria checklist para o PC', () => {
    const { result } = renderHook(() => usePCChecklists('pc-1'))
    act(() => {
      result.current.create({
        pcId: 'pc-1',
        templateId: 'tpl-2',
        templateName: 'Novo',
        labName: 'Lab B',
        items: [],
        completedAt: null,
      })
    })
    expect(pcChecklistService.create).toHaveBeenCalled()
    expect(result.current.checklists).toHaveLength(2)
  })

  it('atualiza um checklist', () => {
    const { result } = renderHook(() => usePCChecklists('pc-1'))
    act(() => {
      result.current.update('cl-1', { completedAt: '2026-01-16T10:00:00Z' })
    })
    expect(pcChecklistService.update).toHaveBeenCalledWith('cl-1', { completedAt: '2026-01-16T10:00:00Z' })
  })

  it('remove um checklist', () => {
    const { result } = renderHook(() => usePCChecklists('pc-1'))
    act(() => {
      result.current.remove('cl-1')
    })
    expect(pcChecklistService.remove).toHaveBeenCalledWith('cl-1')
    expect(result.current.checklists).toHaveLength(0)
  })

  it('reload recarrega os checklists', () => {
    const { result } = renderHook(() => usePCChecklists('pc-1'))
    ;(pcChecklistService.getByPC as any).mockReturnValue([])
    act(() => {
      result.current.reload()
    })
    expect(result.current.checklists).toHaveLength(0)
  })
})
