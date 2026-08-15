import { describe, it, expect, vi } from 'vitest'
import { activateItemAsPC } from '../activateAsPC'
import { pcService } from '../../../pcare/services/pcService'
import type { StockItem } from '../../types'

function makeItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'i-1',
    name: 'Notebook HP',
    section: 'maquinas',
    subcategory: 'Notebook',
    serialNumber: 'SN-001',
    room: 'Lab 1',
    status: 'ativo',
    condition: 'Bom',
    notes: 'obs',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('activateItemAsPC', () => {
  it('cria um PC no PC Care com os dados do item e vincula o item', () => {
    const updateItem = vi.fn()
    const pcId = activateItemAsPC(makeItem(), { updateItem })
    const pc = pcService.getById(pcId)
    expect(pc).toBeDefined()
    expect(pc!.pcNumber).toBe('SN-001')
    expect(pc!.labName).toBe('Lab 1')
    expect(pc!.assetTag).toBe('SN-001')
    expect(pc!.restorationStatus).toBe('pending')
    expect(updateItem).toHaveBeenCalledWith('i-1', { linkedPcId: pcId, linkedPcLabel: 'Lab 1 — SN-001' })
    expect(pcId).toBe(pc!.id)
  })

  it('usa fallbacks quando o item não tem sala nem série', () => {
    const pcId = activateItemAsPC(makeItem({ room: '', serialNumber: '' }), { updateItem: vi.fn() })
    const pc = pcService.getById(pcId)
    expect(pc!.labName).toBe('Laboratório')
    expect(pc!.pcNumber).toBe('Notebook HP')
  })

  it('cada ativação gera um PC novo', () => {
    const item = makeItem()
    const first = activateItemAsPC(item, { updateItem: vi.fn() })
    const second = activateItemAsPC(item, { updateItem: vi.fn() })
    expect(first).not.toBe(second)
    expect(pcService.getAll()).toHaveLength(2)
  })
})
