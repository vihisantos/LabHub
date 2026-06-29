import { pcService } from '../pcService'
import type { PC } from '../../types'

function makePC(overrides: Partial<PC> = {}): PC {
  return {
    id: 'pc-1',
    labName: 'Lab A',
    pcNumber: 'PC-001',
    assetTag: 'TAG-001',
    roomLocation: 'Sala 101',
    specs: { cpu: 'i5', ram: '8GB', storage: '256GB', os: 'Windows 11' },
    cleaningStatus: 'pending',
    restorationStatus: 'pending',
    softwareInstalled: ['Chrome', 'VS Code'],
    partsReplaced: [],
    observations: '',
    photos: [],
    lastIntervention: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('pcService', () => {
  it('getAll retorna array vazio inicialmente', () => {
    expect(pcService.getAll()).toEqual([])
  })

  it('getAll retorna PCs do localStorage', () => {
    const pc = makePC()
    localStorage.setItem('labhub_pcs', JSON.stringify([pc]))
    const all = pcService.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].labName).toBe('Lab A')
  })

  it('getById retorna PC existente', () => {
    const pc = makePC()
    localStorage.setItem('labhub_pcs', JSON.stringify([pc]))
    const found = pcService.getById('pc-1')
    expect(found?.labName).toBe('Lab A')
  })

  it('getById retorna undefined para id inexistente', () => {
    expect(pcService.getById('no-such-id')).toBeUndefined()
  })

  it('update modifica campos do PC', () => {
    const pc = makePC()
    localStorage.setItem('labhub_pcs', JSON.stringify([pc]))
    const updated = pcService.update('pc-1', { pcNumber: 'PC-002' })
    expect(updated?.pcNumber).toBe('PC-002')
    expect(updated?.labName).toBe('Lab A')
  })

  it('query filtra PCs por predicado', () => {
    const a = makePC({ id: 'a', labName: 'Lab A' })
    const b = makePC({ id: 'b', labName: 'Lab B' })
    localStorage.setItem('labhub_pcs', JSON.stringify([a, b]))
    const result = pcService.query((pc) => pc.labName === 'Lab A')
    expect(result).toHaveLength(1)
    expect(result[0].labName).toBe('Lab A')
  })
})
