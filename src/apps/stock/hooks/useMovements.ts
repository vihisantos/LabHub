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

  const getByItem = useCallback((itemId: string) => {
    return movementService.getByItem(itemId)
  }, [])

  return { movements, loading, create, getByItem, reload: load }
}
