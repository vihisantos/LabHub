import { useState, useEffect, useCallback } from 'react'
import { fetchPlaylists, fetchAllPlaylists, createPlaylist, updatePlaylist, deletePlaylist } from '../services/supabase'
import { useToast } from '../../../lib/ToastContext'
import type { TvPlaylist } from '../types'

export function usePlaylists(type?: 'video' | 'music') {
  const [playlists, setPlaylists] = useState<TvPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchPlaylists(type)
      setPlaylists(data)
    } catch {
      addToast('error', 'Erro ao carregar playlists')
    } finally {
      setLoading(false)
    }
  }, [type, addToast])

  useEffect(() => { load() }, [load])

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
    } catch {
      addToast('error', 'Erro ao criar playlist')
    }
  }

  const edit = async (id: string, values: Partial<TvPlaylist>) => {
    try {
      await updatePlaylist(id, values)
      await load()
    } catch {
      addToast('error', 'Erro ao salvar playlist')
    }
  }

  const remove = async (id: string) => {
    try {
      await deletePlaylist(id)
      await load()
      addToast('success', 'Playlist removida')
    } catch {
      addToast('error', 'Erro ao remover playlist')
    }
  }

  return { playlists, loading, refresh: load, add, edit, remove }
}
