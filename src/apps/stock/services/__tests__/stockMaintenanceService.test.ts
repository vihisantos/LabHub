import { describe, it, expect, beforeEach } from 'vitest'
import { resetCache } from '../../../../lib/db'
import { stockMaintenanceService } from '../stockMaintenanceService'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

const makeData = () => ({
  itemId: 'item-1',
  itemName: 'Notebook Dell',
  itemSection: 'maquinas',
  type: 'preventiva' as const,
  scheduledDate: new Date(Date.now() + 86400000).toISOString(),
  notes: 'Limpeza preventiva',
  performedBy: 'João',
})

describe('stockMaintenanceService', () => {
  it('getAll retorna array vazio inicialmente', () => {
    expect(stockMaintenanceService.getAll()).toEqual([])
  })

  it('create adiciona manutenção', () => {
    const m = stockMaintenanceService.create(makeData())
    expect(m.id).toBeDefined()
    expect(m.itemName).toBe('Notebook Dell')
    expect(m.completed).toBe(false)
    expect(m.completedAt).toBeNull()
    expect(m.createdAt).toBeDefined()
  })

  it('getById retorna manutenção por id', () => {
    const created = stockMaintenanceService.create(makeData())
    const found = stockMaintenanceService.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it('getByItem retorna manutenções de um item', () => {
    stockMaintenanceService.create(makeData())
    stockMaintenanceService.create({ ...makeData(), itemId: 'item-2', itemName: 'Mouse' })
    const item1M = stockMaintenanceService.getByItem('item-1')
    expect(item1M).toHaveLength(1)
    expect(item1M[0].itemName).toBe('Notebook Dell')
  })

  it('getUpcoming retorna apenas manutenções não concluídas ordenadas', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    const later = new Date(Date.now() + 172800000).toISOString()
    stockMaintenanceService.create({ ...makeData(), scheduledDate: later, notes: 'Segunda' })
    stockMaintenanceService.create({ ...makeData(), scheduledDate: future, notes: 'Primeira' })
    // Uma concluída
    const m = stockMaintenanceService.create(makeData())
    stockMaintenanceService.update(m.id, { completed: true, completedAt: new Date().toISOString() })

    const upcoming = stockMaintenanceService.getUpcoming()
    expect(upcoming).toHaveLength(2)
    expect(upcoming[0].notes).toBe('Primeira')
    expect(upcoming[1].notes).toBe('Segunda')
  })

  it('getOverdue retorna manutenções atrasadas', () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    stockMaintenanceService.create({ ...makeData(), scheduledDate: past })
    stockMaintenanceService.create({ ...makeData(), scheduledDate: new Date(Date.now() + 86400000).toISOString() })
    const overdue = stockMaintenanceService.getOverdue()
    expect(overdue).toHaveLength(1)
  })

  it('update modifica campos', () => {
    const created = stockMaintenanceService.create(makeData())
    const updated = stockMaintenanceService.update(created.id, { notes: 'Atualizado' })
    expect(updated).toBeDefined()
    expect(updated!.notes).toBe('Atualizado')
  })

  it('remove deleta manutenção', () => {
    const created = stockMaintenanceService.create(makeData())
    expect(stockMaintenanceService.remove(created.id)).toBe(true)
    expect(stockMaintenanceService.getById(created.id)).toBeUndefined()
  })
})
