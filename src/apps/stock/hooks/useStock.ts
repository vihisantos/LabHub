import { useCallback, useEffect, useState } from 'react'
import type { StockItem, StockItemFormData } from '../types'
import { stockService } from '../services/stockService'

export function useStock() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = stockService.getAll()
    setItems(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: StockItemFormData) => {
    const item = stockService.create(data)
    setItems((prev) => [item, ...prev])
    return item
  }, [])

  const update = useCallback((id: string, data: Partial<StockItem>) => {
    const item = stockService.update(id, data)
    if (item) {
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)))
    }
    return item
  }, [])

  const remove = useCallback((id: string) => {
    const ok = stockService.remove(id)
    if (ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }
    return ok
  }, [])

  return { items, loading, create, update, remove, reload: load }
}
