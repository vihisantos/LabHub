import type { StockMovement } from '../types'

export function getOverdueLoans(movements: StockMovement[]): StockMovement[] {
  const now = Date.now()
  return movements.filter(
    (m) =>
      m.type === 'emprestimo' &&
      !m.returnedAt &&
      m.expectedReturnAt &&
      new Date(m.expectedReturnAt).getTime() < now,
  )
}

export function getOverdueCount(movements: StockMovement[]): number {
  return getOverdueLoans(movements).length
}
