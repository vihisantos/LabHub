import { useCallback, useEffect, useState } from 'react'
import type { StockMovement, StockMovementFormData } from '../types'
import { movementService } from '../services/movementService'

export function useMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = movementService.getAll()
    setMovements(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: StockMovementFormData) => {
    const movement = movementService.create(data)
    setMovements((prev) => [movement, ...prev])
    return movement
  }, [])

  const update = useCallback((id: string, data: Partial<StockMovement>) => {
    const movement = movementService.update(id, data)
    if (movement) {
      setMovements((prev) => prev.map((m) => (m.id === id ? movement : m)))
    }
    return movement
  }, [])

  const remove = useCallback((id: string) => {
    const ok = movementService.remove(id)
    if (ok) {
      setMovements((prev) => prev.filter((m) => m.id !== id))
    }
    return ok
  }, [])

  const getByItem = useCallback((itemId: string) => {
    return movementService.getByItem(itemId)
  }, [])

  return { movements, loading, create, update, remove, getByItem, reload: load }
}
