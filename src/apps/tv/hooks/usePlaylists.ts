import { useState, useEffect, useCallback } from 'react'
import { fetchPlaylists, createPlaylist, updatePlaylist, deletePlaylist } from '../services/supabase'
import { defaultDb as supabase } from '../../../lib/supabase'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { useToast } from '../../../lib/ToastContext'
import { isDesktopEnv, isKiosk, kioskError } from '../utils/kiosk'
import type { TvPlaylist } from '../types'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<TvPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast: rawAddToast } = useToast()
  const addToast = (type: Parameters<typeof rawAddToast>[0], message: string) => {
    if (type === 'error' && isKiosk()) { kioskError(message); return }
    rawAddToast(type, message)
  }

  const load = useCallback(async (silent?: boolean) => {
    // NOVO: no desktop/kiosk, não carrega playlists via Supabase (zero tráfego)
    const localIsDesktop = isDesktopEnv()
    if (localIsDesktop) {
      if (!silent) setLoading(false)
      return
    }

    try {
      if (!silent) setLoading(true)
      const data = await fetchPlaylists()
      setPlaylists(data)
    } catch {
      if (!silent) addToast('error', 'Erro ao carregar playlists')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  // Realtime: auto-refresh when playlists change ── DISABLED in kiosk
  if (!isDesktopEnv()) {
    useRealtimeSubscription('tv_playlists', '*', () => load(true))
  }

  // Poll fallback
  useEffect(() => {
    if (!supabase || isDesktopEnv()) return
    const timer = setInterval(() => { load(true) }, 15000)
    return () => clearInterval(timer)
  }, [load])

  const create = async (name: string, source: TvPlaylist['source'] = 'google_drive') => {
    try {
      const playlist = await createPlaylist({ name, source, youtube_url: '', is_active: true, sort_order: 0 })
      await load()
      addToast('success', 'Playlist criada')
      return playlist
    } catch (err) {
      addToast('error', 'Erro ao criar playlist')
      throw err
    }
  }

  const update = async (id: string, data: Partial<TvPlaylist>) => {
    try {
      await updatePlaylist(id, data)
      await load()
      addToast('success', 'Playlist atualizada')
    } catch (err) {
      addToast('error', 'Erro ao atualizar playlist')
      throw err
    }
  }

  const remove = async (id: string) => {
    try {
      await deletePlaylist(id)
      await load()
      addToast('success', 'Playlist removida')
    } catch (err) {
      addToast('error', 'Erro ao remover playlist')
      throw err
    }
  }

  return { playlists, loading, create, update, remove, refresh: load }
}