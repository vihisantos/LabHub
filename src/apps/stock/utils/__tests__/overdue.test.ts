import { getOverdueLoans, getOverdueCount } from '../overdue'
import type { StockMovement, MovementType } from '../../types'

function makeMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: crypto.randomUUID(),
    itemId: 'item-1',
    itemName: 'Notebook',
    type: 'emprestimo' as MovementType,
    fromRoom: 'Sala 101',
    toRoom: '',
    description: 'Empréstimo',
    replacedPart: '',
    newPart: '',
    performedBy: 'João',
    borrowedBy: 'Maria',
    expectedReturnAt: '2026-06-24T12:00:00.000Z',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('getOverdueLoans', () => {
  it('retorna empréstimos com expectedReturnAt no passado e não devolvidos', () => {
    const movements = [makeMovement()]
    expect(getOverdueLoans(movements)).toHaveLength(1)
  })

  it('exclui empréstimos já devolvidos', () => {
    const movements = [makeMovement({ returnedAt: '2026-06-22T12:00:00.000Z' })]
    expect(getOverdueLoans(movements)).toHaveLength(0)
  })

  it('exclui movimentos que não são empréstimo', () => {
    const movements = [makeMovement({ type: 'entrada' })]
    expect(getOverdueLoans(movements)).toHaveLength(0)
  })

  it('exclui empréstimos sem expectedReturnAt', () => {
    const movements = [makeMovement({ expectedReturnAt: undefined })]
    expect(getOverdueLoans(movements)).toHaveLength(0)
  })

  it('exclui empréstimos com expectedReturnAt no futuro', () => {
    const movements = [makeMovement({ expectedReturnAt: '2026-06-28T12:00:00.000Z' })]
    expect(getOverdueLoans(movements)).toHaveLength(0)
  })

  it('retorna array vazio se não há movimentos', () => {
    expect(getOverdueLoans([])).toEqual([])
  })
})

describe('getOverdueCount', () => {
  it('retorna contagem de empréstimos atrasados', () => {
    const movements = [
      makeMovement(),
      makeMovement({ id: crypto.randomUUID(), returnedAt: '2026-06-22T12:00:00.000Z' }),
      makeMovement({ id: crypto.randomUUID(), type: 'entrada' }),
    ]
    expect(getOverdueCount(movements)).toBe(1)
  })

  it('retorna 0 se não há atrasados', () => {
    expect(getOverdueCount([])).toBe(0)
  })
})
