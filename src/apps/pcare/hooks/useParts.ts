import { useCallback, useEffect, useState } from 'react'
import type { Part, PartFormData } from '../types'
import { partService } from '../services/partService'

export function useParts() {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = partService.getAll()
    setParts(data.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: PartFormData) => {
    const part = partService.create(data)
    setParts((prev) => [part, ...prev])
    return part
  }, [])

  const update = useCallback((id: string, data: Partial<Part>) => {
    const part = partService.update(id, data)
    if (part) {
      setParts((prev) => prev.map((p) => (p.id === id ? part : p)))
    }
    return part
  }, [])

  const remove = useCallback((id: string) => {
    const ok = partService.remove(id)
    if (ok) {
      setParts((prev) => prev.filter((p) => p.id !== id))
    }
    return ok
  }, [])

  return { parts, loading, create, update, remove, reload: load }
}
