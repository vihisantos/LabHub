import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../../../lib/ToastContext'

const STORAGE_KEY = 'tv_youtube_live_cache'
const POLL_INTERVAL = 60_000 // 1 minuto

interface LiveStreamData {
  isLive: boolean
  channelTitle: string
  videoId: string | null
  title: string | null
  thumbnailUrl: string | null
  viewerCount: number | null
  lastChecked: string | null
}

/**
 * Hook que verifica periodicamente se o canal da faculdade tem uma live no YouTube.
 * Usa a API de backend (/api/tv/youtube/live) para não expor a chave da API no cliente.
 */
export function useYouTubeLive() {
  const [liveData, setLiveData] = useState<LiveStreamData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: LiveStreamData = JSON.parse(saved)
        // Usar cache com no máximo 2 minutos de idade
        if (parsed.lastChecked && Date.now() - new Date(parsed.lastChecked).getTime() < 120_000) {
          return parsed
        }
      }
    } catch {
      // ignore
    }
    return {
      isLive: false,
      channelTitle: '',
      videoId: null,
      title: null,
      thumbnailUrl: null,
      viewerCount: null,
      lastChecked: null,
    }
  })
  const [loading, setLoading] = useState(false)
  const { addToast } = useToast()

  const checkLive = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tv/youtube/live', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        // Endpoint pode não existir — silencioso
        return
      }

      const data = await res.json()
      const result: LiveStreamData = {
        isLive: data.isLive ?? false,
        channelTitle: data.channelTitle ?? '',
        videoId: data.videoId ?? null,
        title: data.title ?? null,
        thumbnailUrl: data.thumbnailUrl ?? null,
        viewerCount: data.viewerCount ?? null,
        lastChecked: new Date().toISOString(),
      }

      setLiveData(result)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result))

      if (result.isLive) {
        addToast('info', `🔴 ${result.channelTitle} está AO VIVO: ${result.title}`)
      }
    } catch {
      // Ignorar silenciosamente — API pode não estar disponível
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    checkLive()
    const timer = setInterval(checkLive, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [checkLive])

  return {
    ...liveData,
    loading,
    refresh: checkLive,
  }
}
