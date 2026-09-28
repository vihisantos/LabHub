import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../services/checklistService', () => ({
  checklistTemplateService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

import { useChecklistTemplates } from '../useChecklists'
import type { ChecklistTemplate } from '../../types/checklist'
import { checklistTemplateService } from '../../services/checklistService'

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
