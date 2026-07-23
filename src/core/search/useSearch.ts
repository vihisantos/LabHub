import { useCallback, useState } from 'react'
import type { SearchResult } from './types'
import { searchService } from './service'

export function useSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

  const search = useCallback((q: string) => {
    setQuery(q)
    if (!q.trim()) {
      setResults([])
      return
    }
    const found = searchService.search(q)
    setResults(found)
  }, [])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
  }, [])

  return { query, results, search, clear }
}
