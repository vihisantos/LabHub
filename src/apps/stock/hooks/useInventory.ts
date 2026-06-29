import { useCallback, useEffect, useState } from 'react'
import type { InventoryCycle, InventoryCycleFormData, InventoryCount } from '../types'
import { inventoryService } from '../services/inventoryService'

export function useInventory() {
  const [cycles, setCycles] = useState<InventoryCycle[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setCycles(inventoryService.getCycles())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createCycle = useCallback((data: InventoryCycleFormData) => {
    const cycle = inventoryService.createCycle(data)
    setCycles((prev) => [cycle, ...prev])
    return cycle
  }, [])

  const completeCycle = useCallback((id: string, stats: { verifiedCount: number; missingCount: number; damagedCount: number }) => {
    const updated = inventoryService.completeCycle(id, stats)
    if (updated) setCycles((prev) => prev.map((c) => (c.id === id ? updated : c)))
    return updated
  }, [])

  const removeCycle = useCallback((id: string) => {
    inventoryService.removeCycle(id)
    setCycles((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return { cycles, loading, createCycle, completeCycle, removeCycle, reload: load }
}

export function useInventoryCounts(cycleId: string) {
  const [counts, setCounts] = useState<InventoryCount[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setCounts(inventoryService.getCounts(cycleId))
    setLoading(false)
  }, [cycleId])

  useEffect(() => { load() }, [load])

  const saveCount = useCallback((data: InventoryCount) => {
    inventoryService.saveCount(data)
    setCounts((prev) => {
      const idx = prev.findIndex((c) => c.itemId === data.itemId)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = data
        return next
      }
      return [...prev, data]
    })
  }, [])

  return { counts, loading, saveCount, reload: load }
}
