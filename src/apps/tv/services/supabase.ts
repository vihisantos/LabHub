import { defaultDb as supabase } from '../../../lib/supabase'
import type { TvEvent, TvPlaylist, TvMusicQueue, TvMusicTrack } from '../types'

/* ── Events ── */

export async function fetchEvents(): Promise<TvEvent[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_events')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data as TvEvent[]) || []
}

export async function fetchAllEvents(): Promise<TvEvent[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_events')
    .select('*')
    .order('sort_order', { ascending: true })
  return (data as TvEvent[]) || []
}

export async function createEvent(values: Omit<TvEvent, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_events').insert(values as never)
}

export async function updateEvent(id: string, values: Partial<TvEvent>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_events').update(values as never).eq('id', id)
}

export async function deleteEvent(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_events').delete().eq('id', id)
}

/* ── Playlists ── */

export async function fetchPlaylists(type?: 'video' | 'music'): Promise<TvPlaylist[]> {
  if (!supabase) return []
  let query = supabase.from('tv_playlists').select('*').eq('is_active', true).order('sort_order', { ascending: true })
  if (type) query = query.eq('type', type)
  const { data } = await query
  return (data as TvPlaylist[]) || []
}

export async function fetchAllPlaylists(): Promise<TvPlaylist[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_playlists')
    .select('*')
    .order('sort_order', { ascending: true })
  return (data as TvPlaylist[]) || []
}

export async function createPlaylist(values: Omit<TvPlaylist, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_playlists').insert(values as never)
}

export async function updatePlaylist(id: string, values: Partial<TvPlaylist>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_playlists').update(values as never).eq('id', id)
}

export async function deletePlaylist(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_playlists').delete().eq('id', id)
}

/* ── Music Queues ── */

export async function fetchQueues(): Promise<TvMusicQueue[]> {
  if (!supabase) return []
  const { data } = await supabase.from('tv_music_queues').select('*').order('created_at', { ascending: true })
  return (data as TvMusicQueue[]) || []
}

export async function createQueue(name: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_music_queues').insert({ name })
}

export async function updateQueue(id: string, values: Partial<TvMusicQueue>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_music_queues').update(values as never).eq('id', id)
}

export async function deleteQueue(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_music_queues').delete().eq('id', id)
}

/* ── Music Tracks ── */

export async function fetchTracks(queueId: string): Promise<TvMusicTrack[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_music_tracks')
    .select('*')
    .eq('queue_id', queueId)
    .order('position', { ascending: true })
  return (data as TvMusicTrack[]) || []
}

export async function createTrack(track: Omit<TvMusicTrack, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_music_tracks').insert(track as never)
}

export async function createTracks(tracks: Omit<TvMusicTrack, 'id' | 'created_at'>[]): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado')
  if (tracks.length === 0) return
  const { error } = await supabase.from('tv_music_tracks').insert(tracks as never)
  if (error) throw new Error(`Erro ao salvar tracks: ${error.message}`)
}

export async function deleteTrack(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_music_tracks').delete().eq('id', id)
}

export async function reorderTracks(queueId: string, trackIds: string[]): Promise<void> {
  if (!supabase) return
  const updates = trackIds.map((id, idx) => ({
    id,
    queue_id: queueId,
    position: idx,
  }))
  for (const u of updates) {
    await supabase.from('tv_music_tracks').update({ position: u.position }).eq('id', u.id)
  }
}
