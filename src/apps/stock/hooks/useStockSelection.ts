import { useState, useCallback } from 'react'

export function useStockSelection() {
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(ids)
    })
  }, [])

  const clear = useCallback(() => {
    setSelected(new Set())
  }, [])

  const exit = useCallback(() => {
    setSelectMode(false)
    setSelected(new Set())
  }, [])

  const enter = useCallback(() => {
    setSelectMode(true)
  }, [])

  return { selectMode, selected, toggle, toggleAll, clear, exit, enter, setSelectMode }
}
