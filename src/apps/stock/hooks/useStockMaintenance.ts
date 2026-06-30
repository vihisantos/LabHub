import { useCallback, useEffect, useState } from 'react'
import type { StockMaintenance, StockMaintenanceFormData } from '../types/maintenance'
import { stockMaintenanceService } from '../services/stockMaintenanceService'

export function useStockMaintenance() {
  const [all, setAll] = useState<StockMaintenance[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = stockMaintenanceService.getAll()
    setAll(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const upcoming = all
    .filter((m) => !m.completed)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())

  const overdue = all.filter(
    (m) => !m.completed && new Date(m.scheduledDate).getTime() < Date.now(),
  )

  const create = useCallback((data: StockMaintenanceFormData) => {
    const m = stockMaintenanceService.create(data)
    setAll((prev) => [m, ...prev])
    return m
  }, [])

  const update = useCallback((id: string, data: Partial<StockMaintenance>) => {
    const m = stockMaintenanceService.update(id, data)
    if (m) setAll((prev) => prev.map((x) => (x.id === id ? m : x)))
    return m
  }, [])

  const remove = useCallback((id: string) => {
    const ok = stockMaintenanceService.remove(id)
    if (ok) setAll((prev) => prev.filter((x) => x.id !== id))
    return ok
  }, [])

  const complete = useCallback((id: string) => {
    return update(id, {
      completed: true,
      completedAt: new Date().toISOString(),
    })
  }, [update])

  return { all, upcoming, overdue, loading, create, update, remove, complete, reload: load }
}
