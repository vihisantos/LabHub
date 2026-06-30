import { kitService } from '../kitService'
import type { KitFormData } from '../../types'

function makeFormData(overrides: Partial<KitFormData> = {}): KitFormData {
  return {
    name: 'Kit Emergência',
    room: 'Sala 101',
    items: [
      { name: 'Luvas', expected: 10, present: false },
      { name: 'Máscara', expected: 5, present: false },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('kitService', () => {
  it('getAll retorna array vazio inicialmente', () => {
    expect(kitService.getAll()).toEqual([])
  })

  it('create define status e lastChecked padrão', () => {
    const kit = kitService.create(makeFormData())
    expect(kit.id).toBeDefined()
    expect(kit.name).toBe('Kit Emergência')
    expect(kit.status).toBe('nao_conferido')
    expect(kit.lastChecked).toBeNull()
    expect(kit.createdAt).toBeDefined()
    expect(kit.updatedAt).toBeDefined()
  })

  it('getAll retorna todos os kits', () => {
    kitService.create(makeFormData({ name: 'Kit A' }))
    kitService.create(makeFormData({ name: 'Kit B' }))
    expect(kitService.getAll()).toHaveLength(2)
  })

  it('getById retorna kit por id', () => {
    const created = kitService.create(makeFormData())
    const found = kitService.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it('getById retorna undefined para id inexistente', () => {
    expect(kitService.getById('no-such-id')).toBeUndefined()
  })

  it('update modifica campos do kit', () => {
    const created = kitService.create(makeFormData())
    const updated = kitService.update(created.id, { name: 'Kit Urgência', status: 'ok' })
    expect(updated?.name).toBe('Kit Urgência')
    expect(updated?.status).toBe('ok')
  })

  it('remove deleta kit', () => {
    const created = kitService.create(makeFormData())
    expect(kitService.remove(created.id)).toBe(true)
    expect(kitService.getById(created.id)).toBeUndefined()
  })

  it('getAll retorna todos os kits para filtrar manualmente', () => {
    kitService.create(makeFormData({ name: 'Kit A', room: 'Lab X' }))
    kitService.create(makeFormData({ name: 'Kit B', room: 'Lab Y' }))
    const all = kitService.getAll()
    const filtered = all.filter((kit) => kit.room === 'Lab X')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Kit A')
  })
})
