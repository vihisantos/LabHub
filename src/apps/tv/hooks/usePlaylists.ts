import { useState, useEffect } from 'react'
import { fetchPlaylists, fetchAllPlaylists, createPlaylist, updatePlaylist, deletePlaylist } from '../services/supabase'
import type { TvPlaylist } from '../types'

export function usePlaylists(type?: 'video' | 'music') {
  const [playlists, setPlaylists] = useState<TvPlaylist[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const data = await fetchPlaylists(type)
    setPlaylists(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return { playlists, loading, refresh: load }
}

export function useAllPlaylists() {
  const [playlists, setPlaylists] = useState<TvPlaylist[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const data = await fetchAllPlaylists()
    setPlaylists(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const add = async (values: Omit<TvPlaylist, 'id' | 'created_at'>) => {
    await createPlaylist(values)
    await load()
  }

  const edit = async (id: string, values: Partial<TvPlaylist>) => {
    await updatePlaylist(id, values)
    await load()
  }

  const remove = async (id: string) => {
    await deletePlaylist(id)
    await load()
  }

  return { playlists, loading, refresh: load, add, edit, remove }
}
