import { useCallback, useEffect, useState } from 'react'
import type { ScheduledMaintenance, MaintenanceFormData } from '../types/maintenance'
import { maintenanceService } from '../services/maintenanceService'

export function useMaintenance() {
  const [all, setAll] = useState<ScheduledMaintenance[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = maintenanceService.getAll()
    setAll(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const upcoming = all.filter((m) => !m.completed)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())

  const create = useCallback((data: MaintenanceFormData) => {
    const m = maintenanceService.create(data)
    setAll((prev) => [m, ...prev])
    return m
  }, [])

  const update = useCallback((id: string, data: Partial<ScheduledMaintenance>) => {
    const m = maintenanceService.update(id, data)
    if (m) setAll((prev) => prev.map((x) => (x.id === id ? m : x)))
    return m
  }, [])

  const remove = useCallback((id: string) => {
    const ok = maintenanceService.remove(id)
    if (ok) setAll((prev) => prev.filter((x) => x.id !== id))
    return ok
  }, [])

  const complete = useCallback((id: string) => {
    return update(id, {
      completed: true,
      completedAt: new Date().toISOString(),
    })
  }, [update])

  return { all, upcoming, loading, create, update, remove, complete, reload: load }
}
