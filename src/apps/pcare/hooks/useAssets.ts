import { useCallback, useEffect, useState } from 'react'
import type { Asset } from '../types/asset'
import { assetService } from '../services/assetService'

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    setAssets([...assetService.getAll()].sort((a, b) => {
      const aTime = typeof a.createdAt === 'string' ? a.createdAt : (a.createdAt as any)?.seconds || 0
      const bTime = typeof b.createdAt === 'string' ? b.createdAt : (b.createdAt as any)?.seconds || 0
      return String(bTime).localeCompare(String(aTime))
    }))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  const create = useCallback((data: Omit<Asset, 'id'>) => { const asset = assetService.create(data); setAssets((items) => [asset, ...items]); return asset }, [])
  const update = useCallback((id: string, data: Partial<Asset>) => { const asset = assetService.update(id, data); if (asset) setAssets((items) => items.map((item) => item.id === id ? asset : item)); return asset }, [])
  return { assets, loading, create, update, reload: load }
}
