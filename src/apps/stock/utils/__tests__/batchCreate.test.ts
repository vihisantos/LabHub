import { describe, it, expect, vi } from 'vitest'
import { dedupeBySerial, createMany } from '../batchCreate'
import type { StockItemFormData } from '../../types'

function makeForm(overrides: Partial<StockItemFormData> = {}): StockItemFormData {
  return {
    name: 'Item',
    section: 'maquinas',
    subcategory: 'Desktop',
    serialNumber: '',
    room: '',
    status: 'ativo',
    condition: 'Bom',
    notes: '',
    ...overrides,
  }
}

describe('dedupeBySerial', () => {
  it('remove duplicatas por Nº de série', () => {
    const items = [
      makeForm({ serialNumber: 'SN-1' }),
      makeForm({ serialNumber: 'SN-1' }),
      makeForm({ serialNumber: 'SN-2' }),
    ]
    expect(dedupeBySerial(items)).toHaveLength(2)
  })

  it('mantém o primeiro registro de cada duplicata', () => {
    const items = [
      makeForm({ serialNumber: 'SN-1', name: 'Primeiro' }),
      makeForm({ serialNumber: 'SN-1', name: 'Segundo' }),
    ]
    expect(dedupeBySerial(items)[0].name).toBe('Primeiro')
  })

  it('mantém todos os itens sem Nº de série (mesmo com nome repetido)', () => {
    const items = [
      makeForm({ serialNumber: '', name: 'Mouse A' }),
      makeForm({ serialNumber: '', name: 'mouse a' }),
    ]
    expect(dedupeBySerial(items)).toHaveLength(2)
  })

  it('mantém itens sem série e sem nome', () => {
    const items = [makeForm({ serialNumber: '', name: '' })]
    expect(dedupeBySerial(items)).toHaveLength(1)
  })

  it('não remove registros distintos', () => {
    const items = [
      makeForm({ serialNumber: 'SN-1' }),
      makeForm({ serialNumber: 'SN-2' }),
      makeForm({ serialNumber: 'SN-3' }),
    ]
    expect(dedupeBySerial(items)).toHaveLength(3)
  })
})

describe('createMany', () => {
  it('dedupe por série antes de criar e retorna a quantidade criada', () => {
    const create = vi.fn()
    const reload = vi.fn()
    const created = createMany([
      makeForm({ serialNumber: 'SN-1' }),
      makeForm({ serialNumber: 'SN-1' }),
      makeForm({ serialNumber: 'SN-2' }),
    ], { create, reload })
    expect(create).toHaveBeenCalledTimes(2)
    expect(created).toBe(2)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('cria todos os itens sem Nº de série', () => {
    const create = vi.fn()
    const created = createMany([
      makeForm({ serialNumber: '', name: 'Mouse A' }),
      makeForm({ serialNumber: '', name: 'Mouse B' }),
    ], { create })
    expect(create).toHaveBeenCalledTimes(2)
    expect(created).toBe(2)
  })

  it('reload é opcional', () => {
    const create = vi.fn()
    expect(() => createMany([makeForm()], { create })).not.toThrow()
  })

  it('retorna 0 e não cria nada com lista vazia', () => {
    const create = vi.fn()
    expect(createMany([], { create })).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('passa para create apenas os itens deduplicados', () => {
    const create = vi.fn()
    createMany([
      makeForm({ serialNumber: 'SN-1', name: 'Primeiro' }),
      makeForm({ serialNumber: 'SN-1', name: 'Segundo' }),
    ], { create })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Primeiro' }))
  })
})
