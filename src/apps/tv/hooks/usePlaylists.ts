import { useState, useEffect, useCallback } from 'react'
import { fetchPlaylists, fetchAllPlaylists, createPlaylist, updatePlaylist, deletePlaylist } from '../services/supabase'
import { defaultDb as supabase } from '../../../lib/supabase'
import { useToast } from '../../../lib/ToastContext'
import type { TvPlaylist } from '../types'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<TvPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async (silent?: boolean) => {
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

  /* ── Realtime: auto-refresh when playlists change ── */
  useEffect(() => {
    const db = supabase
    if (!db) return
    const channel = db
      .channel('tv-playlists-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tv_playlists' },
        () => { load(true) }
      )
      .subscribe()
    return () => { db.removeChannel(channel) }
  }, [load])

  /* ── Poll fallback: refresh every 15s ── */
  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(() => { load(true) }, 15000)
    return () => clearInterval(timer)
  }, [load])

  return { playlists, loading, refresh: load }
}

export function useAllPlaylists() {
  const [playlists, setPlaylists] = useState<TvPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchAllPlaylists()
      setPlaylists(data)
    } catch {
      addToast('error', 'Erro ao carregar playlists')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const add = async (values: Omit<TvPlaylist, 'id' | 'created_at'>) => {
    try {
      await createPlaylist(values)
      await load()
      addToast('success', 'Playlist criada')
    } catch (err) {
      console.error('[usePlaylists] add error:', JSON.stringify(err))
      addToast('error', 'Erro ao criar playlist')
    }
  }

  const edit = async (id: string, values: Partial<TvPlaylist>) => {
    try {
      await updatePlaylist(id, values)
      await load()
    } catch (err) {
      console.error('[usePlaylists] edit error:', err)
      addToast('error', 'Erro ao salvar playlist')
    }
  }

  const remove = async (id: string) => {
    try {
      await deletePlaylist(id)
      await load()
      addToast('success', 'Playlist removida')
    } catch (err) {
      console.error('[usePlaylists] remove error:', err)
      addToast('error', 'Erro ao remover playlist')
    }
  }

  return { playlists, loading, refresh: load, add, edit, remove }
}
