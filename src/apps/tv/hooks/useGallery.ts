import { useState, useEffect, useCallback } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { useToast } from '../../../lib/ToastContext'
import {
  fetchActiveGallery,
  fetchGalleries,
  fetchGalleryPhotos,
  createGallery,
  deleteGallery as deleteGallerySvc,
  setActiveGallery as setActiveSvc,
  addGalleryPhoto,
  deleteGalleryPhoto as deletePhotoSvc,
} from '../services/supabase'
import type { TvGallery, TvGalleryPhoto } from '../types'

/* ── Display hook: returns active gallery + photos ── */
export function useActiveGallery() {
  const [gallery, setGallery] = useState<TvGallery | null>(null)
  const [photos, setPhotos] = useState<TvGalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const g = await fetchActiveGallery()
      setGallery(g)
      if (g) {
        const p = await fetchGalleryPhotos(g.id)
        setPhotos(p)
      } else {
        setPhotos([])
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const db = supabase
    if (!db) return
    const ch = db
      .channel('tv-galleries-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tv_galleries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tv_gallery_photos' }, () => load())
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [load])

  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(() => load(), 15000)
    return () => clearInterval(timer)
  }, [load])

  return { gallery, photos, loading }
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
    } catch {
      addToast('error', 'Erro ao criar galeria')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteGallerySvc(id)
      await load()
      addToast('success', 'Galeria removida')
    } catch {
      addToast('error', 'Erro ao remover galeria')
    }
  }

  const setActive = async (id: string | null) => {
    try {
      await setActiveSvc(id)
      await load()
    } catch {
      addToast('error', 'Erro ao ativar galeria')
    }
  }

  return { galleries, loading, create, remove, setActive, refresh: load }
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
