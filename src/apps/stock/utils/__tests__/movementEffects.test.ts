import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyMovementEffects } from '../movementEffects'
import type { StockItem, StockMovementFormData } from '../../types'

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
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeMovement(type: StockMovementFormData['type'], overrides: Partial<StockMovementFormData> = {}): StockMovementFormData {
  return {
    itemId: 'i-1',
    itemName: 'Notebook HP',
    type,
    fromRoom: 'Lab 1',
    toRoom: '',
    description: 'teste',
    replacedPart: '',
    newPart: '',
    performedBy: 'Admin',
    ...overrides,
  }
}

describe('applyMovementEffects', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mudanca_sala: cria o movimento e atualiza a sala', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem(), makeMovement('mudanca_sala', { toRoom: 'Lab 2' }), { createMovement, updateItem })
    expect(createMovement).toHaveBeenCalledTimes(1)
    expect(updateItem).toHaveBeenCalledWith('i-1', { room: 'Lab 2' })
  })

  it('conserto: marca o item como em_conserto', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem(), makeMovement('conserto'), { createMovement, updateItem })
    expect(updateItem).toHaveBeenCalledWith('i-1', { status: 'em_conserto' })
  })

  it('descarte: marca o item como descartado', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem(), makeMovement('descarte'), { createMovement, updateItem })
    expect(updateItem).toHaveBeenCalledWith('i-1', { status: 'descartado' })
  })

  it('emprestimo: marca emprestado, define sala e notifica', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(
      makeItem(),
      makeMovement('emprestimo', { borrowedBy: 'Maria', destinationRoom: 'Lab 3', expectedReturnAt: '2026-07-01' }),
      { createMovement, updateItem },
    )
    expect(updateItem).toHaveBeenCalledWith('i-1', { status: 'emprestado', room: 'Lab 3' })
    expect(fetch).toHaveBeenCalledWith('/api/push/notify-loan', expect.objectContaining({ method: 'POST' }))
  })

  it('emprestimo: mantém a sala do item quando não há destino', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem(), makeMovement('emprestimo', { borrowedBy: 'Maria' }), { createMovement, updateItem })
    expect(updateItem).toHaveBeenCalledWith('i-1', { status: 'emprestado', room: 'Lab 1' })
  })

  it('devolucao: marca ativo e notifica a devolução', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem({ status: 'emprestado' }), makeMovement('devolucao'), { createMovement, updateItem })
    expect(updateItem).toHaveBeenCalledWith('i-1', { status: 'ativo' })
    expect(fetch).toHaveBeenCalledWith('/api/push/notify-return', expect.objectContaining({ method: 'POST' }))
  })

  it('entrada: reativa o item e atualiza a sala quando diferente', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem({ status: 'descartado', room: 'Lab 1' }), makeMovement('entrada', { toRoom: 'Lab 2' }), {
      createMovement,
      updateItem,
    })
    expect(updateItem).toHaveBeenCalledWith('i-1', { room: 'Lab 2' })
    expect(updateItem).toHaveBeenCalledWith('i-1', { status: 'ativo' })
  })

  it('entrada: não altera a sala quando é a mesma do item', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem({ room: 'Lab 2' }), makeMovement('entrada', { toRoom: 'Lab 2' }), {
      createMovement,
      updateItem,
    })
    expect(updateItem).not.toHaveBeenCalledWith('i-1', { room: 'Lab 2' })
    expect(updateItem).not.toHaveBeenCalledWith('i-1', { status: 'ativo' })
  })

  it('saida: marca o item como descartado', () => {
    const createMovement = vi.fn()
    const updateItem = vi.fn()
    applyMovementEffects(makeItem(), makeMovement('saida'), { createMovement, updateItem })
    expect(updateItem).toHaveBeenCalledWith('i-1', { status: 'descartado' })
  })
})
