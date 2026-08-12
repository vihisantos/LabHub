import type { YouTubeTrackInfo, YouTubeSearchResult } from '../types'
import { tvApi } from './apiBase'

export async function fetchYouTubeTracks(url: string): Promise<YouTubeTrackInfo[]> {
  const res = await fetch(tvApi('/api/tv/youtube/fetch'), {
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

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const res = await fetch(tvApi('/api/tv/youtube/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, maxResults: 8 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Erro ao buscar músicas no YouTube')
  }
  const data = await res.json()
  return data.results as YouTubeSearchResult[]
}
