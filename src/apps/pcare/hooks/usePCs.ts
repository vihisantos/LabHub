import { useCallback, useEffect, useState } from 'react'
import type { PC } from '../types'
import { pcService } from '../services/pcService'

export function usePCs() {
  const [pcs, setPCs] = useState<PC[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = pcService.getAll()
    setPCs(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const update = useCallback((id: string, data: Partial<PC>) => {
    const pc = pcService.update(id, data)
    if (pc) {
      setPCs((prev) => prev.map((p) => (p.id === id ? pc : p)))
    }
    return pc
  }, [])

  return { pcs, loading, update, reload: load }
}
