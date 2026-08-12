import { describe, it, expect, beforeEach } from 'vitest'
import { duplicateWorkspaceStructure } from '../duplicateStructure'
import { getCol, setCol, resetCache } from '../../../lib/db'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

const WS_A = 'ws-a'
const WS_B = 'ws-b'

function seedCollection(collection: string, items: Record<string, unknown>[]) {
  setCol(collection, items as any)
}

describe('duplicateWorkspaceStructure', () => {
  it('copia salas do workspace de origem para o destino', () => {
    seedCollection('rooms', [
      { id: 'r1', name: 'Lab 101', workspace_id: WS_A, createdAt: '', updatedAt: '' },
      { id: 'r2', name: 'Lab 102', workspace_id: WS_A, createdAt: '', updatedAt: '' },
    ])

    const result = duplicateWorkspaceStructure(WS_A, WS_B)

    expect(result.rooms).toBe(2)
    const target = getCol<any>('rooms').filter((r) => r.workspace_id === WS_B)
    expect(target.map((r) => r.name).sort()).toEqual(['Lab 101', 'Lab 102'])
    expect(target[0].id).not.toBe('r1')
    expect(target.every((r) => typeof r.updatedAt === 'string')).toBe(true)
  })

  it('não copia itens globais (sem workspace_id)', () => {
    seedCollection('rooms', [
      { id: 'r1', name: 'Sala Global', createdAt: '', updatedAt: '' },
    ])

    const result = duplicateWorkspaceStructure(WS_A, WS_B)

    expect(result.rooms).toBe(0)
    expect(getCol<any>('rooms').filter((r) => r.workspace_id === WS_B)).toHaveLength(0)
  })

  it('ignora itens que já existem no destino (dedupe por nome)', () => {
    seedCollection('rooms', [
      { id: 'r1', name: 'Lab 101', workspace_id: WS_A, createdAt: '', updatedAt: '' },
      { id: 'r2', name: 'Lab 102', workspace_id: WS_A, createdAt: '', updatedAt: '' },
      { id: 'r3', name: 'Lab 101', workspace_id: WS_B, createdAt: '', updatedAt: '' },
    ])

    const result = duplicateWorkspaceStructure(WS_A, WS_B)

    expect(result.rooms).toBe(1)
    const target = getCol<any>('rooms').filter((r) => r.workspace_id === WS_B)
    expect(target.map((r) => r.name).sort()).toEqual(['Lab 101', 'Lab 102'])
  })

  it('copia categorias de problema (por assetType)', () => {
    seedCollection('problem_templates', [
      { id: 'p1', assetType: 'Desktop', categories: ['Não liga'], workspace_id: WS_A, createdAt: '', updatedAt: '' },
      { id: 'p2', assetType: 'Notebook', categories: ['Bateria'], workspace_id: WS_A, createdAt: '', updatedAt: '' },
    ])

    const result = duplicateWorkspaceStructure(WS_A, WS_B)

    expect(result.problemTemplates).toBe(2)
    const target = getCol<any>('problem_templates').filter((t) => t.workspace_id === WS_B)
    expect(target.map((t) => t.assetType).sort()).toEqual(['Desktop', 'Notebook'])
    expect(target[0].categories).toEqual(['Não liga'])
  })

  it('copia templates de checklist (por nome)', () => {
    seedCollection('checklist_templates', [
      { id: 'c1', name: 'Limpeza PC', labName: 'Lab A', items: [], workspace_id: WS_A, createdAt: '', updatedAt: '' },
    ])

    const result = duplicateWorkspaceStructure(WS_A, WS_B)

    expect(result.checklistTemplates).toBe(1)
    const target = getCol<any>('checklist_templates').filter((t) => t.workspace_id === WS_B)
    expect(target).toHaveLength(1)
    expect(target[0].name).toBe('Limpeza PC')
    expect(target[0].items).toEqual([])
  })

  it('origem sem itens vinculados → nada copiado', () => {
    seedCollection('rooms', [{ id: 'r1', name: 'Lab 101', workspace_id: WS_B, createdAt: '', updatedAt: '' }])

    const result = duplicateWorkspaceStructure(WS_A, WS_B)

    expect(result).toEqual({ rooms: 0, problemTemplates: 0, checklistTemplates: 0 })
  })

  it('idempotente: rodar duas vezes não duplica', () => {
    seedCollection('rooms', [
      { id: 'r1', name: 'Lab 101', workspace_id: WS_A, createdAt: '', updatedAt: '' },
    ])

    duplicateWorkspaceStructure(WS_A, WS_B)
    const second = duplicateWorkspaceStructure(WS_A, WS_B)

    expect(second.rooms).toBe(0)
    expect(getCol<any>('rooms').filter((r) => r.workspace_id === WS_B)).toHaveLength(1)
  })
})
