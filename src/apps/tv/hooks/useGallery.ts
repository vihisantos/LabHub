import { useState, useEffect, useCallback } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { useToast } from '../../../lib/ToastContext'
import {
  fetchActiveGalleries,
  fetchGalleries,
  fetchGalleryPhotos,
  createGallery,
  deleteGallery as deleteGallerySvc,
  toggleGalleryActive,
  setGalleryOrder,
  addGalleryPhoto,
  deleteGalleryPhoto as deletePhotoSvc,
} from '../services/supabase'
import type { TvGallery, TvGalleryPhoto } from '../types'

/* ── Display hook: returns all active galleries + their photos ── */
export function useActiveGalleries() {
  const [galleries, setGalleries] = useState<TvGallery[]>([])
  const [photosMap, setPhotosMap] = useState<Record<string, TvGalleryPhoto[]>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const gs = await fetchActiveGalleries()
      setGalleries(gs)
      const map: Record<string, TvGalleryPhoto[]> = {}
      await Promise.all(gs.map(async (g) => {
        map[g.id] = await fetchGalleryPhotos(g.id)
      }))
      setPhotosMap(map)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /* Realtime: auto-refresh when galleries or photos change */
  useRealtimeSubscription('tv_galleries', '*', () => load())
  useRealtimeSubscription('tv_gallery_photos', '*', () => load())

  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(() => load(), 15000)
    return () => clearInterval(timer)
  }, [load])

  return { galleries, photosMap, loading }
}

/* ── Admin hook: CRUD for galleries ── */
export function useGalleries() {
  const [galleries, setGalleries] = useState<TvGallery[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchGalleries()
      setGalleries(data)
    } catch {
      addToast('error', 'Erro ao carregar galerias')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const create = async (title: string) => {
    try {
      await createGallery(title)
      await load()
      addToast('success', 'Galeria criada')
    } catch (err) {
      console.error('[useGallery] create error:', err)
      addToast('error', 'Erro ao criar galeria')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteGallerySvc(id)
      await load()
      addToast('success', 'Galeria removida')
    } catch (err) {
      console.error('[useGallery] remove error:', err)
      addToast('error', 'Erro ao remover galeria')
    }
  }

  const toggleActive = async (id: string) => {
    try {
      await toggleGalleryActive(id)
      await load()
    } catch (err) {
      console.error('[useGallery] toggleActive error:', err)
      addToast('error', 'Erro ao alterar galeria')
    }
  }

  const reorder = async (ids: string[]) => {
    try {
      await setGalleryOrder(ids)
      await load()
    } catch (err) {
      console.error('[useGallery] reorder error:', err)
      addToast('error', 'Erro ao reordenar')
    }
  }

  return { galleries, loading, create, remove, toggleActive, reorder, refresh: load }
}

/* ── Photos hook: managed inside GalleryManager ── */
export function useGalleryPhotos(galleryId: string | null) {
  const [photos, setPhotos] = useState<TvGalleryPhoto[]>([])
  const { addToast } = useToast()

  const load = useCallback(async () => {
    if (!galleryId) { setPhotos([]); return }
    try {
      const data = await fetchGalleryPhotos(galleryId)
      setPhotos(data)
    } catch {
      addToast('error', 'Erro ao carregar fotos')
    }
  }, [galleryId, addToast])

  useEffect(() => { load() }, [load])

  const add = async (imageUrl: string) => {
    if (!galleryId) return
    try {
      await addGalleryPhoto(galleryId, imageUrl)
      await load()
    } catch {
      addToast('error', 'Erro ao adicionar foto')
    }
  }

  const remove = async (id: string) => {
    try {
      await deletePhotoSvc(id)
      await load()
    } catch {
      addToast('error', 'Erro ao remover foto')
    }
  }

  return { photos, add, remove, refresh: load }
}
