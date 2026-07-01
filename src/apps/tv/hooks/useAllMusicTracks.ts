import { useState, useEffect, useCallback } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { fetchQueues, fetchTracks } from '../services/supabase'
import type { TvMusicTrack } from '../types'

export function useAllMusicTracks() {
  const [tracks, setTracks] = useState<TvMusicTrack[]>([])
  const [shuffle, setShuffle] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const qs = await fetchQueues()
      const all: TvMusicTrack[] = []
      let hasShuffle = false
      for (const q of qs) {
        const t = await fetchTracks(q.id)
        all.push(...t)
        if (q.shuffle) hasShuffle = true
      }
      setTracks(all)
      setShuffle(hasShuffle)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /* Realtime */
  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel('tv-all-music-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tv_music_queues' },
        () => load()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tv_music_tracks' },
        () => load()
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  /* Poll */
  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(() => load(), 15000)
    return () => clearInterval(timer)
  }, [load])

  return { tracks, shuffle, loading }
}
