import { useCallback, useEffect, useState } from 'react'
import type { Kit, KitFormData } from '../types'
import { kitService } from '../services/kitService'

export function useKits() {
  const [kits, setKits] = useState<Kit[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = kitService.getAll()
    setKits(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: KitFormData) => {
    const kit = kitService.create(data)
    setKits((prev) => [kit, ...prev])
    return kit
  }, [])

  const update = useCallback((id: string, data: Partial<Kit>) => {
    const kit = kitService.update(id, data)
    if (kit) {
      setKits((prev) => prev.map((k) => (k.id === id ? kit : k)))
    }
    return kit
  }, [])

  const remove = useCallback((id: string) => {
    const ok = kitService.remove(id)
    if (ok) {
      setKits((prev) => prev.filter((k) => k.id !== id))
    }
    return ok
  }, [])

  return { kits, loading, create, update, remove, reload: load }
}
