import type { YouTubeTrackInfo } from '../types'

export async function fetchYouTubeTracks(url: string): Promise<YouTubeTrackInfo[]> {
  const res = await fetch('/api/tv/youtube/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Erro ao buscar tracks do YouTube')
  }
  const data = await res.json()
  return data.tracks as YouTubeTrackInfo[]
}
