import { useCallback, useEffect, useState } from 'react'
import type { PC, PCFormData } from '../types'
import { pcService } from '../services/pcService'

export function usePCs() {
  const [pcs, setPCs] = useState<PC[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = pcService.getAll()
    setPCs(data.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: PCFormData) => {
    const pc = pcService.create(data)
    setPCs((prev) => [pc, ...prev])
    return pc
  }, [])

  const update = useCallback((id: string, data: Partial<PC>) => {
    const pc = pcService.update(id, data)
    if (pc) {
      setPCs((prev) => prev.map((p) => (p.id === id ? pc : p)))
    }
    return pc
  }, [])

  const remove = useCallback((id: string) => {
    const ok = pcService.remove(id)
    if (ok) {
      setPCs((prev) => prev.filter((p) => p.id !== id))
    }
    return ok
  }, [])

  return { pcs, loading, create, update, remove, reload: load }
}
