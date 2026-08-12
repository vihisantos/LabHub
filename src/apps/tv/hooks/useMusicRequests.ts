import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { useToast } from '../../../lib/ToastContext'
import {
  fetchMusicRequests,
  createMusicRequest,
  reviewMusicRequest,
  fetchQueues,
  createQueue,
  fetchTracks,
  createTracks,
} from '../services/supabase'
import { fetchYouTubeTracks } from '../utils/youtubeApi'
import type { TvMusicRequest, YouTubeTrackInfo } from '../types'

export interface MusicRequestInput {
  url: string
  requestedBy: string
  requestedByName: string
  /** Quando vindo da busca por nome, já temos videoId/título — pula o re-fetch da URL */
  track?: Pick<YouTubeTrackInfo, 'videoId' | 'title'>
}

export function useMusicRequests() {
  const [requests, setRequests] = useState<TvMusicRequest[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true)
      const data = await fetchMusicRequests()
      setRequests(data)
    } catch {
      if (!silent) addToast('error', 'Erro ao carregar pedidos de música')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  /* Realtime + poll (mesmo padrão das filas de música) */
  useRealtimeSubscription('tv_music_requests', '*', () => load(true))
  useEffect(() => {
    const timer = setInterval(() => load(true), 15000)
    return () => clearInterval(timer)
  }, [load])

  const request = async ({ url, requestedBy, requestedByName, track }: MusicRequestInput) => {
    try {
      let infos: YouTubeTrackInfo[]
      if (track?.videoId) {
        infos = [{ videoId: track.videoId, title: track.title, duration: 0 }]
      } else {
        infos = await fetchYouTubeTracks(url)
        if (infos.length === 0) {
          addToast('error', 'Nenhuma música encontrada — verifique a URL do YouTube')
          return
        }
      }
      const found = infos[0]
      await createMusicRequest({
        youtube_url: track?.videoId ? `https://www.youtube.com/watch?v=${track.videoId}` : url,
        youtube_video_id: found.videoId,
        title: found.title,
        requested_by: requestedBy,
        requested_by_name: requestedByName,
      })
      await load()
      addToast('success', 'Pedido enviado para verificação')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar pedido'
      console.error('[useMusicRequests] request', msg, e)
      addToast('error', msg)
    }
  }

  /** Aprova um pedido, adicionando a faixa à primeira fila existente (ou criando uma). */
  const approve = async (req: TvMusicRequest, reviewedBy: string) => {
    try {
      if (!req.youtube_video_id) {
        addToast('error', 'Pedido sem vídeo do YouTube válido')
        return
      }
      let queues = await fetchQueues()
      let queueId = queues[0]?.id
      if (!queueId) {
        await createQueue({ name: 'Músicas' })
        queues = await fetchQueues()
        queueId = queues[0]?.id
      }
      if (!queueId) {
        addToast('error', 'Não foi possível criar uma fila de música')
        return
      }
      const existing = await fetchTracks(queueId)
      const already = existing.some((t) => t.youtube_video_id === req.youtube_video_id)
      if (already) {
        addToast('info', 'Essa música já está na fila')
      } else {
        await createTracks([{
          queue_id: queueId,
          youtube_video_id: req.youtube_video_id,
          title: req.title || 'Música solicitada',
          duration_seconds: 0,
          position: existing.length,
        }])
      }
      await reviewMusicRequest(req.id, 'approved', reviewedBy)
      await load()
      addToast('success', 'Pedido aprovado e música adicionada à fila')
    } catch (e) {
      console.error('[useMusicRequests] approve', e)
      addToast('error', 'Erro ao aprovar pedido')
    }
  }

  const reject = async (req: TvMusicRequest, reviewedBy: string) => {
    try {
      await reviewMusicRequest(req.id, 'rejected', reviewedBy)
      await load()
      addToast('success', 'Pedido rejeitado')
    } catch {
      addToast('error', 'Erro ao rejeitar pedido')
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')

  return { requests, pending, loading, refresh: load, request, approve, reject }
}
