import { checklistTemplateService, pcChecklistService } from '../checklistService'
import type { ChecklistTemplateForm } from '../../types/checklist'

function validTemplateForm(): ChecklistTemplateForm {
  return {
    name: 'Checklist Padrão',
    labName: 'Lab A',
    items: [
      { id: 'item-1', label: 'Limpar teclado', category: 'cleaning' },
      { id: 'item-2', label: 'Testar mouse', category: 'restoration' },
    ],
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('checklistTemplateService', () => {
  it('create adiciona template com timestamps', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    expect(t.id).toBeDefined()
    expect(t.name).toBe('Checklist Padrão')
    expect(t.items).toHaveLength(2)
    expect(t.createdAt).toBeDefined()
  })

  it('getAll retorna todos os templates', () => {
    checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.create({ ...validTemplateForm(), name: 'Outro' })
    expect(checklistTemplateService.getAll()).toHaveLength(2)
  })

  it('getById retorna template', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    expect(checklistTemplateService.getById(t.id)?.name).toBe('Checklist Padrão')
  })

  it('update modifica nome', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.update(t.id, { name: 'Renomeado' })
    expect(checklistTemplateService.getById(t.id)?.name).toBe('Renomeado')
  })

  it('remove deleta template', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.remove(t.id)
    expect(checklistTemplateService.getById(t.id)).toBeUndefined()
  })

  it('getByLab retorna templates de um laboratório', () => {
    checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.create({ ...validTemplateForm(), labName: 'Lab B' })
    const result = checklistTemplateService.getByLab('Lab A')
    expect(result).toHaveLength(1)
  })
})

describe('pcChecklistService', () => {
  it('create adiciona checklist para PC', () => {
    const cl = pcChecklistService.create({
      pcId: 'pc-1',
      templateId: 'template-1',
      templateName: 'Checklist Padrão',
      labName: 'Lab A',
      items: [{ itemId: 'item-1', label: 'Limpar', category: 'cleaning', done: false, doneAt: null }],
      completedAt: null,
    })
    expect(cl.id).toBeDefined()
    expect(cl.pcId).toBe('pc-1')
    expect(cl.items).toHaveLength(1)
  })

  it('getByPC retorna checklists de um PC', () => {
    pcChecklistService.create({ pcId: 'pc-1', templateId: 't1', templateName: 'T1', labName: 'Lab A', items: [], completedAt: null })
    pcChecklistService.create({ pcId: 'pc-1', templateId: 't2', templateName: 'T2', labName: 'Lab A', items: [], completedAt: null })
    pcChecklistService.create({ pcId: 'pc-2', templateId: 't3', templateName: 'T3', labName: 'Lab A', items: [], completedAt: null })
    const result = pcChecklistService.getByPC('pc-1')
    expect(result).toHaveLength(2)
  })

  it('update modifica itens do checklist', () => {
    const cl = pcChecklistService.create({
      pcId: 'pc-1', templateId: 't1', templateName: 'T1', labName: 'Lab A',
      items: [{ itemId: 'i1', label: 'Limpar', category: 'cleaning', done: false, doneAt: null }],
      completedAt: null,
    })
    const updated = pcChecklistService.update(cl.id, {
      items: [{ itemId: 'i1', label: 'Limpar', category: 'cleaning', done: true, doneAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any }],
    })
    expect(updated?.items[0].done).toBe(true)
  })
})
