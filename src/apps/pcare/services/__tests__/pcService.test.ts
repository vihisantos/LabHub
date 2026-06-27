import { pcService } from '../pcService'
import type { PCFormData } from '../../types'

function validFormData(): PCFormData {
  return {
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
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('pcService', () => {
  it('getAll retorna array vazio inicialmente', () => {
    expect(pcService.getAll()).toEqual([])
  })

  it('create adiciona um PC com timestamps', () => {
    const pc = pcService.create(validFormData())
    expect(pc.id).toBeDefined()
    expect(pc.labName).toBe('Lab A')
    expect(pc.pcNumber).toBe('PC-001')
    expect(pc.createdAt).toBeDefined()
    expect(pc.updatedAt).toBeDefined()
  })

  it('getById retorna PC criado', () => {
    const created = pcService.create(validFormData())
    const found = pcService.getById(created.id)
    expect(found).toEqual(created)
  })

  it('getById retorna undefined para id inexistente', () => {
    expect(pcService.getById('no-such-id')).toBeUndefined()
  })

  it('update modifica campos do PC', () => {
    const pc = pcService.create(validFormData())
    const updated = pcService.update(pc.id, { pcNumber: 'PC-002' })
    expect(updated?.pcNumber).toBe('PC-002')
    expect(updated?.labName).toBe('Lab A')
  })

  it('remove deleta PC', () => {
    const pc = pcService.create(validFormData())
    expect(pcService.remove(pc.id)).toBe(true)
    expect(pcService.getById(pc.id)).toBeUndefined()
  })

  it('query filtra PCs por predicado', () => {
    const a = { ...validFormData(), labName: 'Lab A' }
    const b = { ...validFormData(), labName: 'Lab B' }
    pcService.create(a)
    pcService.create(b)
    const result = pcService.query((pc) => pc.labName === 'Lab A')
    expect(result).toHaveLength(1)
    expect(result[0].labName).toBe('Lab A')
  })
})
