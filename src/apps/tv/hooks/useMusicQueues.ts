import { useState, useEffect, useCallback } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { useToast } from '../../../lib/ToastContext'
import {
  fetchQueues,
  createQueue,
  updateQueue,
  deleteQueue,
  fetchTracks,
  createTracks,
  deleteTrack,
  reorderTracks,
} from '../services/supabase'
import { fetchYouTubeTracks } from '../utils/youtubeApi'
import type { TvMusicQueue, TvMusicTrack } from '../types'

export interface QueueWithTracks extends TvMusicQueue {
  tracks: TvMusicTrack[]
}

export function useMusicQueues() {
  const [queues, setQueues] = useState<QueueWithTracks[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true)
      const qs = await fetchQueues()
      const withTracks = await Promise.all(
        qs.map(async (q) => {
          const tracks = await fetchTracks(q.id)
          return { ...q, tracks }
        })
      )
      setQueues(withTracks)
    } catch {
      if (!silent) addToast('error', 'Erro ao carregar filas de música')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  /* Realtime: auto-refresh when queues or tracks change */
  useRealtimeSubscription('tv_music_queues', '*', () => load(true))
  useRealtimeSubscription('tv_music_tracks', '*', () => load(true))

  /* Poll */
  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(() => load(true), 15000)
    return () => clearInterval(timer)
  }, [load])

  const add = async (name: string) => {
    try {
      await createQueue({ name })
      await load()
      addToast('success', 'Fila criada')
    } catch {
      addToast('error', 'Erro ao criar fila')
    }
  }

  const edit = async (id: string, values: Partial<TvMusicQueue>) => {
    try {
      await updateQueue(id, values)
      await load()
    } catch {
      addToast('error', 'Erro ao salvar fila')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteQueue(id)
      await load()
      addToast('success', 'Fila removida')
    } catch {
      addToast('error', 'Erro ao remover fila')
    }
  }

  const addTracksFromUrl = async (queueId: string, url: string) => {
    try {
      const infos = await fetchYouTubeTracks(url)
      if (infos.length === 0) {
        addToast('error', 'Nenhum track encontrado — verifique se a URL do YouTube é válida')
        return
      }
      const existing = queues.find(q => q.id === queueId)?.tracks || []
      const maxPos = existing.length
      const newTracks = infos.map((t, i) => ({
        queue_id: queueId,
        youtube_video_id: t.videoId,
        title: t.title,
        duration_seconds: t.duration,
        position: maxPos + i,
      }))
      await createTracks(newTracks)
      await load()
      addToast('success', `${newTracks.length} track(s) adicionado(s)`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao adicionar tracks'
      console.error('[addTracksFromUrl]', msg, e)
      addToast('error', msg)
    }
  }

  const removeTrack = async (id: string) => {
    try {
      await deleteTrack(id)
      await load()
    } catch {
      addToast('error', 'Erro ao remover track')
    }
  }

  const reorder = async (queueId: string, trackIds: string[]) => {
    try {
      await reorderTracks(queueId, trackIds)
      await load(true)
    } catch {
      addToast('error', 'Erro ao reordenar')
    }
  }

  return { queues, loading, refresh: load, add, edit, remove, addTracksFromUrl, removeTrack, reorder }
}
