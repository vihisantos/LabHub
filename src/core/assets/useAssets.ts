import { useCallback, useMemo, useState } from 'react'
import type { AssetFilters } from './types'
import { assetService } from './service'

export function useAssets(filters?: AssetFilters) {
  const [refreshKey, setRefreshKey] = useState(0)

  const assets = useMemo(() => {
    void refreshKey
    return assetService.getAll(filters)
  }, [filters, refreshKey])

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return { assets, reload }
}

export function useAsset(id: string | undefined, source: 'pcare' | 'stock' | undefined) {
  const [refreshKey, setRefreshKey] = useState(0)

  const asset = useMemo(() => {
    void refreshKey
    if (!id || !source) return null
    return assetService.getById(id, source) || null
  }, [id, source, refreshKey])

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return { asset, reload }
}

export function useAssetRooms() {
  const [refreshKey, setRefreshKey] = useState(0)

  const rooms = useMemo(() => {
    void refreshKey
    return assetService.getRooms()
  }, [refreshKey])

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return { rooms, reload }
}

export function useAssetStats() {
  const [refreshKey, setRefreshKey] = useState(0)

  const stats = useMemo(() => {
    void refreshKey
    return assetService.getStats()
  }, [refreshKey])

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return { stats, reload }
}
