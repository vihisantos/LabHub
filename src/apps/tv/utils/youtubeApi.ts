import type { YouTubeTrackInfo, YouTubeSearchResult } from '../types'
import { tvApi } from './apiBase'
import { defaultDb as supabase } from '../../../lib/supabase'
import { workspaceStore } from '../../../core/workspaces/store'
import { assignedWorkspaceIds } from '../../../core/memberships/service'
import { authService } from '../../../core/auth/service'

async function authedPost(path: string, body: Record<string, unknown>): Promise<Response> {
  if (!supabase) throw new Error('Supabase não configurado')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const ws = workspaceStore.activeWorkspaceId
  const wsId = ws ?? (() => {
    const user = authService.getCurrentUser()
    return user ? assignedWorkspaceIds(user)[0] : undefined
  })()
  return fetch(tvApi(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...body, ...(wsId ? { workspace_id: wsId } : {}) }),
  })
}

export async function fetchYouTubeTracks(url: string): Promise<YouTubeTrackInfo[]> {
  const res = await authedPost('/api/tv/youtube/fetch', { url })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Erro ao buscar tracks do YouTube')
  }
  const data = await res.json()
  return data.tracks as YouTubeTrackInfo[]
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const res = await authedPost('/api/tv/youtube/search', { q: query, maxResults: 8 })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Erro ao buscar músicas no YouTube')
  }
  const data = await res.json()
  return data.results as YouTubeSearchResult[]
}
